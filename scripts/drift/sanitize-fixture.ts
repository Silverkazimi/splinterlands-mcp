type ValueClass = "name" | "enum" | "id" | "numeric" | "timestamp" | "freetext" | "opaque";
type EnumValue = string | boolean | number;
type Rule = { valueClass: ValueClass; values: Set<unknown>; allowedValues?: Set<EnumValue> };
const classes = new Set<ValueClass>(["name", "enum", "id", "numeric", "timestamp", "freetext", "opaque"]);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const generalize = (path: string) => path.replace(/\[\d+\]/g, "[]");
const dataOnly = (value: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(value).filter(([key]) => key !== "provenance" && key !== "valueClasses"));

export function sanitizeFixture(existing: unknown, captured: unknown, observedAt: string, forbiddenText: readonly string[] = []) {
  if (!record(existing) || !record(existing.valueClasses) || !record(captured)
    || !Number.isFinite(Date.parse(observedAt))) throw new Error("Invalid fixture envelope.");
  const declarations = existing.valueClasses;
  const rules = new Map<string, Rule>();
  const nullRules = new Map<string, Rule>();
  const containers = new Set<string>();
  function review(value: unknown, path: string): void {
    const generic = generalize(path);
    if (Array.isArray(value)) {
      containers.add(generic);
      value.forEach((child, index) => review(child, path + "[" + index + "]"));
    } else if (record(value)) {
      containers.add(generic);
      for (const [key, child] of Object.entries(value)) review(child, path ? path + "." + key : key);
    } else {
      const declaration = declarations[path];
      const valueClass = (record(declaration) ? declaration.valueClass : declaration) as ValueClass;
      if (!classes.has(valueClass)) throw new Error("Missing reviewed field classification.");
      const allowedValues = record(declaration) ? declaration.allowedValues : undefined;
      if (allowedValues !== undefined && (valueClass !== "enum"
        || (value !== null && typeof value !== "string" && typeof value !== "boolean" && typeof value !== "number")
        || !Array.isArray(allowedValues) || allowedValues.length === 0 || allowedValues.length > 128
        || allowedValues.some(item => (typeof item !== "string" && typeof item !== "boolean" && typeof item !== "number")
          || (typeof item === "number" && !Number.isFinite(item))
          || (typeof item === "string" && (item.length > 128
            || forbiddenText.some(text => text.length > 0 && item.toLowerCase().includes(text.toLowerCase()))))))) {
        throw new Error("Invalid reviewed enum declaration.");
      }
      const selectedRules = value === null ? nullRules : rules;
      const rule = selectedRules.get(generic);
      if (rule && rule.valueClass !== valueClass) throw new Error("Conflicting array field classifications.");
      const current = rule ?? { valueClass, values: new Set<unknown>() };
      current.values.add(value);
      if (Array.isArray(allowedValues)) {
        current.allowedValues ??= new Set<EnumValue>();
        for (const item of allowedValues as EnumValue[]) {
          current.values.add(item);
          current.allowedValues.add(item);
        }
        if (current.allowedValues.size > 128) throw new Error("Invalid reviewed enum declaration.");
      }
      selectedRules.set(generic, current);
    }
  }
  review(dataOnly(existing), "");
  // Null carries no value to classify; a reviewed non-null observation determines redaction.
  for (const [path, rule] of nullRules) {
    const current = rules.get(path);
    if (!current) rules.set(path, rule);
    else if (rule.allowedValues) {
      if (current.valueClass !== "enum") throw new Error("Conflicting array field classifications.");
      current.allowedValues ??= new Set<EnumValue>();
      for (const value of rule.allowedValues) {
        current.allowedValues.add(value);
        current.values.add(value);
      }
      if (current.allowedValues.size > 128) throw new Error("Invalid reviewed enum declaration.");
    }
  }
  for (const rule of rules.values()) {
    if (rule.allowedValues && new Set([...rule.values].filter(value => value !== null).map(value => typeof value)).size !== 1) {
      throw new Error("Invalid reviewed enum declaration.");
    }
  }
  const valueClasses: Record<string, { valueClass: ValueClass; allowedValues?: EnumValue[] }> = {};
  const names = new Map<string, string>();
  function walk(value: unknown, path: string): unknown {
    const generic = generalize(path);
    if (Array.isArray(value)) {
      if (!containers.has(generic)) throw new Error("Unreviewed container.");
      return value.map((child, index) => walk(child, path + "[" + index + "]"));
    }
    if (record(value)) {
      if (!containers.has(generic)) throw new Error("Unreviewed container.");
      return Object.fromEntries(Object.entries(value).map(([key, child]) =>
        [key, walk(child, path ? path + "." + key : key)]));
    }
    if (value === null && containers.has(generic)) {
      valueClasses[path] = { valueClass: "opaque" };
      return null;
    }
    const rule = rules.get(generic);
    if (!rule) throw new Error("Unreviewed field.");
    valueClasses[path] = { valueClass: rule.valueClass,
      ...(rule.allowedValues ? { allowedValues: [...rule.allowedValues].sort() } : {}) };
    if (value === null) return null;
    if (rule.valueClass === "name") {
      if (typeof value !== "string") throw new Error("Invalid name type.");
      if (!names.has(value)) names.set(value, "sample-account-" + (names.size + 1));
      return names.get(value);
    }
    if (rule.valueClass === "opaque" && rule.values.has(value)
      && (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)))) return value;
    if (rule.valueClass === "freetext" || rule.valueClass === "opaque") {
      if (typeof value !== "string") throw new Error("Invalid text type.");
      return "[redacted]";
    }
    if (typeof value === "string" && forbiddenText.some(text => text.length > 0 && value.toLowerCase().includes(text.toLowerCase()))) {
      throw new Error("Account identifier outside a name field.");
    }
    const booleanEnum = rule.valueClass === "enum" && typeof value === "boolean"
      && [...rule.values].every(reviewed => typeof reviewed === "boolean");
    if (rule.valueClass === "enum" && !booleanEnum && !rule.values.has(value)) throw new Error("Unreviewed enum value.");
    if (rule.valueClass === "numeric" && !(typeof value === "number" && Number.isFinite(value))
      && !(typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value))) throw new Error("Invalid numeric value.");
    if (rule.valueClass === "timestamp" && !(typeof value === "number" && Number.isFinite(value))
      && !(typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:T| )/.test(value) && Number.isFinite(Date.parse(value)))) throw new Error("Invalid timestamp.");
    if (rule.valueClass === "id" && typeof value !== "string" && typeof value !== "number") throw new Error("Invalid identifier type.");
    return value;
  }
  const data = walk(dataOnly(captured), "") as Record<string, unknown>;
  return {
    provenance: { source: "live-observation", observedAt, redaction: "Names are synthetic; free text and opaque strings are redacted." },
    valueClasses, ...data,
  };
}

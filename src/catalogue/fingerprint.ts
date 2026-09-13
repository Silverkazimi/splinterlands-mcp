import { isEmptyResult } from "../http/errors.js";
import { jsonType } from "./json-type.js";
import type { Fingerprint, ResultContract } from "./schema.js";

type FingerprintInput =
  | { declared: ResultContract }
  | { body: unknown; contract: ResultContract };

function sortedFingerprint(fields: Map<string, Fingerprint[string]>): Fingerprint {
  return Object.fromEntries([...fields.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function walkValue(value: unknown, path: string, declared: Fingerprint, fields: Map<string, Fingerprint[string]>): void {
  if (path !== "") {
    const declaration = declared[path];
    if (declaration !== undefined) {
      const existing = fields.get(path);
      const observedType = jsonType(value);
      if (existing !== undefined && existing.type !== observedType) {
        // A repeated path is one array's rows seen in turn. A declared-nullable field
        // may be absent on some rows and present on others, which is what nullable
        // means; that is not the shape change this guard exists to catch, so keep the
        // non-null type and carry on. Any other transition still throws.
        const nullTransition = declaration.nullable === true
          && (observedType === "null" || existing.type === "null");
        if (!nullTransition) {
          throw new TypeError(`Response type changed at key path '${path}'`);
        }
        if (observedType === "null") {
          return;
        }
      }
      fields.set(path, { type: observedType, valueClass: declaration.valueClass });
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      walkValue(item, `${path}[]`, declared, fields);
    }
  } else if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      walkValue(child, path === "" ? key : `${path}.${key}`, declared, fields);
    }
  }
}

/** The sole fingerprint computation used for declared contracts and observed bodies. */
export function fingerprint(input: FingerprintInput): Fingerprint {
  if ("declared" in input) {
    return sortedFingerprint(new Map(Object.entries(input.declared.fingerprint)));
  }
  if (Object.keys(input.contract.fingerprint).length === 0) {
    return {};
  }
  const fields = new Map<string, Fingerprint[string]>();
  walkValue(input.body, "", input.contract.fingerprint, fields);
  return sortedFingerprint(fields);
}

function valueAtPath(value: unknown, path: string): unknown[] {
  const parts = path.split(".");
  let current: unknown[] = [value];
  for (const part of parts) {
    const isArray = part.endsWith("[]");
    const key = isArray ? part.slice(0, -2) : part;
    const next: unknown[] = [];
    for (const item of current) {
      if (key !== "") {
        if (typeof item !== "object" || item === null || !(key in item)) {
          continue;
        }
        next.push((item as Record<string, unknown>)[key]);
      } else {
        next.push(item);
      }
    }
    if (isArray) {
      current = next.flatMap((item) => Array.isArray(item) ? item : []);
    } else {
      current = next;
    }
  }
  return current;
}

function envelopeMatches(body: unknown, envelope: ResultContract["envelope"]): boolean {
  if (envelope === "array") {
    return Array.isArray(body);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return false;
  }
  return envelope === "bare" || typeof (body as Record<string, unknown>).status === "string";
}

export function matchesResultContract(body: unknown, contract: ResultContract): boolean {
  if (!envelopeMatches(body, contract.envelope)) {
    return false;
  }
  if (contract.envelope === "vapi" && isEmptyResult(body)) {
    if (Object.keys(contract.fingerprint).length === 0) {
      return true;
    }
    const status = valueAtPath(body, "status");
    const declaration = contract.fingerprint.status;
    return status.length === 1 && declaration !== undefined && jsonType(status[0]) === declaration.type;
  }
  for (const path of contract.requiredKeyPaths) {
    if (valueAtPath(body, path).length === 0) {
      return false;
    }
  }
  if (Object.keys(contract.fingerprint).length === 0) {
    return true;
  }
  try {
    const observed = fingerprint({ body, contract });
    const declared = fingerprint({ declared: contract });
    return Object.entries(declared).every(([path, declaration]) => (
      observed[path]?.type === declaration.type
      || (declaration.nullable === true && observed[path]?.type === "null")
    ));
  } catch {
    return false;
  }
}

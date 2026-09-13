import { jsonType } from "../../src/catalogue/json-type.js";

export const SHAPE_MAX_DEPTH = 8;
export type JsonTypeName = "string" | "number" | "boolean" | "object" | "array" | "null";

export type ShapeFingerprint = {
  fields: Record<string, { types: JsonTypeName[] }>;
  truncatedAt: string[];
};

export type ShapeDelta = {
  keyPath: string;
  change: "added" | "removed" | "retyped";
  baselineTypes?: JsonTypeName[];
  observedTypes?: JsonTypeName[];
};

function isContainer(value: unknown): value is object {
  return Array.isArray(value) || (typeof value === "object" && value !== null);
}

function pathDepth(path: string): number {
  if (path === "") {
    return 0;
  }
  return path.split(".").reduce((depth, segment) => {
    const arraySegments = segment.match(/\[\]/g)?.length ?? 0;
    return depth + (segment.replaceAll("[]", "") === "" ? 0 : 1) + arraySegments;
  }, 0);
}

function isDescendant(path: string, ancestor: string): boolean {
  return path.startsWith(ancestor)
    && path.length > ancestor.length
    && (path[ancestor.length] === "." || path[ancestor.length] === "[");
}

function sortedTypes(types: Set<JsonTypeName>): JsonTypeName[] {
  return [...types].sort((left, right) => left.localeCompare(right));
}

function sortedShape(fields: Map<string, Set<JsonTypeName>>, truncatedAt: Set<string>): ShapeFingerprint {
  return {
    fields: Object.fromEntries(
      [...fields.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([path, types]) => [path, { types: sortedTypes(types) }]),
    ),
    truncatedAt: [...truncatedAt].sort((left, right) => left.localeCompare(right)),
  };
}

export function observeShape(body: unknown, maxDepth = SHAPE_MAX_DEPTH): ShapeFingerprint {
  const fields = new Map<string, Set<JsonTypeName>>();
  const truncatedAt = new Set<string>();

  function walk(value: unknown, path: string): void {
    const type = jsonType(value) as JsonTypeName;
    if (path !== "") {
      const types = fields.get(path) ?? new Set<JsonTypeName>();
      types.add(type);
      fields.set(path, types);
    }

    if (!isContainer(value)) {
      return;
    }
    if (path !== "" && pathDepth(path) >= maxDepth) {
      truncatedAt.add(path);
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item, `${path}[]`);
      }
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      walk(child, path === "" ? key : `${path}.${key}`);
    }
  }

  walk(body, "");
  return sortedShape(fields, truncatedAt);
}

function sameTypes(left: JsonTypeName[], right: JsonTypeName[]): boolean {
  return left.length === right.length && left.every((type, index) => type === right[index]);
}

export function diffShapes(baseline: ShapeFingerprint, observed: ShapeFingerprint): ShapeDelta[] {
  const paths = new Set([...Object.keys(baseline.fields), ...Object.keys(observed.fields)]);
  const baselineTruncation = baseline.truncatedAt;
  const observedTruncation = observed.truncatedAt;
  const deltas: ShapeDelta[] = [];

  for (const keyPath of paths) {
    if (baselineTruncation.some((path) => isDescendant(keyPath, path))
      || observedTruncation.some((path) => isDescendant(keyPath, path))) {
      continue;
    }

    const baselineTypes = baseline.fields[keyPath]?.types;
    const observedTypes = observed.fields[keyPath]?.types;
    if (baselineTypes === undefined) {
      if (observedTypes !== undefined && !observedTruncation.includes(keyPath)) {
        deltas.push({ keyPath, change: "added", observedTypes: [...observedTypes] });
      }
      continue;
    }
    if (observedTypes === undefined) {
      if (!baselineTruncation.includes(keyPath)) {
        deltas.push({ keyPath, change: "removed", baselineTypes: [...baselineTypes] });
      }
      continue;
    }
    if (!sameTypes(baselineTypes, observedTypes)) {
      deltas.push({
        keyPath,
        change: "retyped",
        baselineTypes: [...baselineTypes],
        observedTypes: [...observedTypes],
      });
    }
  }

  return deltas.sort((left, right) => left.keyPath.localeCompare(right.keyPath));
}

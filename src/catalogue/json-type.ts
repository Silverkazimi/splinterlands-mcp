import type { Fingerprint } from "./schema.js";

export function jsonType(value: unknown): Fingerprint[string]["type"] {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
      return "object";
    default:
      throw new TypeError(`Unsupported JSON value at fingerprint path: ${typeof value}`);
  }
}

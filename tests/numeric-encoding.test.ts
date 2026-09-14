import { expect, it } from "vitest";
import { matchesResultContract } from "../src/catalogue/fingerprint.js";
import { FingerprintFieldSchema, type ResultContract } from "../src/catalogue/schema.js";

const contract: ResultContract = {
  envelope: "array", requiredKeyPaths: [],
  fingerprint: { "[].amount": { type: "number", valueClass: "numeric", numericEncoding: "number-or-string", nullable: true } },
};
it("accepts measured decimal encodings without changing the returned values", () => {
  const body = [{ amount: 1 }, { amount: "2.50" }, { amount: null }];
  const before = JSON.stringify(body);
  expect(matchesResultContract(body, contract)).toBe(true);
  expect(JSON.stringify(body)).toBe(before);
  for (const amount of ["", " ", "NaN", "Infinity", "0x10", "1e999", "abc", [], {}, true, Infinity, NaN]) {
    expect(matchesResultContract([{ amount }], contract)).toBe(false);
  }
  expect(matchesResultContract([{}], contract)).toBe(false);
});
it("keeps unreviewed numeric fields strict and validates the opt-in declaration", () => {
  const strict: ResultContract = { ...contract, fingerprint: { "[].amount": { type: "number", valueClass: "numeric" } } };
  expect(matchesResultContract([{ amount: "2" }], strict)).toBe(false);
  expect(matchesResultContract([{ amount: 2 }], strict)).toBe(true);
  expect(FingerprintFieldSchema.safeParse({ type: "string", valueClass: "numeric", numericEncoding: "number-or-string" }).success).toBe(true);
  for (const field of [
    { type: "object", valueClass: "numeric", numericEncoding: "number-or-string" },
    { type: "string", valueClass: "name", numericEncoding: "number-or-string" },
  ]) expect(FingerprintFieldSchema.safeParse(field).success).toBe(false);
});

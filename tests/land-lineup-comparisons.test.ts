import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";
import { estimateLineup, estimateLineups, lineupToolSchema, type LineupInput } from "../src/land-lineup-estimator.js";
const lineup = (base: number): LineupInput => ({
 plot: { terrain: "lake", resource: "GRAIN", efficiency: 1 }, power_core: true,
 workers: [{ uid: "worker", card_detail_id: 1, level: 1, base_pp: base, element: "water", bloodline: "Human", abilities: [] }],
});
describe("bounded offline lineup comparisons", () => {
 it("preserves the existing single-lineup output and independently evaluates alternatives", () => {
  const baseline = lineup(1000);
  expect(estimateLineups(baseline)).toEqual(estimateLineup(baseline));
  const alternatives = [2000, 3000, 4000, 5000, 6000].map((base, i) => ({ label: "variant " + i, lineup: lineup(base) }));
  const before = JSON.stringify(alternatives);
  const result = estimateLineups({ ...baseline, comparisons: alternatives });
  expect("comparisons" in result).toBe(true);
  if (!("comparisons" in result)) throw new Error("Missing comparisons");
  expect(result.estimate?.grain_balance_before_tax_per_hour).toBe(12);
  expect(result.comparisons.map(row => row.estimate?.grain_balance_before_tax_per_hour)).toEqual([24, 36, 48, 60, 72]);
  result.comparisons.forEach((row, i) => expect(row).toEqual({ label: alternatives[i]!.label, ...estimateLineup(alternatives[i]!.lineup) }));
  expect(JSON.stringify(alternatives)).toBe(before);
 });
 it("bounds batch size and rejects empty or repeated trimmed labels", () => {
  const row = { label: "same", lineup: lineup(1000) };
  expect(lineupToolSchema.safeParse({ ...lineup(1000), comparisons: [] }).success).toBe(false);
  expect(lineupToolSchema.safeParse({ ...lineup(1000), comparisons: [{ ...row, label: " " }] }).success).toBe(false);
  expect(lineupToolSchema.safeParse({ ...lineup(1000), comparisons: [row, { ...row, label: " same " }] }).success).toBe(false);
  expect(lineupToolSchema.safeParse({ ...lineup(1000), comparisons: Array.from({ length: 11 }, (_, i) => ({ ...row, label: String(i) })) }).success).toBe(false);
  expect(lineupToolSchema.safeParse({ ...lineup(1000), comparisons: Array.from({ length: 10 }, (_, i) => ({ ...row, label: String(i) })) }).success).toBe(true);
 });
 it("runs six lineups in one MCP call without HTTP and retains partial failures", async () => {
  let requests = 0;
  const server = createServer({ fetch: async () => { requests++; throw new Error("Offline tool made an HTTP request"); } });
  const client = new Client({ name: "lineup-comparison-test", version: "0.0.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st); await client.connect(ct);
  try {
   const args = { ...lineup(1000), comparisons: [2000, 3000, 4000, 5000, 6000].map((base, i) => ({ label: String(i), lineup: lineup(base) })) };
   const result = await client.callTool({ name: "land_lineup_estimate", arguments: args });
   expect(result.isError).toBe(false);
   expect(result.structuredContent).toMatchObject({ valid: true, comparisons: args.comparisons.map(row => ({ label: row.label, valid: true })) });
   args.comparisons[1]!.lineup.power_core = false;
   const partial = await client.callTool({ name: "land_lineup_estimate", arguments: args });
   expect(partial.isError).toBe(true);
   expect(partial.structuredContent).toMatchObject({ valid: true, comparisons: [{ valid: true }, { valid: false, estimate: null }, { valid: true }, { valid: true }, { valid: true }] });
   const invalid = await client.callTool({ name: "land_lineup_estimate", arguments: { ...args, comparisons: [args.comparisons[0], args.comparisons[0]] } });
   expect(invalid.isError).toBe(true);
   expect(requests).toBe(0);
  } finally { await client.close(); await server.close(); }
 });
});

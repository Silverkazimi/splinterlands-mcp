import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { HIVE_URL } from "../src/hive-reader.js";

async function rig(fetcher: typeof fetch, action: (client: Client) => Promise<void>) {
  const server = createServer({ fetch: fetcher });
  const client = new Client({ name: "fixture", version: "0.0.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st); await client.connect(ct);
  try { await action(client); } finally { await client.close(); await server.close(); }
}
const rpc = (result: unknown) => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));

describe("hive_account", () => {
  it("projects public fields and regenerates mana without returning keys or balances", async () => {
    const update = Math.floor(Date.now() / 1000) - 108000;
    await rig(async (url, init) => {
      expect(url).toBe(HIVE_URL);
      expect(JSON.parse(String(init?.body))).toMatchObject({ method: "condenser_api.get_accounts", params: [["sampleacct"]] });
      return rpc([{ name: "sampleacct", post_count: 12, reputation: "10000000000", created: "2020-01-01T00:00:00",
        voting_power: 5000, can_vote: true, proxy: "", last_vote_time: "2026-01-01T00:00:00",
        voting_manabar: { current_mana: "5000000", last_update_time: update },
        vesting_shares: "10.000000 VESTS", received_vesting_shares: "0.000000 VESTS", delegated_vesting_shares: "0.000000 VESTS",
        owner: { key_auths: ["secret"] }, balance: "999 HIVE", json_metadata: "private text" }]);
    }, async client => {
      const response = await client.callTool({ name: "hive_account", arguments: { account: "sampleacct" } });
      expect(response.isError).not.toBe(true);
      expect(response.structuredContent).toMatchObject({ found: true, post_count: 12, reputation_raw: "10000000000", reputation_score: 34,
        voting_mana: { max_mana: 10000000, percent: 75 } });
      const output = JSON.stringify(response.structuredContent);
      for (const omitted of ["owner", "balance", "json_metadata", "secret"]) expect(output).not.toContain(omitted);
    });
  });
  it("handles absent accounts and rejects invalid names before RPC", async () => {
    let calls = 0;
    await rig(async () => { calls++; return rpc([]); }, async client => {
      for (const name of ["Bad", "ab", "sample..acct", "sample-", "sample_acct"]) {
        expect((await client.callTool({ name: "hive_account", arguments: { account: name } })).isError).toBe(true);
      }
      expect(calls).toBe(0);
      expect((await client.callTool({ name: "hive_account", arguments: { account: "sampleacct" } })).structuredContent).toMatchObject({ found: false });
    });
  });
});

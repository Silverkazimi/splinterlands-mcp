import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";
import { PLAYER_COMPLETION_ENTRY_IDS } from "../src/player-completion.js";
import { getCatalogueEntry } from "../src/catalogue/index.js";
import { predicateFor } from "../src/catalogue/predicates.js";

function capture(suffix: string): { body: unknown } {
  return JSON.parse(readFileSync(new URL(`./fixtures/api-players-${suffix}.fixture.json`, import.meta.url), "utf8")) as { body: unknown };
}
const account = "fixture_account";

describe("additional public player tools", () => {
  let server: ReturnType<typeof createServer>;
  let client: Client;
  afterEach(async () => { await client?.close(); await server?.close(); });
  async function connect(fetch: typeof globalThis.fetch) {
    server = createServer({ fetch, sleep: async () => undefined, limiterOptions: { sleep: async () => undefined } });
    client = new Client({ name: "player-completion-test", version: "0.0.0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b); await client.connect(a);
  }
  it("calls each distinct route once with its explicit selector and preserves captured wire data", async () => {
    const urls: URL[] = [];
    await connect(async (input) => {
      const url = new URL(String(input)); urls.push(url);
      return new Response(JSON.stringify(capture(url.pathname.split("/").at(-1)!).body));
    });
    for (const [name, id] of Object.entries(PLAYER_COMPLETION_ENTRY_IDS)) {
      const selector = ["player_balances", "player_archived_balances", "player_authorities"].includes(name)
        ? "players" : name === "player_recent_teams" ? "player" : name === "player_dec" ? null : "username";
      const args = selector === null ? {} : { [selector]: account };
      const before = urls.length;
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError, name).not.toBe(true);
      expect(urls.length - before, name).toBe(1);
      const url = urls.at(-1)!;
      expect(url.hostname).toBe("api.splinterlands.com");
      expect(url.pathname).toBe(getCatalogueEntry(id).pathTemplate);
      expect([...url.searchParams.entries()]).toEqual(selector === null ? [] : [[selector, account]]);
      const body = capture(url.pathname.split("/").at(-1)!).body;
      expect(result.structuredContent).toEqual(Array.isArray(body) ? { data: body } : body);
      expect(JSON.stringify(result._meta)).not.toContain(account);
    }
  }, 15000);
  it("requires account scope and refuses unknown credential arguments before any request", async () => {
    let requests = 0;
    await connect(async () => { requests++; return new Response("[]"); });
    for (const name of Object.keys(PLAYER_COMPLETION_ENTRY_IDS).filter((name) => name !== "player_dec")) {
      const result = await client.callTool({ name, arguments: {} });
      expect(result.isError, name).toBe(true);
    }
    const extra = await client.callTool({ name: "player_recent_teams", arguments: { player: account, decrypt_key: "not-a-key" } });
    expect(extra.isError).toBe(true);
    expect(requests).toBe(0);
    const listed = await client.listTools();
    expect(listed.tools.find((tool) => tool.name === "player_recent_teams")?.inputSchema.properties).not.toHaveProperty("decrypt_key");
  });
  it("accepts empty arrays while rejecting a malformed row among valid rows", async () => {
    for (const id of Object.values(PLAYER_COMPLETION_ENTRY_IDS)) {
      const entry = getCatalogueEntry(id);
      if (entry.resultContract.envelope !== "array") continue;
      const validate = predicateFor(entry.resultContract);
      const suffix = entry.pathTemplate.split("/").at(-1)!;
      const body = capture(suffix).body as unknown[];
      expect(validate([]), id).toBe(true);
      expect(validate(body), id).toBe(true);
      expect(validate([...body, {}]), id).toBe(false);
      expect(validate({ error: "not rows" }), id).toBe(false);
    }
    await connect(async () => new Response("[]"));
    const result = await client.callTool({ name: "player_lp_claim_history", arguments: { username: account, limit: "2", offset: "1" } });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({ data: [] });
  });
  it("reports local row truncation and retains the unconverted leading rows", async () => {
    const row = (capture("balances").body as unknown[])[0];
    const body = Array.from({ length: 105 }, () => row);
    let requests = 0;
    await connect(async () => { requests++; return new Response(JSON.stringify(body)); });
    const result = await client.callTool({ name: "player_balances", arguments: { players: account, token_type: "DEC" } });
    expect(result.structuredContent).toEqual({ data: body.slice(0, 100) });
    expect(result._meta).toMatchObject({ resultLimit: { truncated: true, returnedRows: 100, upstreamRows: 105 } });
    expect(result.content).toEqual([expect.objectContaining({ text: expect.stringContaining("not a complete result") })]);
    expect(requests).toBe(1);
  });
  it("refuses oversized objects and single rows without returning partial records", async () => {
    let body: unknown = { ...capture("voucher").body as object, extra: "x".repeat(270000) };
    await connect(async () => new Response(JSON.stringify(body)));
    const record = await client.callTool({ name: "player_voucher", arguments: { username: account } });
    expect(record.isError).toBe(true);
    expect(record.structuredContent).toMatchObject({ kind: "response_too_large" });
    body = [{ ...(capture("balances").body as object[])[0], extra: "x".repeat(270000) }];
    const row = await client.callTool({ name: "player_balances", arguments: { players: account } });
    expect(row.isError).toBe(true);
    expect(row.structuredContent).toMatchObject({ kind: "response_too_large" });
  });
  it("keeps an upstream authentication refusal distinct from an empty result", async () => {
    await connect(async () => new Response(JSON.stringify({ error: "login required" }), { status: 401 }));
    const result = await client.callTool({ name: "player_quests", arguments: { username: account } });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ kind: "endpoint_requires_auth" });
  });
});

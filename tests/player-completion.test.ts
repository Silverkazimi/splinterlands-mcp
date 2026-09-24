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
const definitionFixture = JSON.parse(readFileSync(new URL("./fixtures/api-cards-get-details.fixture.json", import.meta.url), "utf8")) as { body: Record<string, unknown>[] };
const cardDefinition = { ...definitionFixture.body[0], id: 798, name: "Fixture Card" };
const namedSkin = (row: unknown) => ({ ...(row as object), card_name: "Fixture Card", card_name_status: "known" });

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
      return new Response(JSON.stringify(url.pathname === "/cards/get_details"
        ? [cardDefinition] : capture(url.pathname.split("/").at(-1)!).body));
    });
    for (const [name, id] of Object.entries(PLAYER_COMPLETION_ENTRY_IDS)) {
      const selector = ["player_balances", "player_archived_balances", "player_authorities"].includes(name)
        ? "players" : name === "player_recent_teams" ? "player" : name === "player_dec" ? null : "username";
      const args = selector === null ? {} : { [selector]: account };
      const before = urls.length;
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError, name).not.toBe(true);
      expect(urls.length - before, name).toBe(name === "player_skins" ? 2 : 1);
      const url = urls[before]!;
      expect(url.hostname).toBe("api.splinterlands.com");
      expect(url.pathname).toBe(getCatalogueEntry(id).pathTemplate);
      expect([...url.searchParams.entries()]).toEqual(selector === null ? [] : [[selector, account]]);
      const body = capture(url.pathname.split("/").at(-1)!).body;
      expect(result.structuredContent).toEqual(name === "player_skins"
        ? { data: (body as unknown[]).map(namedSkin) }
        : Array.isArray(body) ? { data: body } : body);
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
  it("returns more than 100 complete skins when the inventory fits the byte bound", async () => {
    const row = (capture("skins").body as unknown[])[0];
    const body = Array.from({ length: 160 }, (_, index) => ({ ...(row as object), skin_detail_id: index + 1 }));
    let requests = 0;
    const urls: URL[] = [];
    await connect(async (input) => {
      requests++; const url = new URL(String(input)); urls.push(url);
      return new Response(JSON.stringify(url.pathname === "/cards/get_details" ? [cardDefinition] : body));
    });
    const result = await client.callTool({ name: "player_skins", arguments: { username: account } });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({ data: body.map(namedSkin) });
    expect(result._meta).toMatchObject({ resultLimit: { truncated: false, returnedRows: 160, upstreamRows: 160, startPosition: 0, nextPosition: null } });
    expect([...urls[0]!.searchParams.entries()]).toEqual([["username", account]]);
    expect(urls[1]!.pathname).toBe("/cards/get_details");
    expect([...urls[1]!.searchParams]).toEqual([]);
    expect(requests).toBe(2);
  });
  it("continues skin inventories at complete-row boundaries within 256 KiB", async () => {
    const row = (capture("skins").body as unknown[])[0];
    const body = Array.from({ length: 120 }, (_, index) => ({ ...(row as object), skin_detail_id: index + 1, cosmetic_note: "x".repeat(3000) }));
    let requests = 0;
    const urls: URL[] = [];
    await connect(async (input) => {
      requests++; const url = new URL(String(input)); urls.push(url);
      return new Response(JSON.stringify(url.pathname === "/cards/get_details" ? [cardDefinition] : body));
    });
    const first = await client.callTool({ name: "player_skins", arguments: { username: account } });
    const firstRows = (first.structuredContent as { data: unknown[] }).data;
    expect(first.isError).not.toBe(true);
    expect(firstRows.length).toBeGreaterThan(0);
    expect(firstRows.length).toBeLessThan(body.length);
    expect(Buffer.byteLength(JSON.stringify(first.structuredContent))).toBeLessThanOrEqual(256 * 1024);
    expect(first._meta).toMatchObject({ resultLimit: { truncated: true, upstreamRows: 120, startPosition: 0, nextPosition: firstRows.length } });
    expect(JSON.stringify(first.content)).toContain(`start_index=${firstRows.length}`);
    const second = await client.callTool({ name: "player_skins", arguments: { username: account, start_index: firstRows.length } });
    const secondRows = (second.structuredContent as { data: unknown[] }).data;
    expect(second.isError).not.toBe(true);
    expect(secondRows).toEqual(body.slice(firstRows.length).map(namedSkin));
    expect(second._meta).toMatchObject({ resultLimit: { truncated: false, startPosition: firstRows.length, nextPosition: null } });
    expect(requests).toBe(3);
    expect(urls.filter((url) => url.pathname === "/cards/get_details")).toHaveLength(1);
    expect(urls.filter((url) => url.pathname.endsWith("/skins"))).toHaveLength(2);
    expect(urls.every((url) => [...url.searchParams.entries()].every(([key]) => key === "username"))).toBe(true);
    expect(JSON.stringify(first._meta)).not.toContain(account);
  });
  it("filters skins and active state locally before continuation", async () => {
    const row = (capture("skins").body as Record<string, unknown>[])[0];
    const body = Array.from({ length: 160 }, (_, index) => ({
      ...row, skin_detail_id: index + 1, skin: index % 2 === 0 ? "Fabled" : "Spooky",
      active: index % 4 === 0, cosmetic_note: "x".repeat(7000),
    }));
    const urls: URL[] = [];
    await connect(async (input) => {
      const url = new URL(String(input)); urls.push(url);
      return new Response(JSON.stringify(url.pathname === "/cards/get_details" ? [cardDefinition] : body));
    });
    const listed = await client.listTools();
    const schema = listed.tools.find((tool) => tool.name === "player_skins")?.inputSchema.properties;
    expect(schema).toHaveProperty("skin");
    expect(schema).toHaveProperty("active");
    const rows: unknown[] = [];
    let startIndex = 0;
    for (let page = 0; page < 4; page++) {
      const result = await client.callTool({ name: "player_skins", arguments: {
        username: account, skin: "Fabled", active: false, start_index: startIndex,
      } });
      expect(result.isError).not.toBe(true);
      const chunk = (result.structuredContent as { data: unknown[] }).data;
      rows.push(...chunk);
      expect(Buffer.byteLength(JSON.stringify(result.structuredContent))).toBeLessThanOrEqual(256 * 1024);
      const limit = result._meta?.resultLimit as { upstreamRows: number; filteredRows: number; nextPosition: number | null; truncated: boolean; startPosition: number };
      expect(limit).toMatchObject({ upstreamRows: 160, filteredRows: 40, startPosition: startIndex });
      if (!limit.truncated) { expect(limit.nextPosition).toBeNull(); break; }
      expect(limit.nextPosition).toBe(rows.length);
      startIndex = limit.nextPosition!;
    }
    expect(rows).toEqual(body.filter((value) => value.skin === "Fabled" && value.active === false).map(namedSkin));
    expect(urls.filter((url) => url.pathname === "/cards/get_details")).toHaveLength(1);
    expect(urls.filter((url) => url.pathname.endsWith("/skins"))).toHaveLength(2);
    expect(urls.every((url) => [...url.searchParams.keys()].every((key) => key === "username"))).toBe(true);
  });
  it("marks absent and unavailable card names without hiding skins", async () => {
    const body = capture("skins").body as Record<string, unknown>[];
    let definitionResponse: Response = new Response(JSON.stringify([{ ...cardDefinition, id: 999 }]));
    await connect(async (input) => new URL(String(input)).pathname === "/cards/get_details"
      ? definitionResponse.clone() : new Response(JSON.stringify(body)));
    const missing = await client.callTool({ name: "player_skins", arguments: { username: account } });
    expect(missing.isError).not.toBe(true);
    expect(missing.structuredContent).toEqual({ data: [{ ...body[0], card_name: null, card_name_status: "definition_missing" }] });
    await client.close(); await server.close();
    definitionResponse = new Response(JSON.stringify({ error: "unavailable" }), { status: 503 });
    await connect(async (input) => new URL(String(input)).pathname === "/cards/get_details"
      ? definitionResponse.clone() : new Response(JSON.stringify(body)));
    const unavailable = await client.callTool({ name: "player_skins", arguments: { username: account } });
    expect(unavailable.isError).not.toBe(true);
    expect(unavailable.structuredContent).toEqual({ data: [{ ...body[0], card_name: null, card_name_status: "definitions_unavailable" }] });
  });
  it("reports local row truncation and retains the unconverted leading rows", async () => {
    const row = (capture("balances").body as unknown[])[0];
    const body = Array.from({ length: 105 }, () => row);
    let requests = 0;
    await connect(async () => { requests++; return new Response(JSON.stringify(body)); });
    const result = await client.callTool({ name: "player_balances", arguments: { players: account, token_type: "DEC" } });
    expect(result.structuredContent).toEqual({ data: body.slice(0, 100) });
    expect(result._meta).toMatchObject({ resultLimit: { truncated: true, returnedRows: 100, upstreamRows: 105 } });
    expect(result.content).toEqual([
      expect.objectContaining({ text: expect.stringContaining("not a complete result") }),
      { type: "text", text: JSON.stringify((result.structuredContent as { data: unknown[] }).data) },
    ]);
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

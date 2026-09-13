import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, it } from "vitest";
import { bindRequest, inputSchemaFor } from "../src/catalogue/index.js";
import { createServer, TOOL_ENTRY_IDS } from "../src/server.js";
import { describeEndpoint } from "../src/endpoint-knowledge.js";

it("binds working observed selectors while leaving inert observations uncallable", () => {
  expect(inputSchemaFor("api.players.details").parse({ name: "fixture_account" })).toEqual({ name: "fixture_account" });
  expect(bindRequest("api.players.details", { name: "fixture_account" }).queryParams).toEqual({ name: "fixture_account" });
  expect(() => bindRequest("vapi.land.deeds.search", { player: "fixture_account", status: "map" })).toThrow();
  const ids = new Set(Object.values(TOOL_ENTRY_IDS));
  const profile = describeEndpoint("api.players.details", ids);
  expect(profile.parameters).toContainEqual(expect.objectContaining({
    name: "name", location: "observed-query",
    dimensions: expect.objectContaining({ callable: expect.objectContaining({ value: true }), declared: expect.objectContaining({ value: null }) }),
  }));
  const richlist = describeEndpoint("api.players.richlist", ids);
  expect(richlist.parameters).toContainEqual(expect.objectContaining({ name: "limit", location: "observed-query", dimensions: expect.objectContaining({ callable: expect.objectContaining({ value: true }) }) }));
  expect(richlist.parameters).toContainEqual(expect.objectContaining({ name: "offset", location: "observed-query", dimensions: expect.objectContaining({ callable: expect.objectContaining({ value: false }) }) }));
});

it("requires profile name, forwards it through MCP, and redacts it from provenance", async () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/api-players-details.fixture.json", import.meta.url), "utf8")) as { body: Record<string, unknown> };
  const urls: URL[] = [];
  const server = createServer({ fetch: async (input) => { urls.push(new URL(String(input))); return new Response(JSON.stringify(fixture.body)); } });
  const client = new Client({ name: "observed-selector-test", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b); await client.connect(a);
  try {
    const listed = await client.listTools();
    expect(listed.tools.find((tool) => tool.name === "player_profile")?.inputSchema.required).toContain("name");
    expect((await client.callTool({ name: "player_profile", arguments: {} })).isError).toBe(true);
    expect(urls).toHaveLength(0);
    const result = await client.callTool({ name: "player_profile", arguments: { name: "fixture_account" } });
    expect(result.isError).not.toBe(true);
    expect(urls).toHaveLength(1);
    expect(urls[0]?.pathname).toBe("/players/details");
    expect(urls[0]?.searchParams.get("name")).toBe("fixture_account");
    expect(result.structuredContent).toEqual(fixture.body);
    expect(JSON.stringify(result._meta)).not.toContain("fixture_account");
  } finally { await client.close(); await server.close(); }
});

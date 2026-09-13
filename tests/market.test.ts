import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, expect, it } from "vitest";
import { createServer } from "../src/server.js";
import { MARKET_ENTRY_IDS } from "../src/market.js";
import { getCatalogueEntry } from "../src/catalogue/index.js";
import { predicateFor } from "../src/catalogue/predicates.js";

const cases = [
  [
    "market_for_sale_grouped",
    "sale",
    {}
  ],
  [
    "market_for_rent_grouped",
    "rent",
    {}
  ],
  [
    "market_active_rentals",
    "active-card",
    {
      "card_detail_id": "1",
      "limit": "2"
    }
  ],
  [
    "market_query_by_card",
    "by-card",
    {
      "card_detail_id": "1",
      "type": "sale",
      "limit": "2"
    }
  ],
  [
    "market_query_grouped",
    "grouped",
    {
      "card_ids": "1",
      "type": "sale",
      "limit": "2"
    }
  ],
  [
    "market_history",
    "history",
    {
      "player": "fixture_account"
    }
  ],
  [
    "market_rental_history",
    "rental-history",
    {
      "player": "fixture_account",
      "limit": "2"
    }
  ],
  [
    "market_volume",
    "volume",
    {}
  ],
  [
    "market_status",
    "status-id",
    {
      "id": "fixture-id"
    }
  ],
  [
    "market_active_status",
    "active-status-id",
    {
      "ids": "fixture-id"
    }
  ],
  [
    "market_completed_status",
    "completed-status-id",
    {
      "id": "fixture-id"
    }
  ],
  [
    "market_for_sale_packages",
    "packages",
    {}
  ],
  [
    "purchase_settings",
    "purchase-settings",
    {}
  ],
  [
    "purchase_stats",
    "purchase-stats",
    {}
  ],
  [
    "purchase_uniswap_reward",
    "uniswap-zero",
    {
      "address": "0x0000000000000000000000000000000000000000"
    }
  ]
] as const;
function capture(label: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/market-${label}.fixture.json`, import.meta.url), "utf8")).body;
}
let server: ReturnType<typeof createServer>; let client: Client;
afterEach(async () => { await client?.close(); await server?.close(); });
async function connect(fetch: typeof globalThis.fetch) {
  server = createServer({ fetch, sleep: async () => undefined, limiterOptions: { sleep: async () => undefined } });
  client = new Client({ name: "market-contract-test", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b); await client.connect(a);
}
it("calls all fifteen distinct market and purchase routes with their advertised selectors", async () => {
  let body: unknown; const urls: URL[] = [];
  await connect(async input => { urls.push(new URL(String(input))); return new Response(JSON.stringify(body)); });
  for (const [name, label, args] of cases) {
    body = capture(label);
    if (name === "market_active_status") body = [body];
    const before = urls.length;
    const r = await client.callTool({ name, arguments: args });
    expect(r.isError, name).not.toBe(true);
    expect(urls.length-before).toBe(1);
    expect(urls.at(-1)!.pathname).toBe(getCatalogueEntry(MARKET_ENTRY_IDS[name]!).pathTemplate);
    expect(Object.fromEntries(urls.at(-1)!.searchParams)).toEqual(args);
    expect(r.structuredContent).toEqual(Array.isArray(body) ? { data: body } : body);
    for (const key of ["player", "username", "owner", "renter", "address"]) {
      if (key in args) expect(r._meta).toMatchObject({ provenance: { requestScope: { [key]: { supplied: true } } } });
    }
  }
}, 20000);
it("refuses missing scope, ambiguous aliases and credentials before HTTP", async () => {
  let requests = 0;
  await connect(async () => { requests++; return new Response("{}"); });
  const invalid = [
    { name: "market_active_rentals", arguments: {} },
    { name: "market_query_by_card", arguments: {} },
    { name: "market_query_by_card", arguments: { id: "1", card_detail_id: "2" } },
    { name: "market_query_grouped", arguments: {} },
    { name: "market_status", arguments: {} },
    { name: "market_status", arguments: { id: "x", ids: "y" } },
    { name: "market_history", arguments: {} },
    { name: "market_rental_history", arguments: { player: "fixture_account", username: "fixture_other" } },
    { name: "purchase_uniswap_reward", arguments: {} },
    { name: "purchase_settings", arguments: { token: "credential" } }
  ];
  for(const args of invalid) expect((await client.callTool(args)).isError, args.name).toBe(true);
  expect(requests).toBe(0);
  expect((await client.listTools()).tools.some(t => t.name === "purchase_status")).toBe(false);
});
it("keeps singular, plural and absent status shapes while rejecting malformed rows", () => {
  for(const label of ["status-id", "active-status-id", "completed-status-id"]) {
    const body = capture(label);
    const id = label === "status-id" ? "api.market.status" : label === "active-status-id" ? "api.market.active-status" : "api.market.completed-status";
    const matches = predicateFor(getCatalogueEntry(id).resultContract);
    expect(matches(body)).toBe(true);
    expect(matches([body])).toBe(true);
    expect(matches([])).toBe(true);
    for(const bad of [{}, null, {error:"failure"}, [body,{}], [1]]) expect(matches(bad)).toBe(false);
  }
});
it("bounds root groups and retains complete nested listings and packages", async () => {
  let body: unknown;
  await connect(async () => new Response(JSON.stringify(body)));
  for(const [name,label,args] of [
    ["market_query_grouped","grouped",{card_ids:"1"}],
    ["market_for_sale_packages","packages",{}]
  ] as const) {
    const row = (capture(label) as unknown[])[0];
    body = Array.from({length:120}, () => row);
    const r = await client.callTool({name,arguments:args});
    expect(r.isError).not.toBe(true);
    const rows = (r.structuredContent as {data:unknown[]}).data;
    expect(rows.length).toBeGreaterThan(0); expect(rows.length).toBeLessThanOrEqual(100);
    expect(rows.every(v => JSON.stringify(v) === JSON.stringify(row))).toBe(true);
    expect(r._meta).toMatchObject({resultLimit:{truncated:true,upstreamRows:120}});
  }
});
it("refuses a single oversized package without dropping its cards", async () => {
  const row = (capture("packages") as Record<string,unknown>[])[0]!;
  await connect(async () => new Response(JSON.stringify([{...row, extra:"x".repeat(270000)}])));
  const r = await client.callTool({name:"market_for_sale_packages",arguments:{}});
  expect(r.isError).toBe(true);
  expect(r.structuredContent).toMatchObject({kind:"response_too_large"});
});

it("forwards declared offsets without presenting them as proven pagination", async () => {
  let url: URL | undefined;
  await connect(async input => { url = new URL(String(input)); return new Response(JSON.stringify(capture("active-card"))); });
  const result = await client.callTool({ name: "market_active_rentals", arguments: { card_detail_id: "1", limit: "2", offset: "2" } });
  expect(result.isError).not.toBe(true);
  expect(url!.searchParams.get("offset")).toBe("2");
  expect(getCatalogueEntry("api.market.active-rentals").queryParams.find(p => p.name === "offset")?.inertUpstream).toBe(true);
  const tool = (await client.listTools()).tools.find(t => t.name === "market_active_rentals")!;
  expect(tool.description).toContain("not working pagination");
});

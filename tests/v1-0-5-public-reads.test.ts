import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, it } from "vitest";
import { createServer } from "../src/server.js";
import deedFixture from "./fixtures/plot-label-101.fixture.json" with { type: "json" };
import active from "./fixtures/land-projects-active-single.fixture.json" with { type: "json" };
import details from "./fixtures/land-stake-deed-details-active.fixture.json" with { type: "json" };
import assets from "./fixtures/land-stake-assets-rows.fixture.json" with { type: "json" };

const deed = { ...deedFixture.body, data: { ...deedFixture.body.data, deed_uid: "fixture-deed" } };
async function rig(responses: Record<string, unknown>) {
  const urls: URL[] = [];
  const server = createServer({
    fetch: async input => {
      const url = new URL(String(input)); urls.push(url);
      const body = responses[url.pathname];
      if (body instanceof Response) return body;
      return new Response(JSON.stringify(body ?? { status: "success", data: null }));
    }, sleep: async () => undefined, limiterOptions: { sleep: async () => undefined },
  });
  const client = new Client({ name: "v105-public-test", version: "0.0.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st); await client.connect(ct);
  return { urls, call: (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args }), close: async () => { await client.close(); await server.close(); } };
}
it("reads exactly four fresh plot endpoints and preserves each upstream body", async () => {
  const test = await rig({ "/land/deeds/101": deed, "/land/projects/deed/fixture-deed/active": active, "/land/stake/deed/details/fixture-deed": details, "/land/stake/deeds/fixture-deed/assets": assets });
  try {
    for (let i = 0; i < 2; i++) {
      const result = await test.call("land_plot_snapshot", { plot_id: "002-01-001" });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ plot_reference: { plot_id: 101, plot_label: "002-01-001", deed_uid: "fixture-deed" }, deed, active_project: active, stake_details: details, stake_assets: assets });
    }
    expect(test.urls.map(url => url.pathname)).toEqual(Array(2).fill(["/land/deeds/101", "/land/projects/deed/fixture-deed/active", "/land/stake/deed/details/fixture-deed", "/land/stake/deeds/fixture-deed/assets"]).flat());
  } finally { await test.close(); }
});
it("rejects an unverified deed and accepts a null active project", async () => {
  const invalid = await rig({ "/land/deeds/101": { status: "success", data: null } });
  try { const result = await invalid.call("land_plot_snapshot", { plot_id: "002-01-001" }); expect(result.isError).toBe(true); expect(result.structuredContent).toMatchObject({ kind: "plot_resolution_unverified", stage: "deed" }); expect(invalid.urls).toHaveLength(1); } finally { await invalid.close(); }
  const noProject = await rig({ "/land/deeds/101": deed, "/land/projects/deed/fixture-deed/active": { status: "success", data: null }, "/land/stake/deed/details/fixture-deed": details, "/land/stake/deeds/fixture-deed/assets": assets });
  try { const result = await noProject.call("land_plot_snapshot", { plot_id: 101 }); expect(result.isError).not.toBe(true); expect(result.structuredContent).toHaveProperty("active_project.data", null); } finally { await noProject.close(); }
});
it("returns no partial snapshot when a follow-up fails or the result is oversized", async () => {
  const denied = await rig({ "/land/deeds/101": deed, "/land/projects/deed/fixture-deed/active": new Response("denied", { status: 401 }) });
  try { const result = await denied.call("land_plot_snapshot", { plot_id: 101 }); expect(result.isError).toBe(true); expect(result.structuredContent).toMatchObject({ stage: "active_project" }); expect(result.structuredContent).not.toHaveProperty("deed"); expect(denied.urls).toHaveLength(2); } finally { await denied.close(); }
  const oversized = await rig({ "/land/deeds/101": deed, "/land/projects/deed/fixture-deed/active": active, "/land/stake/deed/details/fixture-deed": details, "/land/stake/deeds/fixture-deed/assets": { ...assets, padding: "x".repeat(300_000) } });
  try { const result = await oversized.call("land_plot_snapshot", { plot_id: 101 }); expect(result.isError).toBe(true); expect(result.structuredContent).toMatchObject({ kind: "response_too_large", stage: "result" }); expect(result.structuredContent).not.toHaveProperty("deed"); expect(oversized.urls).toHaveLength(4); } finally { await oversized.close(); }
});
it("requires explicit selectors and forwards only declared inputs", async () => {
  const test = await rig({ "/players/dyk/en": { tips: ["Tip"], lore: ["Lore"] }, "/players/daily_updates": { enabled: true, announcement: {}, did_you_know: [] }, "/players/burn_event_player": { player: {} }, "/players/burn_event_prizes": { prizes: [], prizes_ready: false, has_claimed_prizes: false, can_have_prizes: false }, "/land/liquidity/pools/fixture_account/all-no-vesting": { status: "success", data: { all: { positions: [] } } } });
  try {
    for (const [name, args] of [["player_dyk", { locale: "en" }], ["player_daily_updates", {}], ["player_burn_event_player", { username: "fixture_account" }], ["player_burn_event_prizes", { username: "fixture_account" }], ["land_liquidity_positions_no_vesting", { player: "fixture_account" }]] as const) {
      const result = await test.call(name, args); expect(result.isError, name + JSON.stringify(result.structuredContent)).not.toBe(true);
    }
    expect(test.urls).toHaveLength(5); expect(test.urls[2]!.searchParams.get("username")).toBe("fixture_account"); expect(test.urls[3]!.searchParams.get("username")).toBe("fixture_account");
    for (const [name, args] of [["player_burn_event_player", {}], ["player_burn_event_prizes", {}], ["land_liquidity_positions_no_vesting", {}]] as const) expect((await test.call(name, args)).isError).toBe(true);
    expect(test.urls).toHaveLength(5);
  } finally { await test.close(); }
});
it("rejects a malformed daily-update field through its measured contract", async () => {
  const test = await rig({ "/players/daily_updates": { enabled: "yes", announcement: {}, did_you_know: [] } });
  try {
    const result = await test.call("player_daily_updates", {});
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ kind: "upstream_malformed" });
    expect(test.urls).toHaveLength(1);
  } finally { await test.close(); }
});

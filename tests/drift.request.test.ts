import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { bindSweepInputs, createSweepRequester, SWEEP_RESPONSE_CAP } from "../scripts/drift/request.js";
import { TOOL_ENTRY_IDS } from "../src/server.js";
import { HostRateLimiter } from "../src/http/ratelimit.js";

const lastBlockEntry = (TOOL_ENTRY_IDS as Record<string, string>).game_last_block!;
const inputs = () => bindSweepInputs([{ entryId: lastBlockEntry, params: {} }]);
it("rejects unknown, duplicate and unscoped inputs before requests", () => {
  expect(() => bindSweepInputs([{ entryId: "unknown.route", params: {} }])).toThrow();
  expect(() => bindSweepInputs([{ entryId: TOOL_ENTRY_IDS.player_profile, params: {} }])).toThrow();
  expect(() => bindSweepInputs(Array.from({ length: 2 }, () => ({ entryId: lastBlockEntry, params: {} })))).toThrow("Duplicate");
});
it("uses one paced GET on the bound host with no redirect following", async () => {
  let calls = 0;
  const request = createSweepRequester(async (url, options) => {
    calls++;
    expect(new URL(String(url)).hostname).toBe("api.splinterlands.com");
    expect(new URL(String(url)).pathname).toBe(inputs()[0]!.path.value);
    expect(options?.method).toBe("GET");
    expect(options?.redirect).toBe("error");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    return new Response('{"value":1}');
  }, new HostRateLimiter());
  expect(await request(inputs()[0]!)).toEqual({ status: 200, body: { value: 1 }, isJson: true });
  expect(calls).toBe(1);
});
it("cancels oversized responses and suppresses malformed/network response contents", async () => {
  let cancelled = false;
  const oversized = createSweepRequester(async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(SWEEP_RESPONSE_CAP + 1)); },
    cancel() { cancelled = true; },
  })));
  expect(await oversized(inputs()[0]!)).toEqual({ status: 200, body: null, isJson: false });
  expect(cancelled).toBe(true);
  const failure = createSweepRequester(async () => { throw new Error("private network detail"); });
  expect(await failure(inputs()[0]!)).toEqual({ status: 0, body: null, isJson: false });
});

it("accepts explicit resource scope without adding an unrelated account", () => {
  const cases = [
    {entryId:"api.guilds.list",params:{name:"fixture guild"}},
    {entryId:"api.guilds.find",params:{id:"fixture-guild"}},
    {entryId:"api.tournaments.find",params:{id:"fixture-tournament"}},
    {entryId:"api.tournaments.find-brawl",params:{id:"fixture-brawl",guild_id:"fixture-guild"}},
    {entryId:"api.tournaments.battles",params:{id:"fixture-tournament",round:"1",swiss_group:"1"}},
  ];
  for (const row of cases) {
    expect(bindSweepInputs([row])).toHaveLength(1);
    for (const key of Object.keys(row.params)) {
      const params = {...row.params} as Record<string,string>;
      delete params[key];
      expect(() => bindSweepInputs([{entryId:row.entryId,params}])).toThrow();
    }
  }
  expect(() => bindSweepInputs([{entryId:"api.guilds.list",params:{name:" "}}])).toThrow();
  expect(() => bindSweepInputs([{entryId:TOOL_ENTRY_IDS.player_profile,params:{id:"fixture-id"}}])).toThrow();
});

it("checks the avatar projection without following its image redirect", async () => {
  const bound=bindSweepInputs([{entryId:"api.players.avatar",params:{name:"fixture-account"}}])[0]!;
  let calls=0;
  const request=createSweepRequester(async(_url,options)=>{
    calls++;
    expect(options?.redirect).toBe("manual");
    return new Response("Found",{status:302,headers:{location:"https://runi.splinterlands.com/avatars/1000.png"}});
  });
  expect(await request(bound)).toMatchObject({status:200,isJson:true,body:{redirect_status:302,image_url:"https://runi.splinterlands.com/avatars/1000.png"}});
  expect(calls).toBe(1);
});

it("streams oversized collections while retaining only three projected cards", async () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/api-cards-collection.raw.json", import.meta.url), "utf8"));
  const card = fixture.body.cards[0];
  const body = JSON.stringify({player:"fixture-account",cards:Array.from({length:4},()=>({...card,padding:"x".repeat(550000)}))});
  expect(Buffer.byteLength(body)).toBeGreaterThan(SWEEP_RESPONSE_CAP);
  const bound = bindSweepInputs([{entryId:"api.cards.collection",params:{username:"fixture-account"}}])[0]!;
  const request = createSweepRequester(async()=>new Response(body));
  const result = await request(bound);
  expect(result.isJson).toBe(true);
  const sample = result.body as {cards:unknown[]};
  expect(sample.cards).toHaveLength(3);
  expect(sample.cards[0]).not.toHaveProperty("padding");
  expect(sample.cards[0]).not.toHaveProperty("last_buy_price");
}, 20000);

it("validates collection cards beyond the retained sample", async () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/api-cards-collection.raw.json", import.meta.url), "utf8"));
  const card = fixture.body.cards[0];
  const bound = bindSweepInputs([{entryId:"api.cards.collection",params:{username:"fixture-account"}}])[0]!;
  const request=createSweepRequester(async()=>Response.json({player:"fixture-account",cards:[card,card,card,{...card,bcx:"wrong"}]}));
  expect(await request(bound)).toEqual({status:200,body:null,isJson:false});
});

it("accepts bounded global rental pages without forcing a player filter", () => {
  for (const entryId of ["vapi.delegation-rental.v3.bids", "vapi.delegation-rental.v3.offers"]) {
    for (const limit of [1, 4, 100]) {
      const bound = bindSweepInputs([{ entryId, params: { limit, minPrice: 1 } }])[0]!;
      expect(bound.queryParams.limit).toBe(limit);
      expect(bound.queryParams).not.toHaveProperty("player");
    }
    for (const params of [{}, { limit: 0 }, { limit: 101 }, { limit: 1.5 }, { limit: "2" }]) {
      expect(() => bindSweepInputs([{ entryId, params }])).toThrow();
    }
  }
  expect(() => bindSweepInputs([{ entryId: TOOL_ENTRY_IDS.player_profile, params: { limit: 2 } }])).toThrow();
});

it("preserves the documented unscoped count scenarios without weakening account routes", () => {
  for (const entryId of ["vapi.land.regions.counts", "vapi.land.tracts.counts"]) {
    const bound = bindSweepInputs([{ entryId, params: {} }])[0]!;
    expect(bound.queryParams).toEqual({});
    expect(() => bindSweepInputs([{ entryId, params: { player: "" } }])).toThrow();
  }
  expect(() => bindSweepInputs([{ entryId: "vapi.land.resources.production-region-harvestable", params: { region_uid: "fixture-region" } }])).toThrow();
  expect(() => bindSweepInputs([{ entryId: TOOL_ENTRY_IDS.player_profile, params: {} }])).toThrow();
});

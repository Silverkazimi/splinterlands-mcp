import {readFileSync} from "node:fs";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {InMemoryTransport} from "@modelcontextprotocol/sdk/inMemory.js";
import {afterEach,expect,it} from "vitest";
import {createServer} from "../src/server.js";
import {getCatalogueEntry} from "../src/catalogue/index.js";
import {CONFLICT_PROPOSAL_ENTRY_IDS} from "../src/conflicts-proposals.js";
const cases=[
  [
    "conflict_seasons",
    "seasons",
    {}
  ],
  [
    "conflict_players",
    "conflict-players",
    {
      "id": "22",
      "player": "fixture_account"
    }
  ],
  [
    "conflict_airdrop_distribution",
    "conflict-airdrop",
    {
      "id": "1",
      "player": "fixture_account"
    }
  ],
  [
    "conflict_leaderboard",
    "conflict-leaderboard",
    {
      "id": "22"
    }
  ],
  [
    "conflict_player_rank",
    "conflict-leaderboard-player",
    {
      "id": "22",
      "username": "fixture_account"
    }
  ],
  [
    "conflict_status",
    "conflict-status",
    {
      "username": "fixture_account"
    }
  ],
  [
    "conflict_wagon",
    "conflict-wagon",
    {
      "uid": "fixture-wagon"
    }
  ],
  [
    "conflict_eligible_cards",
    "eligible",
    {
      "username": "fixture_account",
      "max_group_size": "2"
    }
  ],
  [
    "proposal_list",
    "proposals",
    {
      "limit": "2",
      "offset": "0"
    }
  ],
  [
    "proposal_pending_count",
    "proposal-count",
    {
      "username": "fixture_account"
    }
  ],
  [
    "proposal_votes",
    "proposal-votes",
    {
      "proposal_id": "7525",
      "limit": "2",
      "offset": "0"
    }
  ]
] as const;
function capture(label:string):unknown{return JSON.parse(readFileSync(new URL(`./fixtures/governance-${label}.fixture.json`,import.meta.url),"utf8")).body;}
let server:ReturnType<typeof createServer>;let client:Client;
afterEach(async()=>{await client?.close();await server?.close();});
async function connect(fetch:typeof globalThis.fetch){
 server=createServer({fetch,sleep:async()=>undefined,limiterOptions:{sleep:async()=>undefined}});
 client=new Client({name:"conflict-proposal-test",version:"0.0.0"});
 const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a);
}
it("calls eleven read routes with exact selectors and unmodified captured values",async()=>{
 let body:unknown;const urls:URL[]=[];await connect(async input=>{urls.push(new URL(String(input)));return new Response(JSON.stringify(body));});
 for(const [name,label,args] of cases){
  body=capture(label);const before=urls.length;const result=await client.callTool({name,arguments:args});
  expect(result.isError,name).not.toBe(true);expect(urls.length-before).toBe(1);
  expect(urls.at(-1)!.pathname).toBe(getCatalogueEntry(CONFLICT_PROPOSAL_ENTRY_IDS[name]!).pathTemplate);
  expect(Object.fromEntries(urls.at(-1)!.searchParams)).toEqual(args);
  expect(result.structuredContent).toEqual(Array.isArray(body)?{data:body}:body);
 }
},15000);
it("supports single-season and partial-status shapes without manufacturing omitted sections",async()=>{
 let body:unknown;await connect(async()=>new Response(JSON.stringify(body)));
 body=capture("season-one");
 expect((await client.callTool({name:"conflict_seasons",arguments:{id:"22"}})).structuredContent).toEqual(body);
 for(const [label,flags] of [
  ["status-config-one",{only_config:"1"}],["status-wagons-one",{only_wagons:"1"}],["status-no-wagons",{exclude_wagons:"1"}]
 ] as const){
  body=capture(label);const result=await client.callTool({name:"conflict_status",arguments:{username:"fixture_account",...flags}});
  expect(result.isError).not.toBe(true);expect(result.structuredContent).toEqual(body);
 }
 for(const bad of [{},{error:"failure"},{config:"bad"},{config:{}},{stats:{}},{player:{}},{conflict:{}},{wagons:[{}]}]){
  body=bad;expect((await client.callTool({name:"conflict_status",arguments:{username:"fixture_account"}})).isError).toBe(true);
 }
});
it("accepts unused wagons without timestamps while checking populated and malformed rows",async()=>{
 let body:unknown;await connect(async()=>new Response(JSON.stringify(body)));
 const empty={wagon_uid:"fixture-wagon",cards:[],total_cp:0,damaged:false};
 body={stats:{total_wagon_cp:0},wagons:[empty]};
 const result=await client.callTool({name:"conflict_status",arguments:{username:"fixture_account",only_wagons:"1"}});
 expect(result.isError).not.toBe(true);
 expect(result.structuredContent).toEqual(body);
 for(const row of [
  {...empty,updated_date:123},
  {...empty,updated_date:null},
  {...empty,cards:[{uid:"fixture-card"}]},
  {...empty,total_cp:1},
  {...empty,damaged:"false"},
 ]){
  body={stats:{total_wagon_cp:0},wagons:[row]};
  expect((await client.callTool({name:"conflict_status",arguments:{username:"fixture_account",only_wagons:"1"}})).isError).toBe(true);
 }
});
it("rejects missing identity, ambiguous conflict aliases and credentials before HTTP",async()=>{
 let requests=0;await connect(async()=>{requests++;return new Response("{}");});
 for(const args of [
  {name:"conflict_players",arguments:{player:"fixture_account"}},
  {name:"conflict_airdrop_distribution",arguments:{id:"1"}},
  {name:"conflict_players",arguments:{id:"1",conflict:"2",player:"fixture_account"}},
  {name:"conflict_player_rank",arguments:{id:"22"}},
  {name:"conflict_status",arguments:{}},
  {name:"conflict_wagon",arguments:{}},
  {name:"conflict_eligible_cards",arguments:{}},
  {name:"proposal_pending_count",arguments:{}},
  {name:"proposal_votes",arguments:{}},
  {name:"proposal_votes",arguments:{proposal_id:"1",token:"credential"}}
 ])expect((await client.callTool(args)).isError).toBe(true);
 expect(requests).toBe(0);
});
it("bounds wagons and leaderboards while preserving independent totals and configuration",async()=>{
 let body:unknown;await connect(async()=>new Response(JSON.stringify(body)));
 for(const [name,label,field,args] of [
  ["conflict_status","conflict-status","wagons",{username:"fixture_account"}],
  ["conflict_leaderboard","conflict-leaderboard","leaderboard",{id:"22"}]
 ] as const){
  const fixture=capture(label) as Record<string,unknown>;const row=(fixture[field] as unknown[])[0];
  body={...fixture,[field]:Array.from({length:120},()=>row)};
  const result=await client.callTool({name,arguments:args});expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toEqual({...fixture,[field]:Array.from({length:100},()=>row)});
  expect(result._meta).toMatchObject({resultLimit:{truncated:true,upstreamRows:120}});
 }
});
it("retains sampled card UID arrays and full group counts without claiming completeness",async()=>{
 const body=capture("eligible");await connect(async()=>new Response(JSON.stringify(body)));
 const result=await client.callTool({name:"conflict_eligible_cards",arguments:{username:"fixture_account",max_group_size:"2"}});
 expect(result.isError).not.toBe(true);expect(result.structuredContent).toEqual(body);
 const group=(body as {groups:{qty:number;uids:string[]}[]}).groups.find(g=>g.qty>g.uids.length);
 expect(group).toBeDefined();
});

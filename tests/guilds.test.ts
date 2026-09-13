import {readFileSync} from "node:fs";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {InMemoryTransport} from "@modelcontextprotocol/sdk/inMemory.js";
import {afterEach,expect,it} from "vitest";
import {createServer} from "../src/server.js";
import {getCatalogueEntry} from "../src/catalogue/index.js";
import {GUILD_ENTRY_IDS} from "../src/guilds.js";
const cases=[
  [
    "guild_list",
    "list-name",
    {
      "name": "fixture guild"
    }
  ],
  [
    "guild_find",
    "find",
    {
      "id": "fixture-guild"
    }
  ],
  [
    "guild_members",
    "members",
    {
      "guild_id": "fixture-guild"
    }
  ],
  [
    "guild_contributions",
    "contributions-hall",
    {
      "guild_id": "fixture-guild",
      "type": "guild_hall"
    }
  ],
  [
    "guild_brawl_records",
    "records",
    {
      "guild_id": "fixture-guild"
    }
  ],
  [
    "guild_brawl_sps_rewards",
    "rewards-cycle",
    {
      "cycle": "383",
      "include_total": "1",
      "include_cycles": "1"
    }
  ]
] as const;
function capture(label:string):unknown{return JSON.parse(readFileSync(new URL(`./fixtures/guild-${label}.fixture.json`,import.meta.url),"utf8")).body;}
let server:ReturnType<typeof createServer>;let client:Client;
afterEach(async()=>{await client?.close();await server?.close();});
async function connect(fetch:typeof globalThis.fetch){
 server=createServer({fetch,sleep:async()=>undefined,limiterOptions:{sleep:async()=>undefined}});
 client=new Client({name:"guild-contract-test",version:"0.0.0"});
 const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a);
}
it("calls all six guild routes with exact selectors and unmodified wire values",async()=>{
 let body:unknown;const urls:URL[]=[];
 await connect(async input=>{urls.push(new URL(String(input)));return new Response(JSON.stringify(body));});
 for(const [name,label,args] of cases){
  body=capture(label);const before=urls.length;
  const result=await client.callTool({name,arguments:args});
  expect(result.isError,name).not.toBe(true);expect(urls.length-before).toBe(1);
  expect(urls.at(-1)!.pathname).toBe(getCatalogueEntry(GUILD_ENTRY_IDS[name]!).pathTemplate);
  expect(Object.fromEntries(urls.at(-1)!.searchParams)).toEqual(args);
  expect(result.structuredContent).toEqual(Array.isArray(body)?{data:body}:body);
 }
},15000);
it("refuses absent scope, unproven member pagination and credentials before HTTP",async()=>{
 let requests=0;await connect(async()=>{requests++;return new Response("{}");});
 for(const [name] of cases) expect((await client.callTool({name,arguments:{}})).isError).toBe(true);
 expect((await client.callTool({name:"guild_contributions",arguments:{guild_id:"fixture"}})).isError).toBe(true);
 expect((await client.callTool({name:"guild_members",arguments:{guild_id:"fixture",limit:"2"}})).isError).toBe(true);
 expect((await client.callTool({name:"guild_find",arguments:{id:"fixture",authorization:"credential"}})).isError).toBe(true);
 expect(requests).toBe(0);
});
it("supports total-only, cycle-only, both and empty-cycle reward responses without conflating totals",async()=>{
 let body:unknown;await connect(async()=>new Response(JSON.stringify(body)));
 const fixture=capture("rewards-cycle") as {total_sps_payout:number;sps_reward_records:unknown[]};
 for(const [value,args] of [
  [{total_sps_payout:fixture.total_sps_payout},{include_total:"1"}],
  [{sps_reward_records:fixture.sps_reward_records},{include_cycles:"1",cycle:"383"}],
  [fixture,{include_total:"1",include_cycles:"1",cycle:"383"}],
  [{sps_reward_records:[]},{include_cycles:"1",cycle:"0"}]
 ] as const){
  body=value;const result=await client.callTool({name:"guild_brawl_sps_rewards",arguments:args});
  expect(result.isError).not.toBe(true);expect(result.structuredContent).toEqual(value);
 }
 for(const bad of [{},{total_sps_payout:"12"},{sps_reward_records:[{}]},{error:"failure"}]){
  body=bad;expect((await client.callTool({name:"guild_brawl_sps_rewards",arguments:{include_cycles:"1"}})).isError).toBe(true);
 }
});
it("bounds guild lists and brawl records while preserving surrounding fields",async()=>{
 let body:unknown;await connect(async()=>new Response(JSON.stringify(body)));
 for(const [name,label,field,args] of [
  ["guild_list","list-name","guilds",{name:"fixture"}],
  ["guild_brawl_records","records","results",{guild_id:"fixture"}],
  ["guild_brawl_sps_rewards","rewards-cycle","sps_reward_records",{include_total:"1",include_cycles:"1"}]
 ] as const){
  const fixture=capture(label) as Record<string,unknown>;const rows=fixture[field] as unknown[];
  body={...fixture,[field]:Array.from({length:120},()=>rows[0])};
  const result=await client.callTool({name,arguments:args});
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toEqual({...fixture,[field]:Array.from({length:100},()=>rows[0])});
  expect(result._meta).toMatchObject({resultLimit:{truncated:true,upstreamRows:120,returnedRows:100}});
 }
});

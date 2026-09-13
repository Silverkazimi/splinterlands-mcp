import {readFileSync} from "node:fs";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {InMemoryTransport} from "@modelcontextprotocol/sdk/inMemory.js";
import {afterEach,expect,it} from "vitest";
import {createServer} from "../src/server.js";
import {getCatalogueEntry} from "../src/catalogue/index.js";
import {TOURNAMENT_ENTRY_IDS} from "../src/tournaments.js";
const cases=[
  [
    "tournament_upcoming",
    "upcoming",
    {}
  ],
  [
    "tournament_upcoming_official",
    "upcoming_official",
    {}
  ],
  [
    "tournament_in_progress",
    "in_progress",
    {}
  ],
  [
    "tournament_completed",
    "completed",
    {}
  ],
  [
    "tournament_cancelled",
    "cancelled",
    {}
  ],
  [
    "tournament_mine",
    "mine-creator",
    {
      "username": "fixture_account"
    }
  ],
  [
    "tournament_find",
    "find",
    {
      "id": "fixture-tournament"
    }
  ],
  [
    "tournament_find_brawl",
    "brawl",
    {
      "id": "fixture-brawl",
      "guild_id": "fixture-guild"
    }
  ],
  [
    "tournament_battles",
    "battles-group-one",
    {
      "id": "fixture-tournament",
      "round": "1",
      "swiss_group": "1"
    }
  ],
  [
    "tournament_prizes",
    "prizes",
    {}
  ]
] as const;
function capture(label:string):unknown {return JSON.parse(readFileSync(new URL(`./fixtures/tournament-${label}.fixture.json`,import.meta.url),"utf8")).body;}
let server:ReturnType<typeof createServer>;let client:Client;
afterEach(async()=>{await client?.close();await server?.close();});
async function connect(fetch:typeof globalThis.fetch){
 server=createServer({fetch,sleep:async()=>undefined,limiterOptions:{sleep:async()=>undefined}});
 client=new Client({name:"tournament-contract-test",version:"0.0.0"});
 const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a);
}
it("calls ten distinct routes with exact selectors and preserved response fields",async()=>{
 let body:unknown;const urls:URL[]=[];
 await connect(async input=>{urls.push(new URL(String(input)));return new Response(JSON.stringify(body));});
 for(const [name,label,args] of cases){
  body=capture(label);const before=urls.length;
  const result=await client.callTool({name,arguments:args});
  expect(result.isError,name).not.toBe(true);expect(urls.length-before).toBe(1);
  expect(urls.at(-1)!.pathname).toBe(getCatalogueEntry(TOURNAMENT_ENTRY_IDS[name]!).pathTemplate);
  expect(Object.fromEntries(urls.at(-1)!.searchParams)).toEqual(args);
  expect(result.structuredContent).toEqual(Array.isArray(body)?{data:body}:body);
 }
},15000);
it("rejects missing scope, ineffective undeclared paging and credentials before HTTP",async()=>{
 let requests=0;await connect(async()=>{requests++;return new Response("{}");});
 for(const args of [
  {name:"tournament_find",arguments:{}},
  {name:"tournament_find_brawl",arguments:{id:"fixture"}},
  {name:"tournament_mine",arguments:{}},
  {name:"tournament_battles",arguments:{id:"fixture",round:"1",username:"fixture_account"}},
  {name:"tournament_completed",arguments:{limit:"2",offset:"2"}},
  {name:"tournament_find",arguments:{id:"fixture",authorization:"credential"}}
 ]) expect((await client.callTool(args)).isError).toBe(true);
 expect(requests).toBe(0);
 const names=(await client.listTools()).tools.map(t=>t.name);
 for(const [id,name] of [["api.tournaments.frays","tournament_frays"],["api.tournaments.crown-pot","tournament_crown_pot"]]){
  expect(getCatalogueEntry(id!).owningTool).toBeNull();expect(names).not.toContain(name);
 }
});
it("preserves tournament totals, rounds and guild records while bounding player lists",async()=>{
 let body:unknown;await connect(async()=>new Response(JSON.stringify(body)));
 for(const [name,label,args] of [
  ["tournament_find","find",{id:"fixture"}],
  ["tournament_find_brawl","brawl",{id:"fixture",guild_id:"fixture"}]
 ] as const){
  const fixture=capture(label) as {players:unknown[];[key:string]:unknown};
  body={...fixture,players:Array.from({length:120},()=>fixture.players[0])};
  const result=await client.callTool({name,arguments:args});
  expect(result.isError).not.toBe(true);
  const data=result.structuredContent as {players:unknown[];[key:string]:unknown};
  expect(data.players.length).toBeGreaterThan(0);expect(data.players.length).toBeLessThanOrEqual(100);
  expect({...data,players:undefined}).toEqual({...fixture,players:undefined});
  expect(result._meta).toMatchObject({resultLimit:{truncated:true,upstreamRows:120}});
 }
});
it("accepts empty lists, rejects error objects and malformed participant rows",async()=>{
 let body:unknown=[];await connect(async()=>new Response(JSON.stringify(body)));
 expect((await client.callTool({name:"tournament_mine",arguments:{username:"fixture_account"}})).isError).not.toBe(true);
 body={error:"Tournament not found"};
 expect((await client.callTool({name:"tournament_find",arguments:{id:"fixture"}})).isError).toBe(true);
 const fixture=capture("find") as {players:unknown[]};
 body={...fixture,players:[...fixture.players,{}]};
 expect((await client.callTool({name:"tournament_find",arguments:{id:"fixture"}})).isError).toBe(true);
});

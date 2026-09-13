import {readFileSync} from "node:fs";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {InMemoryTransport} from "@modelcontextprotocol/sdk/inMemory.js";
import {afterEach,expect,it} from "vitest";
import {createServer} from "../src/server.js";
import {SETTINGS_TTL_MS} from "../src/http/cache.js";
const fixture=(label:string):unknown=>JSON.parse(readFileSync(new URL(`./fixtures/metadata-${label}.fixture.json`,import.meta.url),"utf8")).body;
let server:ReturnType<typeof createServer>;let client:Client;
afterEach(async()=>{await client?.close();await server?.close();});
async function connect(fetch:typeof globalThis.fetch,now:()=>number=Date.now){
 server=createServer({fetch,now,sleep:async()=>undefined,limiterOptions:{sleep:async()=>undefined}});
 client=new Client({name:"metadata-contract-test",version:"0.0.0"});
 const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a);
}
it("calls each metadata route on its fixed host and preserves full captured values",async()=>{
 let body:unknown;const urls:URL[]=[];
 await connect(async input=>{urls.push(new URL(String(input)));return new Response(JSON.stringify(body));});
 for(const [name,label,args,path,host] of [
  ["game_settings","settings",{},"/settings","api.splinterlands.com"],
  ["game_last_block","last-block",{},"/last_block","api.splinterlands.com"],
  ["game_maintenance","maintenance",{},"/maintenance_schedule","api.splinterlands.com"],
  ["transaction_lookup","lookup",{trx_id:"fixture-trx"},"/transactions/lookup","api.splinterlands.com"],
  ["transaction_metrics","metrics-filtered",{metrics:"battles",from:"2026-09-10"},"/transactions/metrics","api.splinterlands.com"],
  ["game_vapi_health","health",{},"/","vapi.splinterlands.com"]
 ] as const){
  body=fixture(label);const before=urls.length;
  const r=await client.callTool({name,arguments:args});
  expect(r.isError,name).not.toBe(true);expect(urls.length-before).toBe(1);
  expect(urls.at(-1)!.pathname).toBe(path);expect(urls.at(-1)!.hostname).toBe(host);
  expect(Object.fromEntries(urls.at(-1)!.searchParams)).toEqual(args);
  expect(r.structuredContent).toEqual(Array.isArray(body)?{data:body}:body);
 }
});
it("caches settings by exact query for one hour, advances age, and expires without caching blocks",async()=>{
 let now=Date.parse("2026-09-12T00:00:00Z");let requests=0;
 await connect(async input=>{requests++;return new Response(JSON.stringify(String(input).includes("last_block")?fixture("last-block"):fixture("settings")));},()=>now);
 const call=(args:Record<string,string>={})=>client.callTool({name:"game_settings",arguments:args});
 const first=await call();expect(requests).toBe(1);
 now+=1000;const hit=await call();expect(requests).toBe(1);
 expect(hit.structuredContent).toEqual(first.structuredContent);
 expect(hit._meta).toMatchObject({provenance:{freshness:{ageMs:1000}}});
 await call({version:"fixture"});expect(requests).toBe(2);
 now+=SETTINGS_TTL_MS;await call();expect(requests).toBe(3);
 await client.callTool({name:"game_last_block",arguments:{}});
 await client.callTool({name:"game_last_block",arguments:{}});
 expect(requests).toBe(5);
});
it("does not cache upstream errors and refuses absent scope and credentials before HTTP",async()=>{
 let requests=0;await connect(async()=>{requests++;return new Response(JSON.stringify({error:"temporary failure"}));});
 for(let i=0;i<2;i++)expect((await client.callTool({name:"game_settings",arguments:{}})).isError).toBe(true);
 expect(requests).toBe(2);
 for(const args of [
  {name:"transaction_lookup",arguments:{}},
  {name:"transaction_metrics",arguments:{metrics:"battles"}},
  {name:"game_settings",arguments:{token:"credential"}}
 ])expect((await client.callTool(args)).isError).toBe(true);
 expect(requests).toBe(2);
});
it("keeps metric series intact and refuses a series that exceeds the output bound",async()=>{
 const row=(fixture("metrics-filtered") as Record<string,unknown>[])[0]!;
 await connect(async()=>new Response(JSON.stringify([{...row,extra:"x".repeat(270000)}])));
 const result=await client.callTool({name:"transaction_metrics",arguments:{metrics:"battles",from:"2026-09-10"}});
 expect(result.isError).toBe(true);expect(result.structuredContent).toMatchObject({kind:"response_too_large"});
});

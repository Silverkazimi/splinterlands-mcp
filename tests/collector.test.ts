import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, expect, it } from "vitest";
import { createServer } from "../src/server.js";
import { getCatalogueEntry } from "../src/catalogue/index.js";
import { predicateFor } from "../src/catalogue/predicates.js";
const capture=()=>JSON.parse(readFileSync(new URL("./fixtures/collector-config.fixture.json",import.meta.url),"utf8")).body;
let client:Client;let server:ReturnType<typeof createServer>;
afterEach(async()=>{await client?.close();await server?.close();});
async function connect(fetch:typeof globalThis.fetch){
 server=createServer({fetch,sleep:async()=>undefined,limiterOptions:{sleep:async()=>undefined}});
 client=new Client({name:"collector-test",version:"0.0.0"});
 const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a);
}
it("returns the complete captured configuration through one anonymous GET",async()=>{
 const body=capture();const urls:URL[]=[];
 await connect(async input=>{urls.push(new URL(String(input)));return new Response(JSON.stringify(body));});
 const result=await client.callTool({name:"collector_config",arguments:{}});
 expect(result.isError).not.toBe(true);expect(result.structuredContent).toEqual(body);
 expect(urls).toHaveLength(1);expect(urls[0]!.href).toBe("https://vapi.splinterlands.com/collector/config");
 expect(body.data.shopItems).toHaveLength(10);expect(body.data.cosmetics).toHaveLength(70);
 expect(body.data.featuredAccounts).toHaveLength(6);
 expect(body.data.claim.expiresAt).toBeNull();
});
it("checks every list row without requiring nonempty optional inventories",()=>{
 const predicate=predicateFor(getCatalogueEntry("vapi.collector.config").resultContract);
 expect(predicate(capture())).toBe(true);
 const empty=capture();empty.data.shopItems=[];empty.data.cosmetics=[];empty.data.featuredAccounts=[];
 expect(predicate(empty)).toBe(true);
 for(const group of ["shopItems","cosmetics","featuredAccounts"]){
  const body=capture();body.data[group].push({});expect(predicate(body),group).toBe(false);
 }
 for(const body of [{},{status:"success"},{status:"success",data:null},{status:"success",data:{}}])expect(predicate(body)).toBe(false);
 const bad=capture();bad.data.maxPagesPerBinder="30";expect(predicate(bad)).toBe(false);
});
it("refuses oversized configuration as a whole and never truncates independent lists",async()=>{
 const body=capture();body.data.futureMetadata="x".repeat(270000);
 await connect(async()=>new Response(JSON.stringify(body)));
 const result=await client.callTool({name:"collector_config",arguments:{}});
 expect(result.isError).toBe(true);expect(result.structuredContent).toMatchObject({kind:"response_too_large"});
});
it("rejects account and credential inputs and does not register authenticated routes",async()=>{
 let calls=0;await connect(async()=>{calls++;return new Response("{}");});
 for(const args of [{player:"fixture_account"},{token:"credential"},{binderId:"fixture-binder"}]){
  expect((await client.callTool({name:"collector_config",arguments:args})).isError).toBe(true);
 }
 expect(calls).toBe(0);
 for(const id of ["vapi.collector.me","vapi.collector.me.stickers","vapi.collector.me.binders.by-id"]){
  const entry=getCatalogueEntry(id);expect(entry.owningTool).toBeNull();expect(entry.declared.authTier).toBe("requires_auth");expect(entry.measured).toBeNull();
 }
});

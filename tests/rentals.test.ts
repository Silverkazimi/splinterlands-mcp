import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, expect, it } from "vitest";
import { createServer } from "../src/server.js";
import { getCatalogueEntry } from "../src/catalogue/index.js";
import { predicateFor } from "../src/catalogue/predicates.js";
const capture = (label: string) => JSON.parse(readFileSync(new URL(`./fixtures/rental-${label}.fixture.json`, import.meta.url), "utf8")).body;
let client: Client;
let server: ReturnType<typeof createServer>;
afterEach(async () => { await client?.close(); await server?.close(); });
async function connect(fetch: typeof globalThis.fetch) {
 server = createServer({ fetch, sleep: async () => undefined, limiterOptions: { sleep: async () => undefined } });
 client = new Client({ name: "rental-test", version: "0.0.0" });
 const [a,b] = InMemoryTransport.createLinkedPair(); await server.connect(b); await client.connect(a);
}
it("forwards exact bounded filters and preserves offers, bids and price wire values", async () => {
 let body: unknown; const urls: URL[] = [];
 await connect(async input => { urls.push(new URL(String(input))); return new Response(JSON.stringify(body)); });
 for (const family of ["offers","bids"]) {
  for (const low of [false,true]) {
   body = capture(family + (low ? "-lowest" : ""));
   const args = low ? {} : { limit:2,offset:0,minQuantity:100,maxQuantity:10000,maxPrice:1 };
   const result = await client.callTool({ name:"rental_"+family+(low?"_lowest_price":""),arguments:args });
   expect(result.isError).not.toBe(true); expect(result.structuredContent).toEqual(body);
   const url=urls.at(-1)!;expect(url.hostname).toBe("vapi.splinterlands.com");
   expect(url.pathname).toBe("/delegation-rental/v3/"+family+(low?"/lowest-price":""));
   expect(Object.fromEntries(url.searchParams)).toEqual(Object.fromEntries(Object.entries(args).map(([k,v])=>[k,String(v)])));
  }
 }
 expect(urls).toHaveLength(4);
});
it("preserves empty filtered results and rejects malformed later rows", () => {
 for (const family of ["offers","bids"]) {
  const predicate=predicateFor(getCatalogueEntry("vapi.delegation-rental.v3."+family).resultContract);
  expect(predicate(capture(family+"-price-filter"))).toBe(true);
  expect(predicate(capture(family))).toBe(true);
  for (const body of [{},{status:"success"},{status:"success",data:null},{status:"success",data:{}},{status:"success",data:[capture(family).data[0],{}]}]) expect(predicate(body)).toBe(false);
 }
});
it("accepts the spec's nullable lowest price but refuses a missing price record", () => {
 for (const family of ["offers","bids"]) {
  const predicate=predicateFor(getCatalogueEntry("vapi.delegation-rental.v3."+family+".lowest-price").resultContract);
  expect(predicate({status:"success",data:{price:null}})).toBe(true);
  expect(predicate(capture(family+"-lowest"))).toBe(true);
  for (const data of [null,{},[],{price:1}])expect(predicate({status:"success",data})).toBe(false);
 }
});
it("forwards page and quantity selectors without assuming separately captured pages are atomic", async () => {
 let body: unknown;
 const urls: URL[] = [];
 await connect(async input => { urls.push(new URL(String(input))); return new Response(JSON.stringify(body)); });
 for (const family of ["offers", "bids"]) {
  for (const [suffix, args] of [
   ["", { limit: 2, offset: 0 }],
   ["-next", { limit: 2, offset: 2 }],
   ["-four", { limit: 4, offset: 0 }],
   ["-range", { limit: 2, minQuantity: 10000, maxQuantity: 10000 }],
   ["-max-quantity", { limit: 2, maxQuantity: 1000 }],
  ] as const) {
   body = capture(family + suffix);
   const result = await client.callTool({ name: "rental_" + family, arguments: args });
   expect(result.isError).not.toBe(true);
   expect(result.structuredContent).toEqual(body);
   expect(Object.fromEntries(urls.at(-1)!.searchParams)).toEqual(
    Object.fromEntries(Object.entries(args).map(([key, value]) => [key, String(value)])));
  }
 }
});
it("enforces local request bounds and rejects undeclared credentials before HTTP", async () => {
 let calls=0;await connect(async()=>{calls++;return new Response("{}");});
 for (const args of [{},{limit:0},{limit:101},{limit:1.5},{limit:2,offset:-1},{limit:2,offset:0.5},{limit:2,token:"credential"}]) {
  expect((await client.callTool({name:"rental_offers",arguments:args})).isError).toBe(true);
 }
 expect(calls).toBe(0);
});
it("surfaces upstream decimal-filter failures without silently rescaling",async()=>{
 let url:URL|undefined;
 await connect(async input=>{url=new URL(String(input));return new Response(JSON.stringify({status:"fail",message:"Validation failed (numeric string is expected)"}),{status:400});});
 const result=await client.callTool({name:"rental_bids",arguments:{limit:2,minPrice:0.001}});
 expect(url?.searchParams.get("minPrice")).toBe("0.001");expect(result.isError).toBe(true);
});
it("bounds returned rows even when the upstream exceeds the requested limit",async()=>{
 const row=capture("offers").data[0];let calls=0;
 await connect(async()=>{calls++;return new Response(JSON.stringify({status:"success",data:Array.from({length:120},()=>row)}));});
 const result=await client.callTool({name:"rental_offers",arguments:{limit:2}});
 expect(result.isError).not.toBe(true);expect(calls).toBe(1);
 expect(result.structuredContent).toEqual({status:"success",data:Array.from({length:100},()=>row)});
 expect(result._meta).toMatchObject({resultLimit:{truncated:true,returnedRows:100,upstreamRows:120}});
});

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect,it } from "vitest";
import { createServer } from "../src/server.js";
import { getCatalogueEntry } from "../src/catalogue/index.js";
import { predicateFor } from "../src/catalogue/predicates.js";
import fixture from "./fixtures/collector-stickers-tradeable.fixture.json" with { type: "json" };
it("reads tradeable stickers using the exact player route and preserves relative assets",async()=>{
 const urls:string[]=[];const server=createServer({fetch:async u=>{urls.push(String(u));return new Response(JSON.stringify(fixture.body));}});
 const client=new Client({name:"tradeable-test",version:"0.0.0"});const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);
 try{
  expect((await client.callTool({name:"collector_stickers_tradeable",arguments:{player:" "}})).isError).toBe(true);expect(urls).toHaveLength(0);
  const r=await client.callTool({name:"collector_stickers_tradeable",arguments:{player:"sampleacct"}});
  expect(r.isError).not.toBe(true);expect(r.structuredContent).toEqual(fixture.body);
  expect(urls).toHaveLength(1);expect(new URL(urls[0]!).pathname).toBe("/collector/sampleacct/stickers/tradeable");
 }finally{await client.close();await server.close();}
});
it("validates later sticker rows and leaves empty data distinct from malformed data",()=>{
 const p=predicateFor(getCatalogueEntry("vapi.collector.stickers.tradeable").resultContract);
 expect(p(fixture.body)).toBe(true);expect(p({status:"success",data:[]})).toBe(true);
 const rows=Array.from({length:101},()=>({...fixture.body.data[0]!}));
 expect(p({status:"success",data:rows.map((r,i)=>i===100?{...r,isTradeable:"true"}:r)})).toBe(false);
 expect(p({status:"success",data:null})).toBe(false);
});
it("keeps the sale route excluded with empty-only evidence",()=>{
 const e=getCatalogueEntry("vapi.collector.stickers.for-sale");
 expect(e.owningTool).toBeNull();expect(e.resultContract.fingerprint).toEqual({});
 expect(e.notes).toContain("remain unverified");
});

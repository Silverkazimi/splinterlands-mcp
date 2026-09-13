import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, it, expect } from "vitest";
import { createServer } from "../src/server.js";
import { predicateFor } from "../src/catalogue/predicates.js";
import { getCatalogueEntry } from "../src/catalogue/index.js";
import offers from "./fixtures/rental-offers-by-player.fixture.json" with { type: "json" };
import bids from "./fixtures/rental-bids-by-player.fixture.json" with { type: "json" };
import rentals from "./fixtures/rentals-v3-by-player.fixture.json" with { type: "json" };
import roles from "./fixtures/rentals-v3-by-role.fixture.json" with { type: "json" };
const cases = [
 ["rental_offers_by_player", "vapi.delegation-rental.v3.offers.player", "/delegation-rental/v3/offers/player/sampleacct", offers.body],
 ["rental_bids_by_player", "vapi.delegation-rental.v3.bids.player", "/delegation-rental/v3/bids/player/sampleacct", bids.body],
 ["rentals_v3_by_player", "vapi.delegation-rental.v3.rentals.player", "/delegation-rental/v3/rentals/player/sampleacct", rentals.body],
 ["rentals_v3_by_role", "vapi.delegation-rental.v3.rentals.player.role", "/delegation-rental/v3/rentals/player/sampleacct/lender", roles.body],
] as const;
async function rig(body: unknown) {
 const urls: URL[] = [];
 const server = createServer({fetch: async (input) => { urls.push(new URL(String(input))); return new Response(JSON.stringify(body)); }});
 const client = new Client({name:"v3-rental-test",version:"0.0.0"});
 const [ct,st] = InMemoryTransport.createLinkedPair();
 await server.connect(st); await client.connect(ct);
 return {client,urls,close:async()=>{await client.close();await server.close();}};
}
describe.each(cases)("%s", (name, entryId, path, body) => {
 it("requires bounded selectors and preserves the complete wire response", async () => {
  const r=await rig(body);
  try {
   for (const args of [{limit:4},{player:" ",limit:4},{player:"sampleacct",limit:101},{player:"sampleacct",limit:4,offset:-1}])
    expect((await r.client.callTool({name,arguments:args})).isError).toBe(true);
   expect(r.urls).toHaveLength(0);
   const args={player:"sampleacct",limit:4,offset:0,sort:"amount",order:"asc",...(name.endsWith("role")?{role:"lender"}:{})};
   const result=await r.client.callTool({name,arguments:args});
   expect(result.isError).not.toBe(true);
   expect(result.structuredContent).toEqual(body);
   expect(r.urls).toHaveLength(1);
   expect(r.urls[0]!.pathname).toBe(path);
   expect(Object.fromEntries(r.urls[0]!.searchParams)).toEqual({limit:"4",offset:"0",sort:"amount",order:"asc"});
  } finally {await r.close();}
 });
 it("validates later rows and numeric strings; accepts empty lists without inventing results", () => {
  const validate=predicateFor(getCatalogueEntry(entryId).resultContract);
  const key=name.startsWith("rental_")?"qtyAvailable":"qty";
  const rows=Array.from({length:101},()=>({...body.data[0]}));
  expect(validate({status:"success",data:rows})).toBe(true);
  expect(validate({status:"success",data:rows.map((row,i)=>i===100?{...row,[key]:42}:row)})).toBe(false);
  expect(validate({status:"success",data:[]})).toBe(true);
  expect(validate({status:"success",data:null})).toBe(false);
  expect(validate({status:"success",data:[{}]})).toBe(false);
 });
 it("returns at most 100 complete rows", async () => {
  const r=await rig({status:"success",data:Array.from({length:110},()=>body.data[0])});
  try {
   const result=await r.client.callTool({name,arguments:{player:"sampleacct",limit:100,...(name.endsWith("role")?{role:"lender"}:{})}});
   expect(result.isError).not.toBe(true);
   expect((result.structuredContent as {data:unknown[]}).data).toHaveLength(100);
   expect(r.urls).toHaveLength(1);
  } finally {await r.close();}
 });
});
it("forwards player-role and counterparty filters without changing their meaning", async () => {
 const r=await rig(rentals.body);
 try {
  await r.client.callTool({name:"rentals_v3_by_player",arguments:{player:"sampleacct",limit:4,role:"borrower",counterparty:"part",status:"active"}});
  expect(Object.fromEntries(r.urls[0]!.searchParams)).toEqual({limit:"4",role:"borrower",counterparty:"part",status:"active"});
 } finally {await r.close();}
});
it("keeps the empty-only pending offer route unbound", () => {
 const entry=getCatalogueEntry("vapi.delegation-rental.v3.offers.pending.player");
 expect(entry.owningTool).toBeNull();
 expect(entry.resultContract.fingerprint).toEqual({});
 expect(entry.notes).toContain("populated wire contract remains unverified");
});

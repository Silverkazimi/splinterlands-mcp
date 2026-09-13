import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, it } from "vitest";
import { createServer } from "../src/server.js";
const body = (name: string) => JSON.parse(readFileSync(new URL("./fixtures/collector-" + name + ".fixture.json", import.meta.url), "utf8")).body;
async function rig(value: unknown) {
 const urls: URL[]=[];
 const server=createServer({fetch:async input=>{urls.push(new URL(String(input)));return new Response(JSON.stringify(value));}});
 const client=new Client({name:"collector-player-test",version:"0.0.0"});
 const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a);
 return {urls,call:(name:string,args:Record<string,unknown>)=>client.callTool({name,arguments:args}),close:async()=>{await client.close();await server.close();}};
}
it("preserves all three captured collector responses with one correctly scoped GET",async()=>{
 for(const suffix of ["player","binder","stickers"]){
  const capture=body(suffix);const r=await rig(capture);
  try {
   expect((await r.call("collector_"+suffix,{})).isError).toBe(true);
   expect(r.urls).toHaveLength(0);
   const args=suffix==="binder"?{player:"fixture_account",binderRef:"fixture-binder"}:{player:"fixture_account"};
   const result=await r.call("collector_"+suffix,args);
   expect(result.isError).not.toBe(true);expect(result.structuredContent).toEqual(capture);
   expect(r.urls).toHaveLength(1);
   expect(r.urls[0]!.pathname).toBe("/collector/fixture_account"+(suffix==="binder"?"/fixture-binder":suffix==="stickers"?"/stickers/all":""));
  } finally {await r.close();}
 }
});
it("rejects malformed nested binder slots and oversized objects without dropping fields",async()=>{
 for(const malformed of [true,false]){
  const capture=body("binder");
  if(malformed)capture.data.pages[2].slots[8].slotIndex="eight";
  else capture.data.extra="x".repeat(270000);
  const r=await rig(capture);
  try {
   const result=await r.call("collector_binder",{player:"fixture_account",binderRef:"fixture-binder"});
   expect(result.isError).toBe(true);
   expect(result.structuredContent).toMatchObject({kind:malformed?"upstream_malformed":"response_too_large"});
  } finally {await r.close();}
 }
});
it("caps stickers and validates malformed rows beyond the returned prefix",async()=>{
 const capture=body("stickers");capture.data=Array.from({length:120},()=>structuredClone(capture.data[0]));
 for(const malformed of [false,true]){
  if(malformed)capture.data[119].cosmetic.isPremium="false";
  const r=await rig(capture);
  try{
   const result=await r.call("collector_stickers",{player:"fixture_account"});
   if(malformed)expect(result.isError).toBe(true);
   else {expect(result.isError).not.toBe(true);expect((result.structuredContent as {data:unknown[]}).data).toHaveLength(100);}
   expect(r.urls).toHaveLength(1);
  }finally{await r.close();}
 }
});

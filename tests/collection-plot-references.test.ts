import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {InMemoryTransport} from "@modelcontextprotocol/sdk/inMemory.js";
import {expect,it} from "vitest";
import {createServer} from "../src/server.js";
import definitions from "./fixtures/api-cards-get-details.fixture.json" with {type:"json"};
import collection from "./fixtures/api-cards-collection.fixture.json" with {type:"json"};
import search from "./fixtures/land-deeds-search-limited.fixture.json" with {type:"json"};
import deed from "./fixtures/plot-label-101.fixture.json" with {type:"json"};
async function rig(mode="normal"){
 let clock=Date.parse("2026-09-13T00:00:00Z");
 const urls:URL[]=[];
 const record={...deed.body.data,player:"synthetic"};
 const records=mode==="missing"?[]:mode==="foreign"?[{...record,player:"someoneelse"}]:mode==="conflict"?[record,{...record,deed_uid:"conflicting"}]:[record];
 const cards=[{...collection.body.cards[0]!,stake_start_date:"2026-09-01T00:00:00Z",
  stake_end_date:mode==="cooldown"?"2026-09-14T00:00:00Z":null,stake_plot:mode==="none"?null:101}];
 const server=createServer({now:()=>clock,sleep:async(ms)=>{clock+=ms;},fetch:async input=>{
  const url=new URL(String(input));urls.push(url);
  if(url.pathname==="/cards/get_details")return new Response(JSON.stringify(definitions.body));
  if(url.pathname==="/cards/collection/synthetic")return new Response(JSON.stringify({player:"synthetic",cards}));
  if(url.pathname==="/land/deeds"){
   expect(Object.fromEntries(url.searchParams)).toEqual({limit:"200",player:"synthetic"});
   return new Response(JSON.stringify(mode==="auth"?{}:mode==="empty"?{status:"success",data:[]}:{status:"success",data:{...search.data,deeds:records}}),{status:mode==="auth"?401:200});
  }
  throw Error("Unexpected request");
 }});
 const c=new Client({name:"collection-labels",version:"0.0.0"}),[ct,st]=InMemoryTransport.createLinkedPair();
 await server.connect(st);await c.connect(ct);
 return {c,urls,close:async()=>{await c.close();await server.close();}};
}
it("resolves verified labels in three reads and reuses the collection when only labels are toggled",async()=>{
 const r=await rig();
 try{
  const first=await r.c.callTool({name:"cards_collection",arguments:{username:"synthetic"}});
  expect(first.isError).not.toBe(true);expect(r.urls).toHaveLength(2);
  expect(first.structuredContent).not.toHaveProperty("plot_references");
  const second=await r.c.callTool({name:"cards_collection",arguments:{username:"synthetic",include_plot_references:true}});
  expect(second.isError).not.toBe(true);expect(r.urls).toHaveLength(3);
  expect(second.structuredContent).toMatchObject({cache:"hit",cards:[{stake_plot:101,reported_stake_plot_reference:{plot_id:101,plot_label:"002-01-001",deed_uid:deed.body.data.deed_uid}}],plot_references:{status:"resolved",unresolved_plot_ids:[]}});
 }finally{await r.close();}
});
it.each(["missing","foreign","conflict","auth","empty"])("preserves unknown labels for %s without extra lookups",async mode=>{
 const r=await rig(mode);
 try{
  const result=await r.c.callTool({name:"cards_collection",arguments:{username:"synthetic",include_plot_references:true}});
  expect(result.isError).not.toBe(true);expect(r.urls).toHaveLength(3);
  expect(result.structuredContent).toMatchObject({cards:[{stake_plot:101,reported_stake_plot_reference:null}],plot_references:{status:mode==="auth"||mode==="empty"?"unavailable":"partial",unresolved_plot_ids:[101]}});
 }finally{await r.close();}
});
it("labels a cooling card's reported former plot without calling it occupied",async()=>{
 const r=await rig("cooldown");
 try{
  const result=await r.c.callTool({name:"cards_collection",arguments:{username:"synthetic",include_plot_references:true}});
  expect(result.structuredContent).toMatchObject({cards:[{staking_status:"unstaking",reported_stake_plot_reference:{plot_label:"002-01-001"}}],plot_references:{scope:expect.stringContaining("historical, not occupied")}});
 }finally{await r.close();}
});
it("does not fetch deeds when returned cards have no numeric plot reference",async()=>{
 const r=await rig("none");
 try{
  const result=await r.c.callTool({name:"cards_collection",arguments:{username:"synthetic",include_plot_references:true}});
  expect(result.isError).not.toBe(true);expect(r.urls).toHaveLength(2);
  expect(result.structuredContent).toMatchObject({plot_references:{status:"not_needed",requested_plots:0}});
 }finally{await r.close();}
});

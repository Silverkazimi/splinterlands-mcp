import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {InMemoryTransport} from "@modelcontextprotocol/sdk/inMemory.js";
import {expect,it} from "vitest";
import {createServer} from "../src/server.js";
import {getCatalogueEntry} from "../src/catalogue/index.js";
import {predicateFor} from "../src/catalogue/predicates.js";
import deed from "./fixtures/plot-label-101.fixture.json" with {type:"json"};
import available from "./fixtures/power-core-available.fixture.json" with {type:"json"};
import grouped from "./fixtures/power-core-grouped.fixture.json" with {type:"json"};
it.each([["available",available.body],["grouped",grouped.body]] as const)("reads bounded Power Core %s with verified plot identity",async(kind,body)=>{
 const urls:URL[]=[];const server=createServer({fetch:async input=>{const u=new URL(String(input));urls.push(u);return new Response(JSON.stringify(u.pathname.startsWith("/land/deeds/")?deed.body:body));}});
 const c=new Client({name:"power-core-test",version:"0.0.0"});const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await c.connect(ct);
 const args={player:"sampleacct",plot_id:101,offset:0,limit:1,...(kind==="grouped"?{order_by:1,order_by_asc:0}:{})};
 try{
  const name="land_power_core_"+kind;
  expect((await c.callTool({name,arguments:{...args,stakeTypeUid:"STK-LND-TOT"}})).isError).toBe(true);expect(urls).toHaveLength(0);
  const result=await c.callTool({name,arguments:args});
  expect(result.isError).not.toBe(true);expect(result.structuredContent).toMatchObject({...body,plot_reference:{plot_id:101,plot_label:"002-01-001",deed_uid:deed.body.data.deed_uid}});
  expect(urls).toHaveLength(2);expect(urls[1]!.pathname).toBe("/land/stake/items/STK-LND-PCR/"+kind);
  expect(Object.fromEntries(urls[1]!.searchParams)).toEqual({player:"sampleacct",deedUid:deed.body.data.deed_uid,offset:"0",limit:"1",...(kind==="grouped"?{order_by:"1",order_by_asc:"0"}:{})});
 }finally{await c.close();await server.close();}
});
it("validates every available UID and grouped count, including rows beyond the output cap",()=>{
 const a=predicateFor(getCatalogueEntry("vapi.land.stake.items-available").resultContract);
 const g=predicateFor(getCatalogueEntry("vapi.land.stake.items-grouped").resultContract);
 expect(a(available.body)).toBe(true);expect(g(grouped.body)).toBe(true);
 expect(a({status:"success",data:{ids:[]}})).toBe(true);
 expect(g({status:"success",data:{items:[]}})).toBe(true);
 expect(a({status:"success",data:{ids:Array.from({length:101},(_,i)=>({uid:i===100?0:"synthetic"}))}})).toBe(false);
 expect(g({status:"success",data:{items:[{...grouped.body.data.items[0],item_count:"94"}]}})).toBe(false);
 expect(g({status:"success",data:null})).toBe(false);
});

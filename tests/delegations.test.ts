import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { it, expect } from "vitest";
import { createServer } from "../src/server.js";
import { getCatalogueEntry } from "../src/catalogue/index.js";
import { predicateFor } from "../src/catalogue/predicates.js";
import outgoing from "./fixtures/delegations-outgoing.fixture.json" with { type: "json" };
import incoming from "./fixtures/delegations-incoming.fixture.json" with { type: "json" };
import pair from "./fixtures/delegation-to-target.fixture.json" with { type: "json" };
const cases=[
 ["delegations_outgoing","vapi.delegation.outgoing","/delegation/outgoing/sampleacct",outgoing.body],
 ["delegations_incoming","vapi.delegation.incoming","/delegation/incoming/sampleacct",incoming.body],
 ["delegation_to_target","vapi.delegation.delegation","/delegation/delegation/sampleacct/targetacct",pair.body],
] as const;
it.each(cases)("%s preserves direction, values and explicit selectors",async(name,_id,path,body)=>{
 const urls:string[]=[];
 const server=createServer({fetch:async input=>{urls.push(String(input));return new Response(JSON.stringify(body));}});
 const client=new Client({name:"delegation-test",version:"0.0.0"});
 const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);
 try{
  for(const args of [{},{player:""},{player:"sampleacct"}])
   expect((await client.callTool({name,arguments:args})).isError).toBe(true);
  expect(urls).toHaveLength(0);
  const args=name==="delegation_to_target"?{player:"sampleacct",target:"targetacct"}:{player:"sampleacct",limit:4,offset:0};
  const result=await client.callTool({name,arguments:args});
  expect(result.isError).not.toBe(true);expect(result.structuredContent).toEqual(body);
  expect(urls).toHaveLength(1);expect(new URL(urls[0]!).pathname).toBe(path);
 }finally{await client.close();await server.close();}
});
it.each(cases)("%s validates types throughout and accepts nullable dates",(_name,id,_path,body)=>{
 const validate=predicateFor(getCatalogueEntry(id).resultContract);
 expect(validate(body)).toBe(true);
 if(Array.isArray(body.data)){
  const first=body.data[0];
  const rows=Array.from({length:101},()=>({...first}));
  expect(validate({status:"success",data:rows.map((r,i)=>i===100?{...r,amount:42}:r)})).toBe(false);
  expect(validate({status:"success",data:[{...body.data[0],lastManualDelegationDate:null}]})).toBe(true);
  expect(validate({status:"success",data:[]})).toBe(true);
 }else{
  expect(validate({status:"success",data:{...body.data,amount:"0.000",isFromRental:false}})).toBe(true);
  expect(validate({status:"success",data:{...body.data,amount:0}})).toBe(false);
 }
 expect(validate({status:"success",data:null})).toBe(false);
});
it("keeps a missing pair distinct from an empty delegation",async()=>{
 const server=createServer({fetch:async()=>new Response(JSON.stringify({status:"fail",data:{}}),{status:404})});
 const client=new Client({name:"delegation-missing-test",version:"0.0.0"});
 const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);
 try{
  const result=await client.callTool({name:"delegation_to_target",arguments:{player:"sampleacct",target:"targetacct"}});
  expect(result.isError).toBe(true);
 }finally{await client.close();await server.close();}
});

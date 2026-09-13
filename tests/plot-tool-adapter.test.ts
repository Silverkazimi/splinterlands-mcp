import { predicateFor } from "../src/catalogue/predicates.js";
import {readFileSync} from "node:fs";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {InMemoryTransport} from "@modelcontextprotocol/sdk/inMemory.js";
import {afterEach,expect,it} from "vitest";
import {createServer,TOOL_ENTRY_IDS} from "../src/server.js";
import {PLOT_TOOL_KEYS} from "../src/plot-tool-adapter.js";
import {getCatalogueEntry} from "../src/catalogue/index.js";
import {withCallScope,registerLogicalRequest} from "../src/http/callscope.js";
const fixture=(file:string)=>{
 const raw=JSON.parse(readFileSync(new URL("./fixtures/"+file,import.meta.url),"utf8"));
 if(raw.body)return raw.body;
 const {provenance:_p,valueClasses:_v,...body}=raw;return body;
};
const baseline=JSON.parse(readFileSync(new URL("../scripts/drift/baseline-input.json",import.meta.url),"utf8")) as Record<string,{entryId:string}>;
const deed=(uidView=false)=>({status:"success",data:{...fixture(uidView?"land-deed-by-uid-hit.fixture.json":"plot-label-101.fixture.json").data,plot_id:101,region_number:2,tract_number:1,plot_number:1,deed_uid:"fixture-deed"}});
let client:Client;let server:ReturnType<typeof createServer>;
afterEach(async()=>{await client?.close();await server?.close();});
async function connect(fetch:typeof globalThis.fetch){
 server=createServer({fetch,sleep:async()=>undefined,limiterOptions:{sleep:async()=>undefined}});
 client=new Client({name:"compound-plot-test",version:"0.0.0"});
 const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a);
}
it("supports labels on all registered plot adapters, retaining target contracts and a two-request ceiling",async()=>{
 const urls:URL[]=[];let targetBody:unknown;
 await connect(async input=>{
  const url=new URL(String(input));urls.push(url);
  if(url.pathname==="/land/deeds/101"||url.pathname==="/land/deeds/details/fixture-deed")return new Response(JSON.stringify(deed(url.pathname.includes("/details/"))));
  return new Response(JSON.stringify(targetBody));
 });
 for(const tool of Object.keys(PLOT_TOOL_KEYS)){
  const bindings: Readonly<Record<string,string>> = TOOL_ENTRY_IDS;
  const entryId=bindings[tool]!;
  const file=Object.entries(baseline).find(([,value])=>value.entryId===entryId)?.[0];
  if(!file)throw new Error("Missing existing target fixture: "+tool);
  targetBody=fixture(file);
  const isCore=tool.startsWith("land_power_core_");
  const args={plot_id:"2-1-1",...(isCore?{player:"synthetic-player",limit:1,offset:0}:{}),...(tool==="land_power_core_grouped"?{order_by:1,order_by_asc:0}:{})};
  const before=urls.length;const result=await client.callTool({name:tool,arguments:args});
  expect(result.isError,tool+" "+JSON.stringify(result.structuredContent)).not.toBe(true);
  expect(result.structuredContent,tool).toMatchObject({plot_reference:{plot_id:101,plot_label:"002-01-001",deed_uid:"fixture-deed"}});
  if(tool==="land_stake_deed_details") {
   expect(result.structuredContent).toHaveProperty("plot_view.display");
   expect(result.structuredContent).toHaveProperty("plot_view.reference_values");
   expect((result.structuredContent as Record<string, unknown> | undefined)?.data).toEqual((targetBody as {data:unknown}).data);
  }
  expect(urls.length-before,tool).toBe(tool==="land_deed_by_plot"?1:2);
  expect(urls[before]!.pathname).toBe("/land/deeds/101");
  if(tool!=="land_deed_by_plot"){
   const path=getCatalogueEntry(entryId).pathTemplate.replace(/\{[^}]+\}/,isCore?"STK-LND-PCR":"fixture-deed");
   expect(urls.at(-1)!.pathname,tool).toBe(path);
  }
 }
},15000);
it("accepts the canonical UID alias on camel-case routes and preserves paging parameters",async()=>{
 const urls:URL[]=[];
 await connect(async input=>{
  const url=new URL(String(input));urls.push(url);
  return new Response(JSON.stringify(url.pathname.includes("/land/deeds/details/")?deed(true):{status:"success",data:[]}));
 });
 const result=await client.callTool({name:"land_resources_rewardactions",arguments:{deed_uid:"fixture-deed",limit:2,offset:0}});
 expect(result.isError).not.toBe(true);expect(urls).toHaveLength(2);
 expect(urls[0]!.pathname).toBe("/land/deeds/details/fixture-deed");
 expect(urls[1]!.pathname).toBe("/land/resources/rewardactions/fixture-deed");
 expect(Object.fromEntries(urls[1]!.searchParams)).toEqual({limit:"2",offset:"0"});
});
it("stops before the target if resolution is empty or points at another location",async()=>{
 let body:unknown={status:"success",data:null};let calls=0;
 await connect(async()=>{calls++;return new Response(JSON.stringify(body));});
 for(const response of [{status:"success",data:null},{...deed(),data:{...deed().data,region_number:3}}]){
  body=response;const before=calls;
  const result=await client.callTool({name:"land_stake_assets",arguments:{plot_id:"2-1-1"}});
  expect(result.isError).toBe(true);expect(result.structuredContent).toMatchObject({kind:"plot_resolution_unverified"});
  expect(calls-before).toBe(1);
 }
});
it("rejects conflicting references and unknown credentials before resolution",async()=>{
 let calls=0;await connect(async()=>{calls++;return new Response("{}");});
 for(const args of [{},{plot_id:101,deed_uid:"fixture-deed"},{deedUID:"fixture-deed",deed_uid:"fixture-deed"},{plot_id:"2-1-1",token:"credential"}]){
  expect((await client.callTool({name:"land_resources_taxes",arguments:args})).isError).toBe(true);
 }
 expect(calls).toBe(0);
});
it("refuses a third request in a two-request scope and prevents nested budget resets",async()=>{
 await expect(withCallScope("compound",async()=>{
  registerLogicalRequest("https://vapi.splinterlands.com/one");
  registerLogicalRequest("https://vapi.splinterlands.com/two");
  registerLogicalRequest("https://vapi.splinterlands.com/three");
 },2)).rejects.toMatchObject({kind:"refusal_would_fan_out"});
 await expect(withCallScope("ordinary",async()=>{
  registerLogicalRequest("https://vapi.splinterlands.com/one");
  await withCallScope("nested",async()=>{registerLogicalRequest("https://vapi.splinterlands.com/two");},2);
 })).rejects.toMatchObject({kind:"refusal_would_fan_out"});
});

it("preserves live null market fields on unlisted UID-view deeds",()=>{
 const predicate=predicateFor(getCatalogueEntry("vapi.land.deeds.details-by-uid").resultContract);
 for(const n of [101,15001]){
  const body=fixture("plot-uid-unlisted-"+n+".fixture.json");
  expect(predicate(body)).toBe(true);expect(body.data.listing_price).toBeNull();
  body.data.listing_price="wrong-type";expect(predicate(body)).toBe(false);
 }
});


it("refuses a mismatched numeric deed identity on the native lookup",async()=>{
 await connect(async()=>new Response(JSON.stringify(deed())));
 const result=await client.callTool({name:"land_deed_by_plot",arguments:{plot_id:102}});
 expect(result.isError).toBe(true);expect(result.structuredContent).toMatchObject({kind:"plot_resolution_unverified"});
});

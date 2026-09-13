import {readFileSync} from "node:fs";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {InMemoryTransport} from "@modelcontextprotocol/sdk/inMemory.js";
import {afterEach,expect,it} from "vitest";
import {createServer} from "../src/server.js";
import {parsePlotLabel,candidatePlotId,formatPlotLabel} from "../src/plot-references.js";
const capture=(id:number)=>JSON.parse(readFileSync(new URL(`./fixtures/plot-label-${id}.fixture.json`,import.meta.url),"utf8")).body;
let client:Client;let server:ReturnType<typeof createServer>;
afterEach(async()=>{await client?.close();await server?.close();});
async function connect(fetch:typeof globalThis.fetch){
 server=createServer({fetch,sleep:async()=>undefined,limiterOptions:{sleep:async()=>undefined}});
 client=new Client({name:"plot-label-test",version:"0.0.0"});
 const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a);
}
it("parses padded and unpadded labels with strict geographical bounds",()=>{
 for(const [label,id,canonical] of [
  ["1-1-1",1,"001-01-001"],["001-01-100",100,"001-01-100"],
  ["2-1-1",101,"002-01-001"],["1-2-1",15001,"001-02-001"],
  ["150-10-100",150000,"150-10-100"]
 ] as const){
  const coordinates=parsePlotLabel(label)!;expect(candidatePlotId(coordinates)).toBe(id);expect(formatPlotLabel(coordinates)).toBe(canonical);
 }
 for(const label of ["0-1-1","151-1-1","1-0-1","1-11-1","1-1-0","1-1-101","1/1/1","1-1-1x","0001-01-001","1-1","1.0-1-1"]){
  expect(parsePlotLabel(label),label).toBeUndefined();
 }
});
it("resolves each label in one GET and returns all three identities",async()=>{
 const urls:URL[]=[];let body=capture(101);
 await connect(async input=>{urls.push(new URL(String(input)));return new Response(JSON.stringify(body));});
 for(const [input,id,label] of [["2-1-1",101,"002-01-001"],["001-02-001",15001,"001-02-001"],[15001,15001,"001-02-001"]] as const){
  body=capture(id);const result=await client.callTool({name:"land_deed_by_plot",arguments:{plot_id:input}});
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toMatchObject({status:"success",plot_reference:{plot_id:id,plot_label:label,deed_uid:body.data.deed_uid}});
  expect(urls.at(-1)!.href).toBe("https://vapi.splinterlands.com/land/deeds/"+id);
 }
 expect(urls).toHaveLength(3);
});
it("does not present a different deed as a label match",async()=>{
 await connect(async()=>new Response(JSON.stringify(capture(101))));
 const result=await client.callTool({name:"land_deed_by_plot",arguments:{plot_id:"1-2-1"}});
 expect(result.isError).toBe(true);
 expect(result.structuredContent).toMatchObject({kind:"plot_resolution_unverified",candidate_plot_id:15001});
 expect(result.structuredContent).not.toHaveProperty("data");
});
it("distinguishes empty label resolution from the existing numeric empty result",async()=>{
 await connect(async()=>new Response(JSON.stringify({status:"success",data:null})));
 const label=await client.callTool({name:"land_deed_by_plot",arguments:{plot_id:"150-10-100"}});
 expect(label.isError).toBe(true);expect(label.structuredContent).toMatchObject({kind:"plot_resolution_unverified"});
 const numeric=await client.callTool({name:"land_deed_by_plot",arguments:{plot_id:150000}});
 expect(numeric.isError).not.toBe(true);expect(numeric.structuredContent).toMatchObject({status:"success",data:null});
});
it("refuses invalid labels, missing inputs and credentials before HTTP",async()=>{
 let calls=0;await connect(async()=>{calls++;return new Response("{}");});
 for(const args of [{},{plot_id:0},{plot_id:"1-11-1"},{plot_id:"1-2-1",token:"credential"}]){
  expect((await client.callTool({name:"land_deed_by_plot",arguments:args})).isError).toBe(true);
 }
 expect(calls).toBe(0);
});

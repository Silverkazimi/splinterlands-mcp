import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {InMemoryTransport} from "@modelcontextprotocol/sdk/inMemory.js";
import {afterEach,expect,it} from "vitest";
import {z} from "zod";
import {createServer} from "../src/server.js";
import {registerLogicalRequest,currentCallRequestCount} from "../src/http/callscope.js";
let client:Client;let server:ReturnType<typeof createServer>;
afterEach(async()=>{await client?.close();await server?.close();});
async function connect(){
 client=new Client({name:"scope-protocol-test",version:"0.0.0"});
 const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a);
}
it("enforces the default budget inside actual SDK tool callbacks",async()=>{
 server=createServer();let reached=false;
 server.registerTool("budget_probe",{inputSchema:z.object({}).strict()},async()=>{
  registerLogicalRequest("https://api.splinterlands.com/first");
  registerLogicalRequest("https://api.splinterlands.com/first");
  expect(currentCallRequestCount()).toBe(1);
  registerLogicalRequest("https://api.splinterlands.com/second");
  reached=true;return {content:[]};
 });
 await connect();
 const result=await client.callTool({name:"budget_probe",arguments:{}});
 expect(result.isError).toBe(true);expect(result.structuredContent).toEqual({kind:"refusal_would_fan_out"});
 expect(reached).toBe(false);
});
it("forwards validated inputs and SDK context and isolates overlapping calls",async()=>{
 server=createServer();let arrived=0;let release!:()=>void;
 const barrier=new Promise<void>(resolve=>{release=resolve;});
 server.registerTool("concurrent_probe",{inputSchema:z.object({slot:z.number().int()}).strict()},async(params,extra)=>{
  expect(extra.signal).toBeDefined();
  registerLogicalRequest("https://api.splinterlands.com/item/"+params.slot);
  if(++arrived===2)release();await barrier;
  expect(currentCallRequestCount()).toBe(1);
  return {content:[{type:"text",text:String(params.slot)}],structuredContent:{slot:params.slot}};
 });
 await connect();
 const results=await Promise.all([1,2].map(slot=>client.callTool({name:"concurrent_probe",arguments:{slot}})));
 expect(results.map(result=>result.structuredContent)).toEqual([{slot:1},{slot:2}]);
 expect(results.every(result=>!result.isError)).toBe(true);
});
it("does not leak a finished call's budget into the next call",async()=>{
 server=createServer();let count=0;
 server.registerTool("sequential_probe",{inputSchema:z.object({}).strict()},async()=>{
  registerLogicalRequest("https://api.splinterlands.com/item/"+(++count));
  return {content:[],structuredContent:{count:currentCallRequestCount()}};
 });
 await connect();
 for(let i=0;i<2;i++)expect((await client.callTool({name:"sequential_probe",arguments:{}})).structuredContent).toEqual({count:1});
});

import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, expect, it } from "vitest";
import { createServer } from "../src/server.js";
import { catalogue } from "../src/catalogue/index.js";

function capture(label: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/battle-${label}.fixture.json`, import.meta.url), "utf8")).body;
}
let server: ReturnType<typeof createServer>; let client: Client;
afterEach(async () => { await client?.close(); await server?.close(); });
async function connect(fetch: typeof globalThis.fetch) {
  server=createServer({fetch,sleep:async()=>undefined,limiterOptions:{sleep:async()=>undefined}});
  client=new Client({name:"battle-contract-test",version:"0.0.0"});
  const [a,b]=InMemoryTransport.createLinkedPair(); await server.connect(b);await client.connect(a);
}
it("forwards explicit battle selectors and preserves encoded replay fields", async () => {
  let body: unknown; const urls: URL[]=[];
  await connect(async input => {urls.push(new URL(String(input)));return new Response(JSON.stringify(body));});
  for(const [name,label,args,path] of [
    ["battle_queue","queue",{username:"fixture_account"},"/battle/battle_queue"],
    ["battle_status","status",{id:"fixture-battle"},"/battle/status"],
    ["battle_result","result",{id:"fixture-battle"},"/battle/result"]
  ] as const) {
    body=capture(label);const before=urls.length;
    const result=await client.callTool({name,arguments:args});
    expect(result.isError).not.toBe(true);expect(urls.length-before).toBe(1);
    expect(urls.at(-1)!.pathname).toBe(path);
    expect(Object.fromEntries(urls.at(-1)!.searchParams)).toEqual(args);
    expect(result.structuredContent).toEqual(Array.isArray(body)?{data:body}:body);
  }
});
it("rejects missing IDs, credentials and excluded battle operations without HTTP",async()=>{
  let requests=0;await connect(async()=>{requests++;return new Response("{}");});
  for(const name of ["battle_queue","battle_status","battle_result"]) {
    expect((await client.callTool({name,arguments:{}})).isError).toBe(true);
  }
  expect((await client.callTool({name:"battle_result",arguments:{id:"fixture",authorization:"credential"}})).isError).toBe(true);
  const names=(await client.listTools()).tools.map(t=>t.name);
  for(const suffix of ["history","history2","battle-teams-info","submit-ptr"]){
    const entry=catalogue.find(e=>e.entryId==="api.battle."+suffix)!;
    expect(entry.owningTool).toBeNull();
    expect(names).not.toContain("battle_"+suffix.replaceAll("-","_"));
  }
  expect(requests).toBe(0);
});
it("treats HTTP 200 error strings and malformed replay records as errors",async()=>{
  let body:unknown="Error: no battle queue transaction found with ID [fixture]";
  await connect(async()=>new Response(JSON.stringify(body)));
  for(const name of ["battle_status","battle_result"]) expect((await client.callTool({name,arguments:{id:"fixture"}})).isError).toBe(true);
  body={...capture("result") as object,details:[]};
  expect((await client.callTool({name:"battle_result",arguments:{id:"fixture"}})).isError).toBe(true);
});
it("accepts empty queues and refuses an oversized replay without partial rounds",async()=>{
  let body:unknown=[];await connect(async()=>new Response(JSON.stringify(body)));
  const empty=await client.callTool({name:"battle_queue",arguments:{username:"fixture_account"}});
  expect(empty.isError).not.toBe(true);expect(empty.structuredContent).toEqual({data:[]});
  body={...capture("result") as object,details:"x".repeat(270000)};
  const large=await client.callTool({name:"battle_result",arguments:{id:"fixture"}});
  expect(large.isError).toBe(true);expect(large.structuredContent).toMatchObject({kind:"response_too_large"});
});

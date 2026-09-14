import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {InMemoryTransport} from "@modelcontextprotocol/sdk/inMemory.js";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {createServer} from "../src/server.js";
import {getCatalogueEntry} from "../src/catalogue/index.js";
import {withCallScope,registerLogicalRequest} from "../src/http/callscope.js";
import deedFixture from "./fixtures/plot-label-101.fixture.json" with {type:"json"};
import assetsFixture from "./fixtures/land-stake-assets-rows.fixture.json" with {type:"json"};
import projectFixture from "./fixtures/land-projects-active-single.fixture.json" with {type:"json"};
import summaryFixture from "./fixtures/land-stake-deed-details-active.fixture.json" with {type:"json"};
import regionFixture from "./fixtures/land-stake-dec-region-resolved.fixture.json" with {type:"json"};
import searchFixture from "./fixtures/land-deeds-search-limited.fixture.json" with {type:"json"};
import definitionsFixture from "./fixtures/api-cards-get-details.fixture.json" with {type:"json"};
import collectionFixture from "./fixtures/api-cards-collection.raw.json" with {type:"json"};
// Scenario tests control process occupancy; collection memory tests exercise real memory use.
const normalMemory = {rss:64*1024*1024,heapTotal:32*1024*1024,heapUsed:16*1024*1024,external:0,arrayBuffers:0};
beforeEach(() => { vi.spyOn(process, "memoryUsage").mockReturnValue(normalMemory); });
afterEach(() => { vi.restoreAllMocks(); });
function fixtures(){
 const deed=structuredClone(deedFixture.body);Object.assign(deed.data,{deed_type:"Plains",resource_symbol:"GRAIN"});
 const uid=deed.data.deed_uid,region=deed.data.region_uid;
 const card={...collectionFixture.body.cards[0]!,uid:"current",card_detail_id:1,level:1,land_base_pp:"1000.000",land_dec_stake_needed:10000,
  stake_start_date:"2026-01-01T00:00:00Z",stake_end_date:null,stake_plot:101};
 const asset={...assetsFixture.data.cards[0]!,uid:"current",card_detail_id:1,stake_type_uid:"STK-LND-WKR",stake_ref_uid:uid,
  slot:1,land_base_pp:"1000.000",land_dec_stake_needed:10000};
 const assets={status:"success",data:{cards:[asset],items:[{...assetsFixture.data.items[0]!,stake_type_uid:"STK-LND-PCR",stake_ref_uid:uid}]}};
 const project={status:"success",data:{...projectFixture.data,deed_uid:uid,is_construction:false,pp_staked:1100,rewards_per_hour:22,grain_req_per_hour:10}};
 const summary={status:"success",data:{...summaryFixture.data,deed_uid:uid,region_uid:region,
  active_land_project_id:project.data.id,worker_count:1,is_power_core_staked:true,is_runi_staked:false,total_base_pp_cap:100000,total_base_pp_after_cap:1000,
  total_construction_pp:1100,total_harvest_pp:1100,total_dec_stake_needed:10000,deed_rarity_boost:0,deed_status_token_boost:0,title_boost:0,totem_boost:0}};
 const regional={status:"success",data:{...regionFixture.data,uid:region,dec_staked:10000,dec_stake_needed:10000,dec_stake_in_use:10000}};
 const definitions=definitionsFixture.body.slice(0,1).map(d=>({...d,id:1,name:"Synthetic worker",color:"White",sub_type:"Human",stats:{}}));
 const collection={player:"sampleacct",cards:[card,{...card,uid:"candidate",stake_plot:null,stake_start_date:null}]};
 const search={status:"success",data:{...searchFixture.data,deeds:searchFixture.data.deeds.map(d=>({...d,...deed.data}))}};
 return {deed,assets,project,summary,regional,definitions,collection,search};
}
async function rig(mutate?: (data:ReturnType<typeof fixtures>)=>void,fail?:string){
 const data=fixtures();mutate?.(data);const requests:string[]=[];
 const bodies:Record<string,unknown>={
  "vapi.land.deeds.by-plot":data.deed,"vapi.land.stake.deeds-assets":data.assets,"vapi.land.projects.deed-active":data.project,
  "vapi.land.stake.deed-details":data.summary,"vapi.land.stake.dec-region":data.regional,"api.cards.get-details":data.definitions,
  "api.cards.collection":data.collection,"vapi.land.deeds.search":data.search,
  "vapi.land.stake.items-available":{status:"success",data:{ids:[{uid:"synthetic-core"}]}},
  "vapi.land.stake.items-grouped":{status:"success",data:{items:[{item_detail_id:322,name:"Power Core",item_count:1,boost:"0.000"}]}},
 };
 let clock=Date.parse("2026-09-13T00:00:00Z");
 const advance=async(ms:number)=>{clock+=ms;};
 const server=createServer({now:()=>clock,sleep:advance,limiterOptions:{sleep:advance},
 fetch:async(input)=>{
  const path=new URL(String(input)).pathname;
  const id=Object.keys(bodies).find(id=>new RegExp("^"+getCatalogueEntry(id).pathTemplate.replace(/\{[^}]+\}/g,"[^/]+")+"$").test(path));
  if(!id)throw Error("Unexpected test route "+path);
  requests.push(id);
  return new Response(JSON.stringify(id===fail?{status:"fail",data:{}}:bodies[id]),{status:id===fail?401:200,headers:{"content-type":"application/json"}});
 }});
 const c=new Client({name:"snapshot-test",version:"0.0.0"});const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await c.connect(ct);
 return {c,requests,close:async()=>{await c.close();await server.close();}};
}
it("gathers an agreeing baseline, candidates and provenance within ten logical reads",async()=>{
 const r=await rig();
 try{
  const result=await r.c.callTool({name:"land_lineup_snapshot",arguments:{player:"sampleacct",plot_id:101,candidate_uids:["candidate"]}});
  expect(result.isError, JSON.stringify(result.structuredContent ?? result.content)).not.toBe(true);
  expect(result.structuredContent).toMatchObject({baseline_check:{agrees:true},baseline:{workers:[{uid:"current"}]},
   candidates:[{card:{uid:"candidate"},readiness:expect.stringContaining("Unstaked")}],request_budget:{maximum:10,used:10}});
  expect(r.requests).toHaveLength(10);expect(new Set(r.requests).size).toBe(10);
 }finally{await r.close();}
});
it.each(["mismatch","missing-worker","wrong-account","wrong-project","too-many","cooldown"])("does not fabricate ready inputs for %s",async(mode)=>{
 const r=await rig(data=>{
  if(mode==="mismatch")data.summary.data.total_harvest_pp=1200;
  if(mode==="missing-worker")data.assets.data.cards[0]!.uid="absent";
  if(mode==="wrong-account")data.collection.player="someoneelse";
  if(mode==="wrong-project")data.summary.data.active_land_project_id=-1;
  if(mode==="too-many")data.collection.cards=Array.from({length:101},(_,i)=>({...data.collection.cards[0]!,uid:i===0?"current":"candidate-"+i}));
  if(mode==="cooldown")Object.assign(data.collection.cards[1]!,{stake_plot:101,stake_start_date:"2026-01-01T00:00:00Z",stake_end_date:"2026-09-14T00:00:00Z"});
 });
 try{
  const result=await r.c.callTool({name:"land_lineup_snapshot",arguments:{player:"sampleacct",plot_id:101,candidate_card_detail_ids:[1]}});
  if(mode==="cooldown"){
   expect(result.isError, JSON.stringify(result.structuredContent ?? result.content)).not.toBe(true);expect(result.structuredContent).toMatchObject({candidates:expect.arrayContaining([expect.objectContaining({readiness:"Cooling down; not ready to stake."})])});
  }else expect(result.isError).toBe(true);
  expect(r.requests.length).toBeLessThanOrEqual(10);
 }finally{await r.close();}
});
it("retains an agreeing baseline when an auxiliary availability read fails",async()=>{
 const r=await rig(undefined,"vapi.land.stake.items-available");
 try{
  const result=await r.c.callTool({name:"land_lineup_snapshot",arguments:{player:"sampleacct",plot_id:101}});
  expect(result.isError, JSON.stringify(result.structuredContent ?? result.content)).not.toBe(true);expect(result.structuredContent).toMatchObject({baseline_check:{agrees:true},limitations:expect.arrayContaining([expect.objectContaining({component:"power_core_available"})])});
 }finally{await r.close();}
});
it("rejects missing/ambiguous selectors before reads and leaves ordinary budgets unchanged",async()=>{
 const r=await rig();
 try{
  for(const args of [{player:"sampleacct"},{player:"sampleacct",plot_id:101,deed_uid:"both"}])
   expect((await r.c.callTool({name:"land_lineup_snapshot",arguments:args})).isError).toBe(true);
  expect(r.requests).toHaveLength(0);
  await expect(withCallScope("ordinary",async()=>{registerLogicalRequest("first");registerLogicalRequest("second");})).rejects.toMatchObject({kind:"refusal_would_fan_out"});
  await expect(withCallScope("snapshot",async()=>{for(let i=0;i<11;i++)registerLogicalRequest(String(i));},10)).rejects.toMatchObject({kind:"refusal_would_fan_out"});
 }finally{await r.close();}
});

it("preserves the collection memory refusal before auxiliary reads", async () => {
 const r=await rig(undefined,"vapi.land.stake.items-available");
 vi.mocked(process.memoryUsage).mockReturnValue({...normalMemory,heapUsed:129*1024*1024});
 try {
  const result=await r.c.callTool({name:"land_lineup_snapshot",arguments:{player:"sampleacct",plot_id:101}});
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toMatchObject({
   kind:"upstream_malformed",message:expect.stringContaining("heap occupancy guard"),
   request_budget:{maximum:10,used:7},
  });
  expect(r.requests).not.toContain("vapi.land.stake.items-available");
 } finally { await r.close(); }
});

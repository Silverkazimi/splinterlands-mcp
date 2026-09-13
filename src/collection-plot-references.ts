import {bindRequest} from "./catalogue/index.js";
import type {ProjectedCollectionCard} from "./cards-collection.js";
import type {SplinterlandsHttpClient} from "./http/client.js";
import {candidatePlotId,parsePlotLabel,plotIdentityFromResponse,type PlotIdentity} from "./plot-references.js";
export async function collectionPlotReferences(client:SplinterlandsHttpClient,player:string,cards:ProjectedCollectionCard[]){
 const requested=new Set(cards.map(c=>c.stake_plot).filter((v):v is number=>typeof v==="number"&&v>0));
 const scope="One account-scoped deed search, limit 200, no continuation or per-card lookups. Unresolved references stay null. A cooling card's reported plot is historical, not occupied; reads are non-atomic.";
 const mapped=(refs:Map<number,PlotIdentity>)=>cards.map(card=>({...card,
  reported_stake_plot_reference:typeof card.stake_plot==="number"?refs.get(card.stake_plot)??null:null}));
 if(!requested.size)return {cards:mapped(new Map()),metadata:{status:"not_needed",scope,requested_plots:0,unresolved_plot_ids:[]}};
 const bound=bindRequest("vapi.land.deeds.search",{player,limit:200},"limited");
 const result=await bound.execute(client);
 const provenance={endpoint:bound.endpointTemplate,trace_id:result.traceId,freshness:result.freshness};
 if(!result.ok)return {cards:mapped(new Map()),metadata:{status:"unavailable",kind:result.kind,scope,requested_plots:requested.size,unresolved_plot_ids:[...requested],...provenance}};
 const payload=(result.data as {data?:unknown}).data;
 const deeds=payload&&typeof payload==="object"&&"deeds" in payload&&Array.isArray(payload.deeds)?payload.deeds as Array<Record<string,unknown>>:[];
 const refs=new Map<number,PlotIdentity>(),conflicts=new Set<number>();
 for(const deed of deeds){
  const ref=plotIdentityFromResponse({data:deed});
  if(!ref||!requested.has(ref.plot_id)||deed.player!==player)continue;
  if(candidatePlotId(parsePlotLabel(ref.plot_label)!)!==ref.plot_id){conflicts.add(ref.plot_id);continue;}
  const previous=refs.get(ref.plot_id);
  if(previous&&(previous.deed_uid!==ref.deed_uid||previous.plot_label!==ref.plot_label))conflicts.add(ref.plot_id);
  refs.set(ref.plot_id,ref);
 }
 for(const id of conflicts)refs.delete(id);
 const unresolved=[...requested].filter(id=>!refs.has(id));
 return {cards:mapped(refs),metadata:{status:unresolved.length?"partial":"resolved",scope,requested_plots:requested.size,unresolved_plot_ids:unresolved,...provenance}};
}

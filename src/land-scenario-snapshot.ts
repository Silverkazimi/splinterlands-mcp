import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { bindRequest } from "./catalogue/index.js";
import type { SplinterlandsHttpClient } from "./http/client.js";
import type { HttpResult } from "./http/errors.js";
import { currentCallRequestCount, RefusalWouldFanOutError } from "./http/callscope.js";
import { parseCardsCollection, COLLECTION_TIMEOUT_MS, type ProjectedCollectionCard } from "./cards-collection.js";
import { joinCardDefinition, type CardDefinition } from "./card-definitions.js";
import { withCollectionStaking } from "./collection-staking.js";
import { candidatePlotId, matchesPlotLabel, parsePlotLabel, plotIdentityFromResponse, plotIdOrLabelSchema, type PlotIdentity } from "./plot-references.js";
import { estimateLineup, lineupSchema } from "./land-lineup-estimator.js";
import rules from "./data/land-card-ability-rules.json" with { type: "json" };

export const SCENARIO_TOOL_ROUTES: Record<string,string> = {
  land_lineup_snapshot: "Bounded compound GETs; at most ten logical requests",
};
const input = z.object({
  player: z.string().trim().min(1).max(100),
  plot_id: plotIdOrLabelSchema.optional(),
  deed_uid: z.string().trim().min(1).max(100).optional(),
  candidate_card_detail_ids: z.array(z.number().int().positive()).max(10).default([]),
  candidate_uids: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
}).strict();
const record = (v: unknown): Record<string,unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Expected a populated object.");
  return v as Record<string,unknown>;
};
const number = (v: unknown): number => {
  if (v === null || v === undefined || (typeof v !== "number" && typeof v !== "string") || String(v).trim() === "" || !Number.isFinite(Number(v)))
    throw new Error("Missing or malformed numeric scenario input.");
  return Number(v);
};
const rows = (v: unknown): Record<string,unknown>[] => {
  if (!Array.isArray(v)) throw new Error("Expected an array of scenario records.");
  return v.map(record);
};
const known = new Set<number>(rules.cards.map(c => c.card_detail_id));
class SnapshotError extends Error {
  constructor(readonly kind: string, message: string) { super(message); }
}
const result = (body: Record<string,unknown>, isError = false) => {
  const text = JSON.stringify(body);
  if (Buffer.byteLength(text) > 256 * 1024) throw new SnapshotError("response_too_large", "Snapshot exceeds 256 KiB; select fewer candidate cards.");
  return { ...(isError ? {isError:true} : {}), content:[{type:"text" as const,text}], structuredContent:body };
};
function worker(card: ProjectedCollectionCard, asset?: Record<string,unknown>) {
  if (typeof card.element !== "string" || !card.sub_type || card.land_abilities_status !== "known")
    throw new Error("A selected card lacks verified element, bloodline or level-specific abilities.");
  if (known.has(card.card_detail_id)) {
    const pinned = rules.cards.find(c=>c.card_detail_id===card.card_detail_id)?.levels.find(l=>l.level===card.level);
    if (!pinned || JSON.stringify(pinned.abilities)!==JSON.stringify(card.land_abilities))
      throw new Error("Live level-specific abilities disagree with the dated estimator resource.");
  }
  return lineupSchema.shape.workers.element.parse({
    uid:card.uid,card_detail_id:card.card_detail_id,level:card.level,
    base_pp:number(asset?.land_base_pp ?? card.land_base_pp),
    land_dec_stake_needed:number(asset?.land_dec_stake_needed ?? card.land_dec_stake_needed),
    element:card.element, ...(card.secondary_element ? {secondary_element:card.secondary_element} : {}),
    bloodline:card.sub_type, ...(known.has(card.card_detail_id) ? {} : {abilities:card.land_abilities}),
  });
}
export function registerScenarioSnapshot(server: McpServer, client: SplinterlandsHttpClient,
  definitions: () => Promise<HttpResult<Map<number,CardDefinition>>>, now: () => number = Date.now): void {
  server.registerTool("land_lineup_snapshot", {
    description: "Gather an explicit player's current Grain/Wood/Stone/Iron plot and selected candidate cards for land_lineup_estimate. Supply exactly one numeric/display plot_id or deed_uid. Select up to ten card detail IDs or twenty UIDs; current workers are always included. At most ten logical GETs, including one bounded-memory full collection stream; no automatic pagination or per-card lookup loops. Fetches deed, worker/project/plot facts, regional DEC, Power Core availability, definitions and up to 200 owner deeds for verified candidate locations. At most 100 matching cards; a larger selection is refused. Returns an estimator-ready baseline only when identity and backend production checks agree, candidate eligibility caveats, verified locations where returned, and per-source freshness. Reads are not atomic. Missing, cooling-down or unsupported cards are not presented as ready to stake. No stake changes are performed; Land stake changes remain scoped per plot.",
    inputSchema: input,
    annotations: {readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true},
  }, async args => {
    const provenance: Array<Record<string,unknown>> = [];
    const failures: Array<Record<string,unknown>> = [];
    const startedAt = now();
    const get = async (id: string, params: Record<string,unknown>, variant?: string) => {
      const bound = bindRequest(id,params,variant);
      const read = await bound.execute(client);
      provenance.push({entry_id:id,endpoint:bound.endpointTemplate,trace_id:read.traceId,freshness:read.freshness});
      if (!read.ok) throw new SnapshotError(read.kind,read.message);
      return read.data;
    };
    try {
      if ((args.plot_id === undefined) === (args.deed_uid === undefined))
        throw new SnapshotError("invalid_input","Supply exactly one plot_id or deed_uid.");
      const coords = typeof args.plot_id === "string" ? parsePlotLabel(args.plot_id)! : undefined;
      const requestedId = coords ? candidatePlotId(coords) : args.plot_id;
      const deedBody = args.deed_uid === undefined
        ? await get("vapi.land.deeds.by-plot",{plot_id:requestedId})
        : await get("vapi.land.deeds.details-by-uid",{deed_uid:args.deed_uid});
      const identity = plotIdentityFromResponse(deedBody);
      if (!identity || (coords && !matchesPlotLabel(deedBody,coords))
        || (args.deed_uid !== undefined && identity.deed_uid !== args.deed_uid)
        || (args.deed_uid === undefined && identity.plot_id !== requestedId))
        throw new SnapshotError("plot_resolution_unverified","The returned deed does not match the requested plot.");
      const deed = record(record(deedBody).data);
      const uid = identity.deed_uid;
      const assets = record(record(await get("vapi.land.stake.deeds-assets",{deedUid:uid})).data);
      const project = record(record(await get("vapi.land.projects.deed-active",{deed_uid:uid})).data);
      const summary = record(record(await get("vapi.land.stake.deed-details",{deedUid:uid})).data);
      if (project.deed_uid !== uid || summary.deed_uid !== uid || summary.region_uid !== deed.region_uid)
        throw new SnapshotError("snapshot_inconsistent","Project, staking summary and deed identities disagree.");
      if (project.is_active !== true || project.id !== summary.active_land_project_id)
        throw new SnapshotError("snapshot_inconsistent","The active project does not match the staking summary.");
      if (project.is_construction !== false)
        throw new SnapshotError("unsupported_scenario","Only completed production worksites are supported.");
      const region = record(record(await get("vapi.land.stake.dec-region",{player:args.player,region_uid:deed.region_uid})).data);
      if (region.uid !== deed.region_uid) throw new SnapshotError("snapshot_inconsistent","Regional DEC belongs to a different region.");
      const definitionResult = await definitions();
      provenance.push({entry_id:"api.cards.get-details",trace_id:definitionResult.traceId,freshness:definitionResult.freshness});
      if (!definitionResult.ok) throw new SnapshotError(definitionResult.kind,definitionResult.message);
      const assetCards = rows(assets.cards);
      const currentUids = new Set(assetCards.map(a=>String(a.uid)));
      const detailIds = new Set(args.candidate_card_detail_ids);
      const requestedUids = new Set(args.candidate_uids);
      const bound = bindRequest("api.cards.collection",{username:args.player});
      const collectionResult = await client.requestStreaming(bound.hostname,bound.path,{},{
        endpointTemplate:bound.endpointTemplate,timeoutMs:COLLECTION_TIMEOUT_MS,
        consume: response => parseCardsCollection(response,{
          limit:100,
          enrich: c=>withCollectionStaking(joinCardDefinition(c,definitionResult.data),startedAt),
          matches: c=>currentUids.has(c.uid)||detailIds.has(c.card_detail_id)||requestedUids.has(c.uid),
        }),
      });
      provenance.push({entry_id:"api.cards.collection",trace_id:collectionResult.traceId,freshness:collectionResult.freshness});
      if (!collectionResult.ok) throw new SnapshotError(collectionResult.kind,collectionResult.message);
      const collection = collectionResult.data;
      if (collection.player !== args.player) throw new SnapshotError("snapshot_inconsistent","Collection account does not match the request.");
      if (collection.total > 100) throw new SnapshotError("selection_too_large","More than 100 cards match; narrow the candidate selection.");
      const byUid = new Map(collection.cards.map(c=>[c.uid,c]));
      if (assetCards.some(a=>{
        const c=byUid.get(String(a.uid));
        return !c || c.staking_status!=="staked" || c.stake_plot!==identity.plot_id || a.stake_ref_uid!==uid;
      })) throw new SnapshotError("snapshot_inconsistent","Current worker assignments disagree with the collection; no baseline is inferred.");
      const locations = new Map<number,PlotIdentity>([[identity.plot_id,identity]]);
      try {
        const search = record(record(await get("vapi.land.deeds.search",{player:args.player,limit:200},"limited")).data);
        for (const item of rows(search.deeds)) {
          const ref=plotIdentityFromResponse({data:item});
          if (ref) locations.set(ref.plot_id,ref);
        }
      } catch(error) {
        if (!(error instanceof SnapshotError)) throw error;
        failures.push({component:"candidate_locations",kind:error.kind,message:error.message});
      }
      const core: Record<string,unknown> = {};
      for (const kind of ["available","grouped"] as const) {
        try {
          core[kind]=record(await get("vapi.land.stake.items-"+kind,{
            stakeTypeUid:"STK-LND-PCR",deedUid:uid,player:args.player,offset:0,limit:1,
            ...(kind==="grouped"?{order_by:1,order_by_asc:0}:{}),
          })).data;
        } catch(error) {
          if (!(error instanceof SnapshotError)) throw error;
          failures.push({component:"power_core_"+kind,kind:error.kind,message:error.message});
        }
      }
      const ordinary=assetCards.filter(a=>a.stake_type_uid==="STK-LND-WKR").sort((a,b)=>number(a.slot)-number(b.slot));
      const runis=assetCards.filter(a=>a.stake_type_uid==="STK-LND-RUNI");
      if (ordinary.length+runis.length!==assetCards.length || runis.length>1)
        throw new SnapshotError("unsupported_scenario","Unexpected worker stake type or multiple Runi records.");
      const poweredByCore=rows(assets.items).some(a=>a.stake_type_uid==="STK-LND-PCR");
      if (summary.is_power_core_staked!==poweredByCore || summary.is_runi_staked!==(runis.length===1)
        || number(summary.worker_count)!==assetCards.length)
        throw new SnapshotError("snapshot_inconsistent","Worker count or power-source flags disagree.");
      const runi=runis[0];
      const baseline = lineupSchema.parse({
        plot:{terrain:String(deed.deed_type).toLowerCase(),resource:deed.resource_symbol,
          base_cap:number(summary.total_base_pp_cap),rarity_boost:number(summary.deed_rarity_boost),status_boost:number(summary.deed_status_token_boost)},
        workers:ordinary.map(a=>worker(byUid.get(String(a.uid))!,a)),
        ...(runi ? {runi:{uid:runi.uid,base_pp:number(runi.land_base_pp),terrain_modifier:number(runi.terrain_boost),bloodline:byUid.get(String(runi.uid))!.sub_type}} : {}),
        regional_power:{staked_dec:number(region.dec_staked),current_required_dec:number(region.dec_stake_needed),current_plot_required_dec:number(summary.total_dec_stake_needed)},
        power_core:poweredByCore,totem_boost:number(summary.totem_boost),title_boost:number(summary.title_boost),
      });
      const calculated=estimateLineup(baseline);
      const expected={total_pp:number(summary.total_harvest_pp),boostable_pp:number(summary.total_construction_pp),
        base_pp_after_cap:number(summary.total_base_pp_after_cap),resource_per_hour:number(project.rewards_per_hour),food_per_hour:number(project.grain_req_per_hour)};
      const agrees=calculated.valid && Object.entries(expected).every(([key,value])=>{
        const actual=calculated.estimate[key as keyof typeof calculated.estimate];
        return typeof actual==="number" && Math.abs(actual-value)<=0.011;
      }) && Math.abs(number(project.pp_staked)-number(summary.total_harvest_pp))<=0.011;
      const candidates=collection.cards.filter(c=>detailIds.has(c.card_detail_id)||requestedUids.has(c.uid)).map(card=>{
        let normalized: unknown=null;let reason: string|null=null;
        try { normalized=worker(card); } catch(error) {reason=error instanceof Error?error.message:"Unsupported card.";}
        return {card,worker:normalized,input_issue:reason,
          reported_stake_plot:card.stake_plot?locations.get(card.stake_plot)??null:null,
          readiness:card.staking_status==="unstaked"?"Unstaked in collection; other eligibility is not established."
            :card.staking_status==="unstaking"?"Cooling down; not ready to stake."
            :card.staking_status==="staked"?"Already staked; moving requires separate per-plot changes.":"Eligibility unknown.",
        };
      });
      return result({player:args.player,plot_reference:identity,baseline:agrees?baseline:null,baseline_check:{agrees,expected,calculated},
        candidates,missing_candidate_uids:args.candidate_uids.filter(u=>!byUid.has(u)),power_core:{currently_staked:poweredByCore,...core},
        location_scope:"Verified labels only for returned deeds. Search completeness is not inferred; an unresolved reported plot remains null.",
        snapshot_scope:"Non-atomic public reads. Baseline agreement is necessary, not proof that every candidate can be staked. Comparisons are hypothetical until cooldown, ownership and eligibility checks permit actions.",
        limitations:failures,request_budget:{maximum:10,used:currentCallRequestCount()},provenance},!agrees);
    } catch(error) {
      if (error instanceof RefusalWouldFanOutError) throw error;
      if (!(error instanceof SnapshotError) && !(error instanceof z.ZodError) && !(error instanceof Error)) throw error;
      return result({kind:error instanceof SnapshotError?error.kind:"scenario_input_unverified",
        message:error instanceof z.ZodError?"Scenario fields do not match the supported estimator input.":error.message,
        provenance,request_budget:{maximum:10,used:currentCallRequestCount()}},true);
    }
  });
}

import type { ResultContract } from "./schema.js";
import { matchesResultContract } from "./fingerprint.js";
import {
  matchesLandDeedByPlot,
  matchesLandDeedsSearchLimited,
  matchesLandDeedsSearchOrdered,
  matchesLandProjectsActive,
  matchesLandProjectsList,
  matchesLandProjectsRequirements,
  matchesLandRegionsCounts,
  matchesLandStakeDeedAssets,
  matchesLandTractsCounts,
} from "./land-result-validators.js";

export type CataloguePredicate = (body: unknown) => body is unknown;

export const cataloguePredicates: Readonly<Record<string, CataloguePredicate>> = {
  "land.deeds.by-plot": matchesLandDeedByPlot,
  "land.deeds.search.limited": matchesLandDeedsSearchLimited,
  "land.deeds.search.ordered": matchesLandDeedsSearchOrdered,
  "land.projects.active": matchesLandProjectsActive,
  "land.projects.list": matchesLandProjectsList,
  "land.projects.requirements": matchesLandProjectsRequirements,
  "land.regions.counts": matchesLandRegionsCounts,
  "land.stake.deeds-assets": matchesLandStakeDeedAssets,
  "land.tracts.counts": matchesLandTractsCounts,
};

export function predicateFor(contract: ResultContract): CataloguePredicate {
  if (contract.predicateId === "players.profile") {
    return (body): body is unknown => {
      if (typeof body !== "object" || body === null || Array.isArray(body)) return false;
      const guild = (body as Record<string, unknown>).guild;
      if (typeof guild !== "object" || guild === null || Array.isArray(guild)) return false;
      const present = (path: string) => {
        if (path === "guild.tournament_status") return Object.hasOwn(guild, "tournament_status");
        if (path === "guild.tournament_data" || path.startsWith("guild.tournament_data.")) {
          return Object.hasOwn(guild, "tournament_data");
        }
        return true;
      };
      return matchesResultContract(body, {
        ...contract,
        fingerprint: Object.fromEntries(Object.entries(contract.fingerprint).filter(([path]) => present(path))),
        requiredKeyPaths: contract.requiredKeyPaths.filter(present),
      });
    };
  }
  if (contract.predicateId === "collector.config") {
    const root = predicateFor({
      ...contract, predicateId: "vapi-object.captured",
      fingerprint: Object.fromEntries(Object.entries(contract.fingerprint).filter(([path]) => !path.includes("[]"))),
      requiredKeyPaths: contract.requiredKeyPaths.filter(path => !path.includes("[]")),
    });
    const groups = ["shopItems", "featuredAccounts", "cosmetics"] as const;
    return (body): body is unknown => {
      if (!root(body)) return false;
      const data = (body as { data: Record<string, unknown[]> }).data;
      return groups.every(group => {
        const prefix = `data.${group}[]`;
        const rowContract: ResultContract = {
          envelope: "vapi",
          fingerprint: Object.fromEntries(Object.entries(contract.fingerprint).filter(([path]) => path === "status" || path.startsWith(prefix))),
          requiredKeyPaths: contract.requiredKeyPaths.filter(path => path === "status" || path.startsWith(prefix)),
        };
        return data[group]!.every(row => matchesResultContract({ status: "success", data: { [group]: [row] } }, rowContract));
      });
    };
  }

  if (contract.predicateId === "vapi-array.captured") {
    return (body): body is unknown => {
      if (typeof body !== "object" || body === null || Array.isArray(body)) return false;
      const record = body as Record<string, unknown>;
      return record.status === "success" && Array.isArray(record.data)
        && record.data.every(row => matchesResultContract({ ...record, data: [row] }, contract));
    };
  }
  if (contract.predicateId === "vapi-object.captured") {
    const inner: ResultContract = {
      envelope: "bare",
      fingerprint: Object.fromEntries(Object.entries(contract.fingerprint).filter(([path]) => path.startsWith("data.")).map(([path, value]) => [path.slice(5), value])),
      requiredKeyPaths: contract.requiredKeyPaths.filter(path => path.startsWith("data.")).map(path => path.slice(5)),
    };
    return (body): body is unknown => typeof body === "object" && body !== null && !Array.isArray(body)
      && (body as Record<string, unknown>).status === "success"
      && matchesResultContract((body as Record<string, unknown>).data, inner);
  }

  if (contract.predicateId?.startsWith("vapi-object-list.")) {
    const field = contract.predicateId.slice("vapi-object-list.".length);
    const inner = predicateFor({
      ...contract, envelope: "bare", predicateId: `object-list.${field}`,
      fingerprint: Object.fromEntries(Object.entries(contract.fingerprint).filter(([path]) => path.startsWith("data.")).map(([path, value]) => [path.slice(5), value])),
      requiredKeyPaths: contract.requiredKeyPaths.filter(path => path.startsWith("data.")).map(path => path.slice(5)),
    });
    return (body): body is unknown => typeof body === "object" && body !== null && !Array.isArray(body)
      && (body as Record<string, unknown>).status === "success"
      && inner((body as Record<string, unknown>).data);
  }

  if (contract.predicateId === "guilds.brawl-rewards") {
    return (body): body is unknown => {
      if (typeof body !== "object" || body === null || Array.isArray(body)) return false;
      const record = body as Record<string, unknown>;
      const total = "total_sps_payout" in record;
      const records = "sps_reward_records" in record;
      if (!total && !records) return false;
      if (total && (typeof record.total_sps_payout !== "number" || !Number.isFinite(record.total_sps_payout))) return false;
      if (!records) return true;
      const nested = {
        ...contract, predicateId: "object-list.sps_reward_records",
        fingerprint: Object.fromEntries(Object.entries(contract.fingerprint).filter(([path]) => total || path !== "total_sps_payout")),
      };
      return predicateFor(nested)(record);
    };
  }
  if (contract.predicateId === "record-or-array.captured") {
    const matches = (row: unknown) => typeof row === "object" && row !== null && !Array.isArray(row) && matchesResultContract(row, contract);
    return (body): body is unknown => Array.isArray(body) ? body.every(matches) : matches(body);
  }
  if (contract.predicateId === "cards.definitions") {
    const core = { ...contract, fingerprint: Object.fromEntries(Object.entries(contract.fingerprint).filter(([path]) => !path.startsWith("[].distribution[]"))) };
    const distribution = {
      ...contract, envelope: "bare" as const, requiredKeyPaths: [],
      fingerprint: Object.fromEntries(Object.entries(contract.fingerprint)
        .filter(([path]) => path.startsWith("[].distribution[]."))
        .map(([path, field]) => [path.slice("[].distribution[].".length), field])),
    };
    return (body): body is unknown => Array.isArray(body) && body.every((value) => {
      if (!matchesResultContract([value], core)) return false;
      const row = value as { stats: Record<string, unknown>; distribution: unknown[] };
      const mana = row.stats.mana;
      if (mana !== undefined && !(typeof mana === "number" && Number.isFinite(mana)) &&
          !(Array.isArray(mana) && mana.every((amount) => typeof amount === "number" && Number.isFinite(amount)))) return false;
      if (row.stats.abilities !== undefined && !Array.isArray(row.stats.abilities)) return false;
      return row.distribution.every((item) => matchesResultContract(item, distribution));
    });
  }
  if (contract.predicateId === "array.empty-or-captured") {
    return (body): body is unknown => Array.isArray(body)
      && body.every((row) => matchesResultContract([row], contract));
  }
  if (contract.predicateId?.startsWith("partial-object-list.")) {
    const field = contract.predicateId.slice("partial-object-list.".length);
    if (!/^[a-z_]+$/.test(field)) throw new Error("Invalid partial-object-list field");
    return (body): body is unknown => {
      if (typeof body !== "object" || body === null || Array.isArray(body)) return false;
      const record = body as Record<string, unknown>;
      const root = (path: string) => path.split(".")[0]!.split("[")[0]!;
      if (!Object.keys(contract.fingerprint).some(path => root(path) in record)) return false;
      const selected = {
        ...contract,
        fingerprint: Object.fromEntries(Object.entries(contract.fingerprint).filter(([path]) => root(path) in record)),
        requiredKeyPaths: contract.requiredKeyPaths.filter(path => root(path) in record),
      };
      return field in record
        ? predicateFor({ ...selected, predicateId: `object-list.${field}` })(record)
        : matchesResultContract(record, selected);
    };
  }
  if (contract.predicateId?.startsWith("object-list.")) {
    const field = contract.predicateId.slice("object-list.".length);
    if (!/^[a-z_]+$/.test(field)) throw new Error("Invalid object-list field");
    const prefix = `${field}[]`;
    const rootContract = {
      ...contract,
      fingerprint: Object.fromEntries(Object.entries(contract.fingerprint).filter(([path]) => !path.startsWith(prefix))),
      requiredKeyPaths: contract.requiredKeyPaths.filter((path) => !path.startsWith(prefix)),
    };
    const rowContract = {
      ...contract,
      fingerprint: Object.fromEntries(Object.entries(contract.fingerprint).filter(([path]) => path.startsWith(prefix))),
      requiredKeyPaths: contract.requiredKeyPaths.filter((path) => path.startsWith(prefix)),
    };
    return (body): body is unknown => {
      if (typeof body !== "object" || body === null || Array.isArray(body)) return false;
      const rows = (body as Record<string, unknown>)[field];
      return Array.isArray(rows) && matchesResultContract(body, rootContract)
        && rows.every((row) => matchesResultContract({ [field]: [row] }, rowContract));
    };
  }
  if (contract.predicateId !== undefined) {
    const predicate = cataloguePredicates[contract.predicateId];
    if (predicate === undefined) {
      throw new Error(`Catalogue predicate '${contract.predicateId}' is not registered`);
    }
    return predicate;
  }
  return (body): body is unknown => matchesResultContract(body, contract);
}

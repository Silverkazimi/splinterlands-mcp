type JsonRecord = Record<string, unknown>;

const deedKeys = [
  "map_name", "region_id", "tract_id", "plot_id", "region_number", "tract_number", "plot_number",
  "territory", "region_uid", "resource_id", "resource_symbol", "magic_type", "stats", "deed_uid",
  "player", "created_date", "listed", "lock_days", "unlock_date", "in_use", "deed_type", "land_stats",
  "region_name", "market_updated_date", "market_id", "listing_price", "market_listing_id",
  "market_listing_status_id", "castle", "keep", "rarity", "plot_status", "hex_code", "tax_rate",
  "item_detail_id", "created_block_num", "created_tx", "worksite_type", "time_crystal_value",
  "rarity_sort_value", "is_construction",
] as const;

const worksiteKeys = [
  "id", "deed_uid", "region_uid", "project_id", "project_number", "project_type", "worksite_type",
  "resource_id", "token_symbol", "segments", "created_date", "start_date",
  "completed_date", "destroyed_date", "projected_end", "projected_hours", "hours_to_completion", "estimated_totem_chance",
  "elapsed_hours", "hours_since_last_op", "hours_till_next_op", "last_action_time", "last_updated_date",
  "next_op_allowed_date", "block_num", "trx_id", "is_active", "is_construction", "is_empty",
  "is_harvesting", "is_runi_staked", "is_sps_work", "land_work_type_id", "land_work_type_total_work_type_pp",
  "resource_mint_rate", "resource_recipe", "captured_tax_rate", "max_tax_rate", "grain_req_per_hour", "project_created_date",
  "grain_required", "iron_required", "stone_required", "wood_required", "pp_balance", "pp_required",
  "pp_spent", "pp_staked", "site_efficiency", "sps_mining_reward_debt", "sps_tokens_per_block",
  "latest_sps_reward_block", "rewards_per_hour", "projected_amount_received", "accumulated_sps_rewards_per_share_of_pool",
  "time_crystal_value", "total_time_crystals_used", "work_per_hour_per_one_pp",
] as const;

const landProjectKeys = [
  "id", "deed_uid", "region_uid", "block_num", "project_id", "project_number", "project_type",
  "worksite_type", "created_date", "start_date", "completed_date", "destroyed_date", "projected_end",
  "projected_hours", "hours_to_completion", "elapsed_hours", "hours_since_last_op", "hours_till_next_op",
  "last_action_time", "last_updated_date", "next_op_allowed_date", "trx_id", "is_active", "is_construction",
  "is_empty", "is_harvesting", "is_runi_staked", "is_sps_work", "land_work_type_id",
  "land_work_type_total_work_type_pp", "captured_tax_rate", "estimated_totem_chance", "grain_req_per_hour",
  "grain_required", "iron_required", "stone_required", "wood_required", "pp_balance", "pp_required",
  "pp_spent", "pp_staked", "site_efficiency", "resource_id", "resource_mint_rate", "resource_recipe",
  "segments", "max_tax_rate", "project_created_date", "sps_mining_reward_debt", "sps_tokens_per_block",
  "latest_sps_reward_block", "rewards_per_hour", "projected_amount_received",
  "accumulated_sps_rewards_per_share_of_pool", "time_crystal_value", "total_time_crystals_used",
  "token_symbol", "work_per_hour_per_one_pp",
] as const;

const landProjectStringKeys = new Set([
  "deed_uid", "region_uid", "project_type", "worksite_type", "created_date", "start_date", "last_action_time",
  "last_updated_date", "next_op_allowed_date", "trx_id", "projected_end", "project_created_date", "token_symbol",
]);
const landProjectBooleanKeys = new Set([
  "is_active", "is_construction", "is_empty", "is_harvesting", "is_runi_staked", "is_sps_work",
]);
const landProjectStringOrNullKeys = new Set(["completed_date", "destroyed_date", "next_op_allowed_date", "projected_end"]);
const landProjectNumberOrNullKeys = new Set(["hours_to_completion", "project_id"]);
const landProjectBooleanOrNullKeys = new Set(["is_sps_work"]);
const landProjectKeySet = new Set<string>(landProjectKeys);

const segmentKeys = [
  "id", "land_project_id", "project_number", "timecrystal_pp", "time_crystal_value", "time_crystals_used",
  "staked_pp", "raw_pp_spent", "pp_spent", "efficiency", "deed_uid", "created_date", "opened_trx",
  "ended_date", "closed_trx", "end_staked_pp", "duration", "source",
] as const;
const segmentStringKeys = new Set(["deed_uid", "created_date", "opened_trx", "ended_date", "closed_trx", "source"]);
const segmentStringOrNullKeys = new Set(["ended_date", "closed_trx"]);
const segmentNumberOrNullKeys = new Set(["end_staked_pp", "duration"]);

const requirementKeys = [
  "deed_uid", "land_work_type_name", "land_work_type_parent_id", "land_work_type_id",
  "land_work_type_total_work_type_pp", "land_work_type_is_construction", "land_work_requirement_id",
  "pp_required", "projected_hours", "projected_end", "work_per_hour", "allow_time_crystals",
] as const;
const requirementKeySet = new Set<string>(requirementKeys);
const requirementsNullOnlyKeys = new Set(["land_work_type_parent_id"]);
const activeNullOnlyKeys = new Set(["segments", "completed_date", "destroyed_date", "hours_to_completion", "projected_end"]);
const listNullOnlyKeys = new Set<string>();

const stakingKeys = [
  "deed_uid", "region_uid", "manager", "active_land_project_id", "efficiency", "worker_count",
  "powered_worker_count", "max_workers_allowed", "is_powered", "is_energized", "is_power_core_staked",
  "is_runi_staked", "has_completed_first_project", "has_labors_luck", "black_biome_modifier",
  "blue_biome_modifier", "gold_biome_modifier", "green_biome_modifier", "red_biome_modifier",
  "white_biome_modifier", "card_abilities_boost", "card_bloodlines_boost", "deed_rarity_boost",
  "deed_status_token_boost", "grain_food_discount", "lite_food_discount", "dec_stake_needed_discount",
  "runi_boost", "title_boost", "totem_boost", "total_base_pp", "total_base_pp_after_cap",
  "total_base_pp_after_cap_percentage", "total_base_pp_cap", "total_boost", "total_boost_pp",
  "total_card_abilities_boost_pp", "total_card_bloodlines_boost_pp", "total_construction_pp",
  "total_dec_stake_in_use", "total_dec_stake_needed", "total_dec_staked", "total_deed_rarity_boost",
  "total_deed_rarity_boost_pp", "total_deed_status_token_boost", "total_deed_status_token_boost_pp",
  "total_harvest_pp", "total_runi_boost", "total_runi_boost_pp", "total_terrain_boost", "total_terrain_boost_pp",
  "total_title_boost", "total_title_boost_pp", "total_totem_boost", "total_totem_boost_pp",
  "total_work_per_hour",
] as const;

const deedNullOnlyKeys = new Set(["resource_id", "resource_symbol", "castle", "keep"]);
const byPlotNullOnlyKeys = new Set(["unlock_date", "market_updated_date", "market_id", "listing_price", "market_listing_id", "market_listing_status_id", "castle", "keep"]);
const worksiteNullOnlyKeys = new Set(["segments", "completed_date", "destroyed_date", "hours_to_completion", "projected_end"]);
const deedKeySet = new Set<string>(deedKeys);
const worksiteKeySet = new Set<string>(worksiteKeys);
const stakingKeySet = new Set<string>(stakingKeys);

const landStakeCardKeys = [
  "base_pp_after_cap", "base_pp_after_cap_percentage", "bcx", "boost", "boost_pp",
  "card_abilities_boost", "card_abilities_boost_pp", "card_bloodlines_boost", "card_bloodlines_boost_pp",
  "card_detail_id", "card_set", "collection_power", "dec_stake_needed", "deed_rarity_boost",
  "deed_rarity_boost_pp", "deed_status_token_boost", "deed_status_token_boost_pp", "edition", "foil",
  "gold", "is_powered", "land_base_pp", "land_dec_stake_needed", "name", "player", "runi_boost",
  "runi_boost_pp", "slot", "stake_ref_uid", "stake_start_date", "stake_type_uid", "terrain_boost",
  "terrain_boost_pp", "title_boost", "title_boost_pp", "total_construction_pp", "total_harvest_pp",
  "totem_boost", "totem_boost_pp", "uid", "work_per_hour",
] as const;
const landStakeItemKeys = [
  "boost", "item_detail_id", "name", "player", "stake_ref_uid", "stake_start_date", "stake_type_uid", "uid",
] as const;
const landStakeCardKeySet = new Set<string>(landStakeCardKeys);
const landStakeItemKeySet = new Set<string>(landStakeItemKeys);

const landStakeStringKeys = new Set([
  "base_pp_after_cap", "base_pp_after_cap_percentage", "boost", "boost_pp", "card_abilities_boost",
  "card_abilities_boost_pp", "card_bloodlines_boost", "card_bloodlines_boost_pp", "card_set",
  "deed_rarity_boost", "deed_rarity_boost_pp", "deed_status_token_boost", "deed_status_token_boost_pp",
  "land_base_pp", "name", "player", "runi_boost", "runi_boost_pp", "stake_ref_uid", "stake_start_date",
  "stake_type_uid", "terrain_boost", "terrain_boost_pp", "title_boost", "title_boost_pp",
  "total_construction_pp", "total_harvest_pp", "totem_boost", "totem_boost_pp", "uid", "work_per_hour",
]);
const landStakeNumberKeys = new Set([
  "bcx", "card_detail_id", "collection_power", "dec_stake_needed", "edition", "foil", "item_detail_id",
  "land_dec_stake_needed", "slot",
]);
const landStakeBooleanKeys = new Set(["gold", "is_powered"]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasRequiredKeys(
  value: JsonRecord,
  expected: readonly string[],
): boolean {
  return expected.every((key) => Object.hasOwn(value, key));
}

function isNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function isNumberOrNull(value: unknown): boolean {
  return value === null || isNumber(value);
}

function isStringOrNull(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function isBoolean(value: unknown): boolean {
  return typeof value === "boolean";
}

export function isBooleanOrNull(value: unknown): boolean {
  return value === null || isBoolean(value);
}

function isLandProjectSegment(value: unknown): value is JsonRecord {
  if (!isRecord(value) || !hasRequiredKeys(value, segmentKeys)) return false;
  for (const [key, field] of Object.entries(value)) {
    if (!segmentKeys.includes(key as (typeof segmentKeys)[number])) continue;
    if (segmentStringOrNullKeys.has(key)) {
      if (!isStringOrNull(field)) return false;
    } else if (segmentNumberOrNullKeys.has(key)) {
      if (!isNumberOrNull(field)) return false;
    } else if (segmentStringKeys.has(key)) {
      if (typeof field !== "string") return false;
    } else if (!isNumber(field)) {
      return false;
    }
  }
  return true;
}

function isLandProject(value: unknown, nullOnlyKeys: ReadonlySet<string>): value is JsonRecord {
  if (!isRecord(value) || !hasRequiredKeys(value, landProjectKeys.filter((key) => !nullOnlyKeys.has(key)))) return false;
  for (const [key, field] of Object.entries(value)) {
    if (!landProjectKeySet.has(key)) continue;
    if (nullOnlyKeys.has(key)) continue;
    if (key === "segments") {
      if (!Array.isArray(field) || !field.every(isLandProjectSegment)) return false;
    } else if (key === "resource_recipe") {
      if (!Array.isArray(field)) return false;
    } else if (landProjectStringOrNullKeys.has(key)) {
      if (!isStringOrNull(field)) return false;
    } else if (landProjectNumberOrNullKeys.has(key)) {
      if (!isNumberOrNull(field)) return false;
    } else if (landProjectBooleanOrNullKeys.has(key)) {
      if (!isBooleanOrNull(field)) return false;
    } else if (landProjectStringKeys.has(key)) {
      if (typeof field !== "string") return false;
    } else if (landProjectBooleanKeys.has(key)) {
      if (!isBoolean(field)) return false;
    } else if (!isNumber(field)) {
      return false;
    }
  }
  return true;
}

function isLandProjectRequirement(value: unknown): value is JsonRecord {
  if (!isRecord(value) || !hasRequiredKeys(value, requirementKeys.filter((key) => !requirementsNullOnlyKeys.has(key)))) return false;
  for (const [key, field] of Object.entries(value)) {
    if (!requirementKeySet.has(key) || requirementsNullOnlyKeys.has(key)) continue;
    if (["deed_uid", "land_work_type_name", "projected_end", "work_per_hour"].includes(key)) {
      if (typeof field !== "string") return false;
    } else if (key === "allow_time_crystals" || key === "land_work_type_is_construction") {
      if (!isBoolean(field)) return false;
    } else if (!isNumber(field)) {
      return false;
    }
  }
  return true;
}

function isDeed(value: unknown, optionalNullOnlyKeys: ReadonlySet<string> = deedNullOnlyKeys): value is JsonRecord {
  if (!isRecord(value) || !hasRequiredKeys(value, deedKeys.filter((key) => !optionalNullOnlyKeys.has(key)))) return false;
  for (const [key, field] of Object.entries(value)) {
    if (!deedKeySet.has(key)) continue;
    if (optionalNullOnlyKeys.has(key)) continue;
    if (["region_id", "tract_id", "plot_id", "region_number", "tract_number", "plot_number", "item_detail_id", "created_block_num", "time_crystal_value", "rarity_sort_value"].includes(key)) {
      if (!isNumber(field)) return false;
    } else if (["listed", "in_use", "is_construction"].includes(key)) {
      if (!isBoolean(field)) return false;
    } else if (["resource_id", "market_listing_status_id", "lock_days"].includes(key)) {
      if (!isNumberOrNull(field)) return false;
    } else if (["resource_symbol", "unlock_date", "market_updated_date", "market_id", "listing_price", "market_listing_id"].includes(key)) {
      if (!isStringOrNull(field)) return false;
    } else if (typeof field !== "string") {
      return false;
    }
  }
  return true;
}

function isWorksite(value: unknown): value is JsonRecord {
  if (!isRecord(value) || !hasRequiredKeys(value, worksiteKeys.filter((key) => !worksiteNullOnlyKeys.has(key)))) return false;
  for (const [key, field] of Object.entries(value)) {
    if (!worksiteKeySet.has(key)) continue;
    if (worksiteNullOnlyKeys.has(key)) continue;
    if (["is_active", "is_construction", "is_empty", "is_harvesting", "is_runi_staked", "is_sps_work"].includes(key)) {
      if (!isBoolean(field)) return false;
    } else if (key === "resource_recipe") {
      if (!Array.isArray(field)) return false;
    } else if (["deed_uid", "region_uid", "project_type", "worksite_type", "token_symbol", "created_date", "start_date", "project_created_date", "last_action_time", "last_updated_date", "next_op_allowed_date", "trx_id"].includes(key)) {
      if (typeof field !== "string") return false;
    } else if (!isNumber(field)) {
      return false;
    }
  }
  return true;
}

function isStaking(value: unknown): value is JsonRecord {
  if (!isRecord(value) || !hasRequiredKeys(value, stakingKeys)) return false;
  for (const [key, field] of Object.entries(value)) {
    if (!stakingKeySet.has(key)) continue;
    if (["deed_uid", "region_uid", "manager"].includes(key)) {
      if (typeof field !== "string") return false;
    } else if (["is_powered", "is_energized", "is_power_core_staked", "is_runi_staked", "has_completed_first_project", "has_labors_luck"].includes(key)) {
      if (!isBoolean(field)) return false;
    } else if (key === "active_land_project_id") {
      if (!isNumberOrNull(field)) return false;
    } else if (!isNumber(field)) {
      return false;
    }
  }
  return true;
}

function isVapiStatus(body: unknown): body is JsonRecord {
  return isRecord(body) && typeof body.status === "string";
}

function isLandStakeRow(value: unknown, keys: readonly string[], keySet: ReadonlySet<string>): value is JsonRecord {
  if (!isRecord(value) || !hasRequiredKeys(value, keys)) return false;
  for (const [key, field] of Object.entries(value)) {
    if (!keySet.has(key) || field === null) continue;
    if (landStakeStringKeys.has(key)) {
      if (typeof field !== "string") return false;
    } else if (landStakeNumberKeys.has(key)) {
      if (!isNumber(field)) return false;
    } else if (landStakeBooleanKeys.has(key)) {
      if (!isBoolean(field)) return false;
    } else {
      return false;
    }
  }
  return true;
}

const landCountRegionKeys = ["uid", "name", "region_number"] as const;

function isLandCountRegion(value: unknown): value is JsonRecord {
  if (!isRecord(value) || !hasRequiredKeys(value, landCountRegionKeys)) return false;
  return typeof value.uid === "string"
    && typeof value.name === "string"
    && isNumber(value.region_number);
}

function isLandRegionCountRow(value: unknown): value is JsonRecord {
  if (!isRecord(value) || !hasRequiredKeys(value, ["region", "for_sale", "owned", "listed", "min_price", "dec_stake"])) return false;
  return isLandCountRegion(value.region)
    && isNumber(value.for_sale)
    && isNumber(value.owned)
    && isNumber(value.listed)
    && isNumber(value.min_price)
    && isNumber(value.dec_stake);
}

function isLandTractCountRow(value: unknown): value is JsonRecord {
  if (!isRecord(value) || !hasRequiredKeys(value, ["region", "tract_number", "owned", "listed"])) return false;
  return isLandCountRegion(value.region)
    && isNumber(value.tract_number)
    && isNumber(value.owned)
    && isNumber(value.listed);
}

export function matchesLandDeedByPlot(body: unknown): body is unknown {
  if (!isVapiStatus(body)) return false;
  if (body.data === null || body.data === undefined || (Array.isArray(body.data) && body.data.length === 0)) return true;
  return isDeed(body.data, byPlotNullOnlyKeys);
}

export function matchesLandDeedsSearchLimited(body: unknown): body is unknown {
  if (!isVapiStatus(body) || !isRecord(body.data) || !hasRequiredKeys(body.data, ["deeds", "worksite_details", "staking_details"])) return false;
  const { deeds, worksite_details: worksiteDetails, staking_details: stakingDetails } = body.data;
  return Array.isArray(deeds) && deeds.every((deed) => isDeed(deed))
    && Array.isArray(worksiteDetails) && worksiteDetails.every(isWorksite)
    && Array.isArray(stakingDetails) && stakingDetails.every(isStaking);
}

export function matchesLandDeedsSearchOrdered(body: unknown): body is unknown {
  return isVapiStatus(body) && Array.isArray(body.data) && body.data.length === 0;
}

export function matchesLandProjectsActive(body: unknown): body is unknown {
  if (!isVapiStatus(body)) return false;
  if (body.data === null || body.data === undefined || (Array.isArray(body.data) && body.data.length === 0)) return true;
  return isLandProject(body.data, activeNullOnlyKeys);
}

export function matchesLandProjectsList(body: unknown): body is unknown {
  if (!isVapiStatus(body)) return false;
  if (body.data === null || body.data === undefined || (Array.isArray(body.data) && body.data.length === 0)) return true;
  return Array.isArray(body.data) && body.data.every((row) => isLandProject(row, listNullOnlyKeys));
}

export function matchesLandProjectsRequirements(body: unknown): body is unknown {
  if (!isVapiStatus(body)) return false;
  if (body.data === null || body.data === undefined || (Array.isArray(body.data) && body.data.length === 0)) return true;
  return Array.isArray(body.data) && body.data.every(isLandProjectRequirement);
}

export function matchesLandStakeDeedAssets(body: unknown): body is unknown {
  if (!isVapiStatus(body)) return false;
  if (body.data === null || body.data === undefined || (Array.isArray(body.data) && body.data.length === 0)) return true;
  if (!isRecord(body.data) || !Array.isArray(body.data.cards) || !Array.isArray(body.data.items)) return false;
  return body.data.cards.every((row) => isLandStakeRow(row, landStakeCardKeys, landStakeCardKeySet))
    && body.data.items.every((row) => isLandStakeRow(row, landStakeItemKeys, landStakeItemKeySet));
}

export function matchesLandRegionsCounts(body: unknown): body is unknown {
  return isVapiStatus(body) && Array.isArray(body.data) && body.data.every(isLandRegionCountRow);
}

export function matchesLandTractsCounts(body: unknown): body is unknown {
  return isVapiStatus(body) && Array.isArray(body.data) && body.data.every(isLandTractCountRow);
}

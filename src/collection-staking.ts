import type { ProjectedCollectionCard } from "./cards-collection.js";

export function withCollectionStaking(card: ProjectedCollectionCard, observedAt: number): ProjectedCollectionCard {
  const start = card.stake_start_date;
  const end = card.stake_end_date;
  let staking_status: NonNullable<ProjectedCollectionCard["staking_status"]> = "unknown";
  if (start === null && end === null) staking_status = "unstaked";
  else if (typeof start === "string" && end !== undefined) {
    const startMs = Date.parse(start);
    if (startMs >= observedAt) staking_status = "pending";
    else if (end === null) staking_status = "staked";
    else staking_status = Date.parse(end) > observedAt ? "unstaking" : "unstaked";
  }
  return { ...card, staking_status, staking_observed_at: new Date(observedAt).toISOString() };
}

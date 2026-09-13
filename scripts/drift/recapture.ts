import { bindSweepInputs, createSweepRequester } from "./request.js";
import { sanitizeFixture } from "./sanitize-fixture.js";
import { planFixtureRenewal, type FixtureRenewalPair, RENEWAL_HOLD_FLOOR } from "./renewal.js";
import type { BoundCatalogueRequest } from "../../src/catalogue/index.js";
import type { RawOutcome } from "./types.js";

export type RecaptureInput = {
  fixturePath: string;
  entryId: string;
  params: Record<string, string | number | boolean>;
  variantKey?: string;
  existing: Record<string, unknown>;
};

export async function recaptureFixtures(inputs: RecaptureInput[],
  request: (bound: BoundCatalogueRequest) => Promise<RawOutcome> = createSweepRequester(),
  observedAt = new Date().toISOString(),
) {
  if (inputs.length === 0 || inputs.length > 512) throw new Error("Invalid recapture count.");
  if (new Set(inputs.map(item => item.fixturePath)).size !== inputs.length) throw new Error("Duplicate fixture target.");
  const bound = inputs.map(item => {
    if (!/^tests\/fixtures\/[a-z0-9][a-z0-9-]*\.fixture\.json$/.test(item.fixturePath)) throw new Error("Invalid fixture target.");
    return bindSweepInputs([{ entryId: item.entryId, params: item.params,
      ...(item.variantKey === undefined ? {} : { variantKey: item.variantKey }) }])[0]!;
  });
  const failed: Array<{ fixturePath: string; reason: "response" | "review" }> = [];
  const pairs: FixtureRenewalPair[] = [];
  const blocked = new Set<string>();
  let reads = 0;
  for (const [index, input] of inputs.entries()) {
    const binding = bound[index]!;
    const outcome = await request(binding);
    reads++;
    if (outcome.status === 403) blocked.add(binding.entryId);
    if (outcome.status < 200 || outcome.status >= 300 || !outcome.isJson) {
      failed.push({ fixturePath: input.fixturePath, reason: "response" });
      if (blocked.size >= 2) break;
      continue;
    }
    try {
      const dataKeys = Object.keys(input.existing).filter(key => key !== "provenance" && key !== "valueClasses");
      const wrapped = dataKeys.length === 1 && dataKeys[0] === "body";
      const captured = wrapped ? { body: outcome.body } : outcome.body;
      const accountKeys = new Set(["name", "username", "player", "players", "owner", "renter", "account", "target"]);
      const forbidden = Object.entries(input.params).filter(([key, value]) => accountKeys.has(key) && typeof value === "string").map(([, value]) => String(value));
      const recaptured = sanitizeFixture(input.existing, captured, observedAt, forbidden);
      pairs.push({
        fixturePath: input.fixturePath, entryId: input.entryId, existing: input.existing,
        recaptured, host: binding.host, pathTemplate: binding.endpointTemplate,
      });
    } catch {
      failed.push({ fixturePath: input.fixturePath, reason: "review" });
    }
  }
  const plan = planFixtureRenewal(pairs, { observedOn: observedAt.slice(0, 10) });
  // Failed or unreviewed captures must not disappear from the batch hold denominator.
  const holdCount = failed.length + plan.outcomes.filter(outcome => outcome === "hold").length;
  const holdFraction = holdCount / inputs.length;
  const aborted = blocked.size >= 2;
  const blockedByHoldFloor = aborted || holdFraction > RENEWAL_HOLD_FLOOR;
  return {
    plan: { ...plan, holdFraction, blockedByHoldFloor,
      writes: blockedByHoldFloor ? [] : plan.decisions.filter(decision => decision.outcome === "refresh")
        .map(decision => ({ path: decision.fixturePath, contents: JSON.stringify(decision.recaptured, null, 2) + "\n" })),
      pendingWrites: blockedByHoldFloor ? [] : plan.pendingWrites },
    failed, reads, total: inputs.length, aborted,
  };
}

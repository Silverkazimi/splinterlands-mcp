import { classifyResponse, isEmptyResult } from "../../src/http/errors.js";
import { avatarFixtureBody } from "./avatar-fixture.js";
import { accountParameterNames } from "./configuration.js";
import { fixtureIsEmpty, verifiedSample } from "./sample-state.js";
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
    if (!/^tests\/fixtures\/[a-z0-9][a-z0-9_-]*\.fixture\.json$/.test(item.fixturePath)) throw new Error("Invalid fixture target.");
    if (item.entryId === "vapi.market.meta.asset") {
      const body = item.existing.body as { data?: { assetName?: unknown } } | undefined;
      if (typeof body?.data?.assetName !== "string" || item.params.assetName !== body.data.assetName) {
        throw new Error("Fixture asset selector mismatch.");
      }
    }
    return bindSweepInputs([{ entryId: item.entryId, params: item.params,
      ...(item.variantKey === undefined ? {} : { variantKey: item.variantKey }) }])[0]!;
  });
  const failed: Array<{ fixturePath: string; reason: "response" | "review" }> = [];
  const pairs: FixtureRenewalPair[] = [];
  const coverageGaps: Array<{ fixturePath: string; entryId: string; reason: "empty_sample" | "populated_sample" }> = [];
  const blocked = new Set<string>();
  let reads = 0;
  for (const [index, input] of inputs.entries()) {
    const binding = bound[index]!;
    const outcome = await request(binding);
    reads++;
    if (outcome.status === 403) blocked.add(binding.entryId);
    const classified = classifyResponse({ host: binding.hostname, endpoint: binding.endpointTemplate,
      status: outcome.status, body: outcome.body, isJson: outcome.isJson });
    if (!classified.ok || !outcome.isJson) {
      failed.push({ fixturePath: input.fixturePath, reason: "response" });
      if (blocked.size >= 2) break;
      continue;
    }
    const empty = isEmptyResult(outcome.body);
    if (accountParameterNames(input.entryId).size > 0 && empty !== fixtureIsEmpty(input.existing)
      && verifiedSample(input.entryId, outcome.body, input.variantKey)) {
      coverageGaps.push({ fixturePath: input.fixturePath, entryId: input.entryId,
        reason: empty ? "empty_sample" : "populated_sample" });
      continue;
    }
    try {
      const dataKeys = Object.keys(input.existing).filter(key => key !== "provenance" && key !== "valueClasses");
      const wrapped = dataKeys.length === 1 && dataKeys[0] === "body";
      const avatar = input.entryId === "api.players.avatar";
      const body = avatar ? avatarFixtureBody(input.existing, outcome.body, binding) : outcome.body;
      const captured = wrapped ? { body } : body;
      const accountKeys = new Set(["name", "username", "player", "players", "owner", "renter", "account", "target"]);
      const forbidden = Object.entries(input.params).filter(([key, value]) => accountKeys.has(key) && typeof value === "string").map(([, value]) => String(value));
      const recaptured = sanitizeFixture(input.existing, captured, observedAt, forbidden);
      if (avatar) recaptured.provenance.redaction += " Avatar URLs retain reviewed synthetic fixture values.";
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
  const holdCount = coverageGaps.length + failed.length + plan.outcomes.filter(outcome => outcome === "hold").length;
  const holdFraction = holdCount / inputs.length;
  const aborted = blocked.size >= 2;
  const blockedByHoldFloor = aborted || holdFraction > RENEWAL_HOLD_FLOOR;
  return {
    plan: { ...plan, holdFraction, blockedByHoldFloor,
      writes: blockedByHoldFloor ? [] : plan.decisions.filter(decision => decision.outcome === "refresh")
        .map(decision => ({ path: decision.fixturePath, contents: JSON.stringify(decision.recaptured, null, 2) + "\n" })),
      pendingWrites: blockedByHoldFloor ? [] : plan.pendingWrites },
    failed, coverageGaps, reads, total: inputs.length, aborted,
  };
}

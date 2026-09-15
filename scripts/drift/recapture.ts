import { classifyResponse } from "../../src/http/errors.js";
import { sampleFixtureBody } from "./fixture-sample.js";
import { MAX_FIXTURE_BYTES } from "./fixture-limits.js";
import { avatarFixtureBody } from "./avatar-fixture.js";
import { accountParameterNames } from "./configuration.js";
import { fixtureIsEmpty, sampleIsEmpty, verifiedSample, isTransientQueue } from "./sample-state.js";
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
  const transientSamples: Array<{ fixturePath: string; entryId: string; reason: "idle_queue" }> = [];
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
    if (!verifiedSample(input.entryId, outcome.body, input.variantKey)) {
      failed.push({ fixturePath: input.fixturePath, reason: "review" });
      continue;
    }
    const empty = sampleIsEmpty(input.entryId, outcome.body, input.variantKey);
    if (empty && isTransientQueue(input.entryId)) {
      transientSamples.push({ fixturePath: input.fixturePath, entryId: input.entryId, reason: "idle_queue" });
      continue;
    }
    if (accountParameterNames(input.entryId).size > 0 && empty !== fixtureIsEmpty(input.existing, input.entryId, input.variantKey)
      && verifiedSample(input.entryId, outcome.body, input.variantKey)) {
      coverageGaps.push({ fixturePath: input.fixturePath, entryId: input.entryId,
        reason: empty ? "empty_sample" : "populated_sample" });
      continue;
    }
    try {
      const dataKeys = Object.keys(input.existing).filter(key => key !== "provenance" && key !== "valueClasses");
      const wrapped = dataKeys.length === 1 && dataKeys[0] === "body";
      const avatar = input.entryId === "api.players.avatar";
      const sampled = sampleFixtureBody(input.existing, outcome.body, input.entryId);
      const body = avatar ? avatarFixtureBody(input.existing, sampled.body, binding) : sampled.body;
      const captured = wrapped ? { body } : body;
      const accountKeys = new Set(["name", "username", "player", "players", "owner", "renter", "account", "target"]);
      const forbidden = Object.entries(input.params).filter(([key, value]) => accountKeys.has(key) && typeof value === "string").map(([, value]) => String(value));
      const sanitized = sanitizeFixture(input.existing, captured, observedAt, forbidden);
      const recaptured = { ...sanitized, provenance: { ...sanitized.provenance,
        ...((input.existing.provenance as Record<string, unknown> | undefined)?.reviewedResponseShapes
          ? { reviewedResponseShapes: (input.existing.provenance as Record<string, unknown>).reviewedResponseShapes } : {}),
        ...(sampled.sample ? { fixtureSample: sampled.sample } : {}),
        ...((input.existing.provenance as Record<string, unknown> | undefined)?.reviewedAlternateShapes
          ? { reviewedAlternateShapes: (input.existing.provenance as Record<string, unknown>).reviewedAlternateShapes } : {}) } };
      if (avatar) recaptured.provenance.redaction += " Avatar URLs retain reviewed synthetic fixture values.";
      const fixtureData = Object.fromEntries(Object.entries(recaptured).filter(([key]) => !["provenance", "valueClasses"].includes(key)));
      if (!verifiedSample(input.entryId, wrapped ? fixtureData.body : fixtureData, input.variantKey)) {
        throw new Error("Sanitized fixture violates response contract.");
      }
      if (Buffer.byteLength(JSON.stringify(recaptured, null, 2) + "\n", "utf8") > MAX_FIXTURE_BYTES) {
        throw new Error("Fixture exceeds size limit.");
      }
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
    transientSamples,
    plan: { ...plan, holdFraction, blockedByHoldFloor,
      writes: blockedByHoldFloor ? [] : plan.decisions.filter(decision => decision.outcome === "refresh")
        .map(decision => ({ path: decision.fixturePath, contents: JSON.stringify(decision.recaptured, null, 2) + "\n" })),
      pendingWrites: blockedByHoldFloor ? [] : plan.pendingWrites },
    failed, coverageGaps, reads, total: inputs.length, aborted,
  };
}

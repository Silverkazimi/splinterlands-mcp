import observationsDocument from "../library/endpoint-observations.json" with { type: "json" };
import { allCatalogueEntries, getCatalogueEntry } from "./catalogue/index.js";
import type { CatalogueEntry, ResultContract } from "./catalogue/schema.js";

export const KNOWLEDGE_DIMENSIONS = [
  "declared",
  "observed-negative",
  "observed-shaped",
  "callable",
  "proven-sufficient",
] as const;

export type KnowledgeDimension = (typeof KNOWLEDGE_DIMENSIONS)[number];

type StoredEvidence = {
  value: boolean;
  observedAt: string;
  reason: string;
  source: string;
  hash?: string;
};

type StoredObservation = {
  endpointId: string;
  subject: string;
  location?: string;
  dimensions: Partial<Record<KnowledgeDimension, StoredEvidence>>;
};

type DimensionEvidence = {
  value: boolean | null;
  evidence: readonly StoredEvidence[];
};

type Parameter = CatalogueEntry["pathParams"][number] | CatalogueEntry["queryParams"][number] | NonNullable<CatalogueEntry["observedQueryParams"]>[number];

export type EndpointKnowledge = {
  entryId: string;
  host: CatalogueEntry["host"];
  method: CatalogueEntry["method"];
  pathTemplate: string;
  owningTool: string | null;
  dimensions: Record<KnowledgeDimension, DimensionEvidence>;
  parameters: Array<Record<string, unknown>>;
  observations: Array<Record<string, unknown>>;
  resultContract: ResultContract;
  variants: NonNullable<CatalogueEntry["variants"]>;
  resultContractStatus: {
    state: "present" | "empty";
    reason?: string;
    observedAt?: string;
    source?: string;
  };
  provenance: CatalogueEntry["provenance"];
  notes?: string;
};

type KnowledgeSummary = {
  cataloguedEndpoints: number;
  registeredEndpointTools: number;
  callableEndpoints: number;
  uncoveredEndpoints: number;
  offlineKnowledgeTools: 2;
};

export type EndpointList = {
  summary: KnowledgeSummary;
  endpoints: Array<Pick<EndpointKnowledge, "entryId" | "host" | "method" | "pathTemplate" | "owningTool" | "dimensions" | "observations" | "resultContractStatus">>;
};

const observations = observationsDocument.observations as StoredObservation[];

function evidenceFor(value: boolean, source: string, reason: string, observedAt: string): StoredEvidence {
  return { value, source, reason, observedAt };
}

function unknownDimension(): DimensionEvidence {
  return { value: null, evidence: [] };
}

function knownDimension(value: boolean, evidence: StoredEvidence): DimensionEvidence {
  return { value, evidence: [evidence] };
}

function provenanceDate(provenance: NonNullable<CatalogueEntry["provenance"]>): string {
  switch (provenance.source) {
    case "spec":
      return provenance.specFetchedAt;
    case "repository-brief":
      return provenance.recordedAt;
    case "live-observation":
      return provenance.observedAt;
  }
}

function provenanceEvidence(entry: CatalogueEntry): DimensionEvidence {
  const provenance = entry.provenance;
  if (provenance === null) {
    return unknownDimension();
  }
  const date = provenanceDate(provenance);
  const source = provenance.source === "spec" ? provenance.sourceUrl : provenance.source;
  const reason = provenance.source === "spec"
    ? "The catalogue records this endpoint in the official specification."
    : provenance.source === "repository-brief"
    ? provenance.sourceDescription
    : "The catalogue records a live observation for this endpoint.";
  return knownDimension(true, {
    value: true,
    source,
    reason,
    observedAt: date,
    ...(provenance.source === "spec" ? { hash: provenance.specHash } : {}),
  });
}

function observationsFor(entryId: string): StoredObservation[] {
  return observations.filter((observation) => observation.endpointId === entryId);
}

function mergeDimensionEvidence(
  entry: CatalogueEntry,
  dimension: KnowledgeDimension,
  callableEndpointIds: ReadonlySet<string>,
): DimensionEvidence {
  if (dimension === "declared") {
    return provenanceEvidence(entry);
  }
  if (dimension === "callable") {
    if (callableEndpointIds.has(entry.entryId)) {
      return knownDimension(true, evidenceFor(true, "server registration", "A registered endpoint tool binds this exact catalogue entry.", "2026-09-06"));
    }
    // Registration is fully known offline, so an entry no tool binds is knowably
    // not callable. The owning tool only supplies the reason; it once supplied the
    // value too, which turned entries naming no tool into "unknown" rather than "no".
    const owningTool = entry.owningTool;
    const reason = owningTool !== null
      ? `The catalogue names '${owningTool}', but no registered endpoint tool is bound to this entry.`
      : "No registered endpoint tool binds this catalogue entry.";
    return knownDimension(false, evidenceFor(false, "server registration", reason, "2026-09-06"));
  }
  const matching = observationsFor(entry.entryId)
    .map((observation) => observation.dimensions[dimension])
    .filter((evidence): evidence is StoredEvidence => evidence !== undefined);
  if (matching.length === 0) {
    if (dimension === "observed-shaped" && hasObservedShape(entry)) {
      return knownDimension(true, evidenceFor(true, "catalogue result contract", "A non-empty result contract is recorded for this entry or one of its variants.", contractDate(entry)));
    }
    return unknownDimension();
  }
  const values = new Set(matching.map((evidence) => evidence.value));
  if (values.size === 1) {
    return { value: matching[0]?.value ?? null, evidence: matching };
  }
  return { value: null, evidence: matching };
}

function contractDate(entry: CatalogueEntry): string {
  const provenance = entry.provenance;
  if (provenance === null) return "2026-09-06";
  return provenanceDate(provenance);
}

function hasRecordedContract(entry: CatalogueEntry): boolean {
  return Object.keys(entry.resultContract.fingerprint).length > 0;
}

function hasObservedShape(entry: CatalogueEntry): boolean {
  const contracts = [entry.resultContract, ...(entry.variants ?? []).map((variant) => variant.resultContract)];
  return contracts.some((contract) => (contract.observedKeyPaths?.length ?? 0) > 0 || contract.predicateId !== undefined);
}

function emptyContractReason(entry: CatalogueEntry): string | undefined {
  if (entry.notes?.includes("No response contract")) {
    return "The result contract is deliberately empty because this route was not captured; no sibling shape is borrowed.";
  }
  if (entry.notes?.includes("Response fields await")) {
    return "The result contract is deliberately empty while response fields await source-backed evidence.";
  }
  if (entry.notes?.includes("No default response contract")) {
    return "The default contract is empty because unparameterized attempts produced no response; only named variants have captured evidence.";
  }
  return undefined;
}

function resultContractStatus(entry: CatalogueEntry): EndpointKnowledge["resultContractStatus"] {
  if (hasRecordedContract(entry)) {
    return { state: "present" };
  }
  const reason = emptyContractReason(entry);
  if (reason === undefined) return { state: "empty" };
  return {
    state: "empty",
    reason,
    observedAt: contractDate(entry),
    source: entry.notes?.includes("No response contract") || entry.notes?.includes("No default response contract")
      ? "tests/evidence/land-result-contract-evidence.json"
      : "catalogue notes",
  };
}

function parameterDimensions(
  entry: CatalogueEntry,
  parameter: Parameter,
  location: string,
  callableEndpointIds: ReadonlySet<string>,
): Record<KnowledgeDimension, DimensionEvidence> {
  const dimensions = Object.fromEntries(KNOWLEDGE_DIMENSIONS.map((dimension) => [
    dimension,
    dimension === "declared" && location === "observed-query"
      ? unknownDimension()
      : dimension === "callable"
      ? mergeDimensionEvidence(entry, dimension, callableEndpointIds)
      : unknownDimension(),
  ])) as Record<KnowledgeDimension, DimensionEvidence>;
  const match = observationsFor(entry.entryId).find((observation) => observation.subject === parameter.name && (observation.location ?? location) === location);
  if (match !== undefined) {
    for (const dimension of KNOWLEDGE_DIMENSIONS) {
      const evidence = match.dimensions[dimension];
      if (evidence !== undefined) {
        dimensions[dimension] = { value: evidence.value, evidence: [evidence] };
      }
    }
  }
  if ((location === "query" || location === "observed-query") && "inertUpstream" in parameter) {
    const observedEvidence = match?.dimensions["observed-negative"];
    const catalogueValue = parameter.inertUpstream;
    const catalogueEvidence = evidenceFor(
      catalogueValue,
      "catalogue parameter model",
      catalogueValue
        ? "The catalogue records this query parameter as inert upstream."
        : "The catalogue records this query parameter as not inert upstream.",
      contractDate(entry),
    );
    if (catalogueValue === true) {
      dimensions["observed-negative"] = observedEvidence === undefined
        ? knownDimension(true, catalogueEvidence)
        : { value: true, evidence: [catalogueEvidence, observedEvidence] };
    } else if (observedEvidence !== undefined) {
      dimensions["observed-negative"] = { value: observedEvidence.value, evidence: [catalogueEvidence, observedEvidence] };
    }
  }
  if (location === "observed-query") {
    const callable = callableEndpointIds.has(entry.entryId) && "inertUpstream" in parameter && !parameter.inertUpstream;
    dimensions.callable = knownDimension(callable, evidenceFor(callable, "catalogue parameter model",
      callable ? "This observed non-inert query parameter is bindable on the registered tool."
        : "This observed parameter is inert or its endpoint has no registered tool.", contractDate(entry)));
  }
  return dimensions;
}

function parameterDescription(
  entry: CatalogueEntry,
  parameter: Parameter,
  location: string,
  callableEndpointIds: ReadonlySet<string>,
): Record<string, unknown> {
  const description: Record<string, unknown> = {
    name: parameter.name,
    type: parameter.type,
    location,
    dimensions: parameterDimensions(entry, parameter, location, callableEndpointIds),
  };
  if ("required" in parameter) {
    description.required = parameter.required;
    description.isPlayerName = parameter.isPlayerName;
  } else if ("declaredRequired" in parameter) {
    description.declaredRequired = parameter.declaredRequired;
    description.measuredRequired = parameter.measuredRequired;
    description.inertUpstream = parameter.inertUpstream;
  } else {
    description.inertUpstream = parameter.inertUpstream;
  }
  if ("minimum" in parameter && parameter.minimum !== undefined) description.minimum = parameter.minimum;
  if ("maximum" in parameter && parameter.maximum !== undefined) description.maximum = parameter.maximum;
  return description;
}

function parameterDescriptions(entry: CatalogueEntry, callableEndpointIds: ReadonlySet<string>): Array<Record<string, unknown>> {
  return [
    ...entry.pathParams.map((parameter) => parameterDescription(entry, parameter, "path", callableEndpointIds)),
    ...entry.queryParams.map((parameter) => parameterDescription(entry, parameter, "query", callableEndpointIds)),
    ...(entry.observedQueryParams ?? []).map((parameter) => parameterDescription(entry, parameter, "observed-query", callableEndpointIds)),
  ];
}

function observationDescriptions(entry: CatalogueEntry): Array<Record<string, unknown>> {
  return observationsFor(entry.entryId).map((observation) => ({
    subject: observation.subject,
    ...(observation.location === undefined ? {} : { location: observation.location }),
    dimensions: Object.fromEntries(Object.entries(observation.dimensions).map(([dimension, evidence]) => [dimension, {
      value: evidence?.value ?? null,
      evidence: evidence === undefined ? [] : [evidence],
    }])),
  }));
}

export function describeEndpoint(entryId: string, callableEndpointIds: ReadonlySet<string>): EndpointKnowledge {
  const entry = getCatalogueEntry(entryId);
  const dimensions = Object.fromEntries(KNOWLEDGE_DIMENSIONS.map((dimension) => [
    dimension,
    mergeDimensionEvidence(entry, dimension, callableEndpointIds),
  ])) as Record<KnowledgeDimension, DimensionEvidence>;
  return {
    entryId: entry.entryId,
    host: entry.host,
    method: entry.method,
    pathTemplate: entry.pathTemplate,
    owningTool: entry.owningTool,
    dimensions,
    parameters: parameterDescriptions(entry, callableEndpointIds),
    observations: observationDescriptions(entry),
    resultContract: entry.resultContract,
    variants: entry.variants ?? [],
    resultContractStatus: resultContractStatus(entry),
    provenance: entry.provenance,
    ...(entry.notes === undefined ? {} : { notes: entry.notes }),
  };
}

export function listEndpoints(callableEndpointIds: ReadonlySet<string>): EndpointList {
  const entries = allCatalogueEntries();
  const endpoints = entries.map((entry) => {
    const described = describeEndpoint(entry.entryId, callableEndpointIds);
    return {
      entryId: described.entryId,
      host: described.host,
      method: described.method,
      pathTemplate: described.pathTemplate,
      owningTool: described.owningTool,
      dimensions: described.dimensions,
      observations: described.observations,
      resultContractStatus: described.resultContractStatus,
    };
  });
  return {
    summary: {
      cataloguedEndpoints: entries.length,
      registeredEndpointTools: callableEndpointIds.size,
      callableEndpoints: endpoints.filter((endpoint) => endpoint.dimensions.callable.value === true).length,
      uncoveredEndpoints: endpoints.filter((endpoint) => endpoint.dimensions.callable.value !== true).length,
      offlineKnowledgeTools: 2,
    },
    endpoints,
  };
}

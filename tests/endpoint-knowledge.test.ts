import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue/index.js";
import { describeEndpoint, listEndpoints } from "../src/endpoint-knowledge.js";
import { createServer, TOOL_ENTRY_IDS } from "../src/server.js";

const callableEndpointIds = new Set(Object.values(TOOL_ENTRY_IDS));

type DescribedDimension = { value: boolean | null };
type DescribedItem = { name: string; location?: string; dimensions: Record<string, DescribedDimension> };

describe("offline endpoint knowledge", () => {
  it("reports the catalogue gap from actual endpoint bindings", () => {
    const result = listEndpoints(callableEndpointIds);

    expect(result.summary).toEqual({
      cataloguedEndpoints: result.endpoints.length,
      registeredEndpointTools: callableEndpointIds.size,
      callableEndpoints: callableEndpointIds.size,
      uncoveredEndpoints: result.endpoints.length - callableEndpointIds.size,
      offlineKnowledgeTools: 2,
    });
    // Anchored to the catalogue rather than to the summary just asserted above,
    // so the length check cannot become an assertion of a value against itself.
    expect(result.endpoints).toHaveLength(catalogue.length);
    expect(callableEndpointIds.size).toBeLessThan(catalogue.length);
    expect(result.endpoints.find((endpoint) => endpoint.entryId === "vapi.land.deeds.details-by-id")?.dimensions.callable).toMatchObject({ value: false });
    expect(result.endpoints.find((endpoint) => endpoint.entryId === "vapi.land.deeds.details-by-uid")?.dimensions.callable).toMatchObject({ value: true });
    expect(result.endpoints.find((endpoint) => endpoint.entryId === "vapi.land.deeds.by-plot")?.dimensions.callable).toMatchObject({ value: true });
  });

  it("keeps measured selector negatives and working selectors distinct", () => {
    const result = describeEndpoint("vapi.land.deeds.search", callableEndpointIds);
    const parameter = (name: string, location?: string) => result.parameters
      .map((candidate) => candidate as DescribedItem)
      .find((candidate) => candidate.name === name && (location === undefined || candidate.location === location));
    const observation = (subject: string) => result.observations
      .map((candidate) => candidate as { subject: string; dimensions: Record<string, DescribedDimension> })
      .find((candidate) => candidate.subject === subject);

    expect(parameter("status", "observed-query")?.dimensions["observed-negative"]).toMatchObject({ value: true });
    expect(parameter("status", "observed-query")?.dimensions.callable).toMatchObject({ value: false });
    expect(parameter("offset")?.dimensions["observed-negative"]).toMatchObject({ value: true });
    expect(parameter("orderBy")?.dimensions["observed-negative"]).toMatchObject({ value: true });
    expect(parameter("player")?.dimensions["observed-negative"]).toMatchObject({ value: false });
    expect(parameter("player")?.dimensions["proven-sufficient"]).toMatchObject({ value: true });
    expect(observation("plot_id")?.dimensions["observed-negative"]).toMatchObject({ value: true });
    expect(observation("unparameterized-call")?.dimensions["observed-negative"]).toMatchObject({ value: true });
  });

  it("reports observed shapes for both staking entries", () => {
    for (const entryId of ["vapi.land.stake.deeds-assets", "vapi.land.stake.deed-details"]) {
      const result = describeEndpoint(entryId, callableEndpointIds);
      expect(result.resultContractStatus.state).toBe("present");
      expect(result.dimensions["observed-shaped"]).toMatchObject({ value: true });
    }
  });

  it("reports DEC staking contracts and measured optional parameters", () => {
    for (const entryId of [
      "vapi.land.stake.dec-overall",
      "vapi.land.stake.dec-region",
      "vapi.land.stake.dec-staked",
      "vapi.land.stake.evp-pending-claim",
    ]) {
      const result = describeEndpoint(entryId, callableEndpointIds);
      expect(result.resultContractStatus.state).toBe("present");
      expect(result.dimensions["observed-shaped"]).toMatchObject({ value: true });
      expect(result.parameters.some((parameter) => parameter.name === "player" && parameter.measuredRequired === false)).toBe(true);
    }
    const region = describeEndpoint("vapi.land.stake.dec-region", callableEndpointIds);
    expect(region.parameters.some((parameter) => parameter.name === "region_uid" && parameter.measuredRequired === false)).toBe(true);
  });

  it("keeps unverified card availability assessments uncontracted and unbound", () => {
    for (const entryId of [
      "vapi.land.stake.cards-available",
      "vapi.land.stake.cards-grouped",
    ]) {
      const result = describeEndpoint(entryId, callableEndpointIds);
      expect(result.resultContractStatus.state).toBe("empty");
      expect(result.resultContract.fingerprint).toEqual({});
      expect(result.resultContract.requiredKeyPaths).toEqual([]);
      expect(result.dimensions.callable).toMatchObject({ value: false });
    }
  });

  it("reports promoted Power Core item contracts as bound without promoting card routes", () => {
    for (const id of ["vapi.land.stake.items-available","vapi.land.stake.items-grouped"]) {
      const result=describeEndpoint(id,callableEndpointIds);
      expect(result.resultContractStatus.state).toBe("present");
      expect(result.dimensions.callable).toMatchObject({value:true});
      expect(result.dimensions["observed-shaped"]).toMatchObject({value:true});
    }
  });

  it("uses null and false as different evidence states", () => {
    const unknown = describeEndpoint("vapi.land.deeds.owned", callableEndpointIds);
    // Registration is knowable offline, so callable is never null: an entry no tool
    // binds is false with a reason, whether or not it names an owning tool. null
    // belongs to the dimensions that rest on observation, which is what is unknown.
    const unbound = describeEndpoint("vapi.land.deeds.details-by-id", callableEndpointIds);
    const owned = describeEndpoint("vapi.land.deeds.owned", callableEndpointIds);

    expect(unknown.dimensions.declared).toMatchObject({ value: null, evidence: [] });
    expect(unknown.dimensions["observed-negative"]).toMatchObject({ value: null, evidence: [] });
    expect(unbound.dimensions.callable).toMatchObject({ value: false, evidence: [expect.objectContaining({ reason: expect.stringContaining("No registered endpoint tool binds") })] });
    expect(unbound.owningTool).toBeNull();
    expect(owned.dimensions.callable).toMatchObject({ value: true });
    expect(owned.resultContractStatus).toMatchObject({ state: "present" });
  });

  it("answers through MCP without invoking the upstream fetch", async () => {
    let fetchCalls = 0;
    const server = createServer({ fetch: async () => {
      fetchCalls += 1;
      return new Response("{}", { status: 500 });
    } });
    const client = new Client({ name: "endpoint-knowledge-test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const listed = await client.callTool({ name: "list_endpoints", arguments: {} });
      const described = await client.callTool({ name: "describe_endpoint", arguments: { entryId: "vapi.land.deeds.owned" } });

      expect(listed.isError).not.toBe(true);
      expect(described.isError).not.toBe(true);
      expect((listed.structuredContent as { summary: { cataloguedEndpoints: number } }).summary.cataloguedEndpoints).toBe(listEndpoints(callableEndpointIds).summary.cataloguedEndpoints);
      expect((described.structuredContent as { resultContractStatus: { state: string } }).resultContractStatus.state).toBe("present");
      expect(fetchCalls).toBe(0);
    } finally {
      await client.close();
      await server.close();
    }
  });
});

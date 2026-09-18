import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/spec.types.js";
import rankedStatus from "./fixtures/ranked_draws_status.fixture.json" with { type: "json" };
import rankedComplete from "./fixtures/ranked_draws_complete.fixture.json" with { type: "json" };
import rankedEntries from "./fixtures/ranked_draws_entries_completed_id_48.fixture.json" with { type: "json" };
import rankedAvailable from "./fixtures/ranked_draws_available_prizes.fixture.json" with { type: "json" };
import frontierRecent from "./fixtures/frontier_draws_recent_prizes.fixture.json" with { type: "json" };

type Rig = {
  calls: string[];
  close: () => Promise<void>;
  setBody: (path: string, body: unknown) => void;
  call: (name: string, arguments_?: Record<string, unknown>) => Promise<CallToolResult>;
};

async function rig(): Promise<Rig> {
  const calls: string[] = [];
  const bodies: Record<string, unknown> = {
    "/ranked_draws/status": rankedStatus.body,
    "/ranked_draws/complete": rankedComplete.body,
    "/ranked_draws/entries_completed": rankedEntries.body,
    "/ranked_draws/available_prizes": rankedAvailable.body,
    "/frontier_draws/recent_prizes": frontierRecent.body,
  };
  const server = createServer({
    now: () => Date.parse("2026-09-18T00:00:00Z"),
    fetch: async (input) => {
      const url = new URL(String(input));
      calls.push(url.pathname + url.search);
      return new Response(JSON.stringify(bodies[url.pathname] ?? []), { headers: { "content-type": "application/json" } });
    },
    sleep: async () => undefined,
    limiterOptions: { sleep: async () => undefined },
  });
  const client = new Client({ name: "draw-fixtures", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    calls,
    setBody: (path, body) => { bodies[path] = body; },
    close: async () => { await client.close(); await server.close(); },
    call: (name, arguments_ = {}) => client.callTool({ name, arguments: arguments_ }) as Promise<CallToolResult>,
  };
}

describe("ranked and frontier draw tools", () => {
  it("registers both endpoint families and forwards optional status scope", async () => {
    const test = await rig();
    try {
      const result = await test.call("ranked_draws_status", { username: "fixture-account" });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ current_ranked_draw: { id: 49 } });
      expect(test.calls).toEqual(["/ranked_draws/status?username=fixture-account"]);
    } finally { await test.close(); }
  });

  it("requires a numeric draw id and does not request the upstream on invalid input", async () => {
    const test = await rig();
    try {
      const missing = await test.call("ranked_draws_entries_completed");
      const fractional = await test.call("frontier_draws_entries_completed", { id: 1.5 });
      expect(missing.isError).toBe(true);
      expect(fractional.isError).toBe(true);
      expect(test.calls).toEqual([]);
    } finally { await test.close(); }
  });

  it("forwards the required id and applies the shared 100-row truncation notice", async () => {
    const test = await rig();
    try {
      test.setBody("/ranked_draws/entries_completed", Array.from({ length: 101 }, (_, index) => ({
        ...rankedEntries.body[0], player: `sample-account-${index + 1}`,
      })));
      const result = await test.call("ranked_draws_entries_completed", { id: 48 });
      expect(result.isError).not.toBe(true);
      const structured = result.structuredContent;
      if (!structured || !Array.isArray(structured.data)) throw new Error("Expected draw response with a data array");
      expect(structured.data).toHaveLength(100);
      expect(result.content[0]).toMatchObject({ text: expect.stringContaining("truncated") });
      expect(result._meta).toMatchObject({ resultLimit: { truncated: true, returnedRows: 100, upstreamRows: 101 } });
      expect(test.calls).toEqual(["/ranked_draws/entries_completed?id=48"]);
    } finally { await test.close(); }
  });

  it("caches prize metadata but does not cache status", async () => {
    const test = await rig();
    try {
      await test.call("ranked_draws_available_prizes");
      await test.call("ranked_draws_available_prizes");
      await test.call("ranked_draws_status");
      await test.call("ranked_draws_status");
      expect(test.calls).toEqual([
        "/ranked_draws/available_prizes",
        "/ranked_draws/status",
        "/ranked_draws/status",
      ]);
    } finally { await test.close(); }
  });

  it("retains nested recent-prize envelopes and synthetic fixture identities", async () => {
    const test = await rig();
    try {
      const result = await test.call("frontier_draws_recent_prizes");
      expect(result.isError).not.toBe(true);
      const structured = result.structuredContent as { mints: Array<{ mint_player: string }> };
      expect(structured.mints).toHaveLength(3);
      expect(structured.mints[0]!.mint_player).toMatch(/^sample-/);
      expect(test.calls).toEqual(["/frontier_draws/recent_prizes"]);
    } finally { await test.close(); }
  });
});

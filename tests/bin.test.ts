import { SCENARIO_TOOL_ROUTES } from "../src/land-scenario-snapshot.js";
import { HIVE_TOOL_ROUTES } from "../src/hive-tools.js";
import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import * as readline from "node:readline";
import { afterEach, describe, expect, it } from "vitest";
import { TOOL_ENTRY_IDS } from "../src/server.js";

type JsonRpcResponse = {
  jsonrpc?: string;
  id?: number;
  error?: unknown;
  result?: {
    protocolVersion?: string;
    capabilities?: Record<string, unknown>;
    serverInfo?: Record<string, unknown>;
    tools?: unknown[];
  };
};

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), 5000);
    promise.then(
      (value) => {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        resolve(value);
      },
      (error: unknown) => {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        reject(error);
      },
    );
  });
}

describe("built binary", () => {
  let child: ChildProcessWithoutNullStreams | undefined;

  afterEach(() => {
    child?.kill();
  });

  // Re-adding the source shebang alongside tsup's banner must produce a nonzero child exit code.
  it("initializes, lists registered tools, and exits when stdin closes", async () => {
    child = spawn(process.execPath, ["dist/index.js"], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"] as ["pipe", "pipe", "pipe"],
    });

    const stderr: Buffer[] = [];
    let spawnError: (Error & { code?: string }) | undefined;
    child.once("error", (error: Error & { code?: string }) => {
      spawnError = error;
    });
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    const output = readline.createInterface({ input: child.stdout });
    const outputIterator = output[Symbol.asyncIterator]();
    const nextResponse = async (): Promise<JsonRpcResponse> => {
      const line = await withTimeout(
        outputIterator.next(),
        `Timed out waiting for binary output: ${Buffer.concat(stderr).toString("utf8")}`,
      );
      if (line.done) {
        if (spawnError?.code === "EPERM") {
          throw new Error(`Nested child-process execution is restricted by the sandbox (EPERM/empty stream): ${spawnError.message}`);
        }
        throw new Error(`Binary closed before responding: ${Buffer.concat(stderr).toString("utf8")}`);
      }
      return JSON.parse(line.value) as JsonRpcResponse;
    };
    const send = (message: Record<string, unknown>): void => {
      child?.stdin.write(`${JSON.stringify(message)}\n`);
    };

    try {
      send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "splinterlands-mcp-test", version: "0.0.0" },
        },
      });
      const initialize = await nextResponse();
      expect(initialize).toMatchObject({ jsonrpc: "2.0", id: 1 });
      expect(initialize.error).toBeUndefined();
      expect(initialize.result?.protocolVersion).toEqual(expect.any(String));
      expect(initialize.result?.capabilities).toEqual(expect.any(Object));
      expect(initialize.result?.serverInfo).toEqual(
        expect.objectContaining({ name: "splinterlands-mcp", version: "0.0.0" }),
      );

      send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
      send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
      const tools = await nextResponse();
      expect(tools).toMatchObject({ jsonrpc: "2.0", id: 2, result: { tools: expect.any(Array) } });
      expect(tools.result?.tools).toHaveLength(Object.keys(TOOL_ENTRY_IDS).length + 3 + Object.keys(HIVE_TOOL_ROUTES).length + Object.keys(SCENARIO_TOOL_ROUTES).length);
      expect(tools.result?.tools).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "land_deed_by_plot" }),
        expect.objectContaining({ name: "land_deed_by_uid" }),
        expect.objectContaining({ name: "land_deeds_owned" }),
        expect.objectContaining({ name: "land_deeds_search" }),
        expect.objectContaining({ name: "land_projects_active" }),
        expect.objectContaining({ name: "land_projects_history" }),
        expect.objectContaining({ name: "land_projects_count" }),
        expect.objectContaining({ name: "land_projects_requirements" }),
        expect.objectContaining({ name: "land_regions_counts" }),
        expect.objectContaining({ name: "land_tracts_counts" }),
        expect.objectContaining({ name: "land_volume" }),
        expect.objectContaining({ name: "land_resources_richlist" }),
        expect.objectContaining({ name: "land_resources_leaderboards" }),
        expect.objectContaining({ name: "land_resources_rewardactions" }),
        expect.objectContaining({ name: "land_resources_rewardactions_count" }),
        expect.objectContaining({ name: "land_resources_balances_history" }),
        expect.objectContaining({ name: "land_resources_balances_history_count" }),
        expect.objectContaining({ name: "land_resources_titles" }),
        expect.objectContaining({ name: "land_resources_titles_assigned" }),
        expect.objectContaining({ name: "land_resources_history" }),
        expect.objectContaining({ name: "land_resources_fragment_history" }),
        expect.objectContaining({ name: "land_stake_assets" }),
        expect.objectContaining({ name: "land_stake_deed_details" }),
        expect.objectContaining({ name: "land_stake_dec_overall" }),
        expect.objectContaining({ name: "land_stake_dec_region" }),
        expect.objectContaining({ name: "land_stake_dec_staked" }),
        expect.objectContaining({ name: "land_stake_evp_pending_claim" }),
        expect.objectContaining({ name: "land_liquidity_pools" }),
        expect.objectContaining({ name: "land_liquidity_pool_by_id" }),
        expect.objectContaining({ name: "land_liquidity_pool_by_symbol" }),
        expect.objectContaining({ name: "land_resources_liquidity_swaps" }),
        expect.objectContaining({ name: "land_liquidity_allrewards" }),
        expect.objectContaining({ name: "land_liquidity_quote" }),
        expect.objectContaining({ name: "land_liquidity_resources" }),
        expect.objectContaining({ name: "land_liquidity_region" }),
        expect.objectContaining({ name: "list_endpoints" }),
        expect.objectContaining({ name: "describe_endpoint" }),
      ]));

      const exit = once(child, "exit");
      child.stdin.end();
      const [exitCode, signal] = await withTimeout(exit, "Timed out waiting for binary exit");
      expect(exitCode).toBe(0);
      expect(signal).toBeNull();
    } finally {
      output.close();
    }
  });
});

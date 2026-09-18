import { SCENARIO_TOOL_ROUTES } from "../src/land-scenario-snapshot.js";
import { HIVE_TOOL_ROUTES } from "../src/hive-tools.js";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, it } from "vitest";
import { catalogue, getCatalogueEntry } from "../src/catalogue/index.js";
import { createServer, TOOL_ENTRY_IDS } from "../src/server.js";

it("keeps public tool counts and routes aligned with the MCP interface", async () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const capabilities = readFileSync(new URL("../library/capability-notes.md", import.meta.url), "utf8");
  expect(readme).toContain("(library/capability-notes.md)");
  const knowledge = readFileSync(new URL("../library/endpoint-knowledge-tools.md", import.meta.url), "utf8");
  const server = createServer({ fetch: async () => { throw new Error("Documentation checks must stay offline"); } });
  const client = new Client({ name: "documentation-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const names: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : {});
      names.push(...page.tools.map((tool) => tool.name));
      cursor = page.nextCursor;
    } while (cursor);
    const table = readme.split("| Tool | Upstream route |")[1]?.split("\n\n")[0] ?? "";
    const rows = [...table.matchAll(/^\| `([^`]+)` \| (.+) \|$/gm)];
    expect(rows.map((row) => row[1]).sort()).toEqual([...names].sort());
    const bindings: Record<string, string> = TOOL_ENTRY_IDS;
    for (const row of rows) {
      const name = row[1]!;
      const route = row[2]!;
      const id = bindings[name];
      if (id) {
        const entry = getCatalogueEntry(id);
        expect(route).toBe(`\`${entry.method} ${entry.pathTemplate}\``);
      } else if (SCENARIO_TOOL_ROUTES[name]) {
        expect(route).toBe(SCENARIO_TOOL_ROUTES[name]);
      } else if (HIVE_TOOL_ROUTES[name]) {
        expect(route).toBe(HIVE_TOOL_ROUTES[name]);
      } else if (name === "land_lineup_estimate") {
        expect(route).toBe("Offline; calculates a supplied Land lineup");
      } else {
        expect(["list_endpoints", "describe_endpoint"]).toContain(name);
        expect(route).toBe("Offline; reads the local endpoint catalogue");
      }
    }
    const bound = Object.values(bindings).map(getCatalogueEntry);
    const unbound = catalogue.filter((entry) => !Object.values(bindings).includes(entry.entryId));
    expect(capabilities).toContain(`${names.length} tools are registered`);
    expect(capabilities).toContain(`catalogue's ${catalogue.length} endpoints`);
    expect(capabilities).toContain(`${bound.filter((entry) => entry.entryId.startsWith("vapi.")).length} call \`vapi.splinterlands.com\``);
    expect(capabilities).toMatch(new RegExp(`${bound.filter((entry) => entry.entryId.startsWith("api.")).length} call\\s+\`api.splinterlands.com\``));
    expect(readme).toContain(`${unbound.length} of the ${catalogue.length} catalogued`);
    for (const entry of unbound) {
      expect(readme).toContain(`| \`${entry.method} ${entry.pathTemplate}\` |`);
    }
    expect(knowledge).toContain(`${catalogue.length} catalogued endpoints and ${bound.length} endpoint-calling`);
    expect(knowledge).toContain(`${bound.length} catalogue entries are callable, leaving ${unbound.length} catalogue entries`);
  } finally {
    await client.close();
    await server.close();
  }
});

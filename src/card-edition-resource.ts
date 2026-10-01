import editions from "./data/card-editions.json" with { type: "json" };
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerCardEditionResource(server: McpServer): void {
  server.registerResource("card-editions", "splinterlands://cards/editions", {
    title: "Card sets and numeric editions",
    description: "Dated offline hierarchy of main card sets, numeric print classes, sub sets and evidence limits.",
    mimeType: "application/json",
  }, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(editions) }],
  }));
}

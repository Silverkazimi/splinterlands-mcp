import screenFields from "./data/land-screen-fields.json" with { type: "json" };
import abilities from "./data/land-card-ability-rules.json" with { type: "json" };
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import terrain from "./data/land-terrain-rules.json" with { type: "json" };
import production from "./data/land-production-rules.json" with { type: "json" };
import cap from "./data/land-cap-rules.json" with { type: "json" };
import taxAndTrade from "./data/land-tax-and-trade-rules.json" with { type: "json" };

export const LAND_RULE_RESOURCES = [
  { resourceId: "hermes-land-screen-fields", title: "Land API fields and screen labels", uri: "splinterlands://land/rules/screen-fields", data: screenFields,
    description: "Dated public-client worker field mapping, cap order, power slots and rounding evidence. Worker and aggregate labels are kept distinct." },
  { resourceId: "demeter-land-card-abilities", title: "Land card abilities by level", uri: "splinterlands://land/rules/card-abilities", data: abilities,
    description: "Dated edition-19 ability tables, original four cards plus the additional observed card, and sourced activation/stacking rules. Raw API codes and signed values retained." },

  { resourceId: "gaia-land-terrain", title: "Land terrain modifiers", uri: "splinterlands://land/rules/terrain", data: terrain,
    description: "Dated public 14-terrain by 6-element modifier table. Decimal fractions, explicit source and scope; neutral and dual-element selection rules included." },
  { resourceId: "demeter-land-production", title: "Land production and food rates", uri: "splinterlands://land/rules/production", data: production,
    description: "Public baseline resource output and grain-consumption rates, with units, source dates and limits. No plot-specific earnings or discounted food estimate." },
  { resourceId: "demeter-land-cap", title: "Land base-production cap", uri: "splinterlands://land/rules/cap", data: cap,
    description: "Public worksite base-production cap and Runi exception. Building caps and cap allocation require separate evidence." },
  { resourceId: "demeter-land-tax-and-trade", title: "Land harvest tax and Trade Hub fees", uri: "splinterlands://land/rules/tax-and-trade", data: taxAndTrade,
    description: "Public Land harvest-tax, tax-claim, and Trade Hub fee rules with fixed claim costs, fee splits and documented scope." },
] as const;

export function registerLandRuleResources(server: McpServer): void {
  for (const resource of LAND_RULE_RESOURCES) {
    server.registerResource(resource.resourceId, resource.uri, {
      title: resource.title, description: resource.description, mimeType: "application/json",
    }, async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(resource.data) }],
    }));
  }
}

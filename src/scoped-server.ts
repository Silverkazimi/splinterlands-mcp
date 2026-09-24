import type { SplinterlandsHttpClient } from "./http/client.js";
import { PLOT_TOOL_KEYS, callPlotTool, plotToolSchema } from "./plot-tool-adapter.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { RefusalWouldFanOutError, withCallScope } from "./http/callscope.js";

export class ScopedMcpServer extends McpServer {
  private plotClient?: SplinterlandsHttpClient;
  configurePlotReferences(client: SplinterlandsHttpClient): void { this.plotClient = client; }

  override registerTool: McpServer["registerTool"] = (name, config, callback) => {
    const plotKey = this.plotClient ? PLOT_TOOL_KEYS[name] : undefined;
    const invoke = callback as (...args: unknown[]) => CallToolResult | Promise<CallToolResult>;
    const scoped = (async (...args: unknown[]) => {
      try {
        return await withCallScope(name, async () => plotKey ? callPlotTool(name, this.plotClient!, args, invoke) : invoke(...args), name === "land_lineup_snapshot" ? 10 : name === "cards_collection" && (args[0] as {include_plot_references?:boolean})?.include_plot_references === true ? 3 : plotKey || name === "cards_collection" || name === "transaction_inspect" || name === "player_skins" ? 2 : 1);
      } catch (error) {
        if (!(error instanceof RefusalWouldFanOutError)) throw error;
        return {
          isError: true,
          content: [{ type: "text" as const, text: error.message }],
          structuredContent: { kind: error.kind },
        };
      }
    }) as typeof callback;
    const adapted = plotKey ? {
      ...config,
      inputSchema: plotToolSchema(config.inputSchema, plotKey),
      description: `${(config.description ?? "").replace(" Makes one logical GET request.", "")} Supply exactly one plot_id (numeric or display label) or deed_uid; the original UID spelling is also accepted. Reference resolution may add one verified deed GET before the target GET, with a hard two-request limit. Populated resolved results include all three plot identities and resolution freshness.`,
    } : config;
    return super.registerTool(name, adapted as typeof config, scoped);
  };
}

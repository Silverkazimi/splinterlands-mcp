import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { UNTRUSTED_NOTE_FIELD, UNTRUSTED_TEXT_NOTE, UntrustedFence } from "./untrusted.js";

/**
 * Which result fields hold text that players or outsiders wrote.
 *
 * keys: a field name matched anywhere ("motto"), a field under a named parent ("guild.name"),
 *   or a top-level field ("$.name": the result object, a row of a top-level list, or the
 *   object or rows under a top-level data envelope). Matching strings are always fenced.
 * deepRoots: fields whose whole value is outsider-authored (signed Hive operations, decoded
 *   custom JSON, game transaction payloads). Every string below them is fenced unless it has a
 *   plain machine shape (account, ID, hex, timestamp, amount), which cannot carry prose.
 * Numbers, IDs, catalogue card names and timestamps outside these fields stay unchanged.
 */
type FieldRule = { keys?: readonly string[]; deepRoots?: readonly string[] };

const COMMON_KEYS = [
  "guild_name", "guild_motto", "motto", "memo", "display_name", "creator_display_name", "voter_display_name",
  "guild.name", "guild.description", "announcements.subject", "announcements.message", "binders.name",
  "tournament.name", "tournament.description", "tournament.sponsor_name", "tournament.sponsor_url",
  "tournament.sponsor_logo_url", "tournament.sponsor_logo_url_med", "tournament.sponsor_logo_url_lg",
];
const GUILD: FieldRule = { keys: ["$.name", "guilds.name", "description", "subject", "message"] };
const TOURNAMENT: FieldRule = { keys: ["$.name", "guilds.name", "description", "items.text", "sponsor_name", "sponsor_url",
  "sponsor_logo_url", "sponsor_logo_url_med", "sponsor_logo_url_lg"] };
const PROPOSAL: FieldRule = { keys: ["subject", "title", "body", "description"] };
const HIVE_ROOTS = ["raw", "decoded_json", "custom_json_id", "item_ids", "listed_item_ids"];
const GAME_TRX: FieldRule = { deepRoots: ["trx_info"] };

const RULES: Readonly<Record<string, FieldRule>> = {
  ...Object.fromEntries(["guild_list", "guild_find", "guild_members", "guild_contributions", "guild_brawl_records", "guild_brawl_sps_rewards"].map((name) => [name, GUILD])),
  ...Object.fromEntries(["tournament_upcoming", "tournament_upcoming_official", "tournament_in_progress", "tournament_completed", "tournament_cancelled",
    "tournament_mine", "tournament_find", "tournament_find_brawl", "tournament_battles", "tournament_prizes"].map((name) => [name, TOURNAMENT])),
  proposal_list: PROPOSAL, proposal_votes: PROPOSAL,
  hive_transaction: { deepRoots: HIVE_ROOTS },
  hive_account_history: { deepRoots: HIVE_ROOTS },
  transaction_inspect: { deepRoots: [...HIVE_ROOTS, "trx_info", "game_decoded", "game_records"] },
  transaction_lookup: GAME_TRX, cards_trx_lookup: GAME_TRX,
};

// Server-written fields inside outsider-authored subtrees.
const SERVER_KEYS = new Set(["warning", "parse_warning", "item_schema", "marketplace_schema"]);
const PLAIN = [
  /^[A-Za-z0-9_.:@#/+=-]{0,64}$/u,
  /^[0-9a-fA-F]{1,256}$/u,
  /^-?\d+(?:\.\d+)? [A-Z]{2,6}$/u,
];
const plain = (value: string) => PLAIN.some((pattern) => pattern.test(value));

type Matcher = { keys: Set<string>; deepRoots: Set<string> };
function matcherFor(toolName: string): Matcher {
  const rule = RULES[toolName] ?? {};
  return { keys: new Set([...COMMON_KEYS, ...(rule.keys ?? [])]), deepRoots: new Set(rule.deepRoots ?? []) };
}

function walk(value: unknown, m: Matcher, fence: UntrustedFence, parent: string, top: boolean, deep: boolean): unknown {
  if (typeof value === "string") return deep && !plain(value) ? fence.wrap(value) : value;
  if (Array.isArray(value)) return value.map((item) => walk(item, m, fence, parent, top, deep));
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (deep) return [key, SERVER_KEYS.has(key) ? item : walk(item, m, fence, key, false, true)];
    if (m.deepRoots.has(key)) return [key, walk(item, m, fence, key, false, true)];
    if (typeof item === "string" && (m.keys.has(key) || m.keys.has(`${parent}.${key}`) || (top && m.keys.has(`$.${key}`)))) return [key, fence.wrap(item)];
    return [key, walk(item, m, fence, key, top && key === "data", false)];
  }));
}

/** Fence one value with a given fence; exported for result builders and tests. */
export function fenceUntrustedFields(toolName: string, value: unknown, fence: UntrustedFence): unknown {
  return walk(value, matcherFor(toolName), fence, "$", true, false);
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Fence a finished tool result in place. Field names and positions are kept; only string values change.
 * When anything was fenced, the result carries the note once per channel: as untrusted_text_note on the
 * structured object and on a JSON object text item, or as a trailing text line after a bare JSON array.
 */
export function fenceToolResult(toolName: string, result: CallToolResult): CallToolResult {
  if (result.isError) return result;
  const fence = new UntrustedFence();
  const structured = result.structuredContent === undefined ? undefined : fenceUntrustedFields(toolName, result.structuredContent, fence);
  let arrayText = false;
  const content = result.content.map((item) => {
    if (item.type !== "text" || !/^[[{]/u.test(item.text)) return item;
    let parsed: unknown;
    try { parsed = JSON.parse(item.text); } catch { return item; }
    const before = fence.used;
    fence.used = false;
    const fenced = fenceUntrustedFields(toolName, parsed, fence);
    const changed = fence.used;
    fence.used = before || changed;
    if (!changed) return item;
    if (Array.isArray(fenced)) arrayText = true;
    return { ...item, text: JSON.stringify(isRecord(fenced) ? { ...fenced, [UNTRUSTED_NOTE_FIELD]: UNTRUSTED_TEXT_NOTE } : fenced) };
  });
  if (!fence.used) return result;
  if (arrayText) content.push({ type: "text", text: UNTRUSTED_TEXT_NOTE });
  return {
    ...result, content,
    ...(structured === undefined ? {} : { structuredContent: isRecord(structured) ? { ...structured, [UNTRUSTED_NOTE_FIELD]: UNTRUSTED_TEXT_NOTE } : structured as Record<string, unknown> }),
  };
}

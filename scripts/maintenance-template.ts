import { readFileSync } from "node:fs";
import { getCatalogueEntry } from "../src/catalogue/index.js";
import { TOOL_ENTRY_IDS } from "../src/server.js";
import { accountParameterNames } from "./drift/configuration.js";

const mode = process.argv.slice(2);
if (mode.length !== 1 || !["nightly", "fixtures"].includes(mode[0]!)) throw new Error("Choose nightly or fixtures.");
const callable = new Set<string>(Object.values(TOOL_ENTRY_IDS));
const parameters = (entryId: string) => {
  const entry = getCatalogueEntry(entryId);
  const accounts = accountParameterNames(entryId);
  const required = new Set([...entry.pathParams.map(item => item.name),
    ...entry.queryParams
      .filter(item => item.measuredRequired === true || item.declaredRequired).map(item => item.name),
    ...accounts]);
  return Object.fromEntries([...required].sort().map(name => [name, { required: name,
    ...(accounts.has(name) ? { chooseAccountRole: ["ACCOUNT_SMALL", "ACCOUNT_MID", "ACCOUNT_LARGE", "ACCOUNT_NONE"] } : {}) }]));
};
const rows = mode[0] === "nightly"
  ? [...callable].sort().map(entryId => ({ entryId, params: parameters(entryId) }))
  : Object.entries(JSON.parse(readFileSync("scripts/drift/baseline-input.json", "utf8")) as Record<string, { entryId: string; variantKey?: string }>)
    .filter(([, binding]) => callable.has(binding.entryId))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, binding]) => ({ fixturePath: "tests/fixtures/" + name, ...binding, params: parameters(binding.entryId) }));
console.log(JSON.stringify(rows, null, 2));

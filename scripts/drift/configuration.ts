import { z } from "zod";
import { getCatalogueEntry } from "../../src/catalogue/index.js";

export const ACCOUNT_ROLES = ["ACCOUNT_SMALL", "ACCOUNT_MID", "ACCOUNT_LARGE", "ACCOUNT_NONE"] as const;
const roleSchema = z.enum(ACCOUNT_ROLES);
const scalar = z.union([z.string().max(1000), z.number().finite(), z.boolean()]);
const rowSchema = z.object({
  entryId: z.string().min(1),
  params: z.record(z.union([scalar, z.object({ accountRole: roleSchema }).strict()])),
  variantKey: z.string().optional(),
  fixturePath: z.string().optional(),
  expectEmpty: z.boolean().optional(),
}).strict();
const configSchema = z.array(rowSchema).min(1).max(512);

export function accountParameterNames(entryId: string): Set<string> {
  const entry = getCatalogueEntry(entryId);
  const names = new Set(["username", "player", "players", "owner", "renter", "account", "target"]);
  if (entryId === "api.players.details") names.add("name");
  return new Set([...entry.pathParams, ...entry.queryParams, ...(entry.observedQueryParams ?? [])]
    .filter(parameter => !("inertUpstream" in parameter) || !parameter.inertUpstream)
    .filter(parameter => ("isPlayerName" in parameter && parameter.isPlayerName) || names.has(parameter.name))
    .map(parameter => parameter.name));
}

export function resolveMaintenanceInputs(value: unknown, environment: Record<string, string | undefined>) {
  const rows = configSchema.parse(value);
  return rows.map(row => {
    const accounts = accountParameterNames(row.entryId);
    return { ...row, params: Object.fromEntries(Object.entries(row.params).map(([name, value]) => {
      if (typeof value !== "object") return [name, value];
      if (!accounts.has(name)) throw new Error("Account roles require an account selector.");
      const account = environment[value.accountRole];
      if (!account || !/^[a-z][a-z0-9.-]{2,15}$/.test(account)) throw new Error("Account role is missing or invalid.");
      return [name, account];
    })) };
  });
}

export function configuredAccountRoles(environment: Record<string, string | undefined>): string[] {
  return ACCOUNT_ROLES.filter(role => {
    const value = environment[role];
    return value !== undefined && /^[a-z][a-z0-9.-]{2,15}$/.test(value);
  });
}
export function missingAccountRoles(environment: Record<string, string | undefined>): string[] {
  const configured = new Set(configuredAccountRoles(environment));
  return ACCOUNT_ROLES.filter(role => !configured.has(role));
}

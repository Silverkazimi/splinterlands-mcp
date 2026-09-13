import { expect, it } from "vitest";
import { ISSUE_SCAN_LIMIT, publishMaintenanceIssue } from "../scripts/drift/github.js";
it("creates once, updates a changed report and leaves identical reports alone", () => {
  const calls: string[][] = [];
  let existing: unknown[] = [];
  const run = (args: string[]) => { calls.push(args); return args[1] === "list" ? JSON.stringify(existing) : ""; };
  expect(publishMaintenanceIssue("sample/project", "spec", "Spec review", "one", run)).toBe("created");
  existing = [{ number: 1, body: "<!-- maintenance:spec -->\none" }];
  calls.length = 0;
  expect(publishMaintenanceIssue("sample/project", "spec", "Spec review", "one", run)).toBe("unchanged");
  expect(calls).toHaveLength(1);
  expect(publishMaintenanceIssue("sample/project", "spec", "Spec review", "two", run)).toBe("updated");
  expect(calls.at(-1)?.slice(0,3)).toEqual(["issue","edit","1"]);
});
it("refuses ambiguous, malformed, saturated or invalid publication inputs", () => {
  for (const rows of [[{},{}], Array.from({length:ISSUE_SCAN_LIMIT},(_,i)=>({number:i+1,body:""})),
    [{number:1,body:"<!-- maintenance:spec -->\na"},{number:2,body:"<!-- maintenance:spec -->\nb"}]]) {
    let writes = 0;
    expect(() => publishMaintenanceIssue("sample/project","spec","title","body", args => {
      if (args[1] !== "list") writes++;
      return JSON.stringify(rows);
    })).toThrow();
    expect(writes).toBe(0);
  }
  expect(() => publishMaintenanceIssue("--bad","spec","title","body",()=>{throw new Error("must not run");})).toThrow("Invalid repository");
});

it("applies managed labels while preserving unrelated labels", () => {
  const calls: string[][] = [];
  publishMaintenanceIssue("sample/project", "endpoint", "Drift", "changed", args => {
    calls.push(args);
    if (args[0] === "issue" && args[1] === "list") return JSON.stringify([{ number: 1, body: "<!-- maintenance:endpoint -->\nold", labels: [{ name: "drift:shape" }, { name: "help wanted" }] }]);
    if (args[0] === "label" && args[1] === "list") return JSON.stringify([{ name: "drift:auth" }]);
    return "";
  }, ["drift:auth"]);
  const edit = calls.find(args => args[0] === "issue" && args[1] === "edit")!;
  expect(edit).toContain("--body-file");
  expect(edit).toContain("drift:auth");
  expect(edit).toContain("--remove-label");
  expect(edit).not.toContain("help wanted");
});

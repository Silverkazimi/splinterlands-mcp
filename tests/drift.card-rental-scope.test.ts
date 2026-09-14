import { expect, it } from "vitest";
import { bindSweepInputs } from "../scripts/drift/request.js";

const bind = (params: Record<string, string | number>) => bindSweepInputs([
  { entryId: "api.market.active-rentals", params },
]);

it("allows explicit card-scoped rental reads with bounded leading rows", () => {
  for (const params of [{ card_detail_id: "1", limit: "2" }, { card_detail_id: "1", take: "100" }]) {
    expect(bind(params)).toHaveLength(1);
  }
});
it("rejects unscoped, invalid and unbounded card rental reads", () => {
  for (const params of [
    {}, { limit: "2" }, { card_detail_id: "1" }, { card_detail_id: "0", limit: "2" },
    { card_detail_id: "1.5", limit: "2" }, { card_detail_id: "1", limit: "101" },
    { card_detail_id: "1", limit: "2", take: "1000" }, { card_detail_id: "1", limit: "0" },
  ]) expect(() => bind(params)).toThrow();
});

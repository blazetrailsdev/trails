import { describe, it, expect } from "vitest";
import { pick, pluck } from "@blazetrails/activesupport";
import { fixtures } from "../support/use-fixtures.js";
import { CpkOrder } from "../models/cpk.js";

describe("Enumerable#pluck and #pick on a composite primary key record", () => {
  fixtures([]);

  it("read the id column through the record's [] rather than the composite id", async () => {
    const order = new CpkOrder({ id: [1, 5], status: "open" });
    expect(order.id).toEqual([1, 5]);
    expect(pluck([order], "id")).toEqual([5]);
    expect(pick([order], "id")).toBe(5);
    expect(pick([order], "shop_id", "id")).toEqual([1, 5]);
  });
});

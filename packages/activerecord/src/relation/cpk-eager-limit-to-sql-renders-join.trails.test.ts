import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
import { CpkOrder, CpkBook } from "../test-helpers/models/cpk.js";
import type { Base } from "../index.js";

describe("Relation#to_sql composite-PK eager load with limit", () => {
  fixtures(["cpkOrders", "cpkBooks"]);

  beforeAll(() => {
    [CpkOrder, CpkBook].forEach((m) => registerModel(m as unknown as typeof Base));
  });

  it("renders the eager JOIN and a per-column primary-key restriction", () => {
    const sql = CpkOrder.eagerLoad(":books").limit(1).toSql();

    expect(sql).toMatch(/LEFT OUTER JOIN/i);
    expect(sql).toContain("cpk_books");
    expect((sql.match(/IN \(SELECT DISTINCT/gi) ?? []).length).toBe(2);
    expect(sql).toContain("shop_id");
    expect(sql).toMatch(/LIMIT/i);
  });

  it("renders the same restriction for offset without limit", () => {
    const sql = CpkOrder.eagerLoad(":books").offset(2).toSql();

    expect(sql).toMatch(/LEFT OUTER JOIN/i);
    expect((sql.match(/IN \(SELECT DISTINCT/gi) ?? []).length).toBe(2);
  });

  it("loads the limited records through the materialized ids", async () => {
    const orders = await CpkOrder.eagerLoad(":books").order("cpk_orders.id").limit(1);
    expect(orders.length).toBe(1);
  });
});

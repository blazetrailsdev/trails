import { describe, it, expect } from "vitest";
import { fixtures } from "../test-helpers/fixtures.js";
import { Customer } from "../test-helpers/models/customer.js";

/**
 * Locks the string-vs-symbol order-arg deviation resolved by
 * 0023-surfaced-deviations/relation-order-string-arg-stays-bare.
 *
 * Rails passes a string order arg through as a bare `Arel::Nodes::SqlLiteral`
 * (`preprocess_order_args`' `else` branch) — no table qualification, no column
 * quoting. Only Symbol/Hash order args route through column resolution and
 * qualify. trails previously parsed a string fragment and qualified it like a
 * symbol.
 */
describe("order string arg stays bare", () => {
  fixtures([]);

  it("leaves a string order fragment bare", () => {
    expect(Customer.order("name ASC").toSql()).toContain("ORDER BY name ASC");
    expect(Customer.offset(1).order("name ASC").toSql()).toContain("ORDER BY name ASC");
  });

  it("leaves a directionless string bare (no implicit ASC, no qualification)", () => {
    const sql = Customer.order("name").toSql();
    expect(sql).toContain("ORDER BY name");
    expect(sql).not.toMatch(/ORDER BY .*"customers"\."name"/);
  });

  it("qualifies a Symbol order arg to the table, like Rails order(:name)", () => {
    const sql = (Customer as unknown as { order(arg: symbol): { toSql(): string } })
      .order(Symbol.for("name"))
      .toSql();
    expect(sql).toMatch(/ORDER BY "customers"\."name" ASC/);
  });

  it("qualifies a Hash order arg to the table", () => {
    expect(Customer.order({ name: "asc" }).toSql()).toMatch(/ORDER BY "customers"\."name" ASC/);
  });

  it("reversing a string order keeps it bare (flips the trailing direction)", () => {
    expect(Customer.order("name ASC").reverseOrder().toSql()).toContain("ORDER BY name DESC");
    expect(Customer.order("name DESC").reverseOrder().reverseOrder().toSql()).toContain(
      "ORDER BY name DESC",
    );
  });
});

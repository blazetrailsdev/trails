import { describe, it, expect } from "vitest";
import { fixtures } from "../test-helpers/fixtures.js";
import { Customer } from "../test-helpers/models/customer.js";
import { quoteTableName, escapeRegExp } from "../test-helpers/quote-regex.js";

// Adapter-aware `"customers"."name"` — backticks on MySQL/MariaDB.
const qualifiedName = escapeRegExp(quoteTableName("customers.name"));

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

  it("keeps each of multiple string args bare — no direction pairing", () => {
    // Rails maps every String arg through unchanged (no pairing of a trailing
    // "asc"/"desc" string), so `order("name", "desc")` is two bare terms.
    const sql = Customer.order("name", "desc").toSql();
    expect(sql).toContain("ORDER BY name, desc");
  });

  it("dedupes repeated order terms, like Rails order_values |= args", () => {
    // Rails' order! runs `order_values |= args`, deduping repeated terms.
    const dupString = Customer.order("name", "name").toSql();
    expect(dupString.match(/ORDER BY name/g)).toHaveLength(1);
    const dupSymbol = (Customer as unknown as { order(...a: symbol[]): { toSql(): string } })
      .order(Symbol.for("name"), Symbol.for("name"))
      .toSql();
    expect(dupSymbol.match(new RegExp(qualifiedName, "g"))).toHaveLength(1);
  });

  it("leaves a directionless string bare (no implicit ASC, no qualification)", () => {
    const sql = Customer.order("name").toSql();
    expect(sql).toContain("ORDER BY name");
    expect(sql).not.toMatch(new RegExp(`ORDER BY .*${qualifiedName}`));
  });

  it("qualifies a Symbol order arg to the table, like Rails order(:name)", () => {
    const sql = (Customer as unknown as { order(arg: symbol): { toSql(): string } })
      .order(Symbol.for("name"))
      .toSql();
    expect(sql).toMatch(new RegExp(`ORDER BY ${qualifiedName} ASC`));
  });

  it("qualifies a Hash order arg to the table", () => {
    expect(Customer.order({ name: "asc" }).toSql()).toMatch(
      new RegExp(`ORDER BY ${qualifiedName} ASC`),
    );
  });

  it("reversing a string order keeps it bare (flips the trailing direction)", () => {
    expect(Customer.order("name ASC").reverseOrder().toSql()).toContain("ORDER BY name DESC");
    expect(Customer.order("name DESC").reverseOrder().reverseOrder().toSql()).toContain(
      "ORDER BY name DESC",
    );
  });
});

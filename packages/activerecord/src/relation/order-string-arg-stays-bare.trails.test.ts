import { describe, it, expect } from "vitest";
import { fixtures } from "../test-fixtures.js";
import { Customer } from "../test-helpers/models/customer.js";
import { quoteTableName } from "../support/quote-regex.js";
import { regexpEscape } from "@blazetrails/ruby-compat";

const qualifiedName = regexpEscape(quoteTableName("customers.name"));

describe("order string arg stays bare", () => {
  fixtures([]);

  it("leaves a string order fragment bare", () => {
    expect(Customer.order("name ASC").toSql()).toContain("ORDER BY name ASC");
    expect(Customer.offset(1).order("name ASC").toSql()).toContain("ORDER BY name ASC");
  });

  it("keeps each of multiple string args bare — no direction pairing", () => {
    const sql = Customer.order("name", "desc").toSql();
    expect(sql).toContain("ORDER BY name, desc");
  });

  it("dedupes repeated order terms, like Rails order_values |= args", () => {
    const dupString = Customer.order("name", "name").toSql();
    expect(dupString.match(/ORDER BY name/g)).toHaveLength(1);
    const dupSymbol = Customer.order(":name", ":name").toSql();
    expect(dupSymbol.match(new RegExp(qualifiedName, "g"))).toHaveLength(1);
  });

  it("leaves a directionless string bare (no implicit ASC, no qualification)", () => {
    const sql = Customer.order("name").toSql();
    expect(sql).toContain("ORDER BY name");
    expect(sql).not.toMatch(new RegExp(`ORDER BY .*${qualifiedName}`));
  });

  it("qualifies a Symbol order arg to the table, like Rails order(:name)", () => {
    const sql = Customer.order(":name").toSql();
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

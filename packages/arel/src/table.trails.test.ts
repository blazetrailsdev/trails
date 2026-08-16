import { describe, it, expect } from "vitest";
import { Table, Nodes, EmptyJoinError } from "./index.js";

// Trails-only coverage for the `Nodes::SqlLiteral` arm of Arel::Table#join's
// `case relation when String, Nodes::SqlLiteral` (table.rb:41-45). Rails'
// table_test.rb exercises the arm with a bare String only; in Ruby SqlLiteral
// subclasses String, so one `when` covers both. TypeScript has no such
// subtyping, so the SqlLiteral half is a distinct branch and needs its own pin.
describe("TableTest (trails)", () => {
  const users = new Table("users");

  it("promotes a SqlLiteral relation to a StringJoin", () => {
    const mgr = users.join(new Nodes.SqlLiteral("comments ON comments.user_id = users.id"));
    const join = mgr.ast.cores[0].source.right[0];
    expect(join).toBeInstanceOf(Nodes.StringJoin);
    expect(mgr.toSql()).toBe('SELECT FROM "users" comments ON comments.user_id = users.id');
  });

  it("raises EmptyJoinError on an empty SqlLiteral", () => {
    expect(() => users.join(new Nodes.SqlLiteral(""))).toThrow(EmptyJoinError);
  });

  // Rails uses `String#empty?`, which is length-based — a whitespace-only
  // relation is NOT empty and must join rather than raise.
  it("does not raise on a whitespace-only relation", () => {
    expect(() => users.join(" ")).not.toThrow();
  });

  // `Arel::Table` includes both `FactoryMethods` and `AliasPredication`
  // (table.rb:5-6), so `#as` is AliasPredication's — an `As` node over a
  // retryable SqlLiteral — and is a different node from `#alias`'s TableAlias.
  // Rails' table_test.rb covers `#alias` only, so the `#as` half needs a pin.
  it("as returns an AliasPredication As node, not a TableAlias", () => {
    const aliased = users.as("u") as Nodes.As;
    expect(aliased).toBeInstanceOf(Nodes.As);
    expect(aliased.left).toBe(users);
    expect(aliased.right).toBeInstanceOf(Nodes.SqlLiteral);
    expect((aliased.right as Nodes.SqlLiteral).value).toBe("u");
    expect(users.alias("u")).toBeInstanceOf(Nodes.TableAlias);
  });
});

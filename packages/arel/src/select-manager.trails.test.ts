import { describe, it, expect } from "vitest";
import { Table, SelectManager, Nodes, EmptyJoinError } from "./index.js";

// Trails-only coverage for the `Nodes::SqlLiteral` arm of
// Arel::SelectManager#join's `case relation when String, Nodes::SqlLiteral`
// (select_manager.rb:105-109). Rails' select_manager_test.rb exercises the arm
// with a bare String only; in Ruby SqlLiteral subclasses String, so one `when`
// covers both. TypeScript has no such subtyping, so the SqlLiteral half is a
// distinct branch and needs its own pin.
describe("SelectManagerTest (trails)", () => {
  const users = new Table("users");

  it("promotes a SqlLiteral relation to a StringJoin", () => {
    const mgr = new SelectManager(users);
    mgr.join(new Nodes.SqlLiteral("comments ON comments.user_id = users.id"));
    expect(mgr.joinSources[0]).toBeInstanceOf(Nodes.StringJoin);
    expect(mgr.toSql()).toContain("comments ON comments.user_id = users.id");
  });

  it("raises EmptyJoinError on an empty SqlLiteral", () => {
    const mgr = new SelectManager(users);
    expect(() => mgr.join(new Nodes.SqlLiteral(""))).toThrow(EmptyJoinError);
  });

  // Rails uses String#empty? (length), not a whitespace check: a blank-but-
  // non-empty relation is NOT empty and must join rather than raise.
  it("does not raise on a whitespace-only relation", () => {
    const mgr = new SelectManager(users);
    expect(() => mgr.join(" ")).not.toThrow();
  });

  it("promotes a bare string relation to a StringJoin", () => {
    const mgr = new SelectManager(users);
    mgr.join("comments ON comments.user_id = users.id");
    expect(mgr.joinSources[0]).toBeInstanceOf(Nodes.StringJoin);
  });
});

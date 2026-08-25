import { describe, it, expect } from "vitest";
import { fakeRecordConnection } from "../test-helpers/connection.js";
import { Table, Nodes, Visitors } from "../index.js";
import { uniq } from "../test-helpers/uniq.js";

describe("Arel::Nodes::ExtractTest", () => {
  const users = new Table("users");
  it("should extract field", () => {
    const sql = new Visitors.ToSql(fakeRecordConnection).compile(
      users.get("timestamp").extract("date"),
    );
    expect(sql).toBe('EXTRACT(DATE FROM "users"."timestamp")');
  });

  it("uppercases a lowercase field to match Rails", () => {
    // Rails' visit_Arel_Nodes_Extract does `o.field.to_s.upcase`, so the
    // field identifier in the emitted SQL is always uppercased regardless
    // of how it was constructed.
    const createdAt = users.get("created_at");
    const node = new Nodes.Extract(createdAt, "month");
    const sql = new Visitors.ToSql(fakeRecordConnection).compile(node);
    expect(sql).toBe('EXTRACT(MONTH FROM "users"."created_at")');
  });

  // Mirrors Rails: `Expressions#extract` calls `Nodes::Extract.new [self], field`,
  // wrapping the receiver in an array (expressions.rb). The visitor renders
  // the array via `inject_join`, so a single-element array still produces
  // the same SQL as a bare expression.
  it("expressions.extract wraps the receiver in an array", () => {
    const createdAt = users.get("created_at");
    const node = createdAt.extract("year");
    expect(Array.isArray(node.expr)).toBe(true);
    expect((node.expr as Nodes.Node[])[0]).toBe(createdAt);
    expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toBe(
      'EXTRACT(YEAR FROM "users"."created_at")',
    );
  });

  describe("as", () => {
    it("should alias the extract", () => {
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(
        users.get("timestamp").extract("date").as("foo"),
      );
      expect(sql).toBe('EXTRACT(DATE FROM "users"."timestamp") AS foo');
    });

    it("should not mutate the extract", () => {
      const extract = users.get("timestamp").extract("date");
      // Rails snapshots with `extract.dup`; arel's TS nodes carry no `dup`, so
      // the untouched twin stands in for the copy.
      const before = users.get("timestamp").extract("date");
      extract.as("foo");
      expect(extract.eql(before)).toBe(true);
    });
  });

  describe("equality", () => {
    it("is equal with equal ivars", () => {
      const array = [users.get("attr").extract("foo"), users.get("attr").extract("foo")];
      expect(uniq(array).length).toBe(1);
    });

    it("is not equal with different ivars", () => {
      const array = [users.get("attr").extract("foo"), users.get("attr").extract("bar")];
      expect(uniq(array).length).toBe(2);
    });
  });
});

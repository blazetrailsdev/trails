import { describe, it, expect } from "vitest";
import { fakeRecordConnection } from "../test-helpers/connection.js";
import { Table, Visitors } from "../index.js";
import { uniq } from "../test-helpers/uniq.js";

describe("Arel::Nodes::ExtractTest", () => {
  const users = new Table("users");
  it("should extract field", () => {
    const sql = new Visitors.ToSql(fakeRecordConnection).compile(
      users.get("timestamp").extract("date"),
    );
    expect(sql).toBe('EXTRACT(DATE FROM "users"."timestamp")');
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

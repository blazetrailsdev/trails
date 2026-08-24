import { describe, it, expect } from "vitest";
import { Table, DeleteManager } from "./index.js";
import { fakeRecordEngine } from "./test-helpers/connection.js";
import { mustBeLike } from "./test-helpers/must-be-like.js";

describe("DeleteManagerTest", () => {
  it("handles limit properly", () => {
    const table = new Table("users");
    const dm = new DeleteManager();
    dm.take(10);
    dm.from(table);
    dm.key = table.get("id");
    expect(dm.toSql(fakeRecordEngine)).toMatch(/LIMIT 10/);
  });

  describe("from", () => {
    it("uses from", () => {
      const table = new Table("users");
      const dm = new DeleteManager();
      dm.from(table);
      expect(mustBeLike(dm.toSql(fakeRecordEngine))).toBe(mustBeLike(` DELETE FROM "users" `));
    });

    it("chains", () => {
      const table = new Table("users");
      const dm = new DeleteManager();
      expect(dm.from(table)).toEqual(dm);
    });
  });

  describe("where", () => {
    it("uses where values", () => {
      const table = new Table("users");
      const dm = new DeleteManager();
      dm.from(table);
      dm.where(table.get("id").eq(10));
      expect(mustBeLike(dm.toSql(fakeRecordEngine))).toBe(
        mustBeLike(` DELETE FROM "users" WHERE "users"."id" = 10`),
      );
    });

    it("chains", () => {
      const table = new Table("users");
      const dm = new DeleteManager();
      expect(dm.where(table.get("id").eq(10))).toEqual(dm);
    });
  });
});

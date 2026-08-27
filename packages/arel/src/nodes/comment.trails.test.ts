import { describe, it, expect } from "vitest";
import { testConnection } from "../test-helpers/connection.js";
import { Visitors, Table, star } from "../index.js";

describe("CommentTest", () => {
  describe("sanitization", () => {
    it("strips comment terminators so input cannot break out", () => {
      const users = new Table("users");
      const mgr = users.project(star());
      mgr.comment("hello */ DROP TABLE users");
      const sql = new Visitors.ToSql(testConnection).compile(mgr.ast);
      expect(sql).toContain("/* hello DROP TABLE users */");
      expect(sql.match(/\/\*/g)!.length).toBe(1);
      expect(sql.match(/\*\//g)!.length).toBe(1);
    });

    it("strips comment openers from values", () => {
      const users = new Table("users");
      const mgr = users.project(star());
      mgr.comment("before /* nested */ after");
      const sql = new Visitors.ToSql(testConnection).compile(mgr.ast);
      expect(sql).toContain("/* before nested after */");
    });

    it("normalizes whitespace in comments", () => {
      const users = new Table("users");
      const mgr = users.project(star());
      mgr.comment("hello   \n  world");
      const sql = new Visitors.ToSql(testConnection).compile(mgr.ast);
      expect(sql).toContain("/* hello world */");
    });
  });
});

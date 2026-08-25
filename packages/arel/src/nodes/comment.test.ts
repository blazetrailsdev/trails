import { describe, it, expect } from "vitest";
import { testConnection } from "../test-helpers/connection.js";
import { Nodes, Visitors, Table, star } from "../index.js";
import { uniq } from "../test-helpers/uniq.js";

describe("CommentTest", () => {
  describe("equality", () => {
    it("is equal with equal contents", () => {
      const array = [new Nodes.Comment(["foo"]), new Nodes.Comment(["foo"])];
      expect(uniq(array).length).toBe(1);
    });

    it("is not equal with different contents", () => {
      const array = [new Nodes.Comment(["foo"]), new Nodes.Comment(["bar"])];
      expect(uniq(array).length).toBe(2);
    });
  });

  describe("sanitization", () => {
    it("strips comment terminators so input cannot break out", () => {
      const users = new Table("users");
      const mgr = users.project(star);
      mgr.comment("hello */ DROP TABLE users");
      const sql = new Visitors.ToSql(testConnection).compile(mgr.ast);
      expect(sql).toContain("/* hello DROP TABLE users */");
      expect(sql.match(/\/\*/g)!.length).toBe(1);
      expect(sql.match(/\*\//g)!.length).toBe(1);
    });

    it("strips comment openers from values", () => {
      const users = new Table("users");
      const mgr = users.project(star);
      mgr.comment("before /* nested */ after");
      const sql = new Visitors.ToSql(testConnection).compile(mgr.ast);
      expect(sql).toContain("/* before nested after */");
    });

    it("normalizes whitespace in comments", () => {
      const users = new Table("users");
      const mgr = users.project(star);
      mgr.comment("hello   \n  world");
      const sql = new Visitors.ToSql(testConnection).compile(mgr.ast);
      expect(sql).toContain("/* hello world */");
    });
  });
});

import { describe, it, expect } from "vitest";
import { Nodes, Visitors, Table, star } from "../index.js";

describe("CommentTest", () => {
  describe("equality", () => {
    it("is not equal with different contents", () => {
      const a = new Nodes.SqlLiteral("NOW()");
      const b = new Nodes.SqlLiteral("CURRENT_TIMESTAMP");
      expect(a.value).not.toBe(b.value);
    });

    it("is equal with equal contents", () => {
      const a = new Nodes.SqlLiteral("NOW()");
      const b = new Nodes.SqlLiteral("NOW()");
      expect(a.value).toBe(b.value);
    });
  });

  describe("sanitization", () => {
    it("strips comment terminators so input cannot break out", () => {
      const users = new Table("users");
      const mgr = users.project(star);
      mgr.comment("hello */ DROP TABLE users");
      const sql = new Visitors.ToSql().compile(mgr.ast);
      // The */ is stripped so the comment stays enclosed
      expect(sql).toContain("/* hello DROP TABLE users */");
      // There should be exactly one block comment pair
      expect(sql.match(/\/\*/g)!.length).toBe(1);
      expect(sql.match(/\*\//g)!.length).toBe(1);
    });

    it("strips comment openers from values", () => {
      const users = new Table("users");
      const mgr = users.project(star);
      mgr.comment("before /* nested */ after");
      const sql = new Visitors.ToSql().compile(mgr.ast);
      // Both /* and */ stripped from the value
      expect(sql).toContain("/* before nested after */");
    });

    it("normalizes whitespace in comments", () => {
      const users = new Table("users");
      const mgr = users.project(star);
      mgr.comment("hello   \n  world");
      const sql = new Visitors.ToSql().compile(mgr.ast);
      expect(sql).toContain("/* hello world */");
    });
  });
});

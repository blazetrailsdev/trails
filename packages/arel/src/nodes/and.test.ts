import { describe, it, expect } from "vitest";
import { Table, Nodes, Visitors } from "../index.js";

describe("Arel", () => {
  describe("and", () => {
    it("is equal with equal ivars", () => {
      const s1 = new Nodes.DeleteStatement();
      const s2 = new Nodes.DeleteStatement();
      expect(s1.relation).toBe(s2.relation);
      expect(s1.wheres.length).toBe(s2.wheres.length);
    });

    it("is not equal with different ivars", () => {
      const a = new Table("users");
      const b = new Table("posts");
      expect(a.name).not.toBe(b.name);
    });

    it("allows aliasing", () => {
      const caseNode = new Nodes.Case()
        .when(new Nodes.SqlLiteral("1 = 1"), new Nodes.SqlLiteral("'yes'"))
        .as("result");
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(caseNode)).toBe("CASE WHEN 1 = 1 THEN 'yes' END AS result");
    });
  });
});

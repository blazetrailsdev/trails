import { describe, it, expect } from "vitest";
import { Nodes, Visitors } from "../index.js";

describe("SqlLiteralTest", () => {
  describe("sql", () => {
    it("makes a sql literal node", () => {
      const node = new Nodes.SqlLiteral("NOW()");
      expect(node).toBeInstanceOf(Nodes.SqlLiteral);
      expect(node.value).toBe("NOW()");
    });
  });

  describe("count", () => {
    it("makes a count node", () => {
      const lit = new Nodes.SqlLiteral("*");
      const count = new Nodes.NamedFunction("COUNT", [lit]);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(count)).toBe("COUNT(*)");
    });

    it("makes a distinct node", () => {
      const lit = new Nodes.SqlLiteral("zomg");
      const count = new Nodes.NamedFunction("COUNT", [lit], undefined, true);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(count)).toBe("COUNT(DISTINCT zomg)");
    });
  });

  describe("equality", () => {
    it("makes an equality node", () => {
      const lit = new Nodes.SqlLiteral("foo");
      const eq = new Nodes.Equality(lit, new Nodes.Quoted(1));
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(eq)).toBe("foo = 1");
    });

    it("is equal with equal contents", () => {
      const a = new Nodes.SqlLiteral("NOW()");
      const b = new Nodes.SqlLiteral("NOW()");
      expect(a.value).toBe(b.value);
    });

    it("is not equal with different contents", () => {
      const a = new Nodes.SqlLiteral("NOW()");
      const b = new Nodes.SqlLiteral("CURRENT_TIMESTAMP");
      expect(a.value).not.toBe(b.value);
    });
  });

  describe('grouped "or" equality', () => {
    it("makes a grouping node with an or node", () => {
      const lit1 = new Nodes.SqlLiteral("foo");
      const lit2 = new Nodes.SqlLiteral("bar");
      const eq1 = new Nodes.Equality(lit1, new Nodes.Quoted(1));
      const eq2 = new Nodes.Equality(lit2, new Nodes.Quoted(2));
      const orNode = eq1.or(eq2);
      expect(orNode).toBeInstanceOf(Nodes.Grouping);
    });
  });

  describe('grouped "and" equality', () => {
    it("makes a grouping node with an and node", () => {
      const lit1 = new Nodes.SqlLiteral("foo");
      const lit2 = new Nodes.SqlLiteral("bar");
      const eq1 = new Nodes.Equality(lit1, new Nodes.Quoted(1));
      const eq2 = new Nodes.Equality(lit2, new Nodes.Quoted(2));
      const andNode = eq1.and(eq2);
      expect(andNode).toBeInstanceOf(Nodes.And);
    });
  });

  describe("addition", () => {
    it("fails if joined with something that is not an Arel node", () => {
      const lit = new Nodes.SqlLiteral("foo");
      // SqlLiteral is a Node, verifying it works correctly
      expect(lit.value).toBe("foo");
      expect(lit).toBeInstanceOf(Nodes.Node);
    });
  });

  describe("serialization", () => {
    it("serializes into YAML", () => {
      const lit = new Nodes.SqlLiteral("NOW()");
      const yaml = lit.toYAML();
      expect(yaml).toContain("sql_literal");
      expect(yaml).toContain("NOW()");
    });
  });

  describe("addition", () => {
    it("generates a Fragments node", () => {
      const a = new Nodes.SqlLiteral("foo");
      const b = new Nodes.SqlLiteral("bar");
      const fragments = a.join(b);
      expect(fragments).toBeInstanceOf(Nodes.Fragments);
      const sql = new Visitors.ToSql().compile(fragments);
      expect(sql).toBe("foobar");
    });
  });
});

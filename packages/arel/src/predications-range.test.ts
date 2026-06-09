import { describe, it, expect } from "vitest";
import { Table, Nodes, Visitors } from "./index.js";

// Mirrors Rails' Arel attribute_test.rb #between / #not_between blocks.
// The Trails port accepts `[begin, end]`, `{ begin, end, excludeEnd? }`,
// and `(begin, end, excludeEnd?)` call shapes; the decision tree
// (predications.rb) is the same in all cases.
describe("Predications range semantics", () => {
  const users = new Table("users");
  const id = users.get("id");

  describe("#between", () => {
    it("inclusive standard range builds Between(And(Casted, Casted))", () => {
      const node = id.between({ begin: 1, end: 3 });
      expect(node).toBeInstanceOf(Nodes.Between);
    });

    it("range begin == end collapses to Equality", () => {
      const node = id.between({ begin: 5, end: 5 });
      expect(node).toBeInstanceOf(Nodes.Equality);
    });

    it("exclusive range builds And(GreaterThanOrEqual, LessThan)", () => {
      const node = id.between({ begin: 1, end: 3, excludeEnd: true });
      expect(node).toBeInstanceOf(Nodes.And);
      const and = node as Nodes.And;
      expect(and.children[0]).toBeInstanceOf(Nodes.GreaterThanOrEqual);
      expect(and.children[1]).toBeInstanceOf(Nodes.LessThan);
    });

    it("-Infinity..end inclusive becomes LessThanOrEqual", () => {
      const node = id.between({ begin: -Infinity, end: 3 });
      expect(node).toBeInstanceOf(Nodes.LessThanOrEqual);
    });

    it("-Infinity...end exclusive becomes LessThan", () => {
      const node = id.between({ begin: -Infinity, end: 3, excludeEnd: true });
      expect(node).toBeInstanceOf(Nodes.LessThan);
    });

    it("begin..Infinity becomes GreaterThanOrEqual", () => {
      const node = id.between({ begin: 1, end: Infinity });
      expect(node).toBeInstanceOf(Nodes.GreaterThanOrEqual);
    });

    it("-Infinity..Infinity becomes NotIn([])", () => {
      const node = id.between({ begin: -Infinity, end: Infinity });
      expect(node).toBeInstanceOf(Nodes.NotIn);
      expect(((node as Nodes.NotIn).right as unknown[]).length).toBe(0);
    });

    it("Infinity..end (unboundable begin) collapses to In([])", () => {
      const node = id.between({ begin: Infinity, end: 3 });
      expect(node).toBeInstanceOf(Nodes.In);
      expect(((node as Nodes.In).right as unknown[]).length).toBe(0);
    });

    it("begin..-Infinity (unboundable end) collapses to In([])", () => {
      const node = id.between({ begin: 1, end: -Infinity });
      expect(node).toBeInstanceOf(Nodes.In);
      expect(((node as Nodes.In).right as unknown[]).length).toBe(0);
    });

    it("null..end (open begin) collapses to LessThanOrEqual", () => {
      const node = id.between({ begin: null, end: 3 });
      expect(node).toBeInstanceOf(Nodes.LessThanOrEqual);
    });

    it("begin..null (open end) collapses to GreaterThanOrEqual", () => {
      const node = id.between({ begin: 1, end: null });
      expect(node).toBeInstanceOf(Nodes.GreaterThanOrEqual);
    });
  });

  describe("#between SQL output", () => {
    const sql = (n: Nodes.Node) => new Visitors.ToSql().compile(n);

    it("inclusive standard range → BETWEEN", () => {
      expect(sql(id.between({ begin: 1, end: 3 }))).toBe('"users"."id" BETWEEN 1 AND 3');
    });

    it("exclusive range → >= AND <", () => {
      expect(sql(id.between({ begin: 1, end: 3, excludeEnd: true }))).toBe(
        '"users"."id" >= 1 AND "users"."id" < 3',
      );
    });

    it("begin == end → equality", () => {
      expect(sql(id.between({ begin: 5, end: 5 }))).toBe('"users"."id" = 5');
    });

    it("-Infinity..Infinity → 1=1", () => {
      expect(sql(id.between({ begin: -Infinity, end: Infinity }))).toBe("1=1");
    });

    it("Infinity..end (unboundable begin) → 1=0", () => {
      expect(sql(id.between({ begin: Infinity, end: 3 }))).toBe("1=0");
    });
  });

  describe("#not_between SQL output", () => {
    const sql = (n: Nodes.Node) => new Visitors.ToSql().compile(n);

    it("inclusive range → (col < b OR col > e)", () => {
      expect(sql(id.notBetween({ begin: 1, end: 3 }))).toBe(
        '("users"."id" < 1 OR "users"."id" > 3)',
      );
    });

    it("exclusive range → (col < b OR col >= e)", () => {
      expect(sql(id.notBetween({ begin: 1, end: 3, excludeEnd: true }))).toBe(
        '("users"."id" < 1 OR "users"."id" >= 3)',
      );
    });

    it("-Infinity..end → > end (no NOT wrapper)", () => {
      expect(sql(id.notBetween({ begin: -Infinity, end: 3 }))).toBe('"users"."id" > 3');
    });

    it("-Infinity..Infinity → 1=0", () => {
      expect(sql(id.notBetween({ begin: -Infinity, end: Infinity }))).toBe("1=0");
    });
  });

  describe("#not_between", () => {
    it("inclusive standard range builds Grouping(Or(LessThan, GreaterThan))", () => {
      const node = id.notBetween({ begin: 1, end: 3 });
      expect(node).toBeInstanceOf(Nodes.Grouping);
      const inner = (node as Nodes.Grouping).expr as Nodes.Or;
      expect(inner).toBeInstanceOf(Nodes.Or);
      expect(inner.children[0]).toBeInstanceOf(Nodes.LessThan);
      expect(inner.children[1]).toBeInstanceOf(Nodes.GreaterThan);
    });

    it("exclusive range builds Grouping(Or(LessThan, GreaterThanOrEqual))", () => {
      const node = id.notBetween({ begin: 1, end: 3, excludeEnd: true });
      expect(node).toBeInstanceOf(Nodes.Grouping);
      const inner = (node as Nodes.Grouping).expr as Nodes.Or;
      expect(inner.children[0]).toBeInstanceOf(Nodes.LessThan);
      expect(inner.children[1]).toBeInstanceOf(Nodes.GreaterThanOrEqual);
    });

    it("-Infinity..end (open begin) becomes GreaterThan", () => {
      const node = id.notBetween({ begin: -Infinity, end: 3 });
      expect(node).toBeInstanceOf(Nodes.GreaterThan);
    });

    it("-Infinity...end (open begin, exclusive end) becomes GreaterThanOrEqual", () => {
      const node = id.notBetween({ begin: -Infinity, end: 3, excludeEnd: true });
      expect(node).toBeInstanceOf(Nodes.GreaterThanOrEqual);
    });

    it("begin..Infinity (open end) becomes LessThan", () => {
      const node = id.notBetween({ begin: 1, end: Infinity });
      expect(node).toBeInstanceOf(Nodes.LessThan);
    });

    it("-Infinity..Infinity becomes In([])", () => {
      const node = id.notBetween({ begin: -Infinity, end: Infinity });
      expect(node).toBeInstanceOf(Nodes.In);
    });

    it("Infinity..end (unboundable begin) becomes NotIn([])", () => {
      const node = id.notBetween({ begin: Infinity, end: 3 });
      expect(node).toBeInstanceOf(Nodes.NotIn);
    });

    it("begin..-Infinity (unboundable end) becomes NotIn([])", () => {
      const node = id.notBetween({ begin: 1, end: -Infinity });
      expect(node).toBeInstanceOf(Nodes.NotIn);
    });
  });
});

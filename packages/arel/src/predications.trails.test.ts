import { describe, it, expect } from "vitest";
import { Table, Nodes, Visitors } from "./index.js";

// The Enumerable-arm distinctions below are trails-only: in Ruby a Set, a Hash
// and a lazy enumerator are all simply `Enumerable`, so there is no Rails test
// to mirror. See attribute.trails.test.ts for the same coverage on Attribute.
describe("PredicationsMixin in/notIn Enumerable arm", () => {
  const users = new Table("users");
  const visitor = new Visitors.ToSql();
  // An InfixOperation, not an Attribute — this exercises the Predications
  // mixin's own `in`/`notIn`, which Attribute overrides.
  const expr = () => users.get("bitmap").bitwiseAnd(16);

  describe("#in", () => {
    it("expands a Set through the Enumerable arm", () => {
      expect(visitor.compile(expr().in(new Set([1, 2, 3])))).toBe(
        '("users"."bitmap" & 16) IN (1, 2, 3)',
      );
    });

    it("expands a generator through the Enumerable arm", () => {
      function* ids(): Generator<number> {
        yield 1;
        yield 2;
      }
      expect(visitor.compile(expr().in(ids()))).toBe('("users"."bitmap" & 16) IN (1, 2)');
    });

    it("expands a Map through the Enumerable arm", () => {
      expect(visitor.compile(expr().in(new Map([[1, 2]]).keys()))).toBe(
        '("users"."bitmap" & 16) IN (1)',
      );
    });

    it("casts a non-iterable object through the scalar arm", () => {
      const node = expr();
      const randomObject = {};
      expect(node.in(randomObject)).toEqual(new Nodes.In(node, new Nodes.Quoted(randomObject)));
    });

    it("casts a string through the scalar arm, since Ruby's String is not Enumerable", () => {
      const node = expr();
      expect(node.in("abc")).toEqual(new Nodes.In(node, new Nodes.Quoted("abc")));
    });

    it("takes the SelectManager arm ahead of the Enumerable arm", () => {
      const mgr = users.project(users.get("id"));
      const node = expr();
      expect(node.in(mgr)).toEqual(new Nodes.In(node, mgr.ast));
    });
  });

  describe("#not_in", () => {
    it("expands a Set through the Enumerable arm", () => {
      expect(visitor.compile(expr().notIn(new Set([1, 2])))).toBe(
        '("users"."bitmap" & 16) NOT IN (1, 2)',
      );
    });

    it("casts a string through the scalar arm, since Ruby's String is not Enumerable", () => {
      const node = expr();
      expect(node.notIn("abc")).toEqual(new Nodes.NotIn(node, new Nodes.Quoted("abc")));
    });

    it("takes the SelectManager arm ahead of the Enumerable arm", () => {
      const mgr = users.project(users.get("id"));
      const node = expr();
      expect(node.notIn(mgr)).toEqual(new Nodes.NotIn(node, mgr.ast));
    });
  });
});

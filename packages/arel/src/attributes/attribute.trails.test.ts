import { describe, it, expect } from "vitest";
import { Table, Nodes, Visitors } from "../index.js";

// TS-only coverage for the `when Enumerable` arm of Attribute#in / #notIn
// (arel/predications.rb:65-74, 112-121). Ruby's Enumerable spans Set, Hash and
// Range as well as Array, so the port matches any JS iterable rather than
// Array.isArray. Rails has no equivalent test because in Ruby these are all
// simply Enumerable; the distinction only exists on this side of the port.
describe("AttributeTest (trails)", () => {
  const users = new Table("users");
  const visitor = new Visitors.ToSql();

  describe("#in", () => {
    it("expands a Set through the Enumerable arm", () => {
      const node = users.get("id").in(new Set([1, 2, 3]));
      expect(visitor.compile(node)).toBe('"users"."id" IN (1, 2, 3)');
    });

    it("expands a generator through the Enumerable arm", () => {
      function* ids(): Generator<number> {
        yield 1;
        yield 2;
      }
      const node = users.get("id").in(ids());
      expect(visitor.compile(node)).toBe('"users"."id" IN (1, 2)');
    });

    it("casts a non-iterable object through the scalar arm", () => {
      const attribute = users.get("id");
      const randomObject = {};
      expect(attribute.in(randomObject)).toEqual(
        new Nodes.In(attribute, new Nodes.Casted(randomObject, attribute)),
      );
    });

    it("casts a string through the scalar arm, since Ruby's String is not Enumerable", () => {
      const attribute = users.get("id");
      expect(attribute.in("abc")).toEqual(
        new Nodes.In(attribute, new Nodes.Casted("abc", attribute)),
      );
    });

    // The Hash half of the decided split (see isEnumerable in predications.ts):
    // a Map is the Ruby Hash analogue, so it expands into PAIRS exactly as
    // Rails' `in({a: 1})` does — distinct from iterating `.keys()`. The
    // object-literal half is pinned by the scalar-arm test above.
    it("expands a Map into pairs, matching Ruby's Enumerable Hash", () => {
      const attribute = users.get("id");
      const map = new Map<string, number>([
        ["a", 1],
        ["b", 2],
      ]);
      expect(attribute.in(map)).toEqual(
        new Nodes.In(attribute, [
          new Nodes.Casted(["a", 1], attribute),
          new Nodes.Casted(["b", 2], attribute),
        ]),
      );
    });
  });

  describe("#not_in", () => {
    it("expands a Set through the Enumerable arm", () => {
      const node = users.get("id").notIn(new Set([1, 2]));
      expect(visitor.compile(node)).toBe('"users"."id" NOT IN (1, 2)');
    });

    it("casts a string through the scalar arm, since Ruby's String is not Enumerable", () => {
      const attribute = users.get("id");
      expect(attribute.notIn("abc")).toEqual(
        new Nodes.NotIn(attribute, new Nodes.Casted("abc", attribute)),
      );
    });

    it("casts a non-iterable object through the scalar arm", () => {
      const attribute = users.get("id");
      const randomObject = {};
      expect(attribute.notIn(randomObject)).toEqual(
        new Nodes.NotIn(attribute, new Nodes.Casted(randomObject, attribute)),
      );
    });

    it("expands a Map into pairs, matching Ruby's Enumerable Hash", () => {
      const attribute = users.get("id");
      const map = new Map<string, number>([["a", 1]]);
      expect(attribute.notIn(map)).toEqual(
        new Nodes.NotIn(attribute, [new Nodes.Casted(["a", 1], attribute)]),
      );
    });
  });
});

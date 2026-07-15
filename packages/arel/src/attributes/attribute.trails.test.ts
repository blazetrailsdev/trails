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
  });
});

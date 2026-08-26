import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";
import { BindError } from "../errors.js";

describe("BoundSqlLiteralTest", () => {
  describe("#plus", () => {
    it("returns a Fragments node containing self and other", () => {
      const bsl = new Nodes.BoundSqlLiteral("a = ?", [1], null);
      const other = new Nodes.SqlLiteral(" AND b = 2");
      const frag = bsl.plus(other);
      expect(frag).toBeInstanceOf(Nodes.Fragments);
      expect(frag.values).toEqual([bsl, other]);
    });

    it("throws when other is not an Arel node", () => {
      const bsl = new Nodes.BoundSqlLiteral("a = ?", [1], null);
      expect(() => bsl.plus("not a node" as unknown as Nodes.Node)).toThrow(/Expected Arel node/);
    });
  });

  describe("equality", () => {
    it("is equal with equal components", () => {
      const a = new Nodes.BoundSqlLiteral("id = ?", [1], null);
      const b = new Nodes.BoundSqlLiteral("id = ?", [1], null);
      expect(a.eql(b)).toBe(true);
      expect(a.hash()).toBe(b.hash());
    });

    it("is not equal with different components", () => {
      const a = new Nodes.BoundSqlLiteral("id = ?", [1], null);
      const b = new Nodes.BoundSqlLiteral("id = ?", [2], null);
      expect(a.eql(b)).toBe(false);
    });
  });

  describe("node shape", () => {
    it("exposes sqlWithPlaceholders", () => {
      const node = new Nodes.BoundSqlLiteral("id = ?", [1], null);
      expect(node.sqlWithPlaceholders).toBe("id = ?");
    });

    it("exposes positionalBinds and namedBinds", () => {
      const pos = new Nodes.BoundSqlLiteral("id = ?", [42], null);
      expect(pos.positionalBinds).toEqual([42]);

      const named = new Nodes.BoundSqlLiteral("id = :id", null, { id: 1 });
      expect(named.namedBinds).toEqual({ id: 1 });
    });
  });

  describe("refuses mixed binds", () => {
    it("raises BindError for mixed positional and named", () => {
      expect(
        () => new Nodes.BoundSqlLiteral("id = ? AND name = :name", [1], { name: "x" }),
      ).toThrow(BindError);
    });

    it("error message is quoted", () => {
      expect(
        () => new Nodes.BoundSqlLiteral("id = ? AND name = :name", [1], { name: "x" }),
      ).toThrow('cannot mix positional and named binds in: "id = ? AND name = :name"');
    });
  });

  describe("requires positional binds to match the placeholders", () => {
    it("raises BindError when too few binds", () => {
      expect(() => new Nodes.BoundSqlLiteral("id IN (?, ?, ?)", [1, 2], null)).toThrow(BindError);
    });

    it("raises BindError when too many binds", () => {
      expect(() => new Nodes.BoundSqlLiteral("id IN (?, ?, ?)", [1, 2, 3, 4], null)).toThrow(
        BindError,
      );
    });

    it("error message matches Rails phrasing", () => {
      expect(() => new Nodes.BoundSqlLiteral("id IN (?, ?, ?)", [1, 2], null)).toThrow(
        'wrong number of bind variables (2 for 3) in: "id IN (?, ?, ?)"',
      );
    });

    it("JSON.stringify escapes embedded double-quotes in error message", () => {
      expect(() => new Nodes.BoundSqlLiteral('name = "O\'Brien" AND ?', [1, 2], null)).toThrow(
        'wrong number of bind variables (2 for 1) in: "name = \\"O\'Brien\\" AND ?"',
      );
    });
  });

  describe("requires all named bind params to be supplied", () => {
    it("raises BindError when a named bind is missing", () => {
      expect(() => new Nodes.BoundSqlLiteral("id IN (:foo, :bar)", null, { foo: 1 })).toThrow(
        BindError,
      );
    });

    it("error message matches Rails phrasing", () => {
      expect(() => new Nodes.BoundSqlLiteral("id IN (:foo, :bar)", null, { foo: 1 })).toThrow(
        'missing value for :bar in: "id IN (:foo, :bar)"',
      );
    });

    it("error message matches Rails phrasing (plural missing)", () => {
      expect(() => new Nodes.BoundSqlLiteral("id IN (:foo, :bar, :baz)", null, { foo: 1 })).toThrow(
        'missing values for ["bar","baz"] in: "id IN (:foo, :bar, :baz)"',
      );
    });
  });
});

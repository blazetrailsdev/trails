import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";
import { BindError } from "../errors.js";

describe("BoundSqlLiteralTest", () => {
  describe("equality", () => {
    it("is equal with equal components", () => {
      const a = new Nodes.BoundSqlLiteral("id = ?", [1]);
      const b = new Nodes.BoundSqlLiteral("id = ?", [1]);
      expect(a.eql(b)).toBe(true);
      expect(a.hash()).toBe(b.hash());
    });

    it("is not equal with different components", () => {
      const a = new Nodes.BoundSqlLiteral("id = ?", [1]);
      const b = new Nodes.BoundSqlLiteral("id = ?", [2]);
      expect(a.eql(b)).toBe(false);
    });
  });

  describe("node shape", () => {
    it("exposes sqlWithPlaceholders", () => {
      const node = new Nodes.BoundSqlLiteral("id = ?", [1]);
      expect(node.sqlWithPlaceholders).toBe("id = ?");
    });

    it("exposes positionalBinds and namedBinds", () => {
      const pos = new Nodes.BoundSqlLiteral("id = ?", [42]);
      expect(pos.positionalBinds).toEqual([42]);

      const named = new Nodes.BoundSqlLiteral("id = :id", [], { id: 1 });
      expect(named.namedBinds).toEqual({ id: 1 });
    });
  });

  describe("refuses mixed binds", () => {
    it("raises BindError for mixed positional and named", () => {
      expect(
        () => new Nodes.BoundSqlLiteral("id = ? AND name = :name", [1], { name: "x" }),
      ).toThrow(BindError);
    });
  });

  describe("requires positional binds to match the placeholders", () => {
    it("raises BindError when too few binds", () => {
      expect(() => new Nodes.BoundSqlLiteral("id IN (?, ?, ?)", [1, 2])).toThrow(BindError);
    });

    it("raises BindError when too many binds", () => {
      expect(() => new Nodes.BoundSqlLiteral("id IN (?, ?, ?)", [1, 2, 3, 4])).toThrow(BindError);
    });

    it("error message matches Rails phrasing", () => {
      expect(() => new Nodes.BoundSqlLiteral("id IN (?, ?, ?)", [1, 2])).toThrow(
        "wrong number of bind variables (2 for 3) in: id IN (?, ?, ?)",
      );
    });
  });

  describe("requires all named bind params to be supplied", () => {
    it("raises BindError when a named bind is missing", () => {
      expect(() => new Nodes.BoundSqlLiteral("id IN (:foo, :bar)", [], { foo: 1 })).toThrow(
        BindError,
      );
    });

    it("error message matches Rails phrasing", () => {
      expect(() => new Nodes.BoundSqlLiteral("id IN (:foo, :bar)", [], { foo: 1 })).toThrow(
        "missing value for :bar in: id IN (:foo, :bar)",
      );
    });
  });
});

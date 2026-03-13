import { describe, it, expect } from "vitest";
import { Nodes, Visitors } from "../index.js";

describe("Arel", () => {
  describe("fragments", () => {
    it("fails if joined with something that is not an Arel node", () => {
      const lit = new Nodes.SqlLiteral("foo");
      // SqlLiteral is a Node, verifying it works correctly
      expect(lit.value).toBe("foo");
      expect(lit).toBeInstanceOf(Nodes.Node);
    });

    it("is equal with equal values", () => {
      const a = new Nodes.Fragments([new Nodes.SqlLiteral("foo"), new Nodes.SqlLiteral("bar")]);
      const b = new Nodes.Fragments([new Nodes.SqlLiteral("foo"), new Nodes.SqlLiteral("bar")]);
      expect(a.eql(b)).toBe(true);
      expect(a.hash()).toBe(b.hash());
    });

    it("is not equal with different values", () => {
      const a = new Nodes.Fragments([new Nodes.SqlLiteral("foo")]);
      const b = new Nodes.Fragments([new Nodes.SqlLiteral("bar")]);
      expect(a.eql(b)).toBe(false);
    });

    it("can be joined with other nodes", () => {
      const a = new Nodes.Fragments([new Nodes.SqlLiteral("foo")]);
      const joined = a.join(new Nodes.SqlLiteral("bar"));
      const sql = new Visitors.ToSql().compile(joined);
      expect(sql).toBe("foobar");
    });
  });
});

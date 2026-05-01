import { describe, it, expect } from "vitest";
import { Table, Nodes, SelectManager, Visitors } from "../index.js";

describe("NodesTest", () => {
  const users = new Table("users");

  describe("set operations extend Binary", () => {
    it("Union is a Binary", () => {
      const sm = new SelectManager(users);
      const union = sm.union(new SelectManager(users));
      expect(union).toBeInstanceOf(Nodes.Binary);
    });

    it("Union supports as() from Binary", () => {
      const sm = new SelectManager(users);
      const union = sm.union(new SelectManager(users)) as Nodes.Union;
      expect(union.as("u")).toBeInstanceOf(Nodes.As);
    });

    it("Union supports and() from Binary", () => {
      const sm = new SelectManager(users);
      const union = sm.union(new SelectManager(users)) as Nodes.Union;
      const other = users.get("id").eq(1);
      expect(union.and(other)).toBeInstanceOf(Nodes.And);
    });

    it("UnionAll is a Binary", () => {
      const sm = new SelectManager(users);
      const unionAll = sm.unionAll(new SelectManager(users));
      expect(unionAll).toBeInstanceOf(Nodes.Binary);
    });

    it("Intersect is a Binary", () => {
      const sm = new SelectManager(users);
      const intersect = sm.intersect(new SelectManager(users));
      expect(intersect).toBeInstanceOf(Nodes.Binary);
    });

    it("Except is a Binary", () => {
      const sm = new SelectManager(users);
      const except = sm.except(new SelectManager(users));
      expect(except).toBeInstanceOf(Nodes.Binary);
    });
  });

  describe("Join extends Binary", () => {
    it("InnerJoin is a Binary", () => {
      const join = new Nodes.InnerJoin(users, null);
      expect(join).toBeInstanceOf(Nodes.Binary);
    });

    it("OuterJoin is a Binary", () => {
      const join = new Nodes.OuterJoin(users, null);
      expect(join).toBeInstanceOf(Nodes.Binary);
    });

    it("StringJoin is a Binary", () => {
      const join = new Nodes.StringJoin(new Nodes.SqlLiteral("JOIN foo ON ..."));
      expect(join).toBeInstanceOf(Nodes.Binary);
    });
  });

  describe("dot visitor — union emits left/right edges via Binary fallback", () => {
    it("Union graph has left and right edges", () => {
      const sm = new SelectManager(users);
      const union = sm.union(new SelectManager(users));
      const dot = new Visitors.Dot();
      const out = dot.compile(union);
      expect(out).toMatch(/-> \d+ \[label="left"\]/);
      expect(out).toMatch(/-> \d+ \[label="right"\]/);
    });
  });

  describe("Binary", () => {
    it("generates a hash based on its value", () => {
      const a = new Nodes.Equality(users.get("id"), new Nodes.Quoted(1));
      const b = new Nodes.Equality(users.get("id"), new Nodes.Quoted(2));
      expect(a.hash()).not.toBe(b.hash());
    });

    it("generates a hash specific to its class", () => {
      const a = new Nodes.Equality(users.get("id"), new Nodes.Quoted(1));
      const b = new Nodes.NotEqual(users.get("id"), new Nodes.Quoted(1));
      expect(a.hash()).not.toBe(b.hash());
    });

    describe("#hash", () => {
      it("generates a hash based on its value", () => {
        const eq = new Nodes.Equality("foo", "bar");
        const eq2 = new Nodes.Equality("foo", "bar");
        const eq3 = new Nodes.Equality("bar", "baz");
        expect(eq.hash()).toBe(eq2.hash());
        expect(eq.hash()).not.toBe(eq3.hash());
      });

      it("generates a hash specific to its class", () => {
        const eq = new Nodes.Equality("foo", "bar");
        const neq = new Nodes.NotEqual("foo", "bar");
        expect(eq.hash()).not.toBe(neq.hash());
      });
    });
  });
});

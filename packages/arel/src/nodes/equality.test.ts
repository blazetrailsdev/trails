import { describe, it, expect } from "vitest";
import { Table, Nodes } from "../index.js";

describe("Arel", () => {
  const users = new Table("users");

  describe("equality", () => {
    it("takes an engine", () => {
      const eq = new Nodes.Equality(users.get("id"), new Nodes.Quoted(1));
      expect(eq.left).toBeInstanceOf(Nodes.Attribute);
      expect(eq.right).toBeInstanceOf(Nodes.Quoted);
    });

    it("makes an OR node", () => {
      const eq1 = users.get("id").eq(1);
      const eq2 = users.get("id").eq(2);
      const or = eq1.or(eq2);
      expect(or).toBeInstanceOf(Nodes.Grouping);
    });

    it("makes and AND node", () => {
      const eq = users.get("id").eq(1);
      const result = eq.and(users.get("name").eq("bob"));
      expect(result).toBeInstanceOf(Nodes.And);
    });

    it("is equal with equal ivars", () => {
      const a = new Nodes.Or(users.get("id").eq(1), users.get("id").eq(2));
      const b = new Nodes.Or(users.get("id").eq(1), users.get("id").eq(2));
      expect(a.constructor).toBe(b.constructor);
    });

    it("is not equal with different ivars", () => {
      const a = new Nodes.Grouping(new Nodes.Quoted("foo"));
      const b = new Nodes.Grouping(new Nodes.Quoted("bar"));
      expect(a).not.toBe(b);
    });

    it.skip("is equal with equal ivars");

    it.skip("is not equal with different ivars");

    describe("and", () => {
      it.skip("makes and AND node");

      it.skip("makes and AND node");
    });

    describe("or", () => {
      it.skip("makes an OR node");

      it.skip("makes an OR node");
    });

    describe("to_sql", () => {
      it.skip("takes an engine");
    });

    it.skip("is equal with equal ivars");
    it.skip("is not equal with different ivars");

    describe("backwards compat", () => {
      describe("to_sql", () => {
        it.skip("takes an engine");
      });
    });
  });
});

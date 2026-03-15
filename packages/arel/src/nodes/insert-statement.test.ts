import { describe, it, expect } from "vitest";
import { Table, Nodes } from "../index.js";

describe("Arel", () => {
  const users = new Table("users");

  describe("insert-statement", () => {
    it("clones columns and values", () => {
      const stmt = new Nodes.InsertStatement();
      stmt.columns.push(users.get("name"));
      const copy = [...stmt.columns];
      expect(copy.length).toBe(1);
      stmt.columns.push(users.get("age"));
      expect(copy.length).toBe(1);
      expect(stmt.columns.length).toBe(2);
    });

    it("is equal with equal ivars", () => {
      const o1 = new Nodes.Over(users.get("id").count());
      const o2 = new Nodes.Over(users.get("id").count());
      expect(o1.right).toBe(o2.right); // both null
    });

    it("is not equal with different ivars", () => {
      const c1 = new Nodes.NamedFunction("COUNT", [users.get("id")]);
      const c2 = new Nodes.NamedFunction("COUNT", [users.get("name")]);
      expect(c1.expressions[0]).not.toBe(c2.expressions[0]);
    });
  });
});

describe("equality", () => {
  it.skip("is equal with equal ivars");

  it.skip("is not equal with different ivars");
});

describe("#clone", () => {
  it.skip("clones columns and values");
});

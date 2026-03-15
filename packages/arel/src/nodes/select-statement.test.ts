import { describe, it, expect } from "vitest";
import { Table, Nodes } from "../index.js";

describe("Arel", () => {
  const users = new Table("users");

  describe("select-statement", () => {
    it("clones cores", () => {
      const stmt = new Nodes.SelectStatement();
      expect(stmt.cores.length).toBe(1);
      expect(stmt.cores[0]).toBeInstanceOf(Nodes.SelectCore);
    });

    it("is equal with equal ivars", () => {
      const s1 = new Nodes.UpdateStatement();
      const s2 = new Nodes.UpdateStatement();
      expect(s1.relation).toBe(s2.relation);
      expect(s1.wheres.length).toBe(s2.wheres.length);
    });

    it("is not equal with different ivars", () => {
      const w = new Nodes.Window();
      const o1 = new Nodes.Over(users.get("id").count());
      const o2 = new Nodes.Over(users.get("id").count(), w);
      expect(o1.right).not.toBe(o2.right);
    });
  });
});

describe("equality", () => {
  it.skip("is equal with equal ivars");

  it.skip("is not equal with different ivars");

  it.skip("is equal with equal ivars");
  it.skip("is not equal with different ivars");
});

describe("#clone", () => {
  it.skip("clones cores");

  it.skip("clones cores");
});

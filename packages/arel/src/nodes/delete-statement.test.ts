import { describe, it, expect } from "vitest";
import { Table, Nodes } from "../index.js";

describe("Arel", () => {
  const users = new Table("users");

  describe("delete-statement", () => {
    it("clones wheres", () => {
      const stmt = new Nodes.DeleteStatement();
      stmt.wheres.push(users.get("id").eq(1));
      const copy = [...stmt.wheres];
      expect(copy.length).toBe(1);
      stmt.wheres.push(users.get("name").eq("dean"));
      expect(copy.length).toBe(1);
      expect(stmt.wheres.length).toBe(2);
    });

    it("is equal with equal ivars", () => {
      const s1 = new Nodes.InsertStatement();
      const s2 = new Nodes.InsertStatement();
      expect(s1.relation).toBe(s2.relation);
      expect(s1.columns.length).toBe(s2.columns.length);
    });

    it("is not equal with different ivars", () => {
      const c1 = new Nodes.Case(users.get("name")).when(new Nodes.Quoted("a"));
      const c2 = new Nodes.Case(users.get("id")).when(new Nodes.Quoted("b"));
      expect((c1.operand as Nodes.Attribute).name).not.toBe((c2.operand as Nodes.Attribute).name);
    });

    describe("equality", () => {
      it("is equal with equal ivars", () => {
        const s1 = new Nodes.DeleteStatement();
        s1.wheres = [new Nodes.Quoted("a"), new Nodes.Quoted("b"), new Nodes.Quoted("c")];
        const s2 = new Nodes.DeleteStatement();
        s2.wheres = [new Nodes.Quoted("a"), new Nodes.Quoted("b"), new Nodes.Quoted("c")];
        expect(s1.hash()).toBe(s2.hash());
      });

      it("is not equal with different ivars", () => {
        const s1 = new Nodes.DeleteStatement();
        s1.wheres = [new Nodes.Quoted("a"), new Nodes.Quoted("b"), new Nodes.Quoted("c")];
        const s2 = new Nodes.DeleteStatement();
        s2.wheres = [new Nodes.Quoted("1"), new Nodes.Quoted("2"), new Nodes.Quoted("3")];
        expect(s1.hash()).not.toBe(s2.hash());
      });
    });

    describe("#clone", () => {
      it.skip("clones wheres");
    });
  });
});

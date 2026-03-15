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
      it("clones wheres", () => {
        const stmt = new Nodes.DeleteStatement();
        stmt.wheres = [new Nodes.Quoted("a"), new Nodes.Quoted("b"), new Nodes.Quoted("c")];
        const dolly = stmt.clone();
        expect(dolly.wheres).toEqual(stmt.wheres);
        expect(dolly.wheres).not.toBe(stmt.wheres);
      });
    });
  });
});

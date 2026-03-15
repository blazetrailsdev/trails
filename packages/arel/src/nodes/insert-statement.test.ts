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

    describe("equality", () => {
      it("is equal with equal ivars", () => {
        const s1 = new Nodes.InsertStatement();
        s1.columns = [users.get("a"), users.get("b"), users.get("c")];
        s1.values = new Nodes.Quoted("xyz");
        const s2 = new Nodes.InsertStatement();
        s2.columns = [users.get("a"), users.get("b"), users.get("c")];
        s2.values = new Nodes.Quoted("xyz");
        expect(s1.hash()).toBe(s2.hash());
      });

      it("is not equal with different ivars", () => {
        const s1 = new Nodes.InsertStatement();
        s1.columns = [users.get("a"), users.get("b"), users.get("c")];
        s1.values = new Nodes.Quoted("xyz");
        const s2 = new Nodes.InsertStatement();
        s2.columns = [users.get("a"), users.get("b"), users.get("c")];
        s2.values = new Nodes.Quoted("123");
        expect(s1.hash()).not.toBe(s2.hash());
      });
    });

    describe("#clone", () => {
      it("clones columns and values", () => {
        const stmt = new Nodes.InsertStatement();
        stmt.columns = [users.get("a"), users.get("b"), users.get("c")];
        stmt.values = new Nodes.Quoted("xyz");
        const dolly = stmt.clone();
        expect(dolly.columns).toEqual(stmt.columns);
        expect(dolly.columns).not.toBe(stmt.columns);
        expect(dolly.values).toBe(stmt.values);
      });
    });
  });
});

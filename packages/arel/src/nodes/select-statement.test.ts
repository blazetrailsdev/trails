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

    describe("equality", () => {
      it("is equal with equal ivars", () => {
        const s1 = new Nodes.SelectStatement();
        s1.offset = new Nodes.Offset(new Nodes.Quoted(1));
        s1.limit = new Nodes.Limit(new Nodes.Quoted(2));
        const s2 = new Nodes.SelectStatement();
        s2.offset = new Nodes.Offset(new Nodes.Quoted(1));
        s2.limit = new Nodes.Limit(new Nodes.Quoted(2));
        expect(s1.hash()).toBe(s2.hash());
      });

      it("is not equal with different ivars", () => {
        const s1 = new Nodes.SelectStatement();
        s1.offset = new Nodes.Offset(new Nodes.Quoted(1));
        const s2 = new Nodes.SelectStatement();
        s2.offset = new Nodes.Offset(new Nodes.Quoted(2));
        expect(s1.hash()).not.toBe(s2.hash());
      });
    });

    describe("#clone", () => {
      it("clones cores", () => {
        const stmt = new Nodes.SelectStatement();
        const dolly = stmt.clone();
        expect(dolly.cores.length).toBe(stmt.cores.length);
        expect(dolly.cores).not.toBe(stmt.cores);
      });
    });
  });
});

import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";

describe("Arel", () => {
  describe("select-statement", () => {
    it("clones cores", () => {
      const stmt = new Nodes.SelectStatement();
      expect(stmt.cores.length).toBe(1);
      expect(stmt.cores[0]).toBeInstanceOf(Nodes.SelectCore);
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
        stmt.offset = new Nodes.Offset(new Nodes.Quoted(5));
        stmt.limit = new Nodes.Limit(new Nodes.Quoted(10));
        const dolly = stmt.clone();
        expect(dolly.cores.length).toBe(stmt.cores.length);
        expect(dolly.cores).not.toBe(stmt.cores);
        expect(dolly.offset).toBe(stmt.offset);
        expect(dolly.limit).toBe(stmt.limit);
      });
    });
  });
});

import { describe, it, expect } from "vitest";
import { Table, Nodes } from "../index.js";

describe("NodesTest", () => {
  const users = new Table("users");
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

import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";

describe("Window", () => {
  describe("equality", () => {
    it("is equal with equal ivars", () => {
      const a = new Nodes.Window();
      const b = new Nodes.Window();
      expect(a.hash()).toBe(b.hash());
    });

    it("is not equal with different ivars", () => {
      const a = new Nodes.Window();
      a.orders = [new Nodes.Quoted("foo")];
      const b = new Nodes.Window();
      b.orders = [new Nodes.Quoted("bar")];
      expect(a.hash()).not.toBe(b.hash());
    });
  });
});

describe("NamedWindow", () => {
  describe("equality", () => {
    it("is equal with equal ivars", () => {
      const a = new Nodes.NamedWindow("w");
      const b = new Nodes.NamedWindow("w");
      expect(a.hash()).toBe(b.hash());
    });

    it("is not equal with different ivars", () => {
      const a = new Nodes.NamedWindow("w1");
      const b = new Nodes.NamedWindow("w2");
      expect(a.hash()).not.toBe(b.hash());
    });
  });
});

describe("CurrentRow", () => {
  describe("equality", () => {
    it("is equal to other current row nodes", () => {
      const a = new Nodes.CurrentRow();
      const b = new Nodes.CurrentRow();
      expect(a.hash()).toBe(b.hash());
    });

    it("is not equal with other nodes", () => {
      const a = new Nodes.CurrentRow();
      const b = new Nodes.Preceding();
      expect(a.hash()).not.toBe(b.hash());
    });
  });
});

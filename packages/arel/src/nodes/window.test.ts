import { describe, it, expect } from "vitest";
import { Table, Nodes } from "../index.js";

describe("Arel", () => {
  const users = new Table("users");

  describe("window", () => {
    it("is equal with equal ivars", () => {
      const a = new Nodes.Extract(users.get("created_at"), "YEAR");
      const b = new Nodes.Extract(users.get("created_at"), "YEAR");
      expect(a.field).toBe(b.field);
    });

    it("is not equal with different ivars", () => {
      const a = users.get("name").as("n");
      const b = users.get("name").as("m");
      expect((a.right as Nodes.SqlLiteral).value).not.toBe((b.right as Nodes.SqlLiteral).value);
    });

    it("is equal with equal ivars", () => {
      const a = new Nodes.Grouping(new Nodes.Quoted("foo"));
      const b = new Nodes.Grouping(new Nodes.Quoted("foo"));
      expect(a.constructor).toBe(b.constructor);
    });

    it("is not equal with different ivars", () => {
      const a = users.get("id").eq(1);
      const b = users.get("id").eq(2);
      expect(a).not.toBe(b);
    });

    it("is equal to other current row nodes", () => {
      const a = new Nodes.CurrentRow();
      const b = new Nodes.CurrentRow();
      expect(a.constructor).toBe(b.constructor);
    });

    it("is not equal with other nodes", () => {
      const a = new Nodes.Distinct();
      expect(a).not.toBeInstanceOf(Nodes.True);
    });
  });
});

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

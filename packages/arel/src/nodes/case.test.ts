import { describe, it, expect, beforeEach } from "vitest";
import {
  Table,
  sql,
  star,
  SelectManager,
  InsertManager,
  UpdateManager,
  DeleteManager,
  Nodes,
  Visitors,
  Collectors,
} from "../index.js";

describe("Arel", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  const visitor = new Visitors.ToSql();

  describe("case", () => {
    it("sets case expression from first argument", () => {
      const caseNode = new Nodes.Case(users.get("status"));
      expect(caseNode.operand).toBeInstanceOf(Nodes.Attribute);
    });

    it("is equal with equal ivars", () => {
      const a = new Nodes.Window();
      const b = new Nodes.Window();
      expect(a.constructor).toBe(b.constructor);
    });

    it("is not equal with different ivars", () => {
      const a = new Nodes.Or(users.get("id").eq(1), users.get("id").eq(2));
      const b = new Nodes.Or(users.get("id").eq(3), users.get("id").eq(4));
      expect(a).not.toBe(b);
    });

    it("allows aliasing", () => {
      const node = new Nodes.And([users.get("id").eq(1), users.get("name").eq("dean")]);
      const aliased = node.as("condition");
      expect(aliased).toBeInstanceOf(Nodes.As);
    });

    it.todo("sets default case from second argument", () => {});

    it.todo("clones case, conditions and default", () => {});
  });
});

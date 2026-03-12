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

  describe("unary-operation", () => {
    it("construct", () => {
      const attr = users.get("age");
      const node = new Nodes.UnaryOperation("-", attr);
      expect(node.operator).toBe("-");
      expect(node.operand).toBe(attr);
      expect(node.operand).toBeInstanceOf(Nodes.Attribute);
    });

    it("operation alias", () => {
      const node = new Nodes.UnaryOperation("-", users.get("age"));
      const aliased = node.as("negated_age");
      expect(aliased).toBeInstanceOf(Nodes.As);
      expect(aliased.left).toBe(node);
      expect(aliased.right).toBeInstanceOf(Nodes.SqlLiteral);
    });

    it("expr", () => {
      const attr = users.get("id");
      const node = new Nodes.UnaryOperation("-", attr);
      expect(node.operand).toBe(attr);
    });

    it("equality with same ivars", () => {
      const a = new Nodes.UnaryOperation("-", users.get("age"));
      const b = new Nodes.UnaryOperation("-", users.get("age"));
      expect(a).toEqual(b);
    });

    it("inequality with different ivars", () => {
      const a = new Nodes.UnaryOperation("-", users.get("age"));
      const b = new Nodes.UnaryOperation("-", users.get("id"));
      expect(a).not.toEqual(b);
    });

    it("operation ordering", () => {
      const node = new Nodes.UnaryOperation("-", users.get("age"));
      const ordering = node.desc();
      expect(ordering).toBeInstanceOf(Nodes.Descending);
      expect(ordering.expr).toBe(node);
      expect(ordering.isDescending()).toBe(true);
    });
  });
});

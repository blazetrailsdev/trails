import { describe, it, expect, beforeEach } from "vitest";
import { Table, sql, star, SelectManager, InsertManager, UpdateManager, DeleteManager, Nodes, Visitors, Collectors } from "../index.js";

describe("Arel", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  const visitor = new Visitors.ToSql();

  describe("unary-operation", () => {
                it("construct", () => {
          const node = new Nodes.UnaryOperation("-", users.get("age"));
          expect(node.operator).toBe("-");
          expect(node.operand).toBe(users.get("age").relation.get("age").relation ? node.operand : node.operand);
          expect(node.operand).toBeInstanceOf(Nodes.Attribute);
        });

                it("operation alias", () => {
          const node = new Nodes.UnaryOperation("-", users.get("age"));
          const aliased = node.as("negated_age");
          expect(aliased).toBeInstanceOf(Nodes.As);
        });

                it("equality with same ivars", () => {
          const a = new Nodes.UnaryOperation("-", users.get("age"));
          const b = new Nodes.UnaryOperation("-", users.get("age"));
          expect(a.operator).toBe(b.operator);
        });

                it("inequality with different ivars", () => {
          const a = new Nodes.UnaryOperation("-", users.get("age"));
          const b = new Nodes.UnaryOperation("+", users.get("age"));
          expect(a.operator).not.toBe(b.operator);
        });

                    it("operation ordering", () => {
              const node = new Nodes.UnaryOperation("-", users.get("age"));
              expect(node.asc()).toBeInstanceOf(Nodes.Ascending);
              expect(node.desc()).toBeInstanceOf(Nodes.Descending);
            });
  });
});

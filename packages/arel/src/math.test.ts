import { describe, it, expect } from "vitest";
import { Table, Nodes, Visitors } from "./index.js";

describe("Math", () => {
  const users = new Table("users");
  const visitor = new Visitors.ToSql();

  describe("operands pass through raw (no Quoted wrapper)", () => {
    const arg = new Nodes.SqlLiteral("42");

    it("multiply", () => {
      const node = users.get("id").multiply(arg) as Nodes.Multiplication;
      expect(node).toBeInstanceOf(Nodes.Multiplication);
      expect(node.right).toBe(arg);
    });

    it("divide", () => {
      const node = users.get("id").divide(arg) as Nodes.Division;
      expect(node.right).toBe(arg);
    });

    it("add", () => {
      const grouping = users.get("id").add(arg) as Nodes.Grouping;
      const inner = grouping.expr as Nodes.Addition;
      expect(inner).toBeInstanceOf(Nodes.Addition);
      expect(inner.right).toBe(arg);
    });

    it("subtract", () => {
      const grouping = users.get("id").subtract(arg) as Nodes.Grouping;
      const inner = grouping.expr as Nodes.Subtraction;
      expect(inner.right).toBe(arg);
    });

    it("bitwiseAnd", () => {
      const grouping = users.get("id").bitwiseAnd(arg) as Nodes.Grouping;
      expect((grouping.expr as Nodes.BitwiseAnd).right).toBe(arg);
    });

    it("bitwiseOr", () => {
      const grouping = users.get("id").bitwiseOr(arg) as Nodes.Grouping;
      expect((grouping.expr as Nodes.BitwiseOr).right).toBe(arg);
    });

    it("bitwiseXor", () => {
      const grouping = users.get("id").bitwiseXor(arg) as Nodes.Grouping;
      expect((grouping.expr as Nodes.BitwiseXor).right).toBe(arg);
    });

    it("bitwiseShiftLeft", () => {
      const grouping = users.get("id").bitwiseShiftLeft(arg) as Nodes.Grouping;
      expect((grouping.expr as Nodes.BitwiseShiftLeft).right).toBe(arg);
    });

    it("bitwiseShiftRight", () => {
      const grouping = users.get("id").bitwiseShiftRight(arg) as Nodes.Grouping;
      expect((grouping.expr as Nodes.BitwiseShiftRight).right).toBe(arg);
    });

    it("primitive numbers also pass through unwrapped", () => {
      const node = users.get("id").multiply(2) as Nodes.Multiplication;
      expect(node.right).toBe(2);
    });
  });

  describe("bitwiseNot", () => {
    it("returns a BitwiseNot wrapping the receiver", () => {
      const attr = users.get("flags");
      const node = attr.bitwiseNot();
      expect(node).toBeInstanceOf(Nodes.BitwiseNot);
      expect(node.operator).toBe("~");
      expect(node.operand).toBe(attr);
    });

    it("renders SQL with surrounding spaces around the operator", () => {
      const sql = visitor.compile(users.get("flags").bitwiseNot());
      expect(sql).toBe(' ~ "users"."flags"');
    });
  });
});

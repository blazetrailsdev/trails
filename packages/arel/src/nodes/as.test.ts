import { describe, it, expect } from "vitest";
import { uniq } from "../test-helpers/uniq.js";
import { sql, Table, Nodes } from "../index.js";

describe("As", () => {
  describe("#as", () => {
    it("makes an AS node", () => {
      const attr = new Table("users").get("id");
      const as = attr.as(sql("foo"));
      expect(as.left).toBe(attr);
      // Ruby's SqlLiteral is a String subclass, so `assert_equal "foo", as.right`
      // compares string values (sql_literal.rb:6-11); the TS node carries the
      // text in `value`.
      expect((as.right as Nodes.SqlLiteral).value).toBe("foo");
    });

    it("converts right to SqlLiteral if a string", () => {
      const attr = new Table("users").get("id");
      const as = attr.as("foo");
      expect(as.right).toBeInstanceOf(Nodes.SqlLiteral);
    });
  });

  describe("equality", () => {
    it("is equal with equal ivars", () => {
      const array = [new Nodes.As("foo", "bar"), new Nodes.As("foo", "bar")];
      expect(uniq(array).length).toBe(1);
    });

    it("is not equal with different ivars", () => {
      const array = [new Nodes.As("foo", "bar"), new Nodes.As("foo", "baz")];
      expect(uniq(array).length).toBe(2);
    });
  });

  describe("#to_cte", () => {
    it("returns a Cte node using the LHS's name and the RHS as the relation", () => {
      const table = new Table("users");
      const asNode = new Nodes.As(table, "foo");
      const cteNode = asNode.toCte();

      expect(cteNode).toBeInstanceOf(Nodes.Cte);
      expect(cteNode.name).toBe((asNode.left as Table).name);
      expect(cteNode.relation).toBe(asNode.right);
    });
  });
});

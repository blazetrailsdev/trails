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

  describe("to-sql", () => {
    it("should handle nil", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("name").eq(null);
      expect(visitor.compile(node)).toBe('"users"."name" IS NULL');
    });

    it("can handle subqueries", () => {
      const subquery = users.project(users.get("id"));
      const node = users.get("id").in(subquery);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toContain("SELECT");
    });

    it("should know how to visit", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("id").in([1, 2, 3]);
      expect(visitor.compile(node)).toContain("IN");
    });

    it("can handle ESCAPE", () => {
      const node = users.get("name").matches("foo%", true, "\\");
      const visitor = new Visitors.ToSql();
      const result = visitor.compile(node);
      expect(result).toContain("LIKE");
    });

    it("should escape LIMIT", () => {
      const mgr = users.project(star).take(10);
      expect(mgr.toSql()).toContain("LIMIT 10");
    });

    it.todo("can define a dispatch method", () => {});
    it.todo("should visit built-in functions", () => {});
    it.todo("should construct a valid generic SQL statement", () => {});
    it.todo("should handle column names on both sides", () => {});

    // Convention-compare parity stubs (Ruby tests that should live in visitors/to-sql.test.ts).
    it.todo("allows chaining multiple conditions", () => {});
    it.todo("can be built by adding SQL fragments one at a time", () => {});
    it.todo("can be chained as a predicate", () => {});
    it.todo("can handle ranges bounded by infinity", () => {});
    it.todo("can handle three dot ranges", () => {});
    it.todo("can handle two dot ranges", () => {});
    it.todo("does not quote BindParams used as part of a ValuesList", () => {});
    it.todo("encloses SELECT statements with parentheses", () => {});
    it.todo("handles CTEs with a MATERIALIZED modifier", () => {});
    it.todo("handles CTEs with a NOT MATERIALIZED modifier", () => {});
    it.todo("handles CTEs with no MATERIALIZED modifier", () => {});
    it.todo("handles Cte nodes", () => {});
    it.todo("handles table aliases", () => {});
    it.todo("ignores excess named parameters", () => {});
    it.todo("is not preparable when an array", () => {});
    it.todo("is preparable when a subselect", () => {});
    it.todo("joins subexpressions", () => {});
    it.todo("quotes nested arrays", () => {});
    it.todo("raises not implemented error", () => {});
    it.todo("refuses mixed binds", () => {});
    it.todo("requires all named bind params to be supplied", () => {});
    it.todo("requires positional binds to match the placeholders", () => {});
    it.todo("should apply Not to the whole expression", () => {});
    it.todo("should chain predications on named functions", () => {});
    it.todo("should compile node names", () => {});
    it.todo("should compile nodes with bind params", () => {});
    it.todo("should contain a single space before ORDER BY", () => {});
    it.todo("should escape strings", () => {});
    it.todo("should handle BitwiseAnd", () => {});
    it.todo("should handle BitwiseNot", () => {});
    it.todo("should handle BitwiseOr", () => {});
    it.todo("should handle BitwiseShiftLeft", () => {});
    it.todo("should handle BitwiseShiftRight", () => {});
    it.todo("should handle BitwiseXor", () => {});
    it.todo("should handle Concatenation", () => {});
    it.todo("should handle arbitrary operators", () => {});
    it.todo("should handle nil with named functions", () => {});
    it.todo("should handle nulls first", () => {});
    it.todo("should handle nulls first reversed", () => {});
    it.todo("should handle nulls last", () => {});
    it.todo("should handle nulls last reversed", () => {});
    it.todo("should handle true", () => {});
    it.todo(
      "should mark collector as non-retryable if SQL literal is marked as retryable",
      () => {},
    );
    it.todo("should mark collector as non-retryable if SQL literal is not retryable", () => {});
    it.todo("should mark collector as non-retryable when visiting SQL literal", () => {});
    it.todo("should mark collector as non-retryable when visiting bound SQL literal", () => {});
    it.todo("should mark collector as non-retryable when visiting delete statement node", () => {});
    it.todo("should mark collector as non-retryable when visiting insert statement node", () => {});
    it.todo("should mark collector as non-retryable when visiting named function", () => {});
    it.todo("should mark collector as non-retryable when visiting update statement node", () => {});
    it.todo("should not change retryable if SQL literal is marked as retryable", () => {});
    it.todo("should not quote BindParams used as part of a ValuesList", () => {});
    it.todo("should quote LIMIT without column type coercion", () => {});
    it.todo("should return 1=0 when empty right which is always false", () => {});
    it.todo("should return 1=1 when empty right which is always true", () => {});
    it.todo("should use the underlying table for checking columns", () => {});
    it.todo("should visit_Arel_Nodes_And", () => {});
    it.todo("should visit_Arel_Nodes_Assignment", () => {});
    it.todo("should visit_Arel_Nodes_Or", () => {});
    it.todo("should visit_Arel_SelectManager, which is a subquery", () => {});
    it.todo("should visit_As", () => {});
    it.todo("should visit_BigDecimal", () => {});
    it.todo("should visit_Class", () => {});
    it.todo("should visit_Date", () => {});
    it.todo("should visit_DateTime", () => {});
    it.todo("should visit_Float", () => {});
    it.todo("should visit_Hash", () => {});
    it.todo("should visit_Integer", () => {});
    it.todo("should visit_NilClass", () => {});
    it.todo("should visit_Not", () => {});
    it.todo("should visit_Set", () => {});
    it.todo("should visit_TrueClass", () => {});
    it.todo("should visit named functions", () => {});
    it.todo("should visit string subclass", () => {});
    it.todo("should visit built-in functions operating on distinct values", () => {});
    it.todo("squashes parenthesis on multiple union alls", () => {});
    it.todo("squashes parenthesis on multiple unions", () => {});
    it.todo("supports other bound literals as binds", () => {});
    it.todo("supports simple case expressions", () => {});
    it.todo("supports extended case expressions", () => {});
    it.todo("unsupported input should raise UnsupportedVisitError", () => {});
    it.todo("will only consider named binds starting with a letter", () => {});
    it.todo("works with BindParams", () => {});
    it.todo("works with lists", () => {});
    it.todo("works with positional binds", () => {});
    it.todo("works with named binds", () => {});
    it.todo("works with array values", () => {});
    it.todo("wraps nested groupings in brackets only once", () => {});
    it.todo("works without default branch", () => {});
    it.todo("supports #when with two arguments and no #then", () => {});

    // Misplaced descriptions that need to exist in this file for convention mapping.
    it.todo("should not quote sql literals", () => {});
    it.todo("should handle false", () => {});
    it.todo("should handle Multiplication", () => {});
    it.todo("should handle Division", () => {});
    it.todo("should handle Addition", () => {});
    it.todo("should handle Subtraction", () => {});
    it.todo("should handle Contains", () => {});
    it.todo("should handle Overlaps", () => {});
    it.todo("should compile literal SQL", () => {});
    it.todo("should compile Arel nodes", () => {});
  });
});

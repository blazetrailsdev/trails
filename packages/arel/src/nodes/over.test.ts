import { describe, it, expect, beforeEach } from "vitest";
import { Table, sql, star, SelectManager, InsertManager, UpdateManager, DeleteManager, Nodes, Visitors, Collectors } from "../index.js";

describe("Arel", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  const visitor = new Visitors.ToSql();

  describe("over", () => {
                it("should alias the expression", () => {
          const fn = new Nodes.NamedFunction("ROW_NUMBER", []);
          const over = new Nodes.Over(fn);
          const visitor = new Visitors.ToSql();
          expect(visitor.compile(over)).toBe("ROW_NUMBER() OVER ()");
        });

                it("should reference the window definition by name", () => {
          const fn = new Nodes.NamedFunction("ROW_NUMBER", []);
          const w = new Nodes.Window();
          w.order(users.get("id").asc());
          const over = new Nodes.Over(fn, w);
          const visitor = new Visitors.ToSql();
          const result = visitor.compile(over);
          expect(result).toContain("OVER");
          expect(result).toContain("ORDER BY");
        });

                it("should reference the window definition by name", () => {
          const count = new Nodes.NamedFunction("COUNT", [new Nodes.SqlLiteral("*")]);
          const filter = new Nodes.Filter(count, users.get("active").eq(true));
          const over = filter.over("w");
          expect(over).toBeInstanceOf(Nodes.Over);
        });

                it("should use empty definition", () => {
          const fn = new Nodes.NamedFunction("ROW_NUMBER", []);
          const over = new Nodes.Over(fn);
          const visitor = new Visitors.ToSql();
          expect(visitor.compile(over)).toBe("ROW_NUMBER() OVER ()");
        });

                it("should use definition in sub-expression", () => {
          const fn = new Nodes.NamedFunction("SUM", [users.get("amount")]);
          const w = new Nodes.Window();
          w.partition(users.get("department_id"));
          const over = new Nodes.Over(fn, w);
          const visitor = new Visitors.ToSql();
          const result = visitor.compile(over);
          expect(result).toContain("SUM");
          expect(result).toContain("PARTITION BY");
        });

                it("is equal with equal ivars", () => {
          const a = users.get("id").eq(1);
          const b = users.get("id").eq(1);
          expect((a.left as Nodes.Attribute).name).toBe((b.left as Nodes.Attribute).name);
        });

                it("is not equal with different ivars", () => {
          const a = new Nodes.And([users.get("id").eq(1)]);
          const b = new Nodes.And([users.get("id").eq(2)]);
          expect(a).not.toBe(b);
        });
  });
});

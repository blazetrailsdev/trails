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

  describe("cte", () => {
    it("is equal with equal ivars", () => {
      const c1 = new Nodes.Case(users.get("name")).when(new Nodes.Quoted("a"));
      const c2 = new Nodes.Case(users.get("name")).when(new Nodes.Quoted("a"));
      expect(c1.conditions.length).toBe(c2.conditions.length);
      expect(c1.operand).toBeInstanceOf(Nodes.Attribute);
      expect(c2.operand).toBeInstanceOf(Nodes.Attribute);
    });

    it("is not equal with unequal ivars", () => {
      const rel = users.project(users.get("id")).ast;
      const a = new Nodes.Cte("cte1", rel);
      const b = new Nodes.Cte("cte2", rel);
      expect(a.name).not.toBe(b.name);
    });

    it("returns self", () => {
      const rel = users.project(users.get("id")).ast;
      const cte = new Nodes.Cte("cte", rel);
      expect(cte).toBeInstanceOf(Nodes.Cte);
    });

    it("returns an Arel::Table using the Cte's name", () => {
      const rel = users.project(users.get("id")).ast;
      const cte = new Nodes.Cte("cte_table", rel);
      const table = cte.toTable();
      expect(table).toBeInstanceOf(Table);
      expect(table.name).toBe("cte_table");
    });
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { Table, sql, star, SelectManager, InsertManager, UpdateManager, DeleteManager, Nodes, Visitors, Collectors } from "../index.js";

describe("Arel", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  const visitor = new Visitors.ToSql();

  describe("table-alias", () => {
    it("returns a Cte node using the TableAlias's name and relation", () => {
      const tableAlias = new Nodes.TableAlias(users, "u");
      const cte = tableAlias.toCte();
      expect(cte).toBeInstanceOf(Nodes.Cte);
      expect(cte.name).toBe("u");
    });

    it("is equal with equal ivars", () => {
      const a = new Nodes.TableAlias(users, "u");
      const b = new Nodes.TableAlias(users, "u");
      expect(a).toEqual(b);
    });

    it.todo("inequality with different ivars", () => {});
  });
});

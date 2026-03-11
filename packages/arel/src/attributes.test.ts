import { describe, it, expect, beforeEach } from "vitest";
import { Table, sql, star, SelectManager, InsertManager, UpdateManager, DeleteManager, Nodes, Visitors, Collectors } from "./index.js";

describe("Arel", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  const visitor = new Visitors.ToSql();

  describe("attributes", () => {
                it("responds to lower", () => {
          const name = users.get("name");
          const fn = name.lower();
          expect(fn).toBeInstanceOf(Nodes.NamedFunction);
          expect(fn.name).toBe("LOWER");
        });

                it("is equal with equal ivars", () => {
          const c1 = new Nodes.NamedFunction("COUNT", [users.get("id")]);
          const c2 = new Nodes.NamedFunction("COUNT", [users.get("id")]);
          expect(c1.name).toBe(c2.name);
        });

                it("is not equal with different ivars", () => {
          const a = new Nodes.Window();
          a.order(users.get("id").asc());
          const b = new Nodes.Window();
          expect(a.orders.length).not.toBe(b.orders.length);
        });
  });
});

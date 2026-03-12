import { describe, it, expect, beforeEach } from "vitest";
import { Table, sql, star, SelectManager, InsertManager, UpdateManager, DeleteManager, Nodes, Visitors, Collectors } from "../index.js";

describe("Arel", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  const visitor = new Visitors.ToSql();

  describe("select-core", () => {
                    it("inequality with different ivars", () => {
              const a = new Nodes.Ascending(users.get("name"));
              const b = new Nodes.Ascending(users.get("email"));
              expect((a.expr as Nodes.Attribute).name).not.toBe((b.expr as Nodes.Attribute).name);
            });

                    it("equality with same ivars", () => {
              const a = new Nodes.Ascending(users.get("name"));
              const b = new Nodes.Ascending(users.get("name"));
              expect(a.direction).toBe(b.direction);
            });

            it.todo("clone", () => {});

            it.todo("set quantifier", () => {});
  });
});

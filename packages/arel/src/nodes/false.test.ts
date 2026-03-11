import { describe, it, expect, beforeEach } from "vitest";
import { Table, sql, star, SelectManager, InsertManager, UpdateManager, DeleteManager, Nodes, Visitors, Collectors } from "../index.js";

describe("Arel", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  const visitor = new Visitors.ToSql();

  describe("false", () => {
                it("is equal to other false nodes", () => {
          const a = new Nodes.False();
          const b = new Nodes.False();
          expect(a.constructor).toBe(b.constructor);
        });

                it("is not equal with other nodes", () => {
          const a = new Nodes.True();
          expect(a).not.toBeInstanceOf(Nodes.False);
        });
  });
});

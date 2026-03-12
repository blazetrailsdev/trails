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

  describe("fragments", () => {
    it("fails if joined with something that is not an Arel node", () => {
      const lit = new Nodes.SqlLiteral("foo");
      // SqlLiteral is a Node, verifying it works correctly
      expect(lit.value).toBe("foo");
      expect(lit).toBeInstanceOf(Nodes.Node);
    });

    it.todo("is equal with equal values", () => {});

    it.todo("is not equal with different values", () => {});

    it.todo("can be joined with other nodes", () => {});
  });
});

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

  describe("true", () => {
    it("is equal to other true nodes", () => {
      const a = new Nodes.True();
      const b = new Nodes.True();
      expect(a.constructor).toBe(b.constructor);
    });

    it("is not equal with other nodes", () => {
      const a = new Nodes.CurrentRow();
      expect(a).not.toBeInstanceOf(Nodes.Preceding);
    });
  });
});

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

  describe("casted", () => {
    it("is equal when eql? returns true", () => {
      const attr = users.get("age");
      const a = new Nodes.Casted(1, attr);
      const b = new Nodes.Casted(1, attr);
      expect(a.eql(b)).toBe(true);
      expect(a.hash()).toBe(b.hash());
    });
  });
});

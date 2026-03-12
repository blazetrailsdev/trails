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

  describe("binary", () => {
    it("generates a hash based on its value", () => {
      const a = new Nodes.Equality(users.get("id"), new Nodes.Quoted(1));
      const b = new Nodes.Equality(users.get("id"), new Nodes.Quoted(2));
      expect(a.hash()).not.toBe(b.hash());
    });

    it("generates a hash specific to its class", () => {
      const a = new Nodes.Equality(users.get("id"), new Nodes.Quoted(1));
      const b = new Nodes.NotEqual(users.get("id"), new Nodes.Quoted(1));
      expect(a.hash()).not.toBe(b.hash());
    });
  });
});

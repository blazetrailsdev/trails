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

  describe("or", () => {
    it("makes an OR node", () => {
      const a = users.get("id").eq(1);
      const b = users.get("id").eq(2);
      const or = new Nodes.Or(a, b);
      expect(or).toBeInstanceOf(Nodes.Or);
      expect(or.left).toBe(a);
      expect(or.right).toBe(b);
    });

    it("is equal with equal ivars", () => {
      const s1 = new Nodes.NamedFunction("SUM", [users.get("id")]);
      const s2 = new Nodes.NamedFunction("SUM", [users.get("id")]);
      expect(s1.name).toBe(s2.name);
    });

    it("is not equal with different ivars", () => {
      const s1 = new Nodes.InsertStatement();
      const s2 = new Nodes.InsertStatement();
      s2.relation = users;
      expect(s1.relation).not.toBe(s2.relation);
    });
  });
});

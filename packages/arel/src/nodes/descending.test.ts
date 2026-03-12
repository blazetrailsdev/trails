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

  describe("descending", () => {
    it("construct", () => {
      const desc = new Nodes.Descending(users.get("name"));
      expect(desc).toBeInstanceOf(Nodes.Descending);
      expect(desc.expr).toBeInstanceOf(Nodes.Attribute);
    });

    it("reverse", () => {
      const desc = new Nodes.Descending(users.get("name"));
      const reversed = desc.reverse();
      expect(reversed).toBeInstanceOf(Nodes.Ascending);
    });

    it("direction", () => {
      const desc = new Nodes.Descending(users.get("name"));
      expect(desc.direction).toBe("desc");
    });

    it("ascending?", () => {
      const desc = new Nodes.Descending(users.get("name"));
      expect(desc.isAscending()).toBe(false);
    });

    it("descending?", () => {
      const desc = new Nodes.Descending(users.get("name"));
      expect(desc.isDescending()).toBe(true);
    });

    it("equality with same ivars", () => {
      const a = new Nodes.Descending(users.get("name"));
      const b = new Nodes.Descending(users.get("name"));
      expect(a.direction).toBe(b.direction);
    });

    it("inequality with different ivars", () => {
      const a = new Nodes.Descending(users.get("name"));
      const b = new Nodes.Descending(users.get("email"));
      expect((a.expr as Nodes.Attribute).name).not.toBe((b.expr as Nodes.Attribute).name);
    });
  });
});

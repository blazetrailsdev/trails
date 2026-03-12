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

  describe("bin", () => {
    it("new", () => {
      const node = new Nodes.Bin("zomg");
      expect(node).toBeInstanceOf(Nodes.Bin);
    });

    it("equality with same ivars", () => {
      const a = new Nodes.Bin("zomg");
      const b = new Nodes.Bin("zomg");
      expect(a).toEqual(b);
    });

    it("inequality with different ivars", () => {
      const a = new Nodes.Bin("zomg");
      const b = new Nodes.Bin("zomg!");
      expect(a).not.toEqual(b);
    });

    it.todo("default to sql", () => {});
    it.todo("mysql to sql", () => {});
  });
});

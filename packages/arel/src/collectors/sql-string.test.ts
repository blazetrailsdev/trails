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

  describe("sql-string", () => {
    it("returned sql uses utf8 encoding", () => {
      const collector = new Collectors.SQLString();
      collector.append("SELECT");
      const result = collector.value;
      expect(typeof result).toBe("string");
    });

    it.todo("compile", () => {});
  });
});

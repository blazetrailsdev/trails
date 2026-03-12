import { describe, it, expect, beforeEach } from "vitest";
import { Table, sql, star, SelectManager, InsertManager, UpdateManager, DeleteManager, Nodes, Visitors, Collectors } from "../index.js";

describe("Arel", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  const visitor = new Visitors.ToSql();

  describe("binary", () => {
            it.todo("generates a hash based on its value", () => {});

            it.todo("generates a hash specific to its class", () => {});
  });
});

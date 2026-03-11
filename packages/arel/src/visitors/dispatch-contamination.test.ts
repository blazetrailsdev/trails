import { describe, it, expect, beforeEach } from "vitest";
import { Table, sql, star, SelectManager, InsertManager, UpdateManager, DeleteManager, Nodes, Visitors, Collectors } from "../index.js";

describe("Arel", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  const visitor = new Visitors.ToSql();

  describe("dispatch-contamination", () => {
            it.todo("dispatches properly after failing upwards", () => {});

            it.todo("is threadsafe when implementing superclass fallback", () => {});
  });
});

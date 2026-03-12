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
} from "./index.js";

describe("Arel", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  const visitor = new Visitors.ToSql();

  describe("crud", () => {
    it.todo("should call insert on the connection", () => {});

    it.todo("should call update on the connection", () => {});

    it.todo("should call delete on the connection", () => {});
  });
});

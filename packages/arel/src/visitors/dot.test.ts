import { describe, it, expect, beforeEach } from "vitest";
import { Table, sql, star, SelectManager, InsertManager, UpdateManager, DeleteManager, Nodes, Visitors, Collectors } from "../index.js";

describe("Arel", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  const visitor = new Visitors.ToSql();

  describe("dot", () => {
            it.todo("named function", () => {});

            it.todo("Arel Nodes BindParam", () => {});

            it.todo("ActiveModel Attribute", () => {});

            it.todo("Arel Nodes CurrentRow", () => {});

            it.todo("Arel Nodes Distinct", () => {});

            it.todo("Arel Nodes Case and friends", () => {});

            it.todo("Arel Nodes InfixOperation", () => {});

            it.todo("Arel Nodes RegExp", () => {});

            it.todo("Arel Nodes NotRegExp", () => {});

            it.todo("Arel Nodes UnaryOperation", () => {});

            it.todo("Arel Nodes With", () => {});

            it.todo("Arel Nodes SelectCore", () => {});

            it.todo("Arel Nodes SelectStatement", () => {});

            it.todo("Arel Nodes InsertStatement", () => {});

            it.todo("Arel Nodes UpdateStatement", () => {});

            it.todo("Arel Nodes DeleteStatement", () => {});
  });
});

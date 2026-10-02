import { describe, it, expect } from "vitest";
import { Table, Nodes } from "@blazetrails/arel";
import { Hash } from "@blazetrails/ruby-compat";
import { WhereClause } from "./where-clause.js";
import "../index.js";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
import { Topic } from "../test-helpers/models/topic.js";

registerModel(Topic);

function table(): Table {
  return new Table("table");
}

describe("WhereClause String predicates (trails)", () => {
  it("wraps a String predicate in a Grouping around a SqlLiteral", () => {
    const ast = new WhereClause(["id = 1"]).ast;
    expect(ast).toBeInstanceOf(Nodes.Grouping);
    expect((ast as Nodes.Grouping).expr).toBeInstanceOf(Nodes.SqlLiteral);
  });

  it("inverts a String predicate into NOT of its SqlLiteral", () => {
    const inverted = new WhereClause(["id = 1"]).invert().predicates;
    expect(inverted).toHaveLength(1);
    const node = inverted[0] as Nodes.Not;
    expect(node).toBeInstanceOf(Nodes.Not);
    expect(node.expr).toBeInstanceOf(Nodes.SqlLiteral);
  });

  it("inverts a SqlLiteral predicate as a String, into NOT of a new SqlLiteral", () => {
    const literal = new Nodes.SqlLiteral("id = 1", { retryable: true });
    const node = new WhereClause([literal]).invert().predicates[0] as Nodes.Not;
    expect(node).toBeInstanceOf(Nodes.Not);
    expect(node.expr).toBeInstanceOf(Nodes.SqlLiteral);
    expect(node.expr).not.toBe(literal);
    expect((node.expr as Nodes.SqlLiteral).retryable).toBe(false);
  });

  it("compares a String predicate equal to a SqlLiteral carrying the same SQL", () => {
    const asString = new WhereClause(["id = 1"]);
    const asLiteral = new WhereClause([new Nodes.SqlLiteral("id = 1")]);
    expect(asString.equals(asLiteral)).toBe(true);
    expect(asString.minus(asLiteral).isEmpty()).toBe(true);
    expect(asString.union(asLiteral).predicates).toHaveLength(1);
  });

  it("does not treat a String predicate as an equality node", () => {
    const clause = new WhereClause([table().get("id").eq(1), "id = 1"]);
    expect(Object.keys(clause.toH())).toEqual(["id"]);
  });
});

describe("where / having with a SqlLiteral (trails)", () => {
  const { topics } = fixtures(["topics"]);

  it("binds the rest arguments of a SqlLiteral statement, as it does for a String", async () => {
    const first = topics("first");
    const literal = new Nodes.SqlLiteral("id = ?");
    const rel = Topic.where(literal, first.id);
    expect(rel.toSql()).not.toContain("?");
    expect((await rel).map((t) => t.id)).toEqual([first.id]);
    expect(Topic.all().where(literal, first.id).toSql()).toBe(rel.toSql());
  });

  it("binds the named arguments of a SqlLiteral statement", async () => {
    const first = topics("first");
    const rel = Topic.where(new Nodes.SqlLiteral("id = :id"), { id: first.id });
    expect((await rel).map((t) => t.id)).toEqual([first.id]);
  });

  it("wraps a bindless SqlLiteral in a new, non-retryable SqlLiteral", () => {
    const literal = new Nodes.SqlLiteral("id = 1", { retryable: true });
    const [predicate] = Topic.where(literal).whereClause.predicates;
    expect(predicate).toBeInstanceOf(Nodes.SqlLiteral);
    expect(predicate).not.toBe(literal);
    expect((predicate as Nodes.SqlLiteral).retryable).toBe(false);
  });

  it("binds the rest arguments of a SqlLiteral having statement", () => {
    const literal = new Nodes.SqlLiteral("count(*) > ?");
    const sql = Topic.group("author_name").having(literal, 1).toSql();
    expect(sql).not.toContain("?");
    expect(sql).toBe(Topic.group("author_name").having("count(*) > ?", 1).toSql());
    expect(Topic.having(literal, 1).toSql()).toBe(Topic.having("count(*) > ?", 1).toSql());
  });

  it("to_h reads the name and table off each equality's left, as Rails does", () => {
    const users = new Table("users");
    const clause = new WhereClause([users.get("id").eq(1), table().get("name").eq("bob")]);
    expect(Object.keys(clause.toH())).toEqual(["id", "name"]);
    expect(Object.keys(clause.toH("users"))).toEqual(["id"]);
    expect(clause.toH("missing")).toEqual({});
    const literal = new WhereClause([new Table(new Nodes.SqlLiteral("users")).get("id").eq(1)]);
    expect(Object.keys(literal.toH("users"))).toEqual(["id"]);
  });

  it("keys referenced_columns by the attribute itself, one entry per attribute", () => {
    const predicate = table().get("id").eq(2);
    const clause = new WhereClause([table().get("id").eq(1), predicate]);
    const columns = (
      clause as unknown as { referencedColumns(): Hash<unknown, unknown> }
    ).referencedColumns();
    expect(columns).toBeInstanceOf(Hash);
    expect(columns.size).toBe(1);
    expect(columns.get(table().get("id"))).toBe(predicate);
  });
});

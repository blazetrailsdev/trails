import { describe, it, expect } from "vitest";
import { Table, Visitors, Nodes } from "@blazetrails/arel";
import { PredicateBuilder } from "./predicate-builder.js";
import { Range } from "../connection-adapters/postgresql/oid/range.js";

describe("PredicateBuilderTest", () => {
  it.skip("registering new handlers", () => {});
  it.skip("registering new handlers for association", () => {});
  it.skip("registering new handlers for joins", () => {});
  it.skip("references with schema", () => {});
  it.skip("build from hash with schema", () => {});
  it.skip("does not mutate", () => {});

  describe("buildFromHash", () => {
    const table = new Table("posts");
    const compile = (node: Nodes.Node) => new Visitors.ToSql().compile(node);

    it("builds equality for scalars", () => {
      const builder = new PredicateBuilder(table);
      const [node] = builder.buildFromHash({ title: "hello" });
      expect(compile(node)).toContain('"posts"."title"');
      expect(compile(node)).toContain("'hello'");
    });

    it("builds IS NULL for null values", () => {
      const builder = new PredicateBuilder(table);
      const [node] = builder.buildFromHash({ title: null });
      expect(compile(node)).toMatch(/IS NULL/);
    });

    it("builds IN for arrays", () => {
      const builder = new PredicateBuilder(table);
      const [node] = builder.buildFromHash({ id: [1, 2, 3] });
      expect(compile(node)).toMatch(/IN \(1, 2, 3\)/);
    });

    it("builds BETWEEN for ranges", () => {
      const builder = new PredicateBuilder(table);
      const [node] = builder.buildFromHash({ age: new Range(18, 65) });
      expect(compile(node)).toMatch(/BETWEEN 18 AND 65/);
    });

    it("handles exclusive ranges", () => {
      const builder = new PredicateBuilder(table);
      const [node] = builder.buildFromHash({ age: new Range(18, 65, true) });
      const sql = compile(node);
      expect(sql).toMatch(/>= 18/);
      expect(sql).toMatch(/< 65/);
    });
  });

  describe("buildNegatedFromHash", () => {
    const table = new Table("posts");
    const compile = (node: Nodes.Node) => new Visitors.ToSql().compile(node);

    it("builds IS NOT NULL for null values", () => {
      const builder = new PredicateBuilder(table);
      const [node] = builder.buildNegatedFromHash({ title: null });
      expect(compile(node)).toMatch(/IS NOT NULL/);
    });

    it("builds NOT IN for arrays", () => {
      const builder = new PredicateBuilder(table);
      const [node] = builder.buildNegatedFromHash({ id: [1, 2, 3] });
      expect(compile(node)).toMatch(/NOT IN \(1, 2, 3\)/);
    });

    it("builds correct negation for exclusive ranges", () => {
      const builder = new PredicateBuilder(table);
      const [node] = builder.buildNegatedFromHash({ age: new Range(18, 65, true) });
      const sql = compile(node);
      expect(sql).toMatch(/< 18/);
      expect(sql).toMatch(/>= 65/);
    });
  });

  describe("association expansion", () => {
    const table = new Table("posts");
    const compile = (node: Nodes.Node) => new Visitors.ToSql().compile(node);

    it("expands belongsTo association to foreign key", () => {
      const builder = new PredicateBuilder(table);
      builder.setAssociationMap(new Map([["author", { foreignKey: "author_id" }]]));
      const fakeAuthor = { id: 42, constructor: { name: "Author" } };
      const [node] = builder.buildFromHash({ author: fakeAuthor });
      const sql = compile(node);
      expect(sql).toContain('"posts"."author_id"');
      expect(sql).toContain("42");
    });

    it("expands null association to IS NULL on foreign key", () => {
      const builder = new PredicateBuilder(table);
      builder.setAssociationMap(new Map([["author", { foreignKey: "author_id" }]]));
      const [node] = builder.buildFromHash({ author: null });
      const sql = compile(node);
      expect(sql).toContain('"posts"."author_id"');
      expect(sql).toMatch(/IS NULL/);
    });

    it("expands scalar id through association mapping", () => {
      const builder = new PredicateBuilder(table);
      builder.setAssociationMap(new Map([["author", { foreignKey: "author_id" }]]));
      const [node] = builder.buildFromHash({ author: 7 });
      const sql = compile(node);
      expect(sql).toContain('"posts"."author_id"');
      expect(sql).toContain("7");
    });
  });
});

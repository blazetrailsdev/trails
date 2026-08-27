import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testConnection } from "@blazetrails/arel/src/test-helpers/connection.js";
import { Table, Visitors, Nodes, Collectors } from "@blazetrails/arel";
import { PredicateBuilder } from "./predicate-builder.js";
import { WhereClause } from "./where-clause.js";
import { Substitute } from "../statement-cache.js";
import { Range } from "../connection-adapters/postgresql/oid/range.js";
import { TableMetadata } from "../table-metadata.js";
import { Base, registerModel, modelRegistry } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Topic } from "../test-helpers/models/topic.js";
import { Reply } from "../test-helpers/models/reply.js";
import { Author } from "../test-helpers/models/author.js";
import { quoteTableName, escapeRegExp } from "../support/quote-regex.js";
import { ValueType } from "@blazetrails/activemodel";

function compileWithBinds(visitor: Visitors.ToSql, node: unknown): [string, unknown[]] {
  const collector = new Collectors.Composite(new Collectors.SQLString(), new Collectors.Bind());
  return visitor.compile(node as never, collector) as [string, unknown[]];
}

const VALUE_TYPE = new ValueType();
const fakePgCaster = {
  typeForAttribute: () => VALUE_TYPE,
  typeCastForDatabase: (_attrName: string, value: unknown) => VALUE_TYPE.serialize(value),
};
const castedTable = (name: string): Table => new Table(name, { typeCaster: fakePgCaster });

describe("PredicateBuilderTest", () => {
  class RegexFilter {
    constructor(public source: string) {}
  }
  const regexpHandler = {
    call: (attr: any, val: RegexFilter) =>
      new Nodes.InfixOperation("~", attr, new Nodes.Quoted(val.source)),
  };

  fixtures(["topics", "posts", "authors", "products"]);

  beforeAll(() => {
    registerModel("Topic", Topic);
    registerModel("Reply", Reply);
  });

  afterAll(() => {
    modelRegistry.delete("Topic");
    modelRegistry.delete("Reply");
  });

  it("registering new handlers", () => {
    Topic.predicateBuilder.registerHandler(RegexFilter, regexpHandler);
    try {
      const sql = Topic.where({ title: new RegexFilter("rails") }).toSql();
      expect(sql).toMatch(
        new RegExp(`${escapeRegExp(quoteTableName("topics.title"))} ~ 'rails'`, "i"),
      );
    } finally {
      (Topic as any)._predicateBuilder = null;
    }
  });

  it("registering new handlers for association", () => {
    Topic.predicateBuilder.registerHandler(RegexFilter, regexpHandler);
    try {
      const sql = Reply.joins(":topic")
        .where({ topics: { title: new RegexFilter("rails") } })
        .toSql();
      expect(sql).toMatch(
        new RegExp(`${escapeRegExp(quoteTableName("topics.title"))} ~ 'rails'`, "i"),
      );
    } finally {
      (Topic as any)._predicateBuilder = null;
    }
  });

  it("registering new handlers for joins", () => {
    class RegexpReply extends Reply {
      static {
        this.belongsTo(
          "regexp_topic",
          (rel: any) => rel.where({ title: new RegexFilter("rails") }),
          {
            className: "Topic",
            foreignKey: "parent_id",
          },
        );
      }
    }
    registerModel("RegexpReply", RegexpReply);
    Topic.predicateBuilder.registerHandler(RegexFilter, regexpHandler);
    try {
      const sql = RegexpReply.joins(":regexp_topic")
        .references(new Nodes.SqlLiteral("regexp_topic") as any)
        .toSql();
      expect(sql).toMatch(
        new RegExp(`${escapeRegExp(quoteTableName("regexp_topic.title"))} ~ 'rails'`, "i"),
      );
    } finally {
      modelRegistry.delete("RegexpReply");
      (Topic as any)._predicateBuilder = null;
    }
  });

  it("references with schema", () => {
    const refs = PredicateBuilder.references(["schema.table.column"]);
    expect(refs.map((r) => r.value)).toEqual(["schema.table"]);
  });

  it("build from hash with schema", () => {
    const [node] = Topic.predicateBuilder.buildFromHash({
      "schema.table.column": "value",
    });
    const sql = new Visitors.ToSql(testConnection).compile(node);
    expect(sql).toMatch(/schema.+table.+column/i);
  });

  it("does not mutate", () => {
    const defaults: Record<string, unknown> = {
      topics: { title: "rails" },
      "topics.approved": true,
    };
    const original = { topics: { title: "rails" }, "topics.approved": true };
    Topic.where(defaults).toSql();
    expect(defaults).toEqual(original);
  });

  describe("buildFromHash", () => {
    const table = castedTable("posts");
    const compile = (node: Nodes.Node) => new Visitors.ToSql(testConnection).compile(node);

    it("builds equality for scalars", () => {
      const builder = new PredicateBuilder(new TableMetadata(null, table));
      const [node] = builder.buildFromHash({ title: "hello" });
      expect(compile(node)).toContain('"posts"."title"');
      expect(compile(node)).toContain("= ?");
    });

    it("builds IS NULL for null values", () => {
      const builder = new PredicateBuilder(new TableMetadata(null, table));
      const [node] = builder.buildFromHash({ title: null });
      expect(compile(node)).toMatch(/IS NULL/);
    });

    it("builds IN for arrays", () => {
      const builder = new PredicateBuilder(new TableMetadata(null, table));
      const [node] = builder.buildFromHash({ id: [1, 2, 3] });
      expect(compile(node)).toMatch(/IN \(\?, \?, \?\)/);
    });

    it("builds IN for Set values (mirrors Rails registering Set => ArrayHandler)", () => {
      const builder = new PredicateBuilder(new TableMetadata(null, table));
      const [node] = builder.buildFromHash({ id: new Set([1, 2, 3]) });
      expect(compile(node)).toMatch(/IN \(\?, \?, \?\)/);
    });

    it("builds IN for Set values when a custom handler is also registered", () => {
      const builder = new PredicateBuilder(new TableMetadata(null, table));
      builder.registerHandler(Date, {
        call: (attr, _v) => attr.eq(0),
      });
      const [node] = builder.buildFromHash({ id: new Set([4, 5]) });
      expect(compile(node)).toMatch(/IN \(\?, \?\)/);
    });

    it("builds BETWEEN for ranges", () => {
      const builder = new PredicateBuilder(new TableMetadata(null, table));
      const [node] = builder.buildFromHash({ age: new Range(18, 65) });
      const [sql, binds] = compileWithBinds(new Visitors.ToSql(testConnection), node);
      expect(sql).toMatch(/BETWEEN \? AND \?/);
      expect(binds.map((b) => (b as { value: unknown }).value)).toEqual([18, 65]);
    });

    it("does not dereference a plain object literal to its id", () => {
      const builder = new PredicateBuilder(new TableMetadata(null, table));
      const node = builder.build(table.get("title"), { id: 5 });
      const [sql, binds] = compileWithBinds(new Visitors.ToSql(testConnection), node);
      expect(sql).toContain('"posts"."title" = ?');
      expect((binds[0] as { value: unknown }).value).toEqual({ id: 5 });
    });

    it("does not dereference a plain object literal inside an array", () => {
      const builder = new PredicateBuilder(new TableMetadata(null, table));
      const node = builder.build(table.get("title"), [{ id: 5 }]);
      const [, binds] = compileWithBinds(new Visitors.ToSql(testConnection), node);
      expect((binds[0] as { value: unknown }).value).toEqual({ id: 5 });
    });

    it("does not dereference a non-Base object carrying an id inside an array", () => {
      class NotARecord {
        constructor(public id: number) {}
      }
      const builder = new PredicateBuilder(new TableMetadata(null, table));
      const node = builder.build(table.get("id"), [new NotARecord(5), new NotARecord(7)]);
      const sql = new Visitors.ToSql(testConnection).compile(node);
      expect(sql).not.toMatch(/IN \(5, 7\)/);
    });

    it("handles exclusive ranges", () => {
      const builder = new PredicateBuilder(new TableMetadata(null, table));
      const [node] = builder.buildFromHash({ age: new Range(18, 65, true) });
      const [sql, binds] = compileWithBinds(new Visitors.ToSql(testConnection), node);
      expect(sql).toMatch(/>= \?/);
      expect(sql).toMatch(/< \?/);
      expect(binds.map((b) => (b as { value: unknown }).value)).toEqual([18, 65]);
    });

    it("forces equality for a force-equality type instead of dispatching to a handler", () => {
      const forceEqType = {
        isForceEquality: (v: unknown) => Array.isArray(v),
        cast: (v: unknown) => v,
        serialize: (v: unknown) => v,
      };
      const feTable = new Table("posts", { typeCaster: { typeForAttribute: () => forceEqType } });
      const builder = new PredicateBuilder(new TableMetadata(null, feTable));
      const node = builder.build(feTable.get("tags"), [1, 2]);
      const [sql, binds] = compileWithBinds(new Visitors.ToSql(testConnection), node);
      expect(sql).toContain('"posts"."tags" = ?');
      expect(sql).not.toMatch(/IN \(/);
      expect(binds).toHaveLength(1);
      expect((binds[0] as { value: unknown }).value).toEqual([1, 2]);
    });
  });

  describe("buildNegatedFromHash", () => {
    const table = castedTable("posts");
    const compile = (node: Nodes.Node) => new Visitors.ToSql(testConnection).compile(node);
    const buildInverted = (builder: PredicateBuilder, hash: Record<string, unknown>) =>
      new WhereClause(builder.buildFromHash(hash)).invert().predicates as Nodes.Node[];

    it("builds IS NOT NULL for null values", () => {
      const builder = new PredicateBuilder(new TableMetadata(null, table));
      const [node] = buildInverted(builder, { title: null });
      expect(compile(node)).toMatch(/IS NOT NULL/);
    });

    it("builds NOT IN for arrays", () => {
      const builder = new PredicateBuilder(new TableMetadata(null, table));
      const [node] = buildInverted(builder, { id: [1, 2, 3] });
      expect(compile(node)).toMatch(/NOT IN \(\?, \?, \?\)/);
    });

    it("builds NOT IN for Set values in negated predicates", () => {
      const builder = new PredicateBuilder(new TableMetadata(null, table));
      const [node] = buildInverted(builder, { id: new Set([1, 2]) });
      expect(compile(node)).toMatch(/NOT IN \(\?, \?\)/);
    });

    it("builds correct negation for exclusive ranges", () => {
      const builder = new PredicateBuilder(new TableMetadata(null, table));
      const [node] = buildInverted(builder, { age: new Range(18, 65, true) });
      const [sql, binds] = compileWithBinds(new Visitors.ToSql(testConnection), node);
      expect(sql).toMatch(/^NOT \(/);
      expect(sql).toMatch(/>= \?/);
      expect(sql).toMatch(/< \?/);
      expect(binds.map((b) => (b as { value: unknown }).value)).toEqual([18, 65]);
    });

    it("does not dereference a plain object literal to its id when negated", () => {
      const builder = new PredicateBuilder(new TableMetadata(null, table));
      const node = builder.build(table.get("title"), { id: 5 }).invert();
      const sql = new Visitors.ToSql(testConnection).compile(node);
      expect(sql).toContain('"posts"."title" !=');
      const bound = (node as unknown as { right: { value: unknown } }).right.value;
      expect(bound).toEqual({ id: 5 });
    });

    it("does not dereference non-Base objects carrying an id inside a negated array", () => {
      class NotARecord {
        constructor(public id: number) {}
      }
      const builder = new PredicateBuilder(new TableMetadata(null, table));
      const [node] = buildInverted(builder, {
        id: [new NotARecord(5), new NotARecord(7)],
      });
      const sql = new Visitors.ToSql(testConnection).compile(node);
      expect(sql).not.toMatch(/NOT IN \(5, 7\)/);
    });
  });

  describe("QueryAttribute bind handling", () => {
    it("buildBindAttribute creates a QueryAttribute", () => {
      const table = castedTable("users");
      const builder = new PredicateBuilder(new TableMetadata(null, table));
      const qa = builder.buildBindAttribute("name", "alice");
      expect(qa.name).toBe("name");
      expect(qa.value).toBe("alice");
    });

    it("BasicObjectHandler routes through buildBindAttribute", () => {
      const table = castedTable("users");
      const builder = new PredicateBuilder(new TableMetadata(null, table));
      const node = builder.build(table.get("name"), "alice");
      const visitor = new Visitors.ToSql(testConnection);
      const [sql, binds] = compileWithBinds(visitor, node);
      expect(sql).toContain('"users"."name" = ?');
      expect(binds).toHaveLength(1);
    });

    it("Substitute flows through as BindParam via QueryAttribute", () => {
      const table = castedTable("users");
      const builder = new PredicateBuilder(new TableMetadata(null, table));
      const node = builder.build(table.get("name"), new Substitute());
      const visitor = new Visitors.ToSql(testConnection);
      const [sql, binds] = compileWithBinds(visitor, node);
      expect(sql).toContain('"users"."name" = ?');
      expect(binds).toHaveLength(1);
      expect((binds[0] as any).valueBeforeTypeCast).toBeInstanceOf(Substitute);
    });

    it("compile inlines QueryAttribute values for display SQL", () => {
      const table = castedTable("users");
      const builder = new PredicateBuilder(new TableMetadata(null, table));
      const node = builder.build(table.get("name"), "alice");
      const visitor = new Visitors.ToSql(testConnection);
      expect(visitor.compile(node)).toBe('"users"."name" = ?');
      const [, binds] = compileWithBinds(visitor, node);
      expect(binds).toHaveLength(1);
    });
  });

  describe("nested table-keyed hash expansion", () => {
    class PbTestPost extends Base {
      static {
        this.tableName = "posts";
        this.belongsTo("author");
        this.belongsTo("writer", { className: "Author" });
      }
    }

    beforeAll(() => {
      registerModel("Author", Author);
      registerModel("Post", PbTestPost);
    });

    afterAll(() => {
      modelRegistry.delete("Author");
      modelRegistry.delete("Post");
    });

    it("expands where({authors: {name: 'Rails'}}) to \"authors\".\"name\" = 'Rails'", () => {
      const meta = new TableMetadata(PbTestPost as any, (PbTestPost as any).arelTable);
      const builder = meta.predicateBuilder;
      const nodes = builder.buildFromHash({ authors: { name: "Rails" } });
      const sql = nodes.map((n) => new Visitors.ToSql(testConnection).compile(n)).join(" AND ");
      expect(sql).toContain('"authors"."name"');
      expect(sql).toContain("= ?");
      expect(sql).not.toContain('"posts"."authors"');
    });

    it("aliases a nested hash keyed by an association name that differs from the table to the association key", () => {
      const meta = new TableMetadata(PbTestPost as any, (PbTestPost as any).arelTable);
      const builder = meta.predicateBuilder;
      const nodes = builder.buildFromHash({ writer: { name: "Rails" } });
      const sql = nodes.map((n) => new Visitors.ToSql(testConnection).compile(n)).join(" AND ");
      expect(sql).toContain('"writer"."name"');
      expect(sql).toContain("= ?");
    });

    it("negated form expands whereNot({authors: {name: 'Rails'}}) to NOT \"authors\".\"name\" = 'Rails'", () => {
      const meta = new TableMetadata(PbTestPost as any, (PbTestPost as any).arelTable);
      const builder = meta.predicateBuilder;
      const nodes = new WhereClause(builder.buildFromHash({ authors: { name: "Rails" } })).invert()
        .predicates as Nodes.Node[];
      const sql = nodes.map((n) => new Visitors.ToSql(testConnection).compile(n)).join(" AND ");
      expect(sql).toContain('"authors"."name"');
      const bound = (nodes[0] as unknown as { right: { value: unknown } }).right.value;
      expect(bound).toBe("Rails");
      expect(sql).not.toContain('"posts"."authors"');
      expect(sql).toMatch(/NOT\b|!=|<>/);
    });

    it("does not expand when key is a known column on the current table (mirrors Rails !table.has_column? guard)", () => {
      class PbTestProduct extends Base {
        static {
          this.tableName = "products";
          registerModel("PbTestProduct", this);
        }
      }
      try {
        const meta = new TableMetadata(PbTestProduct as any, (PbTestProduct as any).arelTable);
        const builder = meta.predicateBuilder;
        const nodes = builder.buildFromHash({ price: { foo: "bar" } });
        const sql = nodes.map((n) => new Visitors.ToSql(testConnection).compile(n)).join(" AND ");
        expect(sql).toContain('"products"."price"');
        expect(sql).not.toContain('"price"."foo"');
      } finally {
        modelRegistry.delete("PbTestProduct");
      }
    });
  });
});

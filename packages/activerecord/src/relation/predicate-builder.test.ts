import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Table, Visitors, Nodes } from "@blazetrails/arel";
import { PredicateBuilder } from "./predicate-builder.js";
import { Substitute } from "../statement-cache.js";
import { Range } from "../connection-adapters/postgresql/oid/range.js";
import { TableMetadata } from "../table-metadata.js";
import { Base, registerModel, modelRegistry } from "../index.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { Topic } from "../test-helpers/models/topic.js";
import { Reply } from "../test-helpers/models/reply.js";
import { Author } from "../test-helpers/models/author.js";
import { quoteTableName, escapeRegExp } from "../test-helpers/quote-regex.js";
import { ValueType } from "@blazetrails/activemodel";

// Same shape as Rails' `fake_pg_caster` (homogeneous_in_test.rb:44-50) — a map
// converting any attribute name to a caster — because `Table#type_for_attribute`
// delegates bare (table.rb:106-108) and these tables are not canonical models
// (`users` is in neither Rails' schema.rb nor TEST_SCHEMA). It yields `ValueType`
// where Rails' yields `String`: Rails' Arel tests assert SQL shape only, whereas
// these assert bound *values*, so they need the no-op type Rails reaches for as
// `ActiveModel::Type.default_value`. A real column type would cast `{ id: 5 }` to
// `"[object Object]"` and defeat the dereference assertions below.
// Both members: #4888 converged `Table#typeCastForDatabase` to bare delegation
// too, and a range bound reaches it through `Casted`. Mirrors TypeCaster::Map /
// ::Connection, whose `type_cast_for_database` is `type_for_attribute(n).serialize(v)`
// (type_caster/map.rb:15-17).
const VALUE_TYPE = new ValueType();
const fakePgCaster = {
  typeForAttribute: () => VALUE_TYPE,
  typeCastForDatabase: (_attrName: string, value: unknown) => VALUE_TYPE.serialize(value),
};
const castedTable = (name: string): Table => new Table(name, { typeCaster: fakePgCaster });

describe("PredicateBuilderTest", () => {
  // Rails setup: Topic.predicate_builder.register_handler(Regexp, proc { |col, val| col ~ val.source })
  // Teardown: Topic.class_eval { @predicate_builder = nil }
  // We use a local RegexFilter class instead of Regexp to keep the test
  // self-contained — trails has no Regexp predicate-builder coercion.
  class RegexFilter {
    constructor(public source: string) {}
  }
  const regexpHandler = {
    call: (attr: any, val: RegexFilter) =>
      new Nodes.InfixOperation("~", attr, new Nodes.Quoted(val.source)),
  };

  // Rails declares no fixtures here; we still ride the canonical tables so the
  // models' schema is warmed for the synchronous `toSql()` assertions below.
  fixtures(["topics", "posts", "authors", "products"]);

  beforeAll(() => {
    // Reply.belongs_to(:topic) and the nested {topics: …} key both resolve
    // "Topic" through the registry — Rails has these globally available.
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
      const sql = Reply.joins("topic")
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
    // Rails: Reply.belongs_to :regexp_topic, -> { where(title: /rails/) },
    //   class_name: "Topic", foreign_key: "parent_id"
    // then Reply.joins(:regexp_topic).references(Arel.sql("regexp_topic")).to_sql
    // aliases the joined `topics` table to the association name `regexp_topic`.
    // We add the association on a throwaway Reply subclass rather than mutating
    // the canonical Reply (Rails leaks the association; we keep it scoped).
    class RegexpReply extends Reply {
      static {
        this.belongsTo("regexp_topic", {
          className: "Topic",
          foreignKey: "parent_id",
          scope: (rel: any) => rel.where({ title: new RegexFilter("rails") }),
        });
      }
    }
    registerModel("RegexpReply", RegexpReply);
    Topic.predicateBuilder.registerHandler(RegexFilter, regexpHandler);
    try {
      const sql = RegexpReply.joins("regexp_topic")
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
    // Rails: PredicateBuilder.references(%w{schema.table.column}) => ["schema.table"]
    const refs = PredicateBuilder.references(["schema.table.column"]);
    expect(refs.map((r) => r.value)).toEqual(["schema.table"]);
  });

  it("build from hash with schema", () => {
    // Rails: Topic.predicate_builder.build_from_hash("schema.table.column" => "value").first.to_sql
    // convert_dot_notation_to_hash splits on rindex("."):
    //   "schema.table.column" → { "schema.table" => { "column" => "value" } }
    // TableMetadata.associated_table("schema.table") falls back to a bare
    // Arel::Table("schema.table"), so expand_from_hash produces:
    //   "schema.table"."column" = 'value'
    // Topic.predicateBuilder is TableMetadata-backed (like Rails), so the
    // associated_table fallback expansion happens without a hand-built PB.
    const [node] = Topic.predicateBuilder.buildFromHash({
      "schema.table.column": "value",
    });
    const sql = new Visitors.ToSql().compile(node);
    // Arel resolves "schema.table" as schema.table identifier, producing:
    // "schema"."table"."column" = ?  (the value is a BindParam, not inlined —
    // Rails parity, see Arel BindParam#toSql).
    expect(sql).toMatch(/"schema"\."table"\."column"/);
    expect(sql).toContain("= ?");
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
    const compile = (node: Nodes.Node) => new Visitors.ToSql().compile(node);

    it("builds equality for scalars", () => {
      const builder = new PredicateBuilder(table);
      const [node] = builder.buildFromHash({ title: "hello" });
      expect(compile(node)).toContain('"posts"."title"');
      // Value is a BindParam → rendered as `?`, not inlined (Rails parity).
      expect(compile(node)).toContain("= ?");
    });

    it("builds IS NULL for null values", () => {
      const builder = new PredicateBuilder(table);
      const [node] = builder.buildFromHash({ title: null });
      expect(compile(node)).toMatch(/IS NULL/);
    });

    it("builds IN for arrays", () => {
      const builder = new PredicateBuilder(table);
      const [node] = builder.buildFromHash({ id: [1, 2, 3] });
      expect(compile(node)).toMatch(/IN \(\?, \?, \?\)/);
    });

    it("builds IN for Set values (mirrors Rails registering Set => ArrayHandler)", () => {
      const builder = new PredicateBuilder(table);
      const [node] = builder.buildFromHash({ id: new Set([1, 2, 3]) });
      expect(compile(node)).toMatch(/IN \(\?, \?, \?\)/);
    });

    it("builds IN for Set values when a custom handler is also registered", () => {
      const builder = new PredicateBuilder(table);
      builder.registerHandler(Date, {
        call: (attr, _v) => attr.eq(0),
      });
      const [node] = builder.buildFromHash({ id: new Set([4, 5]) });
      expect(compile(node)).toMatch(/IN \(\?, \?\)/);
    });

    it("builds BETWEEN for ranges", () => {
      const builder = new PredicateBuilder(table);
      const [node] = builder.buildFromHash({ age: new Range(18, 65) });
      expect(compile(node)).toMatch(/BETWEEN 18 AND 65/);
    });

    // No verbatim Rails test exists for the plain-object-not-a-record case (it is
    // an unusual call shape not exercised by Rails' ported predicate_builder tests).
    // These regressions pin the convergence: in Ruby a bare Hash does not
    // `respond_to?(:id)` (Object#id was removed in 1.9), so `where(col: { id: 5 })`
    // routes the Hash to a handler rather than dereferencing it to `5`.
    it("does not dereference a plain object literal to its id", () => {
      const builder = new PredicateBuilder(table);
      const node = builder.build(table.get("title"), { id: 5 });
      const [sql, binds] = new Visitors.ToSql().compileWithBinds(node);
      expect(sql).toContain('"posts"."title" = ?');
      // The whole object is bound, not the dereferenced `5`.
      expect((binds[0] as { value: unknown }).value).toEqual({ id: 5 });
    });

    it("does not dereference a plain object literal inside an array", () => {
      const builder = new PredicateBuilder(table);
      const node = builder.build(table.get("title"), [{ id: 5 }]);
      const [, binds] = new Visitors.ToSql().compileWithBinds(node);
      expect((binds[0] as { value: unknown }).value).toEqual({ id: 5 });
    });

    // No verbatim Rails test exists for this shape either: Ruby's ArrayHandler
    // derefs only `x.is_a?(Base)`, so a non-Base class instance carrying an
    // `id` is left intact. This pins that convergence — a class instance that
    // is not an AR record must NOT be flattened to its `id` inside an array.
    it("does not dereference a non-Base object carrying an id inside an array", () => {
      class NotARecord {
        constructor(public id: number) {}
      }
      const builder = new PredicateBuilder(table);
      const node = builder.build(table.get("id"), [new NotARecord(5), new NotARecord(7)]);
      const sql = new Visitors.ToSql().compile(node);
      // The objects flow into HomogeneousIn untouched — they are NOT flattened
      // to `IN (5, 7)` the way a real AR record would be.
      expect(sql).not.toMatch(/IN \(5, 7\)/);
    });

    it("handles exclusive ranges", () => {
      const builder = new PredicateBuilder(table);
      const [node] = builder.buildFromHash({ age: new Range(18, 65, true) });
      const sql = compile(node);
      expect(sql).toMatch(/>= 18/);
      expect(sql).toMatch(/< 65/);
    });

    // No verbatim Rails test for this in isolation: it pins the trails
    // convergence for Rails' uniform `force_equality?` dispatch at the top of
    // `PredicateBuilder#build` (predicate_builder.rb:57-69). When the column
    // type reports `force_equality?(value)` — as OID::Array does for an Array —
    // the value is bound as a single equality (`col = ?`) BEFORE any handler
    // dispatch, so an array never reaches ArrayHandler → `IN (...)`. This is the
    // PG-array case (`where(arrayCol: [1, 2])` → `arr = '{1,2}'`) at unit level.
    it("forces equality for a force-equality type instead of dispatching to a handler", () => {
      const builder = new PredicateBuilder(table);
      const forceEqType = {
        isForceEquality: (v: unknown) => Array.isArray(v),
        cast: (v: unknown) => v,
        serialize: (v: unknown) => v,
      };
      (builder as any)._tableContext = { typeForAttribute: () => forceEqType };
      const node = builder.build(table.get("tags"), [1, 2]);
      const [sql, binds] = new Visitors.ToSql().compileWithBinds(node);
      // Single equality bind, NOT `IN (?, ?)`.
      expect(sql).toContain('"posts"."tags" = ?');
      expect(sql).not.toMatch(/IN \(/);
      expect(binds).toHaveLength(1);
      expect((binds[0] as { value: unknown }).value).toEqual([1, 2]);
    });
  });

  describe("buildNegatedFromHash", () => {
    const table = castedTable("posts");
    const compile = (node: Nodes.Node) => new Visitors.ToSql().compile(node);

    it("builds IS NOT NULL for null values", () => {
      const builder = new PredicateBuilder(table);
      const [node] = builder.buildNegatedFromHash({ title: null });
      expect(compile(node)).toMatch(/IS NOT NULL/);
    });

    it("builds NOT IN for arrays", () => {
      const builder = new PredicateBuilder(table);
      const [node] = builder.buildNegatedFromHash({ id: [1, 2, 3] });
      expect(compile(node)).toMatch(/NOT IN \(\?, \?, \?\)/);
    });

    it("builds NOT IN for Set values in negated predicates", () => {
      const builder = new PredicateBuilder(table);
      const [node] = builder.buildNegatedFromHash({ id: new Set([1, 2]) });
      expect(compile(node)).toMatch(/NOT IN \(\?, \?\)/);
    });

    it("builds correct negation for exclusive ranges", () => {
      const builder = new PredicateBuilder(table);
      const [node] = builder.buildNegatedFromHash({ age: new Range(18, 65, true) });
      const sql = compile(node);
      expect(sql).toMatch(/< 18/);
      expect(sql).toMatch(/>= 65/);
    });

    it("does not dereference a plain object literal to its id when negated", () => {
      const builder = new PredicateBuilder(table);
      const node = builder.buildNegated(table.get("title"), { id: 5 });
      const sql = new Visitors.ToSql().compile(node);
      // Negation binds the RHS (Rails inverts a positively-built, bound
      // predicate), so the value rides a QueryAttribute bind rather than being
      // inlined.
      expect(sql).toContain('"posts"."title" !=');
      // The whole object is bound, not the dereferenced `5`.
      const bound = (node as unknown as { right: { value: { value: unknown } } }).right.value.value;
      expect(bound).toEqual({ id: 5 });
    });

    // Mirror of the positive ArrayHandler convergence on the negated per-element
    // path: non-Base objects carrying an `id` are not collapsed into a
    // `NOT IN (5, 7)` PK list the way real AR records would be.
    it("does not dereference non-Base objects carrying an id inside a negated array", () => {
      class NotARecord {
        constructor(public id: number) {}
      }
      const builder = new PredicateBuilder(table);
      const [node] = builder.buildNegatedFromHash({
        id: [new NotARecord(5), new NotARecord(7)],
      });
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).not.toMatch(/NOT IN \(5, 7\)/);
    });
  });

  describe("QueryAttribute bind handling", () => {
    it("buildBindAttribute creates a QueryAttribute", () => {
      const table = castedTable("users");
      const builder = new PredicateBuilder(table);
      const qa = builder.buildBindAttribute("name", "alice");
      expect(qa.name).toBe("name");
      expect(qa.value).toBe("alice");
    });

    it("BasicObjectHandler routes through buildBindAttribute", () => {
      const table = castedTable("users");
      const builder = new PredicateBuilder(table);
      const node = builder.build(table.get("name"), "alice");
      const visitor = new Visitors.ToSql();
      const [sql, binds] = visitor.compileWithBinds(node);
      expect(sql).toContain('"users"."name" = ?');
      expect(binds).toHaveLength(1);
    });

    it("Substitute flows through as BindParam via QueryAttribute", () => {
      const table = castedTable("users");
      const builder = new PredicateBuilder(table);
      const node = builder.build(table.get("name"), new Substitute());
      const visitor = new Visitors.ToSql();
      const [sql, binds] = visitor.compileWithBinds(node);
      expect(sql).toContain('"users"."name" = ?');
      expect(binds).toHaveLength(1);
      // The bind is the raw QueryAttribute wrapping the Substitute —
      // compileWithBinds preserves bind objects for BindMap indexing
      expect((binds[0] as any).valueBeforeTypeCast).toBeInstanceOf(Substitute);
    });

    it("compile inlines QueryAttribute values for display SQL", () => {
      const table = castedTable("users");
      const builder = new PredicateBuilder(table);
      const node = builder.build(table.get("name"), "alice");
      const visitor = new Visitors.ToSql();
      // The value is wrapped in a BindParam, so raw Arel compile emits `?`
      // (mirrors Rails); the value is carried as a bind, not inlined.
      expect(visitor.compile(node)).toBe('"users"."name" = ?');
      const [, binds] = visitor.compileWithBinds(node);
      expect(binds).toHaveLength(1);
    });
  });

  describe("nested table-keyed hash expansion", () => {
    // Mirror of Post.belongs_to(:author) plus a deliberately-renamed
    // belongs_to(:writer, class_name: "Author") to exercise the
    // associated_table aliasing path. Both ride the canonical posts/authors
    // tables. The canonical Post has no `writer` association, so we build a
    // throwaway model carrying both.
    class PbTestPost extends Base {
      static {
        this.tableName = "posts";
        this.belongsTo("author");
        // Association name (writer) deliberately differs from the table (authors).
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
      const sql = nodes.map((n) => new Visitors.ToSql().compile(n)).join(" AND ");
      expect(sql).toContain('"authors"."name"');
      expect(sql).toContain("= ?");
      expect(sql).not.toContain('"posts"."authors"');
    });

    it("aliases a nested hash keyed by an association name that differs from the table to the association key", () => {
      // Rails table_metadata.rb associated_table aliases the resolved table to
      // the hash key whenever the names differ, so an association key that
      // differs from its table (writer -> authors) emits "writer"."name".
      const meta = new TableMetadata(PbTestPost as any, (PbTestPost as any).arelTable);
      const builder = meta.predicateBuilder;
      const nodes = builder.buildFromHash({ writer: { name: "Rails" } });
      const sql = nodes.map((n) => new Visitors.ToSql().compile(n)).join(" AND ");
      expect(sql).toContain('"writer"."name"');
      expect(sql).toContain("= ?");
    });

    it("negated form expands whereNot({authors: {name: 'Rails'}}) to NOT \"authors\".\"name\" = 'Rails'", () => {
      const meta = new TableMetadata(PbTestPost as any, (PbTestPost as any).arelTable);
      const builder = meta.predicateBuilder;
      const nodes = builder.buildNegatedFromHash({ authors: { name: "Rails" } });
      const sql = nodes.map((n) => new Visitors.ToSql().compile(n)).join(" AND ");
      expect(sql).toContain('"authors"."name"');
      // Negation binds the RHS, so 'Rails' rides a QueryAttribute bind.
      const bound = (nodes[0] as unknown as { right: { value: { value: unknown } } }).right.value
        .value;
      expect(bound).toBe("Rails");
      expect(sql).not.toContain('"posts"."authors"');
      expect(sql).toMatch(/NOT\b|!=|<>/);
    });

    it("does not expand when key is a known column on the current table (mirrors Rails !table.has_column? guard)", () => {
      // products.price is a real canonical column, so a nested hash keyed by it
      // must NOT be treated as an association — it stays an equality on the
      // current table.
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
        const sql = nodes.map((n) => new Visitors.ToSql().compile(n)).join(" AND ");
        expect(sql).toContain('"products"."price"');
        expect(sql).not.toContain('"price"."foo"');
      } finally {
        modelRegistry.delete("PbTestProduct");
      }
    });
  });
});

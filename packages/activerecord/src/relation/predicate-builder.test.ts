import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { Table, Visitors, Nodes } from "@blazetrails/arel";
import { PredicateBuilder } from "./predicate-builder.js";
import { Substitute } from "../statement-cache.js";
import { Range } from "../connection-adapters/postgresql/oid/range.js";
import { TableMetadata } from "../table-metadata.js";
import { Base, registerModel, modelRegistry } from "../index.js";
import { createTestAdapter, type TestDatabaseAdapter } from "../test-adapter.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { withTransactionalFixtures } from "../test-helpers/with-transactional-fixtures.js";
import { dropAllTables } from "../test-helpers/drop-all-tables.js";

describe("PredicateBuilderTest", () => {
  // Rails setup: Topic.predicate_builder.register_handler(Regexp, proc { |col, val| col ~ val.source })
  // Teardown: Topic.class_eval { @predicate_builder = nil }
  // We use a local custom class instead of Regexp to keep the test self-contained.

  let adapter: TestDatabaseAdapter;

  beforeAll(async () => {
    adapter = createTestAdapter();
    await defineSchema(adapter, {
      topics: { title: "string" },
      replies: { parent_id: "integer" },
      products: { metadata: "string" },
      authors: { name: "string" },
      posts: { author_id: "integer", title: "string" },
    });
  });
  withTransactionalFixtures(() => adapter);

  afterAll(async () => {
    await dropAllTables(adapter);
  });

  it("registering new handlers", () => {
    class PbTopic extends Base {
      static {
        this.tableName = "topics";
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class RegexFilter {
      constructor(public source: string) {}
    }
    PbTopic.predicateBuilder.registerHandler(RegexFilter, {
      call: (attr, val: RegexFilter) =>
        new Nodes.InfixOperation("~", attr, new Nodes.Quoted(val.source)),
    });
    try {
      const sql = PbTopic.where({ title: new RegexFilter("rails") }).toSql();
      expect(sql).toMatch(/"topics"."title" ~ 'rails'/i);
    } finally {
      (PbTopic as any)._predicateBuilder = null;
    }
  });

  it("registering new handlers for association", () => {
    class PbTopic2 extends Base {
      static {
        this.tableName = "topics";
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class PbReply2 extends Base {
      static {
        this.tableName = "replies";
        this.attribute("parent_id", "integer");
        this.belongsTo("pbTopic2");
        this.adapter = adapter;
      }
    }
    registerModel("PbTopic2", PbTopic2);
    registerModel("PbReply2", PbReply2);
    class RegexFilter2 {
      constructor(public source: string) {}
    }
    PbTopic2.predicateBuilder.registerHandler(RegexFilter2, {
      call: (attr, val: RegexFilter2) =>
        new Nodes.InfixOperation("~", attr, new Nodes.Quoted(val.source)),
    });
    try {
      const sql = PbReply2.where({ pbTopic2: { title: new RegexFilter2("rails") } }).toSql();
      // Handler propagates to associated table — column uses association-resolved table name.
      expect(sql).toMatch(/"pbTopic2"."title" ~ 'rails'/i);
    } finally {
      modelRegistry.delete("PbTopic2");
      modelRegistry.delete("PbReply2");
      (PbTopic2 as any)._predicateBuilder = null;
    }
  });

  it.skip("registering new handlers for joins", () => {
    // BLOCKED: relation — requires scoped belongs_to (lambda scope) evaluated against association's
    // predicate builder; our scoped-association where-clause expansion doesn't yet propagate
    // the custom handlers registered on the target model into the scope lambda context.
  });

  it("references with schema", () => {
    // Rails: PredicateBuilder.references(%w{schema.table.column}) => ["schema.table"]
    const refs = PredicateBuilder.references(["schema.table.column"]);
    expect(refs.map((r) => r.value)).toEqual(["schema.table"]);
  });

  it("build from hash with schema", () => {
    // Rails: predicate_builder.build_from_hash("schema.table.column" => "value").first.to_sql
    // convert_dot_notation_to_hash splits on rindex("."):
    //   "schema.table.column" → { "schema.table" => { "column" => "value" } }
    // TableMetadata.associated_table("schema.table") falls back to a bare Arel::Table("schema.table"),
    // so expand_from_hash produces: "schema.table"."column" = 'value'
    class PbSchemaModel extends Base {
      static {
        this.tableName = "topics";
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    // Use TableMetadata-backed PB to enable associated_table fallback expansion,
    // matching Rails' Topic.predicate_builder which is always backed by TableMetadata.
    const [node] = new TableMetadata(
      PbSchemaModel as any,
      PbSchemaModel.arelTable,
    ).predicateBuilder.buildFromHash({ "schema.table.column": "value" });
    const sql = new Visitors.ToSql().compile(node);
    // Arel resolves "schema.table" as schema.table identifier, producing:
    // "schema"."table"."column" = 'value'
    expect(sql).toMatch(/"schema"\."table"\."column"/);
    expect(sql).toContain("value");
  });

  it("does not mutate", () => {
    class PbTopic3 extends Base {
      static {
        this.tableName = "topics";
        this.attribute("title", "string");
        this.attribute("approved", "boolean");
        this.adapter = adapter;
      }
    }
    const defaults: Record<string, unknown> = { title: "rails", approved: true };
    const original = { ...defaults };
    PbTopic3.where(defaults).toSql();
    expect(defaults).toEqual(original);
  });

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

    it("builds IN for Set values (mirrors Rails registering Set => ArrayHandler)", () => {
      const builder = new PredicateBuilder(table);
      const [node] = builder.buildFromHash({ id: new Set([1, 2, 3]) });
      expect(compile(node)).toMatch(/IN \(1, 2, 3\)/);
    });

    it("builds IN for Set values when a custom handler is also registered", () => {
      const builder = new PredicateBuilder(table);
      builder.registerHandler(Date, {
        call: (attr, _v) => attr.eq(0),
      });
      const [node] = builder.buildFromHash({ id: new Set([4, 5]) });
      expect(compile(node)).toMatch(/IN \(4, 5\)/);
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

    it("builds NOT IN for Set values in negated predicates", () => {
      const builder = new PredicateBuilder(table);
      const [node] = builder.buildNegatedFromHash({ id: new Set([1, 2]) });
      expect(compile(node)).toMatch(/NOT IN \(1, 2\)/);
    });

    it("builds correct negation for exclusive ranges", () => {
      const builder = new PredicateBuilder(table);
      const [node] = builder.buildNegatedFromHash({ age: new Range(18, 65, true) });
      const sql = compile(node);
      expect(sql).toMatch(/< 18/);
      expect(sql).toMatch(/>= 65/);
    });
  });

  describe("QueryAttribute bind handling", () => {
    it("buildBindAttribute creates a QueryAttribute", () => {
      const table = new Table("users");
      const builder = new PredicateBuilder(table);
      const qa = builder.buildBindAttribute("name", "alice");
      expect(qa.name).toBe("name");
      expect(qa.value).toBe("alice");
    });

    it("BasicObjectHandler routes through buildBindAttribute", () => {
      const table = new Table("users");
      const builder = new PredicateBuilder(table);
      const node = builder.build(table.get("name"), "alice");
      const visitor = new Visitors.ToSql();
      const [sql, binds] = visitor.compileWithBinds(node);
      expect(sql).toContain('"users"."name" = ?');
      expect(binds).toHaveLength(1);
    });

    it("Substitute flows through as BindParam via QueryAttribute", () => {
      const table = new Table("users");
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
      const table = new Table("users");
      const builder = new PredicateBuilder(table);
      const node = builder.build(table.get("name"), "alice");
      const visitor = new Visitors.ToSql();
      const sql = visitor.compile(node);
      expect(sql).toContain('"users"."name"');
      expect(sql).toContain("alice");
    });
  });

  describe("nested table-keyed hash expansion", () => {
    class PbTestAuthor extends Base {
      static {
        this.tableName = "authors";
      }
    }
    class PbTestPost extends Base {
      static {
        this.tableName = "posts";
        this.belongsTo("author");
      }
    }

    beforeEach(() => {
      PbTestAuthor.adapter = adapter;
      PbTestPost.adapter = adapter;
      registerModel("Author", PbTestAuthor);
      registerModel("Post", PbTestPost);
    });

    afterAll(() => {
      modelRegistry.delete("Author");
      modelRegistry.delete("Post");
    });

    it("expands where({authors: {name: 'Rails'}}) to \"authors\".\"name\" = 'Rails'", () => {
      const meta = new TableMetadata(PbTestPost as any, new Table("posts"));
      const builder = meta.predicateBuilder;
      const nodes = builder.buildFromHash({ authors: { name: "Rails" } });
      const sql = nodes.map((n) => new Visitors.ToSql().compile(n)).join(" AND ");
      expect(sql).toContain('"authors"."name"');
      expect(sql).toContain("Rails");
      expect(sql).not.toContain('"posts"."authors"');
    });

    it("negated form expands whereNot({authors: {name: 'Rails'}}) to NOT \"authors\".\"name\" = 'Rails'", () => {
      const meta = new TableMetadata(PbTestPost as any, new Table("posts"));
      const builder = meta.predicateBuilder;
      const nodes = builder.buildNegatedFromHash({ authors: { name: "Rails" } });
      const sql = nodes.map((n) => new Visitors.ToSql().compile(n)).join(" AND ");
      expect(sql).toContain('"authors"."name"');
      expect(sql).toContain("Rails");
      expect(sql).not.toContain('"posts"."authors"');
      expect(sql).toMatch(/NOT\b|!=|<>/);
    });

    it("does not expand when key is a known column on the current table (mirrors Rails !table.has_column? guard)", () => {
      class PbTestProduct extends Base {
        static {
          this.tableName = "products";
          this.attribute("metadata", "string");
          this.adapter = adapter;
          registerModel("PbTestProduct", this);
        }
      }
      try {
        const meta = new TableMetadata(PbTestProduct as any, new Table("products"));
        const builder = meta.predicateBuilder;
        const nodes = builder.buildFromHash({ metadata: { foo: "bar" } });
        const sql = nodes.map((n) => new Visitors.ToSql().compile(n)).join(" AND ");
        expect(sql).toContain('"products"."metadata"');
        expect(sql).not.toContain('"metadata"."foo"');
      } finally {
        modelRegistry.delete("PbTestProduct");
      }
    });
  });
});

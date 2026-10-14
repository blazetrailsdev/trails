import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testConnection } from "@blazetrails/arel/src/test-helpers/connection.js";
import { IntegerType, ValueType } from "@blazetrails/activemodel";
import { Nodes, Table, Visitors, Collectors, type ArelNode } from "@blazetrails/arel";
import { fixtures } from "../test-helpers/use-fixtures.js";
import { Company, Firm } from "../test-helpers/models/company.js";
import { Author } from "../test-helpers/models/author.js";
import { PriceEstimate } from "../test-helpers/models/price-estimate.js";
import {
  CpkBook,
  CpkChapter,
  CpkOrderWithSingularBookChapters,
} from "../test-helpers/models/cpk.js";
import { registerModel } from "../associations.js";
import { Base } from "../index.js";
import { quoteColumnName } from "../support/quote-regex.js";
import {
  Range,
  regexpEscape,
  registeredConstant,
  unregisterConstant,
} from "@blazetrails/ruby-compat";
import { PredicateBuilder } from "./predicate-builder.js";
import { TableMetadata } from "../table-metadata.js";
import { WhereClause } from "./where-clause.js";
import { Substitute } from "../statement-cache.js";

function compileWithBinds(visitor: Visitors.ToSql, node: unknown): [string, unknown[]] {
  const collector = new Collectors.Composite(new Collectors.SQLString(), new Collectors.Bind());
  return visitor.compile(node as never, collector) as [string, unknown[]];
}

describe("Base.predicateBuilder STI memoization", () => {
  it("does not leak the parent's builder to an STI subclass", () => {
    const companyPb = Company.predicateBuilder;
    const firmPb = Firm.predicateBuilder;
    expect(firmPb).not.toBe(companyPb);
    expect(Company.predicateBuilder).toBe(companyPb);
    expect(Firm.predicateBuilder).toBe(firmPb);
  });
});

describe("PredicateBuilder positive-equality bind typing", () => {
  const int8 = new IntegerType({ limit: 8 });
  const OUT_OF_RANGE = 2n ** 63n;

  const buildJoinedEquality = (value: unknown) => {
    const joined = new Table("authors", { typeCaster: { typeForAttribute: () => int8 } });
    const builder = new PredicateBuilder(new TableMetadata(null, joined));
    return builder.build(joined.get("id"), value);
  };

  it("collapses a joined out-of-range equality to 1=0", () => {
    const sql = new Visitors.ToSql(testConnection).compile(buildJoinedEquality(OUT_OF_RANGE));
    expect(sql).toBe("1=0");
  });

  it("leaves an in-range joined equality as a bound predicate", () => {
    const [sql, binds] = compileWithBinds(
      new Visitors.ToSql(testConnection),
      buildJoinedEquality(7n),
    );
    expect(sql).not.toContain("1=0");
    expect(binds).toHaveLength(1);
  });
});

describe("PredicateBuilder nested-hash recursion skips dot re-normalization", () => {
  const { self } = fixtures(["authors", "posts", "comments"]);

  it("treats a dotted key inside a nested hash as a literal column on the associated table", () => {
    const sql = Author.where({ posts: { "comments.body": "hi" } }).toSql();
    expect(sql).toMatch(
      new RegExp(
        `${regexpEscape(self().quoteTableName("posts"))}\\.${regexpEscape(quoteColumnName("comments.body"))}`,
      ),
    );
    expect(sql).not.toContain(self().quoteTableName("comments.body"));
  });
});

type HasWhereClause = { whereClause: { predicates: Nodes.Node[] } };

describe("association hash expansion grouping shape", () => {
  const { self, treasures, cars, comments } = fixtures([
    "authors",
    "authorAddresses",
    "posts",
    "comments",
    "treasures",
    "cars",
    "priceEstimates",
  ]);

  it("multi-type polymorphic value emits OR of AND-reduced groups in one Grouping", () => {
    const rel = PriceEstimate.where({
      estimateOf: [treasures("diamond"), cars("honda")],
    }) as unknown as HasWhereClause;
    const preds = rel.whereClause.predicates;
    expect(preds).toHaveLength(1);
    expect(preds[0]).toBeInstanceOf(Nodes.Grouping);
    const or = (preds[0] as Nodes.Grouping).expr as Nodes.Or;
    expect(or).toBeInstanceOf(Nodes.Or);
    expect(or.children).toHaveLength(2);
    for (const child of or.children) expect(child).toBeInstanceOf(Nodes.And);
  });

  beforeAll(() => {
    [CpkOrderWithSingularBookChapters, CpkBook, CpkChapter].forEach((m) =>
      registerModel(m as unknown as typeof Base),
    );
  });

  it("through-association composite primary key routes tuples like Rails' array-key branch", () => {
    const rel = CpkOrderWithSingularBookChapters.where({
      chapters: [[1, 2]],
    }) as unknown as HasWhereClause;
    const preds = rel.whereClause.predicates;
    expect(preds).toHaveLength(2);
    for (const pred of preds) expect(pred).not.toBeInstanceOf(Nodes.Grouping);

    const multi = CpkOrderWithSingularBookChapters.where({
      chapters: [
        [1, 2],
        [3, 4],
      ],
    }) as unknown as HasWhereClause;
    const multiPreds = multi.whereClause.predicates;
    expect(multiPreds).toHaveLength(1);
    expect(multiPreds[0]).toBeInstanceOf(Nodes.Grouping);
    const or = (multiPreds[0] as Nodes.Grouping).expr as Nodes.Or;
    expect(or).toBeInstanceOf(Nodes.Or);
    expect(or.children).toHaveLength(2);
  });

  it("through-association composite primary key raises on a non-tuple value", () => {
    expect(() => CpkOrderWithSingularBookChapters.where({ chapters: [1, 2] })).toThrow(
      'Expected corresponding value for ["author_id", "id"] to be an Array',
    );
    expect(() => CpkOrderWithSingularBookChapters.where({ chapters: null })).not.toThrow();
  });

  it("association arm reads a Map attributes hash, whose Array key cannot be a plain object", () => {
    const rel = Author.where(
      new Map<unknown, unknown>([
        [["id", "name"], [[1, "David"]]],
        ["comments", comments("greetings")],
      ]),
    ) as unknown as HasWhereClause;
    const preds = rel.whereClause.predicates;
    expect(preds).toHaveLength(3);
    const sql = (rel as unknown as { toSql(): string }).toSql();
    expect(sql).toContain(`${self().quoteTableName("comments")}.${quoteColumnName("id")}`);
    expect(sql).toContain(`${self().quoteTableName("authors")}.${quoteColumnName("name")}`);
  });

  it("through-association single query group stays flat, without an And wrapper", () => {
    const rel = Author.where({ comments: comments("greetings") }) as unknown as HasWhereClause;
    const preds = rel.whereClause.predicates;
    expect(preds).toHaveLength(1);
    expect(preds[0]).not.toBeInstanceOf(Nodes.And);
    expect(preds[0]).not.toBeInstanceOf(Nodes.Grouping);
  });
});

const VALUE_TYPE = new ValueType();
const fakePgCaster = {
  typeForAttribute: () => VALUE_TYPE,
  typeCastForDatabase: (_attrName: string, value: unknown) => VALUE_TYPE.serialize(value),
};
const castedTable = (name: string): Table => new Table(name, { typeCaster: fakePgCaster });

describe("PredicateBuilder hash building and bind handling", () => {
  fixtures(["topics", "posts", "authors", "products"]);

  describe("buildFromHash", () => {
    const table = castedTable("posts");
    const compile = (node: ArelNode) => new Visitors.ToSql(testConnection).compile(node);

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
      expect(binds.map((b) => (b as { value(): unknown }).value())).toEqual([18, 65]);
    });

    it("does not dereference a plain object literal to its id", () => {
      const builder = new PredicateBuilder(new TableMetadata(null, table));
      const node = builder.build(table.get("title"), { id: 5 });
      const [sql, binds] = compileWithBinds(new Visitors.ToSql(testConnection), node);
      expect(sql).toContain('"posts"."title" = ?');
      expect((binds[0] as { value(): unknown }).value()).toEqual({ id: 5 });
    });

    it("does not dereference a plain object literal inside an array", () => {
      const builder = new PredicateBuilder(new TableMetadata(null, table));
      const node = builder.build(table.get("title"), [{ id: 5 }]);
      const [, binds] = compileWithBinds(new Visitors.ToSql(testConnection), node);
      expect((binds[0] as { value(): unknown }).value()).toEqual({ id: 5 });
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
      expect(binds.map((b) => (b as { value(): unknown }).value())).toEqual([18, 65]);
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
      expect((binds[0] as { value(): unknown }).value()).toEqual([1, 2]);
    });
  });

  describe("buildNegatedFromHash", () => {
    const table = castedTable("posts");
    const compile = (node: ArelNode) => new Visitors.ToSql(testConnection).compile(node);
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
      expect(binds.map((b) => (b as { value(): unknown }).value())).toEqual([18, 65]);
    });

    it("does not dereference a plain object literal to its id when negated", () => {
      const builder = new PredicateBuilder(new TableMetadata(null, table));
      const node = builder.build(table.get("title"), { id: 5 }).invert();
      const sql = new Visitors.ToSql(testConnection).compile(node);
      expect(sql).toContain('"posts"."title" !=');
      const bound = (node as unknown as { right: { value(): unknown } }).right.value();
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
      expect(qa.value()).toBe("alice");
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
      expect((binds[0] as { valueBeforeTypeCast: unknown }).valueBeforeTypeCast).toBeInstanceOf(
        Substitute,
      );
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
      unregisterConstant("Author", registeredConstant("Author"));
      unregisterConstant("Post", registeredConstant("Post"));
    });

    it("expands where({authors: {name: 'Rails'}}) to \"authors\".\"name\" = 'Rails'", () => {
      const meta = new TableMetadata(PbTestPost, PbTestPost.arelTable);
      const builder = meta.predicateBuilder;
      const nodes = builder.buildFromHash({ authors: { name: "Rails" } });
      const sql = nodes.map((n) => new Visitors.ToSql(testConnection).compile(n)).join(" AND ");
      expect(sql).toContain('"authors"."name"');
      expect(sql).toContain("= ?");
      expect(sql).not.toContain('"posts"."authors"');
    });

    it("aliases a nested hash keyed by an association name that differs from the table to the association key", () => {
      const meta = new TableMetadata(PbTestPost, PbTestPost.arelTable);
      const builder = meta.predicateBuilder;
      const nodes = builder.buildFromHash({ writer: { name: "Rails" } });
      const sql = nodes.map((n) => new Visitors.ToSql(testConnection).compile(n)).join(" AND ");
      expect(sql).toContain('"writer"."name"');
      expect(sql).toContain("= ?");
    });

    it("negated form expands whereNot({authors: {name: 'Rails'}}) to NOT \"authors\".\"name\" = 'Rails'", () => {
      const meta = new TableMetadata(PbTestPost, PbTestPost.arelTable);
      const builder = meta.predicateBuilder;
      const nodes = new WhereClause(builder.buildFromHash({ authors: { name: "Rails" } })).invert()
        .predicates as Nodes.Node[];
      const sql = nodes.map((n) => new Visitors.ToSql(testConnection).compile(n)).join(" AND ");
      expect(sql).toContain('"authors"."name"');
      const bound = (nodes[0] as unknown as { right: { value(): unknown } }).right.value();
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
        const meta = new TableMetadata(PbTestProduct, PbTestProduct.arelTable);
        const builder = meta.predicateBuilder;
        const nodes = builder.buildFromHash({ price: { foo: "bar" } });
        const sql = nodes.map((n) => new Visitors.ToSql(testConnection).compile(n)).join(" AND ");
        expect(sql).toContain('"products"."price"');
        expect(sql).not.toContain('"price"."foo"');
      } finally {
        unregisterConstant("PbTestProduct", registeredConstant("PbTestProduct"));
      }
    });
  });
});

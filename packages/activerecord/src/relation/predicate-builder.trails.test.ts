import { describe, it, expect, beforeAll } from "vitest";
import { testConnection } from "@blazetrails/arel/src/test-helpers/connection.js";
import { IntegerType } from "@blazetrails/activemodel";
import { Nodes, Table, Visitors, Collectors } from "@blazetrails/arel";
import { fixtures } from "../test-fixtures.js";
import { Company, Firm } from "../test-helpers/models/company.js";
import { Author } from "../test-helpers/models/author.js";
import { PriceEstimate } from "../test-helpers/models/price-estimate.js";
import {
  CpkBook,
  CpkChapter,
  CpkOrderWithSingularBookChapters,
} from "../test-helpers/models/cpk.js";
import { registerModel } from "../associations.js";
import type { Base } from "../index.js";
import { quoteTableName, quoteColumnName } from "../support/quote-regex.js";
import { regexpEscape } from "@blazetrails/ruby-compat";
import { PredicateBuilder } from "./predicate-builder.js";
import { TableMetadata } from "../table-metadata.js";

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
  fixtures(["authors", "posts", "comments"]);

  it("treats a dotted key inside a nested hash as a literal column on the associated table", () => {
    const sql = Author.where({ posts: { "comments.body": "hi" } }).toSql();
    expect(sql).toMatch(
      new RegExp(
        `${regexpEscape(quoteTableName("posts"))}\\.${regexpEscape(quoteColumnName("comments.body"))}`,
      ),
    );
    expect(sql).not.toContain(quoteTableName("comments.body"));
  });
});

type HasWhereClause = { whereClause: { predicates: Nodes.Node[] } };

describe("association hash expansion grouping shape", () => {
  const { treasures, cars, comments } = fixtures([
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

  it("through-association single query group stays flat, without an And wrapper", () => {
    const rel = Author.where({ comments: comments("greetings") }) as unknown as HasWhereClause;
    const preds = rel.whereClause.predicates;
    expect(preds).toHaveLength(1);
    expect(preds[0]).not.toBeInstanceOf(Nodes.And);
    expect(preds[0]).not.toBeInstanceOf(Nodes.Grouping);
  });
});

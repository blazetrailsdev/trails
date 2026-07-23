import { describe, it, expect } from "vitest";
import { testConnection } from "@blazetrails/arel/src/test-helpers/connection.js";
import { IntegerType } from "@blazetrails/activemodel";
import { Table, Visitors } from "@blazetrails/arel";
import { Company, Firm } from "../test-helpers/models/company.js";
import { Author } from "../test-helpers/models/author.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { escapeRegExp, quoteTableName, quoteColumnName } from "../test-helpers/quote-regex.js";
import { PredicateBuilder } from "./predicate-builder.js";
import { TableMetadata } from "../table-metadata.js";

// trails-specific regression guard (no Rails counterpart): Base.predicateBuilder
// is now TableMetadata-backed, and that metadata is bound to the class. The memo
// must be an OWN property so an STI subclass (same table_name) does not inherit
// the parent's builder via the prototype chain — that would resolve
// associations/aggregates against the parent klass. Rails avoids this
// structurally by resetting @predicate_builder in `inherited` (core.rb:422-425).
describe("Base.predicateBuilder STI memoization", () => {
  it("does not leak the parent's builder to an STI subclass", () => {
    // Warm the parent first: with a prototype-chain memo, this instance would
    // then be returned for the subclass too.
    const companyPb = Company.predicateBuilder;
    const firmPb = Firm.predicateBuilder;
    expect(firmPb).not.toBe(companyPb);
    // Idempotent per class.
    expect(Company.predicateBuilder).toBe(companyPb);
    expect(Firm.predicateBuilder).toBe(firmPb);
  });
});

// trails-specific regression guard (no Rails counterpart): pins the
// out-of-range collapse through the single-source type lookup. Rails re-roots
// the builder's `table` per association (`associated_table(key).predicate_builder`,
// predicate_builder.rb:96-98), so by the time `build` runs, a joined column's
// builder is rooted on the joined table and `table.type(attribute.name)`
// (predicate_builder.rb:57-69) is the one and only type source — mirror that
// shape here by rooting the builder on the joined table itself.
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
    const [sql, binds] = new Visitors.ToSql(testConnection).compileWithBinds(
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
        `${escapeRegExp(quoteTableName("posts"))}\\.${escapeRegExp(quoteColumnName("comments.body"))}`,
      ),
    );
    expect(sql).not.toContain(quoteTableName("comments.body"));
  });
});

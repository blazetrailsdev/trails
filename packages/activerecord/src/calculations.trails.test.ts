import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import type { JoinDependency } from "./associations/join-dependency.js";
import { lookupCastTypeFromJoinDependencies } from "./relation/calculations.js";
import { fixtures } from "./test-helpers/fixtures.js";
// Opt into the canonical-model autoload index so the `topics` association target
// (`Topic`) resolves by name on first reference — no manual `registerModel`.
import "./support/canonical-model-index.js";

// ==========================================================================
// lookupCastTypeFromJoinDependencies unit tests
//
// trails-specific invariant: lookupCastTypeFromJoinDependencies is an
// `@internal` helper with no Rails counterpart. These unit tests guard its
// behaviour and were relocated verbatim out of calculations.test.ts as part
// of the extra-test burndown (RFC 0043).
// ==========================================================================

describe("lookupCastTypeFromJoinDependencies", () => {
  it("returns cast type from a joined table's attributeTypes", () => {
    const intType = { cast: (v: unknown) => Number(v) };
    const fakeNode = { baseKlass: { attributeTypes: () => ({ credit_limit: intType }) } };
    const fakeJd = [fakeNode];
    const result = lookupCastTypeFromJoinDependencies(
      {} as Parameters<typeof lookupCastTypeFromJoinDependencies>[0],
      "credit_limit",
      [fakeJd] as unknown as JoinDependency[],
    );
    expect(result).toBe(intType);
  });

  it("returns null when name is not in any joined table", () => {
    const fakeNode = { baseKlass: { attributeTypes: () => ({ other: {} }) } };
    const result = lookupCastTypeFromJoinDependencies(
      {} as Parameters<typeof lookupCastTypeFromJoinDependencies>[0],
      "missing",
      [[fakeNode]] as unknown as JoinDependency[],
    );
    expect(result).toBeNull();
  });

  it("returns first match when multiple join deps are present", () => {
    const type1 = { cast: (v: unknown) => String(v) };
    const type2 = { cast: (v: unknown) => Number(v) };
    const node1 = { baseKlass: { attributeTypes: () => ({ name: type1 }) } };
    const node2 = { baseKlass: { attributeTypes: () => ({ name: type2 }) } };
    const result = lookupCastTypeFromJoinDependencies(
      {} as Parameters<typeof lookupCastTypeFromJoinDependencies>[0],
      "name",
      [[node1], [node2]] as unknown as JoinDependency[],
    );
    expect(result).toBe(type1);
  });

  it("supports attributeTypes as a plain object", () => {
    const strType = { cast: (v: unknown) => String(v) };
    const fakeNode = { baseKlass: { attributeTypes: { title: strType } } };
    const result = lookupCastTypeFromJoinDependencies(
      {} as Parameters<typeof lookupCastTypeFromJoinDependencies>[0],
      "title",
      [[fakeNode]] as unknown as JoinDependency[],
    );
    expect(result).toBe(strType);
  });

  it("supports attributeTypes as a Map", () => {
    const strType = { cast: (v: unknown) => String(v) };
    const fakeNode = { baseKlass: { attributeTypes: new Map([["title", strType]]) } };
    const result = lookupCastTypeFromJoinDependencies(
      {} as Parameters<typeof lookupCastTypeFromJoinDependencies>[0],
      "title",
      [[fakeNode]] as unknown as JoinDependency[],
    );
    expect(result).toBe(strType);
  });

  it("skips nodes without modelClass", () => {
    const type = { cast: (v: unknown) => v };
    const nodeMissing = { baseKlass: undefined };
    const nodeGood = { baseKlass: { attributeTypes: () => ({ val: type }) } };
    const result = lookupCastTypeFromJoinDependencies(
      {} as Parameters<typeof lookupCastTypeFromJoinDependencies>[0],
      "val",
      [[nodeMissing, nodeGood]] as unknown as JoinDependency[],
    );
    expect(result).toBe(type);
  });
});

// ==========================================================================
// lookupCastTypeFromJoinDependencies integration test
//
// trails-specific invariant (no Rails counterpart): an end-to-end check that
// joining a real model resolves a joined column's concrete cast type through
// the join-dependency walk — complementing the mock-based unit tests above.
// Relocated verbatim out of calculations.test.ts (RFC 0043).
// ==========================================================================

describe("lookupCastTypeFromJoinDependencies integration", () => {
  // Rails' Author `has_many :topics, primary_key: "name", foreign_key:
  // "author_name"`. Defined locally under a distinct class name (not the
  // canonical Author model) so importing it does not perturb the shared model
  // registry / name-disambiguation counter used by other describe blocks.
  class CalcAuthor extends Base {
    static {
      this._tableName = "authors";
      this.attribute("name", "string");
      this.hasMany("topics", {
        primaryKey: "name",
        foreignKey: "author_name",
        className: "Topic",
      });
    }
  }

  fixtures(["topics", "authors"]);

  // A plain `joins(:assoc)` now feeds buildJoinDependencies (via _namedInnerJoins),
  // so lookupCastTypeFromJoinDependencies recovers the joined column's cast type
  // through the join-dependency walk — no `_joinClauses`-klass fallback. Replaces
  // the unit tests that asserted the (removed) `_joinClauses.klass` recovery.
  it("resolves joined column cast type through the join-dependency walk", () => {
    const rel = CalcAuthor.joins("topics");
    // `written_on` is a datetime attribute that lives only on the joined Topic;
    // it resolves to Topic's Time cast type via the join-dependency walk (the
    // base CalcAuthor has no such attribute).
    const castType = lookupCastTypeFromJoinDependencies(
      rel as unknown as Parameters<typeof lookupCastTypeFromJoinDependencies>[0],
      "written_on",
    ) as {
      constructor: { name: string };
    } | null;
    expect(castType).toBeTruthy();
    // The joined Topic's concrete datetime type (e.g. SQLiteDateTimeType), not
    // the default ValueType the base CalcAuthor returns for unknown columns.
    expect(castType?.constructor.name).not.toBe("ValueType");
  });
});

// ==========================================================================
// Grouped-calculation key typing via an Arel attribute's type caster
//
// trails-specific regression (no verbatim Rails test): Rails resolves each
// group column's key type as `col_name.try(:type_caster) || type_for(col_name)`
// (calculations.rb:567-570), so grouping by an Arel attribute keys the result
// by the attribute's own decorated type — an enum keys by its labels, not the
// raw stored integers. Guards the `groupNode instanceof Nodes.Attribute`
// branch in groupedAggregate.
// ==========================================================================

describe("grouped calculation keyed via Arel attribute type caster", () => {
  fixtures(["books"]);

  it("keys an enum group given as an Arel attribute by its labels", async () => {
    const { Book } = await import("./test-helpers/models/book.js");
    const result = await Book.group(Book.arelTable.get("status")).count();
    expect(result).toEqual(
      new Map([
        ["proposed", 2],
        ["published", 2],
      ]),
    );
  });
});

// ==========================================================================
// Multi-field grouped-calculation key shape
//
// trails-specific regression (no verbatim Rails test asserts these two rules
// in isolation): Rails uniqs group_fields only when there is more than one
// (calculations.rb:516), and unwraps the key tuple to a scalar only when a
// single group field survives (calculations.rb:583-584). Guards against a
// regression to the old single-field collapse, where every non-association
// grouped calculation reduced to `_groupColumns[0]`.
// ==========================================================================

describe("multi-field grouped calculation key shape", () => {
  fixtures(["companies", "accounts"]);

  it("uniqs repeated group fields and keys by a scalar", async () => {
    const { Account } = await import("./test-helpers/models/account.js");
    const result = (await Account.group("firm_id", "firm_id").count()) as Map<unknown, number>;
    // Both fields collapse to one, so keys stay scalar rather than [n, n].
    expect([...result.keys()].every((k) => !Array.isArray(k))).toBe(true);
    expect(result.get(6)).toBe(2);
  });

  it("does not collapse distinct groups sharing their first field", async () => {
    const { Account } = await import("./test-helpers/models/account.js");
    const single = (await Account.group("firm_id").count()) as Map<unknown, number>;
    const multi = (await Account.group("firm_id", "credit_limit").count()) as Map<unknown, number>;
    expect(single.get(6)).toBe(2);
    // firm 6's two accounts have distinct credit limits, so they split in two.
    const firmSix = [...multi.entries()].filter(([k]) => (k as unknown[])[0] === 6);
    expect(firmSix.map(([, v]) => v)).toEqual([1, 1]);
    expect(firmSix.map(([k]) => (k as unknown[])[1]).sort()).toEqual([50, 55]);
  });
});

// ==========================================================================
// Multi-field grouped SUM over a bigint column
//
// trails-specific regression (no Rails analogue — Ruby has no Number
// precision cliff): SQLite returns a large SUM as a lossy double, so
// groupedAggregate wraps the query in a CAST(... AS TEXT) that must re-project
// EVERY group key alias. Guards wrapBigintAgg's grouped branch against
// dropping the trailing keys once there is more than one group field.
// ==========================================================================

describe("multi-field grouped bigint sum", () => {
  fixtures([]);

  it("carries every group key through the bigint text-cast wrap", async () => {
    const { NumericData } = await import("./test-helpers/models/numeric-data.js");
    await NumericData.create({ world_population: 2n ** 62n, my_house_population: 1n });
    await NumericData.create({ world_population: 2n ** 62n, my_house_population: 2n });

    const result = (await NumericData.group("my_house_population", "world_population").sum(
      "atoms_in_universe",
    )) as Map<unknown, unknown>;

    const keys = [...result.keys()] as unknown[][];
    expect(keys).toHaveLength(2);
    // Both key components survive the wrap — the old single-alias wrap would
    // have dropped world_population and collapsed the tuple.
    expect(keys.every((k) => Array.isArray(k) && k.length === 2)).toBe(true);
    // BigIntegerType only widens to bigint past the safe-integer range, so the
    // small key stays a Number while the 2^62 key comes back as a bigint.
    expect(keys.map((k) => k[0]).sort()).toEqual([1, 2]);
    expect(keys.every((k) => k[1] === 2n ** 62n)).toBe(true);
  });
});

// ==========================================================================
// Grouped calculation HAVING — composite-FK belongs_to arm
//
// Rails routes every grouped calculation through `execute_grouped_calculation`,
// which builds from the relation's own arel so `having_clause` rides along
// regardless of key arity (calculations.rb:553-556). trails splits the
// composite-FK belongs_to case into its own `groupedCompositeAssoc` arm, which
// has no Rails counterpart to port a test from — this guards that the arm keeps
// emitting HAVING.
// ==========================================================================

describe("grouped calculation HAVING on a composite-FK belongs_to", () => {
  fixtures([]);

  it("filters groups keyed by the associated composite-PK record", async () => {
    const { CpkBook, CpkAuthor, CpkChapter } = await import("./test-helpers/models/cpk.js");
    await CpkAuthor.create({ id: 1, name: "Author One" });
    await CpkBook.create({ id: [1, 1], title: "Alpha", revision: 1 });
    await CpkBook.create({ id: [1, 2], title: "Beta", revision: 2 });
    await CpkChapter.create({ id: [1, 10], book_id: 1, title: "ch-1" });
    await CpkChapter.create({ id: [1, 11], book_id: 1, title: "ch-2" });
    await CpkChapter.create({ id: [1, 12], book_id: 2, title: "ch-3" });

    const result = (await CpkChapter.group("book").having("COUNT(*) > 1").count()) as Map<
      unknown,
      number
    >;

    const entries = [...result.entries()] as [{ id: unknown[] } | null, number][];
    expect(entries).toHaveLength(1);
    expect(entries[0][0]?.id).toEqual([1, 1]);
    expect(entries[0][1]).toBe(2);
  });
});

// ==========================================================================
// Ungrouped calculation HAVING
//
// `execute_simple_calculation` runs the relation's own arel (calculations.rb:485)
// and `build_arel` emits `arel.having(having_clause.ast) unless
// having_clause.empty?` with no GROUP BY guard (query_methods.rb:1756), so an
// ungrouped `having(...)` reaches the SQL. Rails has no test for it — trails
// projects explicitly instead of reusing `build_arel`, so the clause has to be
// re-applied by hand and needs a guard.
// ==========================================================================

describe("ungrouped calculation HAVING", () => {
  fixtures(["companies", "accounts"]);

  it("emits HAVING with no GROUP BY and filters the single aggregate row", async () => {
    const { Account } = await import("./test-helpers/models/account.js");
    // The whole-table sum survives the satisfied predicate; the unsatisfied one
    // drops the only row, leaving sum-of-no-rows.
    const total = (await Account.sum("credit_limit")) as number;
    expect(total).toBeGreaterThan(100);
    expect(await Account.having("sum(credit_limit) > 100").sum("credit_limit")).toBe(total);
    expect(await Account.having("sum(credit_limit) > 100000").sum("credit_limit")).toBe(0);
  });

  it("emits HAVING with no GROUP BY on the count paths", async () => {
    const { Account } = await import("./test-helpers/models/account.js");
    const total = (await Account.count()) as number;
    const credited = (await Account.where("credit_limit IS NOT NULL").count()) as number;
    expect(total).toBeGreaterThan(1);
    expect(credited).toBeGreaterThan(1);

    expect(await Account.having("count(*) > 1").count()).toBe(total);
    expect(await Account.having("count(*) > 100000").count()).toBe(0);

    expect(await Account.having("count(*) > 1").count("credit_limit")).toBe(credited);
    expect(await Account.having("count(*) > 100000").count("credit_limit")).toBe(0);

    expect(await Account.distinct().having("count(*) > 1").count()).toBe(total);
    expect(await Account.distinct().having("count(*) > 100000").count()).toBe(0);
  });
});

/**
 * Composite-key WHERE: `Relation#where(cols, tuples)` and the
 * underlying `PredicateBuilder.buildComposite(cols, tuples)`.
 *
 * Rails uses `where({[col1, col2] => [[v1, v2], ...]})` for
 * composite-key matching, routing through PredicateBuilder. JS object
 * keys can't be arrays, so we expose the same shape as a positional
 * overload — `where(['c1', 'c2'], [[v1a, v1b], ...])` — and a
 * matching `PredicateBuilder.buildComposite` method.
 *
 * Mirrors: ActiveRecord predicate-builder composite-key handling
 * (`relation/where_test.rb` composite-key `where` cases on `Cpk::Book`).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../index.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { CpkBook, CpkOrder, CpkAuthor, CpkChapter } from "../test-helpers/models/cpk.js";

describe("Relation#where — composite-key form", () => {
  // Rails creates the CPK rows inline with `Cpk::Book.create!` — no cpk
  // fixtures are loaded — so we ride the canonical, empty `cpk_books`
  // table and let transactional rollback clean up each test's inserts.
  useHandlerFixtures([], { schema: canonicalSchema });

  beforeAll(() => {
    [CpkBook, CpkOrder, CpkAuthor, CpkChapter].forEach((m) => registerModel(m));
  });

  it("compiles `where(['c1','c2'], [[v1a,v1b], [v2a,v2b]])` to OR-of-AND of column equalities", async () => {
    await CpkBook.create({ author_id: 1, id: 100, title: "match-1" });
    await CpkBook.create({ author_id: 2, id: 200, title: "match-2" });
    await CpkBook.create({ author_id: 1, id: 999, title: "no-match" });

    const matched = await (CpkBook as any)
      .where(
        ["author_id", "id"],
        [
          [1, 100],
          [2, 200],
        ],
      )
      .toArray();
    expect(matched.map((r: any) => r.title).sort()).toEqual(["match-1", "match-2"]);
  });

  it("returns no rows when all tuples are filtered (empty after null-strip → none())", async () => {
    await CpkBook.create({ author_id: 1, id: 100, title: "exists" });
    const matched = await (CpkBook as any)
      .where(
        ["author_id", "id"],
        [
          [1, null],
          [null, 200],
        ],
      )
      .toArray();
    expect(matched).toEqual([]);
  });

  it("filters null/undefined-bearing tuples instead of emitting IS NULL (SQL tuple-equality semantics)", async () => {
    await CpkBook.create({ author_id: 1, id: 100, title: "valid" });
    await CpkBook.create({ author_id: 2, id: 200, title: "also-valid" });
    // [1, null] is filtered out; [2, 200] remains.
    const matched = await (CpkBook as any)
      .where(
        ["author_id", "id"],
        [
          [1, null],
          [2, 200],
        ],
      )
      .toArray();
    expect(matched.map((r: any) => r.title)).toEqual(["also-valid"]);
  });

  it("single-column case (cols.length === 1) still works (degenerate composite)", async () => {
    await CpkBook.create({ author_id: 1, id: 100, title: "a" });
    await CpkBook.create({ author_id: 1, id: 200, title: "b" });
    const matched = await (CpkBook as any).where(["author_id"], [[1]]).toArray();
    expect(matched.map((r: any) => r.title).sort()).toEqual(["a", "b"]);
  });

  it("PredicateBuilder.buildComposite returns null on empty input (caller short-circuits with none())", async () => {
    const rel = (CpkBook as any).all();
    const node = rel.predicateBuilder.buildComposite(["author_id", "id"], []);
    expect(node).toBeNull();
  });

  it("PredicateBuilder.buildComposite throws on empty column list", () => {
    const rel = (CpkBook as any).all();
    expect(() => rel.predicateBuilder.buildComposite([], [[1, 2]])).toThrow(/empty column list/);
  });

  it("PredicateBuilder.buildComposite throws on tuple arity mismatch (caller bug, not silent filter)", () => {
    const rel = (CpkBook as any).all();
    expect(() => rel.predicateBuilder.buildComposite(["author_id", "id"], [[1]])).toThrow(
      /tuple arity 1 does not match column count 2/,
    );
  });

  it("PredicateBuilder.buildComposite throws on non-array tuple", () => {
    const rel = (CpkBook as any).all();
    expect(() =>
      rel.predicateBuilder.buildComposite(["author_id", "id"], [42 as unknown as unknown[]]),
    ).toThrow(/tuple must be an array/);
  });

  it("PredicateBuilder.buildComposite throws ArgumentError when tuples itself is not an array (null/object)", () => {
    const rel = (CpkBook as any).all();
    expect(() =>
      rel.predicateBuilder.buildComposite(["author_id"], null as unknown as unknown[][]),
    ).toThrow(/tuples must be an array, got null/);
    expect(() =>
      rel.predicateBuilder.buildComposite(["author_id"], { 0: [1] } as unknown as unknown[][]),
    ).toThrow(/tuples must be an array, got object/);
  });

  it("composite predicate values flow through QueryAttribute (bind params, not inlined Casted)", () => {
    // Regression: an earlier draft used `attribute.eq(rawValue)`,
    // which wraps as Arel::Nodes::Casted and inlines values into SQL.
    // That breaks compileWithBinds / prepared-statement caching.
    // Switching to buildBindAttribute makes each value a
    // QueryAttribute → BindParam at SQL emission. Inspect the node
    // tree: the AND's right-hand sides should be QueryAttribute
    // instances (carrying `name` / `type`), not raw literals or
    // Casted nodes.
    const rel = (CpkBook as any).all();
    const node: any = rel.predicateBuilder.buildComposite(["author_id", "id"], [[1, 100]]);
    // Single-tuple path returns Grouping(And([eq, eq])). Arel wraps
    // QueryAttribute in BindParam at `attribute.eq()`, so the Eq's
    // right-hand side is BindParam(QueryAttribute(name, value, type)).
    const and = node.expr;
    const firstEq = and.children[0];
    const rhs = firstEq.right;
    expect(rhs?.constructor?.name).toBe("BindParam");
    expect(rhs?.value?.name).toBe("author_id");
    expect(rhs?.value?.constructor?.name).toBe("QueryAttribute");
  });

  it("single-column composite uses IN(...) (not OR-chain) for compactness", () => {
    const rel = (CpkBook as any).all();
    const node = rel.predicateBuilder.buildComposite(["author_id"], [[1], [2], [3]]);
    // The Arel In node renders as `author_id IN (1, 2, 3)`; OR-chain
    // would render as `author_id = 1 OR author_id = 2 OR author_id = 3`.
    const sql = (CpkBook as any).all().where(node).toSql();
    expect(sql).toMatch(/IN \(1,\s*2,\s*3\)/);
    expect(sql).not.toMatch(/OR/);
  });

  it("Relation#where(cols) without tuples arg throws a clear error", () => {
    expect(() => (CpkBook as any).all().where(["author_id"])).toThrow(
      /requires a tuples argument as an array of arrays/,
    );
  });

  it("Relation#whereNot(cols) without tuples arg throws a clear error", () => {
    expect(() => (CpkBook as any).all().whereNot(["author_id"])).toThrow(
      /requires a tuples argument as an array of arrays/,
    );
  });

  it("Base.where(cols) without tuples arg throws a clear error", () => {
    expect(() => (CpkBook as any).where(["author_id"])).toThrow(
      /requires a tuples argument as an array of arrays/,
    );
  });

  it("Base.whereNot(cols, tuples) routes through Relation#whereNot composite form", async () => {
    await CpkBook.create({ author_id: 1, id: 100, title: "exclude" });
    await CpkBook.create({ author_id: 2, id: 200, title: "keep" });
    const matched = await (CpkBook as any).whereNot(["author_id", "id"], [[1, 100]]).toArray();
    expect(matched.map((r: any) => r.title)).toEqual(["keep"]);
  });

  it("Base.whereNot(cols) without tuples arg throws a clear ArgumentError", () => {
    expect(() => (CpkBook as any).whereNot(["author_id"])).toThrow(
      /requires a tuples argument as an array of arrays/,
    );
  });

  it("whereNot(cols, tuples) negates the OR-of-AND grouping", async () => {
    await CpkBook.create({ author_id: 1, id: 100, title: "exclude-me" });
    await CpkBook.create({ author_id: 2, id: 200, title: "exclude-me-2" });
    await CpkBook.create({ author_id: 3, id: 300, title: "keep" });

    const matched = await (CpkBook as any)
      .all()
      .whereNot(
        ["author_id", "id"],
        [
          [1, 100],
          [2, 200],
        ],
      )
      .toArray();
    expect(matched.map((r: any) => r.title)).toEqual(["keep"]);
  });

  it("whereNot(cols, tuples) on all-filtered tuples is a no-op (matches Rails' empty-hash behavior)", async () => {
    await CpkBook.create({ author_id: 1, id: 100, title: "a" });
    await CpkBook.create({ author_id: 2, id: 200, title: "b" });
    // All tuples have a null component → filtered out → no predicate
    // added → all rows returned.
    const matched = await (CpkBook as any)
      .all()
      .whereNot(
        ["author_id", "id"],
        [
          [1, null],
          [null, 200],
        ],
      )
      .toArray();
    expect(matched.map((r: any) => r.title).sort()).toEqual(["a", "b"]);
  });
});

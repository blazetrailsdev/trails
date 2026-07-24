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
import { fixtures } from "../test-helpers/fixtures.js";
import { CpkBook, CpkOrder, CpkAuthor, CpkChapter } from "../test-helpers/models/cpk.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";

describe("Relation#where — composite-key form", () => {
  // Rails creates the CPK rows inline with `Cpk::Book.create!` — no cpk
  // fixtures are loaded — so we ride the canonical, empty `cpk_books`
  // table and let transactional rollback clean up each test's inserts.
  fixtures([]);

  beforeAll(() => {
    [CpkBook, CpkOrder, CpkAuthor, CpkChapter, Post, Comment].forEach((m) => registerModel(m));
  });

  it("compiles `where(['c1','c2'], [[v1a,v1b], [v2a,v2b]])` to OR-of-AND of column equalities", async () => {
    await CpkBook.create({ id: [1, 100], title: "match-1" });
    await CpkBook.create({ id: [2, 200], title: "match-2" });
    await CpkBook.create({ id: [1, 999], title: "no-match" });

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
    await CpkBook.create({ id: [1, 100], title: "exists" });
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
    await CpkBook.create({ id: [1, 100], title: "valid" });
    await CpkBook.create({ id: [2, 200], title: "also-valid" });
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
    await CpkBook.create({ id: [1, 100], title: "a" });
    await CpkBook.create({ id: [1, 200], title: "b" });
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

  it("qualified composite cols bind through the joined table's type, not the base table's", () => {
    const rel = (Post as any).all();
    const node: any = rel.predicateBuilder.buildComposite(
      ["posts.id", "comments.post_id"],
      [[1, "2"]],
    );
    const [left, right] = node.expr.children;
    expect(right.left.relation.name).toBe("comments");
    const bind = right.right.value;
    expect(bind.name).toBe("post_id");
    expect(bind.valueForDatabase).toBe(2);
    expect(left.left.relation.name).toBe("posts");
  });

  it("qualified single-column composite resolves its IN(...) attribute on the joined table", () => {
    const rel = (Post as any).all();
    const node: any = rel.predicateBuilder.buildComposite(["comments.post_id"], [[1], [2]]);
    expect(node.left.relation.name).toBe("comments");
    expect(node.left.name).toBe("post_id");
  });

  it("single-column composite values flow through the column type as binds, not inlined literals", () => {
    // Regression: the single-column branch used `attribute.in(rawValues)`,
    // which inlines untyped `Casted` literals — so a string "2" for an
    // integer column stayed a string and never became a bind (breaking
    // compileWithBinds / prepared-statement caching).
    const rel = (Post as any).all();
    const node: any = rel.predicateBuilder.buildComposite(["comments.post_id"], [["1"], ["2"]]);
    expect(node.constructor.name).toBe("HomogeneousIn");
    expect(node.castedValues).toEqual([1, 2]);
    const sql = (Post as any).all().where(node).toSql();
    expect(sql).toMatch(/IN \(1,\s*2\)/);
  });

  it("qualified composite cols match rows through a join", async () => {
    const post: any = await (Post as any).create({ title: "joined", body: "b", author_id: 1 });
    const other: any = await (Post as any).create({ title: "unjoined", body: "b", author_id: 1 });
    await (Comment as any).create({ post_id: post.id, body: "c" });
    await (Comment as any).create({ post_id: other.id, body: "c2" });

    const rows = await (Post as any)
      .joins("comments")
      .where(["posts.id", "comments.post_id"], [[post.id, post.id]])
      .toArray();
    expect(rows.map((r: any) => r.title)).toEqual(["joined"]);
  });

  it("single-column composite uses IN(...) (not OR-chain) for compactness", () => {
    const rel = (CpkBook as any).all();
    const node = rel.predicateBuilder.buildComposite(["author_id"], [[1], [2], [3]]);
    // The HomogeneousIn node renders as `author_id IN (?, ?, ?)`, which
    // `toSql` substitutes to `IN (1, 2, 3)`; an OR-chain would render as
    // `author_id = 1 OR author_id = 2 OR author_id = 3`.
    expect(node.constructor.name).toBe("HomogeneousIn");
    const sql = (CpkBook as any).all().where(node).toSql();
    expect(sql).toMatch(/IN \(1,\s*2,\s*3\)/);
    expect(sql).not.toMatch(/OR/);
  });

  it("Relation#where(single array arg) routes to the sanitized-conditions form, not composite", () => {
    // A single all-strings array is Rails' `where(["sql fragment"])` form, not
    // the two-argument composite `where(cols, tuples)`, so it must sanitize
    // rather than raise the composite-key ArgumentError.
    const sql = (CpkBook as any).all().where(["author_id = 1"]).toSql();
    expect(sql).toMatch(/author_id = 1/);
  });

  it("Relation#whereNot(single array arg) routes to the sanitized-conditions form, not composite", () => {
    // Rails' `where.not(["name = ?", x])` (query_methods.rb:28) is the
    // sanitized-conditions form built via `build_where_clause(...).invert`, so a
    // single array must negate the fragment rather than raise the composite-key
    // ArgumentError.
    const sql = (CpkBook as any).all().whereNot(["author_id = 1"]).toSql();
    expect(sql).toMatch(/NOT \(author_id = 1\)/);
  });

  it("Base.where(single array arg) routes to the sanitized-conditions form, not composite", () => {
    const sql = (CpkBook as any).where(["author_id = 1"]).toSql();
    expect(sql).toMatch(/author_id = 1/);
  });

  it("Base.whereNot(cols, tuples) routes through Relation#whereNot composite form", async () => {
    await CpkBook.create({ id: [1, 100], title: "exclude" });
    await CpkBook.create({ id: [2, 200], title: "keep" });
    const matched = await (CpkBook as any).whereNot(["author_id", "id"], [[1, 100]]).toArray();
    expect(matched.map((r: any) => r.title)).toEqual(["keep"]);
  });

  it("Base.whereNot(single array arg) routes to the sanitized-conditions form, not composite", () => {
    const sql = (CpkBook as any).whereNot(["author_id = 1"]).toSql();
    expect(sql).toMatch(/NOT \(author_id = 1\)/);
  });

  it("whereNot(mixed-type cols, tuples) routes to sanitize (symmetric with where), not a bogus composite", () => {
    // The composite form requires an all-strings column list, kept symmetric
    // with `where`. A non-string element means it is NOT composite cols, so it
    // routes to the sanitized-conditions path (which surfaces a bind-arity
    // error) rather than building a predicate off a coerced `5` column.
    expect(() => (CpkBook as any).all().whereNot(["author_id", 5], [[1, 2]])).toThrow(
      /wrong number of bind variables/,
    );
    expect(() => (CpkBook as any).whereNot(["author_id", 5], [[1, 2]])).toThrow(
      /wrong number of bind variables/,
    );
  });

  it("where([], tuples) is the composite form and raises on the empty column list, not a silent no-op", () => {
    // The blank short-circuit (`where([])`) applies only to the single-argument
    // call; a supplied tuples arg keeps this on the composite path.
    expect(() => (CpkBook as any).all().where([], [[1, 2]])).toThrow(/empty column list/);
    expect(() => (CpkBook as any).where([], [[1, 2]])).toThrow(/empty column list/);
  });

  it("whereNot(cols, tuples) negates the OR-of-AND grouping", async () => {
    await CpkBook.create({ id: [1, 100], title: "exclude-me" });
    await CpkBook.create({ id: [2, 200], title: "exclude-me-2" });
    await CpkBook.create({ id: [3, 300], title: "keep" });

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
    await CpkBook.create({ id: [1, 100], title: "a" });
    await CpkBook.create({ id: [2, 200], title: "b" });
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

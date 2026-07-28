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
import { fixtures } from "../test-fixtures.js";
import { CpkBook, CpkOrder, CpkAuthor, CpkChapter } from "../test-helpers/models/cpk.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Customer, Address } from "../test-helpers/models/customer.js";
import { Company } from "../test-helpers/models/company.js";
import { Contract } from "../test-helpers/models/contract.js";

describe("Relation#where — composite-key form", () => {
  // Rails creates the CPK rows inline with `Cpk::Book.create!` — no cpk
  // fixtures are loaded — so we ride the canonical, empty `cpk_books`
  // table and let transactional rollback clean up each test's inserts.
  fixtures([]);

  beforeAll(() => {
    [CpkBook, CpkOrder, CpkAuthor, CpkChapter, Post, Comment, Customer, Company, Contract].forEach(
      (m) => registerModel(m),
    );
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

  it("PredicateBuilder.buildComposite returns [] on empty input (caller short-circuits with none())", async () => {
    const rel = (CpkBook as any).all();
    const nodes = rel.predicateBuilder.buildComposite(["author_id", "id"], []);
    expect(nodes).toEqual([]);
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
    const nodes: any = rel.predicateBuilder.buildComposite(["author_id", "id"], [[1, 100]]);
    // Single-tuple path returns the predicates flat ([eq, eq]), like Rails'
    // grouping_queries. Arel wraps QueryAttribute in BindParam at
    // `attribute.eq()`, so the first Eq's right-hand side is
    // BindParam(QueryAttribute(name, value, type)).
    const rhs = nodes[0].right;
    expect(rhs?.constructor?.name).toBe("BindParam");
    expect(rhs?.value?.name).toBe("author_id");
    expect(rhs?.value?.constructor?.name).toBe("QueryAttribute");
  });

  it("single-tuple composite returns flat predicates (no wrapping Grouping/parens) — Rails grouping_queries one? path", () => {
    // grouping_queries returns a single group's predicates flat
    // (`queries.one? → queries.first`, predicate_builder.rb:155-156), so one
    // surviving tuple is [c1 = ?, c2 = ?] — two addressable predicates, NOT a
    // Grouping. The emitted SQL therefore has no wrapping parens, byte-for-byte
    // Rails' `where({[c1,c2] => [[v1,v2]]})`.
    const rel = (CpkBook as any).all();
    const nodes: any = rel.predicateBuilder.buildComposite(["author_id", "id"], [[1, 100]]);
    expect(nodes.map((n: any) => n.constructor.name)).toEqual(["Equality", "Equality"]);
    const sql = (CpkBook as any)
      .all()
      .where(["author_id", "id"], [[1, 100]])
      .toSql();
    // Quote-agnostic (backtick on MySQL/MariaDB, double-quote elsewhere): the
    // point is the two equalities are ANDed flat, with NO wrapping parens.
    const col = (name: string) => `["\`]?cpk_books["\`]?\\.["\`]?${name}["\`]?`;
    expect(sql).toMatch(new RegExp(`WHERE ${col("author_id")} = 1 AND ${col("id")} = 100`));
    expect(sql).not.toMatch(/\(/);
  });

  it("qualified composite cols bind through the joined table's type, not the base table's", () => {
    const rel = (Post as any).all();
    const nodes: any = rel.predicateBuilder.buildComposite(
      ["posts.id", "comments.post_id"],
      [[1, "2"]],
    );
    const [left, right] = nodes;
    expect(right.left.relation.name).toBe("comments");
    const bind = right.right.value;
    expect(bind.name).toBe("post_id");
    expect(bind.valueForDatabase).toBe(2);
    expect(left.left.relation.name).toBe("posts");
  });

  it("qualified composite col naming a join-only table binds through that table's model type", () => {
    // A qualified col naming a table that exists only as a join-dependency
    // (`contracts` reached via `Comment.joins({ company: "contracts" })`) — NOT
    // a direct reflection on the base model — must still re-root on the joined
    // model so the bind is typed by that model's column type. Rails threads
    // `lookup_table_klass_from_join_dependencies` as the `associated_table`
    // block (predicate_builder.rb:71-73); `buildComposite` mirrors that.
    //
    // `contracts.metadata` is `t.string` in the DB but Contract overrides it to
    // `attribute("metadata", "json")`. Resolved through the join-dependency
    // fallback, the bind uses that model type and JSON-serializes the value
    // (`"x"` → `'"x"'`); without the fallback it falls to a bare Table with a
    // generic `TypeCasterConnection` (klass === null), which reads the raw
    // string column type and leaves it unquoted (`x`).
    const rel: any = (Comment as any)
      .joins({ company: "contracts" })
      .where(["comments.id", "contracts.metadata"], [[1, "x"]]);
    let eq: any;
    const walk = (n: any) => {
      if (!n || typeof n !== "object") return;
      if (n.right?.value?.name === "metadata") eq = n;
      for (const k of ["expr", "left", "right", "children"]) {
        const c = n[k];
        if (Array.isArray(c)) c.forEach(walk);
        else if (c) walk(c);
      }
    };
    rel._whereClause.predicates.forEach(walk);
    // Attribute re-rooted onto the join-only `contracts` table…
    expect(eq.left.relation.name).toBe("contracts");
    // …and the bind is typed by Contract's `attribute("metadata", "json")`
    // override (JSON-serialized, quoted), not the raw DB `t.string` column the
    // generic `TypeCasterConnection` would have used (unquoted `x`).
    expect(eq.right.value.valueForDatabase).toBe('"x"');
  });

  it("qualified single-column composite resolves its IN(...) attribute on the joined table", () => {
    const rel = (Post as any).all();
    const node: any = rel.predicateBuilder.buildComposite(["comments.post_id"], [[1], [2]])[0];
    expect(node.left.relation.name).toBe("comments");
    expect(node.left.name).toBe("post_id");
  });

  it("single-column composite values flow through the column type as binds, not inlined literals", () => {
    // Regression: the single-column branch used `attribute.in(rawValues)`,
    // which inlines untyped `Casted` literals — so a string "2" for an
    // integer column stayed a string and never became a bind (breaking
    // compileWithBinds / prepared-statement caching).
    const rel = (Post as any).all();
    const node: any = rel.predicateBuilder.buildComposite(["comments.post_id"], [["1"], ["2"]])[0];
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
    const node = rel.predicateBuilder.buildComposite(["author_id"], [[1], [2], [3]])[0];
    // The HomogeneousIn node renders as `author_id IN (?, ?, ?)`, which
    // `toSql` substitutes to `IN (1, 2, 3)`; an OR-chain would render as
    // `author_id = 1 OR author_id = 2 OR author_id = 3`.
    expect(node.constructor.name).toBe("HomogeneousIn");
    const sql = (CpkBook as any).all().where(node).toSql();
    expect(sql).toMatch(/IN \(1,\s*2,\s*3\)/);
    expect(sql).not.toMatch(/OR/);
  });

  it("multi-tuple composite builds Rails' grouping_queries tree: one Grouping wrapping an n-ary Or of And chains", () => {
    // buildComposite delegates to grouping_queries
    // (predicate_builder.rb:154-162), so the tree is Rails' verbatim:
    // Grouping(Or([And([eq, eq]), And([eq, eq])])) — the per-tuple Grouping
    // an earlier hand-rolled version added is not part of that shape.
    const rel = (CpkBook as any).all();
    // Multiple tuples collapse to grouping_queries' single node: one
    // Grouping(Or([And, And])), returned as a length-1 array.
    const nodes: any = rel.predicateBuilder.buildComposite(
      ["author_id", "id"],
      [
        [1, 100],
        [2, 200],
      ],
    );
    expect(nodes).toHaveLength(1);
    const node = nodes[0];
    expect(node.constructor.name).toBe("Grouping");
    expect(node.expr.constructor.name).toBe("Or");
    expect(node.expr.children.map((c: any) => c.constructor.name)).toEqual(["And", "And"]);
  });

  it("composite tuple values dereference a record to its id (predicate_builder.rb:58)", async () => {
    // Delegating through `build` inherits Rails' `value = value.id if
    // value.respond_to?(:id)`, which the hand-rolled buildBindAttribute path
    // skipped — a record used to be bound whole.
    const author: any = await (CpkAuthor as any).create({ name: "deref" });
    await CpkBook.create({ id: [author.id, 100], title: "by-record" });
    const matched = await (CpkBook as any).where(["author_id", "id"], [[author, 100]]).toArray();
    expect(matched.map((r: any) => r.title)).toEqual(["by-record"]);
  });

  it("single-column composite over a composed_of key keeps every mapped column's predicate", () => {
    // An aggregate key expands to one predicate per mapped column
    // (expand_from_hash's aggregated_with? branch, predicate_builder.rb:124-141),
    // so the delegation returns a multi-node array for a single key. Returning
    // them all (Node[]) — rather than collapsing to [0] — is what keeps
    // city/country from being silently dropped alongside street, and the caller
    // spreads every predicate into the WhereClause.
    const rel = (Customer as any).all();
    const nodes: any = rel.predicateBuilder.buildComposite(
      ["address"],
      [[new Address("Funny Street", "Scary Town", "Loony Land")]],
    );
    expect(nodes).toHaveLength(3);
    const sql = (Customer as any)
      .all()
      .where(["address"], [[new Address("Funny Street", "Scary Town", "Loony Land")]])
      .toSql();
    expect(sql).toMatch(/address_street/);
    expect(sql).toMatch(/address_city/);
    expect(sql).toMatch(/address_country/);
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

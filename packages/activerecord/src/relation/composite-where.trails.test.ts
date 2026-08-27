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
    const rel = (CpkBook as any).all();
    const nodes: any = rel.predicateBuilder.buildComposite(["author_id", "id"], [[1, 100]]);
    const rhs = nodes[0].right;
    expect(rhs?.name).toBe("author_id");
    expect(rhs?.constructor?.name).toBe("QueryAttribute");
  });

  it("single-tuple composite returns flat predicates (no wrapping Grouping/parens) — Rails grouping_queries one? path", () => {
    const rel = (CpkBook as any).all();
    const nodes: any = rel.predicateBuilder.buildComposite(["author_id", "id"], [[1, 100]]);
    expect(nodes.map((n: any) => n.constructor.name)).toEqual(["Equality", "Equality"]);
    const sql = (CpkBook as any)
      .all()
      .where(["author_id", "id"], [[1, 100]])
      .toSql();
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
    const bind = right.right;
    expect(bind.name).toBe("post_id");
    expect(bind.valueForDatabase).toBe(2);
    expect(left.left.relation.name).toBe("posts");
  });

  it("qualified composite col naming a join-only table binds through that table's model type", () => {
    const rel: any = (Comment as any)
      .joins({ ":company": ":contracts" })
      .where(["comments.id", "contracts.metadata"], [[1, "x"]]);
    let eq: any;
    const walk = (n: any) => {
      if (!n || typeof n !== "object") return;
      if (n.right?.name === "metadata") eq = n;
      for (const k of ["expr", "left", "right", "children"]) {
        const c = n[k];
        if (Array.isArray(c)) c.forEach(walk);
        else if (c) walk(c);
      }
    };
    rel.whereClause.predicates.forEach(walk);
    expect(eq.left.relation.name).toBe("contracts");
    expect(eq.right.valueForDatabase).toBe('"x"');
  });

  it("qualified single-column composite resolves its IN(...) attribute on the joined table", () => {
    const rel = (Post as any).all();
    const node: any = rel.predicateBuilder.buildComposite(["comments.post_id"], [[1], [2]])[0];
    expect(node.left.relation.name).toBe("comments");
    expect(node.left.name).toBe("post_id");
  });

  it("single-column composite values flow through the column type as binds, not inlined literals", () => {
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
      .joins(":comments")
      .where(["posts.id", "comments.post_id"], [[post.id, post.id]])
      .toArray();
    expect(rows.map((r: any) => r.title)).toEqual(["joined"]);
  });

  it("single-column composite uses IN(...) (not OR-chain) for compactness", () => {
    const rel = (CpkBook as any).all();
    const node = rel.predicateBuilder.buildComposite(["author_id"], [[1], [2], [3]])[0];
    expect(node.constructor.name).toBe("HomogeneousIn");
    const sql = (CpkBook as any).all().where(node).toSql();
    expect(sql).toMatch(/IN \(1,\s*2,\s*3\)/);
    expect(sql).not.toMatch(/OR/);
  });

  it("multi-tuple composite builds Rails' grouping_queries tree: one Grouping wrapping an n-ary Or of And chains", () => {
    const rel = (CpkBook as any).all();
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
    const author: any = await (CpkAuthor as any).create({ name: "deref" });
    await CpkBook.create({ id: [author.id, 100], title: "by-record" });
    const matched = await (CpkBook as any).where(["author_id", "id"], [[author, 100]]).toArray();
    expect(matched.map((r: any) => r.title)).toEqual(["by-record"]);
  });

  it("single-column composite over a composed_of key keeps every mapped column's predicate", () => {
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
    const sql = (CpkBook as any).all().where(["author_id = 1"]).toSql();
    expect(sql).toMatch(/author_id = 1/);
  });

  it("Relation#whereNot(single array arg) routes to the sanitized-conditions form, not composite", () => {
    const sql = (CpkBook as any).all().where().not(["author_id = 1"]).toSql();
    expect(sql).toMatch(/NOT \(author_id = 1\)/);
  });

  it("Base.where(single array arg) routes to the sanitized-conditions form, not composite", () => {
    const sql = (CpkBook as any).where(["author_id = 1"]).toSql();
    expect(sql).toMatch(/author_id = 1/);
  });

  it("Base.where().not(cols, tuples) routes through Relation#whereNot composite form", async () => {
    await CpkBook.create({ id: [1, 100], title: "exclude" });
    await CpkBook.create({ id: [2, 200], title: "keep" });
    const matched = await (CpkBook as any)
      .where()
      .not(["author_id", "id"], [[1, 100]])
      .toArray();
    expect(matched.map((r: any) => r.title)).toEqual(["keep"]);
  });

  it("Base.where().not(single array arg) routes to the sanitized-conditions form, not composite", () => {
    const sql = (CpkBook as any).where().not(["author_id = 1"]).toSql();
    expect(sql).toMatch(/NOT \(author_id = 1\)/);
  });

  it("whereNot(mixed-type cols, tuples) routes to sanitize (symmetric with where), not a bogus composite", () => {
    expect(() =>
      (CpkBook as any)
        .all()
        .where()
        .not(["author_id", 5], [[1, 2]]),
    ).toThrow(/wrong number of bind variables/);
    expect(() => (CpkBook as any).where().not(["author_id", 5], [[1, 2]])).toThrow(
      /wrong number of bind variables/,
    );
  });

  it("where([], tuples) is the composite form and raises on the empty column list, not a silent no-op", () => {
    expect(() => (CpkBook as any).all().where([], [[1, 2]])).toThrow(/empty column list/);
    expect(() => (CpkBook as any).where([], [[1, 2]])).toThrow(/empty column list/);
  });

  it("whereNot(cols, tuples) negates the OR-of-AND grouping", async () => {
    await CpkBook.create({ id: [1, 100], title: "exclude-me" });
    await CpkBook.create({ id: [2, 200], title: "exclude-me-2" });
    await CpkBook.create({ id: [3, 300], title: "keep" });

    const matched = await (CpkBook as any)
      .all()
      .where()
      .not(
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
    const matched = await (CpkBook as any)
      .all()
      .where()
      .not(
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

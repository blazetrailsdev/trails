/**
 * Eager-load pluck / cache_version over a composite-PK collection association.
 *
 * `JoinDependency#addAssociation` used to bail for any composite source PK, so a
 * composite-PK model's composite-FK collection (`CpkBook.hasMany("chapters",
 * { foreignKey: ["author_id", "book_id"] })`, `primaryKey = ["author_id", "id"]`)
 * fell out of the join tree and trails preloaded where Rails JOINs. That is now
 * converged: `JoinAssociation#joinConstraints` builds the composite FK↔PK tuple
 * ON clause (`cpk_chapters.author_id = cpk_books.author_id AND
 * cpk_chapters.book_id = cpk_books.id`), so `eagerLoad("chapters")` JOINs like
 * Rails and `pluck` / `cache_version` read from the joined query.
 *
 * The composite-FK `belongsTo` direction is likewise converged: a nested spec
 * whose inner segment is a composite-FK `belongsTo` (`{ chapters: "book" }`)
 * now JOINs both segments (`joinConstraints` keys
 * `target.association_primary_key = source.foreign_key` per column).
 *
 * One residual, separately-tracked trails deviation remains (hence the
 * `*.trails.test.ts` suffix):
 *   - A limit/offset over the joined collection needs the composite-PK
 *     `distinct_relation_for_primary_key` materialization, which trails can't do
 *     yet — it surfaces an explicit NotImplementedError
 *     (0023-surfaced-deviations/composite-pk-distinct-relation-materialization).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "../index.js";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { CpkBook, CpkOrder, CpkAuthor, CpkChapter } from "../test-helpers/models/cpk.js";
import { JoinDependency } from "../associations/join-dependency.js";
import { Nodes } from "@blazetrails/arel";
import "../associations/collection-proxy.js";
import "../association-relation.js";

function withCollectionCacheVersioning(fn: () => Promise<void>): Promise<void> {
  const original = Base.collectionCacheVersioning;
  Base.collectionCacheVersioning = true;
  return fn().finally(() => {
    Base.collectionCacheVersioning = original;
  });
}

describe("CpkBook eager pluck / cache_version over a composite-FK collection", () => {
  // Rails creates CPK rows inline; no cpk fixtures exist. Ride the canonical,
  // empty cpk tables and let transactional rollback clean up each insert.
  fixtures([], { schema: canonicalSchema });

  beforeAll(() => {
    [CpkBook, CpkOrder, CpkAuthor, CpkChapter].forEach((m) => registerModel(m));
  });

  async function seedBooks(): Promise<void> {
    await CpkAuthor.create({ id: 1, name: "Author One" });
    await CpkAuthor.create({ id: 2, name: "Author Two" });
    await CpkBook.create({ author_id: 1, id: 1, title: "Alpha", revision: 1 });
    await CpkBook.create({ author_id: 1, id: 2, title: "Beta", revision: 2 });
    await CpkBook.create({ author_id: 2, id: 3, title: "Gamma", revision: 3 });
    await CpkChapter.create({ author_id: 1, id: 10, book_id: 1, title: "ch-1" });
  }

  it("eagerLoad('chapters') builds a composite FK↔PK tuple JOIN node", () => {
    const jd = new JoinDependency(CpkBook as unknown as typeof Base);
    jd.addAssociationSpec("chapters");
    const nodes = (jd as unknown as { nodes: { assocName: string }[] }).nodes;
    expect(nodes.map((n) => n.assocName)).toEqual(["chapters"]);
  });

  it("eagerLoad('order') builds a composite-FK belongsTo JOIN node", () => {
    const jd = new JoinDependency(CpkBook as unknown as typeof Base);
    const node = jd.addAssociation("order");
    expect(node).not.toBeNull();
    const outerJoin = node!.arelJoin as Nodes.OuterJoin;
    const on = outerJoin.right as Nodes.On;
    const and = on.expr as Nodes.And;
    // belongsTo keys target.association_primary_key = source.foreign_key per
    // column: cpk_orders.shop_id = cpk_books.shop_id AND
    // cpk_orders.id = cpk_books.order_id.
    expect(and.children).toHaveLength(2);
    type Attr = { name: string; relation: { name: string } };
    const [c0, c1] = and.children as Nodes.Equality[];
    const c0l = c0.left as unknown as Attr;
    const c0r = c0.right as unknown as Attr;
    const c1l = c1.left as unknown as Attr;
    const c1r = c1.right as unknown as Attr;
    expect(c0l.name).toBe("shop_id");
    expect(c0l.relation.name).toBe("cpk_orders");
    expect(c0r.name).toBe("shop_id");
    expect(c0r.relation.name).toBe("cpk_books");
    expect(c1l.name).toBe("id");
    expect(c1r.name).toBe("order_id");
  });

  it("pluck over eagerLoad('chapters') joins the composite-FK collection", async () => {
    await seedBooks();
    const titles = await CpkBook.eagerLoad("chapters").order("author_id", "id").pluck("title");
    expect(titles).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("pluck over eagerLoad('chapters') can project the joined table's column", async () => {
    await seedBooks();
    const chapterTitles = await CpkBook.eagerLoad("chapters")
      .order("cpk_books.author_id", "cpk_books.id")
      .pluck("cpk_chapters.title");
    expect(chapterTitles).toEqual(["ch-1", null, null]);
  });

  it("pluck over multiple eager specs joins both", async () => {
    await seedBooks();
    const titles = await CpkBook.eagerLoad("author", "chapters")
      .order("author_id", "id")
      .pluck("title");
    expect(titles).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("pluck over eagerLoad('chapters') with a limit surfaces the composite-PK materialization gap", async () => {
    await seedBooks();
    // Rails materializes the limited DISTINCT primary keys
    // (distinct_relation_for_primary_key) before joining; trails has no
    // composite-PK materialization yet, so it surfaces the explicit error
    // rather than emitting a wrong single-column predicate. Tracked by
    // 0023-surfaced-deviations/composite-pk-distinct-relation-materialization.
    await expect(
      CpkBook.eagerLoad("chapters").order("author_id", "id").limit(2).pluck("title"),
    ).rejects.toThrow(/limit\/offset over a collection association/);
  });

  it("pluck of a nested-hash spec's inner composite-FK belongsTo joins both segments", async () => {
    await seedBooks();
    // `{ chapters: "book" }` nests a composite-FK `belongsTo` (`chapters.book`).
    // Both segments now JOIN: `chapters` keys the composite FK↔PK tuple, and the
    // inner `book` belongsTo keys `cpk_books.author_id = cpk_chapters.author_id
    // AND cpk_books.id = cpk_chapters.book_id`.
    const jd = new JoinDependency(CpkBook as unknown as typeof Base);
    jd.addAssociationSpec({ chapters: "book" });
    const nodes = (jd as unknown as { nodes: { assocName: string }[] }).nodes;
    expect(nodes.map((n) => n.assocName)).toEqual(["chapters", "chapters.book"]);

    const titles = await CpkBook.eagerLoad({ chapters: "book" })
      .order("cpk_books.author_id", "cpk_books.id")
      .pluck("cpk_chapters.title");
    expect(titles).toEqual(["ch-1", null, null]);
  });

  it("cache_version over eagerLoad('chapters') joins the composite-FK collection", async () => {
    await withCollectionCacheVersioning(async () => {
      await seedBooks();
      const eager = await CpkBook.eagerLoad("chapters")
        .order("author_id", "id")
        .cacheVersion("revision");
      const base = await CpkBook.order("author_id", "id").cacheVersion("revision");
      expect(eager).toBe(base);
    });
  });

  it("cache_version over eagerLoad('chapters') with a limit surfaces the composite-PK materialization gap", async () => {
    await withCollectionCacheVersioning(async () => {
      await seedBooks();
      await expect(
        CpkBook.eagerLoad("chapters").order("author_id", "id").limit(2).cacheVersion("revision"),
      ).rejects.toThrow(/limit\/offset over a collection association/);
    });
  });
});

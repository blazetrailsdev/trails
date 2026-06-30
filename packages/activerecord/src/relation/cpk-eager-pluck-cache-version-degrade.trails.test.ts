/**
 * Eager-load pluck / cache_version over a composite-PK collection association.
 *
 * `JoinDependency#addAssociation` bails for any composite source PK
 * (associations/join-dependency.ts), so a composite-PK model's collection
 * association is an unjoinable capability gap: `jd.nodes` ends up empty. Rails
 * JOINs composite keys; trails preloads them. `toArray` already degrades to
 * preload (relation.ts `_executeEagerLoad` `jd.nodes.length === 0`), applying
 * limit/offset to the base query. `pluck` and `cache_version` must mirror that
 * fallback instead of calling `leftOuterJoins(eagerSpecs)`, which throws
 * "Association named 'chapters' was not found on CpkBook" for the unjoinable
 * spec.
 *
 * No like-named Rails test exists: Rails joins composite keys rather than
 * preloading, so this is a trails-specific degrade path (`*.trails.test.ts`).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "../index.js";
import { registerModel } from "../associations.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { CpkBook, CpkOrder, CpkAuthor, CpkChapter } from "../test-helpers/models/cpk.js";
import "../associations/collection-proxy.js";
import "../association-relation.js";

function withCollectionCacheVersioning(fn: () => Promise<void>): Promise<void> {
  const original = Base.collectionCacheVersioning;
  Base.collectionCacheVersioning = true;
  return fn().finally(() => {
    Base.collectionCacheVersioning = original;
  });
}

describe("CpkBook eager pluck / cache_version preload-degrade", () => {
  // Rails creates CPK rows inline; no cpk fixtures exist. Ride the canonical,
  // empty cpk tables and let transactional rollback clean up each insert.
  useHandlerFixtures([], { schema: canonicalSchema });

  beforeAll(() => {
    [CpkBook, CpkOrder, CpkAuthor, CpkChapter].forEach((m) => registerModel(m));
  });

  async function seedBooks(): Promise<void> {
    await CpkAuthor.create({ id: 1, name: "Author One" });
    await CpkAuthor.create({ id: 2, name: "Author Two" });
    await CpkBook.create({ author_id: 1, id: 1, title: "Alpha", revision: 1 });
    await CpkBook.create({ author_id: 1, id: 2, title: "Beta", revision: 2 });
    await CpkBook.create({ author_id: 2, id: 3, title: "Gamma", revision: 3 });
    // A chapter so the degraded preload has rows to load (column values still
    // come from the base cpk_books query).
    await CpkChapter.create({ author_id: 1, id: 10, book_id: 1, title: "ch-1" });
  }

  it("pluck over eagerLoad('chapters') degrades to preload instead of crashing", async () => {
    await seedBooks();
    const titles = await CpkBook.eagerLoad("chapters").order("author_id", "id").pluck("title");
    expect(titles).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("pluck over eagerLoad('chapters') preserves limit on the base query", async () => {
    await seedBooks();
    const titles = await CpkBook.eagerLoad("chapters")
      .order("author_id", "id")
      .limit(2)
      .pluck("title");
    expect(titles).toEqual(["Alpha", "Beta"]);
  });

  it("pluck over a mixed joinable + unjoinable eager spec joins the joinable and degrades the rest", async () => {
    await seedBooks();
    // `author` (single-PK belongs_to) is joinable; `chapters` (composite-PK
    // collection) is not. The joinable spec must still be JOINed and the
    // unjoinable one degraded to preload, rather than the whole list throwing.
    const titles = await CpkBook.eagerLoad("author", "chapters")
      .order("author_id", "id")
      .pluck("title");
    expect(titles).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("pluck of an unjoinable association's own column surfaces the explicit capability-gap error", async () => {
    await seedBooks();
    // The column references the degraded (unjoinable) table directly. trails
    // cannot JOIN cpk_chapters (composite key), so rather than silently emitting
    // SQL against an unjoined table, it surfaces the explicit error Rails' join
    // path would raise.
    await expect(CpkBook.eagerLoad("chapters").pluck("cpk_chapters.title")).rejects.toThrow(
      /chapters/,
    );
  });

  it("cache_version over eagerLoad('chapters') degrades to preload instead of crashing", async () => {
    await withCollectionCacheVersioning(async () => {
      await seedBooks();
      const eager = await CpkBook.eagerLoad("chapters")
        .order("author_id", "id")
        .cacheVersion("revision");
      const base = await CpkBook.order("author_id", "id").cacheVersion("revision");
      expect(eager).toBe(base);
    });
  });

  it("cache_version over eagerLoad('chapters') with a limit preserves the limit", async () => {
    await withCollectionCacheVersioning(async () => {
      await seedBooks();
      const eager = await CpkBook.eagerLoad("chapters")
        .order("author_id", "id")
        .limit(2)
        .cacheVersion("revision");
      const base = await CpkBook.order("author_id", "id").limit(2).cacheVersion("revision");
      expect(eager).toBe(base);
    });
  });
});

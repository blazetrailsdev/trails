/**
 * Composite-key eager count / aggregate folds onto the shared `build_joins`
 * emitter.
 *
 * Two composite-key paths in `calculations.ts` previously skipped the eager
 * JoinDependency fold that `singleAggregate` / `groupedAggregate` use, diverging
 * from Rails `apply_join_dependency` (which routes all arities through the one
 * `build_joins` path):
 *
 *   1. `performCount`'s eager branch guarded the DISTINCT-on-pk fan-out block
 *      with `if (!Array.isArray(pk))`, so a composite-PK model's
 *      `eager_load(:assoc).count` fell through to the plain count and never
 *      joined / de-duplicated (Rails `calculate`, calculations.rb:231-238, sets
 *      `select_values = Array(model.primary_key)` and counts distinctly).
 *   2. `groupedCompositeAssoc` (grouped calc keyed by a composite-FK belongs_to)
 *      emitted `_applyJoinsToManager(manager)` WITHOUT the `eagerJd` argument, so
 *      `eager_load(:x).group(:composite_fk_belongs_to).count/.sum` never folded
 *      its eager JD through the shared emitter.
 *
 * Both now build the eager JD via `collectEagerSpecs` and fold it through
 * `_applyJoinsToManager(manager, eagerJd)`, so one `AliasTracker` spans the
 * manual joins and the eager JD (a coinciding association dedups via `walk`).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { CpkBook, CpkOrder, CpkAuthor, CpkChapter } from "../test-helpers/models/cpk.js";
import { captureSql } from "../testing/sql-capture.js";
import type { Base } from "../index.js";

describe("CpkBook eager count / aggregate build_joins fold", () => {
  // Rails creates CPK rows inline; ride the canonical, empty cpk tables and let
  // transactional rollback clean up each insert.
  fixtures([], { schema: canonicalSchema });

  beforeAll(() => {
    [CpkBook, CpkOrder, CpkAuthor, CpkChapter].forEach((m) =>
      registerModel(m as unknown as typeof Base),
    );
  });

  async function seedBooksWithChapters(): Promise<void> {
    await CpkAuthor.create({ id: 1, name: "Author One" });
    await CpkBook.create({ author_id: 1, id: 1, title: "Alpha", revision: 1 });
    await CpkBook.create({ author_id: 1, id: 2, title: "Beta", revision: 2 });
    // Two chapters on book 1 would fan the row count to 3 without DISTINCT.
    await CpkChapter.create({ author_id: 1, id: 10, book_id: 1, title: "ch-1" });
    await CpkChapter.create({ author_id: 1, id: 11, book_id: 1, title: "ch-2" });
  }

  it("eager_load(:assoc).count on a composite-PK model de-duplicates via DISTINCT", async () => {
    await seedBooksWithChapters();
    let count = 0;
    const sqls = await captureSql(async () => {
      count = (await CpkBook.eagerLoad("chapters").count()) as number;
    });
    // Rails folds the eager JD into a LEFT OUTER JOIN and de-duplicates via a
    // DISTINCT-pk-columns subquery; 2 chapters on book 1 fan to 3 joined rows,
    // collapsed back to the 2 distinct books.
    expect(count).toBe(2);
    const countSql = sqls.find((s) => /count/i.test(s)) ?? "";
    expect(countSql).toMatch(/LEFT OUTER JOIN .*cpk_chapters/i);
    expect(countSql).toMatch(/DISTINCT/i);
  });

  it("eager_load(:assoc).count matches the un-joined count", async () => {
    await seedBooksWithChapters();
    // Rails: Cpk::Book.count == Cpk::Book.includes(:chapters).references(:chapters).count
    expect(await CpkBook.eagerLoad("chapters").count()).toBe(await CpkBook.count());
  });

  it("eager_load(:assoc).count(column) counts distinct non-null values of the column", async () => {
    await seedBooksWithChapters();
    // A specific requested column counts distinctly inline (COUNT(DISTINCT col))
    // rather than through the pk subquery.
    expect(await CpkBook.eagerLoad("chapters").count("cpk_books.revision")).toBe(2);
  });

  it("eager_load(:assoc).limit(n).count(column) respects the limit via a DISTINCT-column subquery", async () => {
    await seedBooksWithChapters();
    await CpkBook.create({ author_id: 1, id: 3, title: "Gamma", revision: 3 });
    let count = 0;
    const sqls = await captureSql(async () => {
      count = (await CpkBook.eagerLoad("chapters").limit(2).count("cpk_books.revision")) as number;
    });
    // Rails `build_count_subquery` wraps `SELECT DISTINCT revision ... LIMIT 2`
    // in an outer COUNT, so the limit caps the distinct column values counted (2
    // of the 3 distinct revisions) rather than being silently dropped.
    expect(count).toBe(2);
    const countSql = sqls.find((s) => /count/i.test(s)) ?? "";
    expect(countSql).toMatch(/subquery_for_count/i);
    expect(countSql).toMatch(/LIMIT 2/i);
    expect(countSql).toMatch(/DISTINCT/i);
  });

  it("eager_load(:assoc).offset(n).count(column) respects the offset via the subquery", async () => {
    await seedBooksWithChapters();
    await CpkBook.create({ author_id: 1, id: 3, title: "Gamma", revision: 3 });
    // 3 distinct revisions; offset(1) drops one → counts 2.
    expect(await CpkBook.eagerLoad("chapters").offset(1).count("cpk_books.revision")).toBe(2);
  });

  async function seedBooksWithOrders(): Promise<void> {
    await CpkAuthor.create({ id: 1, name: "Author One" });
    await CpkOrder.create({ shop_id: 1, id: 100, status: "open" });
    await CpkOrder.create({ shop_id: 1, id: 200, status: "open" });
    await CpkBook.create({ author_id: 1, id: 1, shop_id: 1, order_id: 100, title: "Alpha" });
    await CpkBook.create({ author_id: 1, id: 2, shop_id: 1, order_id: 100, title: "Beta" });
    await CpkBook.create({ author_id: 1, id: 3, shop_id: 1, order_id: 200, title: "Gamma" });
  }

  it("eager_load(:x).group(:composite_fk_belongs_to).count folds the eager JD", async () => {
    await seedBooksWithOrders();
    // group by the composite-FK belongs_to `order`, eager-loading the same
    // association: `walk` dedups the coinciding join so the grouped count keys
    // by the loaded Order records.
    let result!: Map<InstanceType<typeof CpkOrder> | null, number>;
    const sqls = await captureSql(async () => {
      result = (await CpkBook.eagerLoad("order").group("order").count()) as Map<
        InstanceType<typeof CpkOrder> | null,
        number
      >;
    });
    // The eager `order` JD coincides with the grouped belongs_to; `walk` dedups
    // it into a single LEFT OUTER JOIN rather than emitting a parallel join.
    const groupSql = sqls.find((s) => /GROUP BY/i.test(s)) ?? "";
    expect(groupSql).toMatch(/LEFT OUTER JOIN .*cpk_orders/i);
    const counts = new Map<unknown, number>();
    for (const [order, n] of result)
      counts.set(order === null ? null : (order.id as unknown[])[1], n);
    expect(counts.get(100)).toBe(2);
    expect(counts.get(200)).toBe(1);
  });

  it("eager_load(:x).group(:composite_fk_belongs_to).sum folds the eager JD", async () => {
    await seedBooksWithOrders();
    const result = (await CpkBook.eagerLoad("order").group("order").sum("id")) as Map<
      InstanceType<typeof CpkOrder> | null,
      number
    >;
    const sums = new Map<unknown, number>();
    for (const [order, n] of result)
      sums.set(order === null ? null : (order.id as unknown[])[1], n);
    expect(sums.get(100)).toBe(3); // book ids 1 + 2
    expect(sums.get(200)).toBe(3); // book id 3
  });
});

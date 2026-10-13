import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-helpers/use-fixtures.js";
import { CpkBook, CpkOrder, CpkAuthor, CpkChapter } from "../test-helpers/models/cpk.js";
import { captureSql } from "../testing/sql-capture.js";
import type { Base } from "../index.js";

const RAISE = 'Expected corresponding value for ["shop_id", "id"] to be an Array';

describe("CpkBook eager count / aggregate build_joins fold", () => {
  fixtures([]);

  beforeAll(() => {
    [CpkBook, CpkOrder, CpkAuthor, CpkChapter].forEach((m) =>
      registerModel(m as unknown as typeof Base),
    );
  });

  async function seedBooksWithChapters(): Promise<void> {
    await CpkAuthor.create({ id: 1, name: "Author One" });
    await CpkBook.create({ id: [1, 1], title: "Alpha", revision: 1 });
    await CpkBook.create({ id: [1, 2], title: "Beta", revision: 2 });
    await CpkChapter.create({ id: [1, 10], book_id: 1, title: "ch-1" });
    await CpkChapter.create({ id: [1, 11], book_id: 1, title: "ch-2" });
  }

  it("eager_load(:assoc).count on a composite-PK model de-duplicates via DISTINCT", async () => {
    await seedBooksWithChapters();
    let count = 0;
    const sqls = await captureSql(async () => {
      count = await CpkBook.eagerLoad(":chapters").count();
    });
    expect(count).toBe(2);
    const countSql = sqls.find((s) => /count/i.test(s)) ?? "";
    expect(countSql).toMatch(/LEFT OUTER JOIN .*cpk_chapters/i);
    expect(countSql).toMatch(/DISTINCT/i);
  });

  it("eager_load(:assoc).count matches the un-joined count", async () => {
    await seedBooksWithChapters();
    expect(await CpkBook.eagerLoad(":chapters").count()).toBe(await CpkBook.count());
  });

  it("eager_load(:assoc).count(column) counts distinct non-null values of the column", async () => {
    await seedBooksWithChapters();
    expect(await CpkBook.eagerLoad(":chapters").count("cpk_books.revision")).toBe(2);
  });

  async function seedBooksDuplicateRevisions(): Promise<void> {
    await CpkAuthor.create({ id: 1, name: "Author One" });
    await CpkBook.create({ id: [1, 1], title: "Alpha", revision: 5 });
    await CpkBook.create({ id: [1, 2], title: "Beta", revision: 5 });
    await CpkBook.create({ id: [1, 3], title: "Gamma", revision: 9 });
    await CpkChapter.create({ id: [1, 10], book_id: 1, title: "ch-1" });
    await CpkChapter.create({ id: [1, 11], book_id: 1, title: "ch-2" });
  }

  it("eager_load(:assoc).limit(n).count(column) bounds ROWS via a DISTINCT-pk id fetch, then re-counts", async () => {
    await seedBooksDuplicateRevisions();
    let count = 0;
    const sqls = await captureSql(async () => {
      count = await CpkBook.eagerLoad(":chapters")
        .order("cpk_books.author_id", "cpk_books.id")
        .limit(2)
        .count("cpk_books.revision");
    });
    expect(count).toBe(2 - 1);
    const idSql = sqls.find((s) => /DISTINCT.*cpk_books.*author_id/i.test(s) && /LIMIT/i.test(s));
    expect(idSql).toBeTruthy();
    const countSql = sqls.find((s) => /COUNT\(/i.test(s) && /IN \(/i.test(s)) ?? "";
    expect(countSql).toMatch(/DISTINCT/i);
    expect(countSql).toMatch(/author_id.*IN/i);
    expect(countSql).toMatch(/\bid\b.*IN/i);
  });

  it("eager_load(:assoc).order(non_pk_col).limit(n).count(column) routes the id fetch through columns_for_distinct", async () => {
    await seedBooksDuplicateRevisions();
    let count = 0;
    const sqls = await captureSql(async () => {
      count = await CpkBook.eagerLoad(":chapters")
        .order("cpk_books.title")
        .limit(2)
        .count("cpk_books.revision");
    });
    expect(count).toBe(1);
    const idSql = sqls.find((s) => /DISTINCT.*cpk_books.*author_id/i.test(s) && /LIMIT/i.test(s));
    expect(idSql).toBeTruthy();
    expect(idSql).toMatch(/ORDER BY .*title/i);
  });

  it("eager_load(:assoc).offset(n).count(column) bounds ROWS via the id fetch", async () => {
    await seedBooksDuplicateRevisions();
    const count = await CpkBook.eagerLoad(":chapters")
      .order("cpk_books.author_id", "cpk_books.id")
      .offset(1)
      .count("cpk_books.revision");
    expect(count).toBe(2);
  });

  async function seedBooksWithOrders(): Promise<void> {
    await CpkAuthor.create({ id: 1, name: "Author One" });
    const order100 = await CpkOrder.create({ id: [1, 100], status: "open" });
    const order200 = await CpkOrder.create({ id: [1, 200], status: "open" });
    await CpkBook.create({ id: [1, 1], order: order100, title: "Alpha" });
    await CpkBook.create({ id: [1, 2], order: order100, title: "Beta" });
    await CpkBook.create({ id: [1, 3], order: order200, title: "Gamma" });
  }

  it("eager_load(:x).group(:composite_fk_belongs_to).count folds the eager JD", async () => {
    await seedBooksWithOrders();
    const sqls = await captureSql(async () => {
      await expect(
        CpkBook.eagerLoad(":order").group("order").count("cpk_books.id"),
      ).rejects.toThrow(RAISE);
    });
    const groupSql = sqls.find((s) => /GROUP BY/i.test(s)) ?? "";
    expect(groupSql).toMatch(/LEFT OUTER JOIN .*cpk_orders/i);
  });

  it("eager_load(:x).group(:composite_fk_belongs_to).sum folds the eager JD", async () => {
    await seedBooksWithOrders();
    await expect(CpkBook.eagerLoad(":order").group("order").sum("id")).rejects.toThrow(RAISE);
  });
});

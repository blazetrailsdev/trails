import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
import { CpkBook, CpkOrder, CpkAuthor } from "../test-helpers/models/cpk.js";
import { sql as arelSql } from "@blazetrails/arel";
import { captureSql } from "../testing/sql-capture.js";

const RAISE = 'Expected corresponding value for ["shop_id", "id"] to be an Array';

describe("CpkBook grouped calculation over a composite-key belongs_to aliases the aggregate", () => {
  fixtures([]);

  beforeAll(() => {
    [CpkBook, CpkOrder, CpkAuthor].forEach((m) => registerModel(m));
  });

  async function seedOrders(): Promise<void> {
    await CpkAuthor.create({ id: 1, name: "Author One" });
    const orders = new Map<number, CpkOrder>();
    for (const id of [1, 2, 3]) {
      orders.set(id, await CpkOrder.create({ id: [1, id], status: `s-${id}` }));
    }
    const books: Array<[number, number]> = [
      [1, 1],
      [2, 2],
      [3, 2],
      [4, 2],
      [5, 3],
      [6, 3],
    ];
    for (const [bookId, orderId] of books) {
      await CpkBook.create({
        id: [1, bookId],
        title: `book-${bookId}`,
        revision: 1,
        order: orders.get(orderId),
      });
    }
  }

  it("group by a composite-key belongs_to projects the aggregate as count_all", async () => {
    await seedOrders();
    const sqls = await captureSql(async () => {
      await expect(CpkBook.group("order").count()).rejects.toThrow(RAISE);
    });

    const groupedSql = sqls.find((s) => /GROUP BY/i.test(s));
    expect(groupedSql).toMatch(/AS ["`]?count_all["`]?/i);
    expect(groupedSql).not.toMatch(/AS ["`]?val["`]?/i);
  });

  it("group by a composite-key belongs_to can order by the aggregate alias", async () => {
    await seedOrders();
    await expect(
      CpkBook.group("order").order(arelSql("count_all DESC")).limit(2).count(),
    ).rejects.toThrow(RAISE);
  });

  it("group by a composite-key belongs_to aliases a sum as sum_order_id", async () => {
    await seedOrders();
    const sqls = await captureSql(async () => {
      await expect(CpkBook.group("order").sum("order_id")).rejects.toThrow(RAISE);
    });

    const groupedSql = sqls.find((s) => /GROUP BY/i.test(s));
    expect(groupedSql).toMatch(/AS ["`]?sum_order_id["`]?/i);
  });
});

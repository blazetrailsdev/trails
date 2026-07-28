/**
 * Grouped calculation over a composite-key `belongsTo` must alias the aggregate
 * through the column-alias tracker, not a hard-coded "val".
 *
 * Rails' `execute_grouped_calculation` does not special-case foreign-key arity:
 * it always aliases the aggregate as
 * `column_alias_tracker.alias_for("#{operation} #{column_name}")` — `count_all`,
 * `sum_status`, … — so `order("count_all desc")` can reference the aggregate
 * (`activerecord/lib/active_record/relation/calculations.rb:536-539`). The
 * composite-FK arm `groupedCompositeAssoc` (`relation/calculations.ts`) instead
 * projected `AS "val"`, which both diverged from Rails' SQL and made an order by
 * the Rails alias unresolvable — reachable only since #5190 taught that arm to
 * apply `order_values` at all.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
import { CpkBook, CpkOrder, CpkAuthor } from "../test-helpers/models/cpk.js";
import { sql as arelSql } from "@blazetrails/arel";
import { captureSql } from "../testing/sql-capture.js";

describe("CpkBook grouped calculation over a composite-key belongs_to aliases the aggregate", () => {
  // Rails creates CPK rows inline; no cpk fixtures exist. Ride the canonical,
  // empty cpk tables and let transactional rollback clean up each insert.
  fixtures([]);

  beforeAll(() => {
    [CpkBook, CpkOrder, CpkAuthor].forEach((m) => registerModel(m));
  });

  // Three orders in shop 1. Book counts per order: 1 → 1, 2 → 3, 3 → 2.
  async function seedOrders(): Promise<void> {
    await CpkAuthor.create({ id: 1, name: "Author One" });
    for (const id of [1, 2, 3]) {
      await CpkOrder.create({ id: [1, id], status: `s-${id}` });
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
        shop_id: 1,
        order_id: orderId,
      });
    }
  }

  it("group by a composite-key belongs_to projects the aggregate as count_all", async () => {
    await seedOrders();
    let result: Map<unknown, number> = new Map();
    const sqls = await captureSql(async () => {
      result = (await CpkBook.group("order").count()) as Map<unknown, number>;
    });

    const groupedSql = sqls.find((s) => /GROUP BY/i.test(s));
    expect(groupedSql).toMatch(/AS ["`]?count_all["`]?/i);
    expect(groupedSql).not.toMatch(/AS ["`]?val["`]?/i);

    const counts = [...result.entries()].map(([order, count]) => [
      (order as CpkOrder | null)?.id,
      count,
    ]);
    expect(counts.sort()).toEqual(
      [
        [[1, 1], 1],
        [[1, 2], 3],
        [[1, 3], 2],
      ].sort(),
    );
  });

  it("group by a composite-key belongs_to can order by the aggregate alias", async () => {
    await seedOrders();
    const result = (await CpkBook.group("order")
      .order(arelSql("count_all DESC"))
      .limit(2)
      .count()) as Map<unknown, number>;

    const counts = [...result.entries()].map(([order, count]) => [
      (order as CpkOrder | null)?.id,
      count,
    ]);
    expect(counts).toEqual([
      [[1, 2], 3],
      [[1, 3], 2],
    ]);
  });

  it("group by a composite-key belongs_to aliases a sum as sum_order_id", async () => {
    await seedOrders();
    let result: Map<unknown, unknown> = new Map();
    const sqls = await captureSql(async () => {
      result = (await CpkBook.group("order").sum("order_id")) as Map<unknown, unknown>;
    });

    const groupedSql = sqls.find((s) => /GROUP BY/i.test(s));
    expect(groupedSql).toMatch(/AS ["`]?sum_order_id["`]?/i);

    const sums = [...result.entries()].map(([order, s]) => [(order as CpkOrder | null)?.id, s]);
    expect(sums.sort()).toEqual(
      [
        [[1, 1], 1],
        [[1, 2], 6],
        [[1, 3], 6],
      ].sort(),
    );
  });
});

/**
 * Grouped calculation over a composite-key `belongsTo` must apply the
 * relation's order before LIMIT/OFFSET.
 *
 * `groupedCompositeAssoc` (`relation/calculations.ts`) — the composite-FK
 * belongs_to arm of grouped calculations — applied LIMIT/OFFSET but never the
 * relation's `order_values`, so
 * `group(<composite belongs_to>).order(...).limit(n)` picked arbitrary groups
 * on PG/MySQL instead of the ordered first n. The sibling scalar/expression
 * arm `groupedAggregate` already applied it.
 *
 * Rails does not special-case key arity here: `execute_grouped_calculation`
 * builds ONE query from the relation's own arel, so `order_values` ride along
 * for composite and scalar foreign keys alike
 * (`activerecord/lib/active_record/relation/calculations.rb:553-556`).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
import { CpkBook, CpkOrder, CpkAuthor } from "../test-helpers/models/cpk.js";
import { sql as arelSql } from "@blazetrails/arel";
import { captureSql } from "../testing/sql-capture.js";

describe("CpkBook grouped calculation over a composite-key belongs_to applies order", () => {
  // Rails creates CPK rows inline; no cpk fixtures exist. Ride the canonical,
  // empty cpk tables and let transactional rollback clean up each insert.
  fixtures([]);

  beforeAll(() => {
    [CpkBook, CpkOrder, CpkAuthor].forEach((m) => registerModel(m));
  });

  // An aggregate order expression must go through `Arel.sql`: a bare
  // "COUNT(*) DESC" string is a non-attribute argument, so `disallowRawSql`
  // rejects it once `allowUnsafeRawSql` is disabled (as it is under the full
  // suite run).
  //
  // Three orders in shop 1. Book counts per order: 1 → 1, 2 → 3, 3 → 2.
  // Grouping by the composite belongs_to and ordering by COUNT(*) DESC makes
  // the ordered top-2 orders (2, 3) differ from the unordered/insertion-order
  // top-2 (1, 2), so a dropped ORDER BY changes the answer.
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

  it("group by a composite-key belongs_to with order and limit returns the ordered groups", async () => {
    await seedOrders();
    let result: Map<unknown, number> = new Map();
    const sqls = await captureSql(async () => {
      result = (await CpkBook.group("order")
        .order(arelSql("COUNT(*) DESC"))
        .limit(2)
        .count()) as Map<unknown, number>;
    });

    const counts = [...result.entries()].map(([order, count]) => [
      (order as CpkOrder | null)?.id,
      count,
    ]);
    expect(counts).toEqual([
      [[1, 2], 3],
      [[1, 3], 2],
    ]);

    const groupedSql = sqls.find((s) => /GROUP BY/i.test(s) && /LIMIT 2/i.test(s));
    expect(groupedSql).toBeTruthy();
    expect(groupedSql).toMatch(/ORDER BY[\s\S]*LIMIT 2/i);
  });

  it("group by a composite-key belongs_to with order and offset skips the ordered groups", async () => {
    await seedOrders();
    const result = (await CpkBook.group("order")
      .order(arelSql("COUNT(*) DESC"))
      .offset(2)
      .count()) as Map<unknown, number>;

    const counts = [...result.entries()].map(([order, count]) => [
      (order as CpkOrder | null)?.id,
      count,
    ]);
    // Ordered groups are (2 → 3), (3 → 2), (1 → 1); offset(2) leaves order 1.
    expect(counts).toEqual([[[1, 1], 1]]);
  });

  it("group by a composite-key belongs_to with a group-key column order and limit returns the ordered groups", async () => {
    await seedOrders();
    // A bare column order (rather than an aggregate expression) must resolve
    // against the model's table: descending order_id makes the top-2 groups
    // (3, 2) rather than the insertion-order (1, 2).
    const result = (await CpkBook.group("order").order("order_id DESC").limit(2).count()) as Map<
      unknown,
      number
    >;

    const counts = [...result.entries()].map(([order, count]) => [
      (order as CpkOrder | null)?.id,
      count,
    ]);
    expect(counts).toEqual([
      [[1, 3], 2],
      [[1, 2], 3],
    ]);
  });
});

/**
 * Port of vendor/rails/activerecord/test/cases/insert_all_test.rb.
 *
 * Uses the canonical models (Book/Author/Cart/Category/Developer/Ship/
 * Speedometer/Subscriber) and TEST_SCHEMA + handler fixtures rather than
 * bespoke per-test tables, so table/column/model names match Rails exactly.
 *
 * Test names mirror the Ruby method names verbatim (minus the `test_` prefix,
 * underscores rendered as spaces) so scripts/test-compare can match them.
 *
 * Many Rails tests here depend on features trails has not ported yet — they are
 * left `it.skip` with a BLOCKED tag and tracked by RFC 0030 follow-up stories:
 *   - insert_all/upsert_all returning an ActiveRecord::Result (RETURNING
 *     extraction) — d2-insert-all-returning-result
 *   - SQL logging assertions, db-warnings, has_many_through guards,
 *     partitioned indexes, Speedometer no-DB-key — d2-insert-all-canonical-models
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "./index.js";
import { UnknownAttributeError, RecordNotUnique } from "./errors.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { adapterType } from "./test-adapter.js";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { withDbWarningsAction } from "./test-helpers/with-db-warnings-action.js";
import { assertQueriesMatch, assertNoQueriesMatch } from "./testing/query-assertions.js";
import { Base } from "./base.js";
import { Result } from "./result.js";
import { Author } from "./test-helpers/models/author.js";
import { Book } from "./test-helpers/models/book.js";
import { Cart } from "./test-helpers/models/cart.js";
import { Category, SpecialCategory } from "./test-helpers/models/category.js";
import { Developer } from "./test-helpers/models/developer.js";
import { Ship } from "./test-helpers/models/ship.js";
import { Speedometer } from "./test-helpers/models/speedometer.js";
import { Subscriber } from "./test-helpers/models/subscriber.js";
import { Subscription } from "./test-helpers/models/subscription.js";

// Adapter capability gates (mirror Rails' supports_* predicates / current_adapter?).
// MySQL's ON DUPLICATE KEY UPDATE has no conflict-target syntax and no RETURNING.
const supportsInsertConflictTarget = adapterType !== "mysql";
const supportsInsertReturning = adapterType !== "mysql";
const isMysql = adapterType === "mysql";
// MySQL/MariaDB lack partial indexes; MariaDB also lacks expression indexes.
// The harness collapses both to adapterType "mysql", so gate off it — matching
// Rails' supports_partial_index? / supports_expression_index? on the tests.
const supportsPartialIndex = adapterType !== "mysql";
const supportsExpressionIndex = adapterType !== "mysql";

// ReadonlyNameBook < Book with attr_readonly :name (insert_all_test.rb:14).
class ReadonlyNameBook extends Book {
  static {
    this.attrReadonly("name");
  }
}

// trails-only regression model: a model whose configured primary_key ("isbn")
// diverges from the table's schema-cache primary keys (books' real PK is "id").
// "isbn" is chosen because it has a backing unique index, so the conflict-target
// resolution succeeds and we can observe the `returning` clause. Rails computes
// `primary_keys` as `Array(schema_cache.primary_keys(table_name))`
// (insert_all.rb:61), so InsertAll must emit `RETURNING "id"` — not "isbn".
class DivergentPrimaryKeyBook extends Book {
  static {
    this.primaryKey = "isbn";
  }
}

function getYear(val: unknown): number {
  if (val == null) return 0;
  if (val instanceof Temporal.Instant) return val.toZonedDateTimeISO("UTC").year;
  if (typeof val === "string") return parseInt(val.slice(0, 4), 10);
  if (val instanceof Date) return val.getUTCFullYear();
  if (typeof val === "object" && val !== null && "year" in (val as any)) {
    return (val as any).year as number;
  }
  return 0;
}

async function withRecordTimestamps(
  model: typeof Base,
  value: boolean,
  fn: () => Promise<void>,
): Promise<void> {
  const original = model.recordTimestamps;
  model.recordTimestamps = value;
  try {
    await fn();
  } finally {
    model.recordTimestamps = original;
  }
}

describe("InsertAllTest", () => {
  setupHandlerSuite();
  registerModel("Author", Author);
  registerModel("Book", Book);
  registerModel("Cart", Cart);
  registerModel("Category", Category);
  registerModel("SpecialCategory", SpecialCategory);
  registerModel("Developer", Developer);
  registerModel("Ship", Ship);
  registerModel("Speedometer", Speedometer);
  registerModel("Subscriber", Subscriber);
  registerModel("Subscription", Subscription);
  useHandlerFixtures(["authors", "books"], {
    schema: canonicalSchema,
    // These two raise a DB-level RecordNotUnique; a PG unique violation aborts
    // the surrounding transaction and poisons transactional-fixtures teardown,
    // so run them unwrapped (the per-test fixture reseed cleans up). The other
    // raising tests fail in find_unique_index_for (ArgumentError) before any SQL.
    usesTransaction: [
      "insert all raises on duplicate records",
      "insert all will raise if duplicates are skipped only for a certain conflict target",
      "insert all and upsert all with index finding options",
    ],
  });

  beforeAll(async () => {
    ReadonlyNameBook.attrReadonly("name");
    // Book/Author are reflected via fixtures; the others are queried but not
    // fixtured, so force column reflection before insertAll's synchronous
    // attribute/timestamp checks run.
    await Promise.all([
      Cart.loadSchema(),
      Category.loadSchema(),
      SpecialCategory.loadSchema(),
      Developer.loadSchema(),
      Ship.loadSchema(),
      Speedometer.loadSchema(),
    ]);
  });

  it("insert", async () => {
    const id = 1_000_000;
    await Book.insert({ id, name: "Rework", author_id: 1 });
    expect(await Book.exists(id)).toBe(true);
    await Book.upsert({ id, name: "Remote", author_id: 1 });
    expect(((await Book.find(id)) as any).name).toBe("Remote");
  });

  it("insert!", async () => {
    const before = (await Book.count()) as number;
    await Book.insertBang({ name: "Rework", author_id: 1 });
    expect(await Book.count()).toBe(before + 1);
  });

  it.skip("insert with type casting and serialize is consistent", () => {
    // BLOCKED: Rails passes an array as the (string) book name and relies on
    // serialize round-tripping; trails' Book.name is a plain string type, so
    // this exercises serialize behavior out of scope here.
    // RFC 0030 d2-insert-all-returning-result.
  });

  it("insert all", async () => {
    const before = (await Book.count()) as number;
    await Book.insertAllBang([
      { name: "Rework", author_id: 1 },
      { name: "Patterns of Enterprise Application Architecture", author_id: 1 },
      { name: "Design of Everyday Things", author_id: 1 },
      { name: "Practical Object-Oriented Design in Ruby", author_id: 1 },
      { name: "Clean Code", author_id: 1 },
      { name: "Ruby Under a Microscope", author_id: 1 },
      { name: "The Principles of Product Development Flow", author_id: 1 },
      { name: "Peopleware", author_id: 1 },
      { name: "About Face", author_id: 1 },
      { name: "Eloquent Ruby", author_id: 1 },
    ]);
    expect(await Book.count()).toBe(before + 10);
  });

  it("insert all should handle empty arrays", async () => {
    // Rails asserts assert_empty on the returned ActiveRecord::Result.
    expect((await Book.insertAll([])).length).toBe(0);
    expect((await Book.insertAllBang([])).length).toBe(0);
    expect((await Book.upsertAll([])).length).toBe(0);
  });

  it("insert all raises on duplicate records", async () => {
    // The third row collides with the awdr fixture (author_id 1, "Agile Web
    // Development with Rails") on the unique [author_id, name] index.
    await expect(
      Book.insertAllBang([
        { name: "Rework", author_id: 1 },
        { name: "Patterns of Enterprise Application Architecture", author_id: 1 },
        { name: "Agile Web Development with Rails", author_id: 1 },
      ]),
    ).rejects.toThrow(RecordNotUnique);
  });

  it("insert all returns ActiveRecord Result", async () => {
    const result = await Book.insertAllBang([{ name: "Rework", author_id: 1 }]);
    expect(result).toBeInstanceOf(Result);
  });

  it.skipIf(!supportsInsertReturning)(
    "insert all returns primary key if returning is supported",
    async () => {
      const result = await Book.insertAllBang([{ name: "Rework", author_id: 1 }]);
      expect(result.columns).toEqual(["id"]);
    },
  );

  it.skipIf(!supportsInsertReturning)(
    "insert all returns nothing if returning is empty",
    async () => {
      const result = await Book.insertAllBang([{ name: "Rework", author_id: 1 }], {
        returning: [],
      });
      expect(result.columns).toEqual([]);
    },
  );

  it.skipIf(!supportsInsertReturning)(
    "insert all returns nothing if returning is false",
    async () => {
      const result = await Book.insertAllBang([{ name: "Rework", author_id: 1 }], {
        returning: false,
      });
      expect(result.columns).toEqual([]);
    },
  );

  it.skipIf(!supportsInsertReturning)("insert all returns requested fields", async () => {
    const result = await Book.insertAllBang([{ name: "Rework", author_id: 1 }], {
      returning: ["id", "name"],
    });
    expect(result.pluck("name")).toEqual(["Rework"]);
  });

  it.skipIf(!supportsInsertReturning)("insert all returns requested sql fields", async () => {
    const { sql } = await import("@blazetrails/arel");
    const result = await Book.insertAllBang([{ name: "Rework", author_id: 1 }], {
      returning: sql("UPPER(name) as name"),
    });
    expect(result.pluck("name")).toEqual(["REWORK"]);
  });

  it("insert all can skip duplicate records", async () => {
    const before = (await Book.count()) as number;
    // id 1 is the `awdr` fixture, so the row is skipped on the PK conflict.
    await Book.insertAll([{ id: 1, name: "Agile Web Development with Rails" }]);
    expect(await Book.count()).toBe(before);
  });

  // Rails gates these to MySQL (`if current_adapter?(:Mysql2Adapter, :TrilogyAdapter)`):
  // ON DUPLICATE KEY UPDATE is MySQL-specific, and SQLite/PG reject
  // `DEFAULT VALUES ON CONFLICT`.
  it.skipIf(!isMysql)("insert all generates correct sql", async () => {
    await assertQueriesMatch(/ON DUPLICATE KEY UPDATE/, undefined, false, async () => {
      await Book.insertAll([{ id: 1, name: "Agile Web Development with Rails" }]);
    });
  });

  it.skipIf(!isMysql)("insert all succeeds when passed no attributes", async () => {
    await expect(Book.insertAll([{}])).resolves.not.toThrow();
  });

  it("insert all with skip duplicates and autonumber id not given", async () => {
    const before = (await Book.count()) as number;
    // Duplicates per the unique [author_id, name] index, but their IDs are not
    // specified, so one is skipped by the index rather than by id.
    await Book.insertAll([
      { author_id: 8, name: "Refactoring" },
      { author_id: 8, name: "Refactoring" },
    ]);
    expect(((await Book.count()) as number) - before).toBe(1);
  });

  it("insert all with skip duplicates and autonumber id given", async () => {
    const before = (await Book.count()) as number;
    await Book.insertAll([
      { id: 200, author_id: 8, name: "Refactoring" },
      { id: 201, author_id: 8, name: "Refactoring" },
    ]);
    expect(((await Book.count()) as number) - before).toBe(1);
  });

  it("skip duplicates strategy does not secretly upsert", async () => {
    const book = await Book.create({ format: "EXPECTED", author_id: 8, name: "Refactoring" });
    const before = (await Book.count()) as number;
    await Book.insertAll([{ format: "UNEXPECTED", author_id: 8, name: "Refactoring" }]);
    expect((await Book.count()) as number).toBe(before);
    await book.reload();
    expect(book.format).toBe("EXPECTED");
  });

  it.skipIf(!supportsInsertConflictTarget)(
    "insert all will raise if duplicates are skipped only for a certain conflict target",
    async () => {
      // The awdr fixture occupies id 1; the conflict target is (author_id, name),
      // so the colliding primary key surfaces as RecordNotUnique.
      await expect(
        Book.insertAll([{ id: 1, name: "Agile Web Development with Rails" }], {
          uniqueBy: "index_books_on_author_id_and_name",
        }),
      ).rejects.toThrow(RecordNotUnique);
    },
  );

  it.skipIf(!supportsInsertConflictTarget)(
    "insert all and upsert all with index finding options",
    async () => {
      const before = (await Book.count()) as number;
      await Book.insertAll([{ name: "Rework", author_id: 1 }], { uniqueBy: "isbn" });
      await Book.insertAll([{ name: "Remote", author_id: 1 }], { uniqueBy: ["author_id", "name"] });
      await Book.insertAll([{ name: "Renote", author_id: 1 }], {
        uniqueBy: "index_books_on_isbn",
      });
      await Book.insertAll([{ name: "Recoat", author_id: 1 }], { uniqueBy: "id" });
      expect(((await Book.count()) as number) - before).toBe(4);

      await expect(
        Book.upsertAll([{ name: "Rework", author_id: 1 }], { uniqueBy: "isbn" }),
      ).rejects.toThrow(RecordNotUnique);
    },
  );

  it.skipIf(!supportsInsertConflictTarget || !supportsExpressionIndex)(
    "insert all and upsert all with expression index",
    async () => {
      const book = await Book.create({ external_id: "abc" });
      const before = (await Book.count()) as number;
      await Book.insertAll([{ external_id: "ABC" }], {
        uniqueBy: "index_books_on_lower_external_id",
      });
      expect(((await Book.count()) as number) - before).toBe(0);

      await Book.upsertAll([{ external_id: "Abc" }], {
        uniqueBy: "index_books_on_lower_external_id",
      });
      await book.reload();
      expect(book.external_id).toBe("Abc");
    },
  );

  it.skipIf(!supportsInsertConflictTarget)(
    "insert all and upsert all raises when index is missing",
    async () => {
      for (const missing of ["cats", ["author_id", "isbn"], "author_id"] as const) {
        await expect(
          Book.insertAll([{ name: "Rework", author_id: 1 }], { uniqueBy: missing as any }),
        ).rejects.toThrow(/No unique index/);
        await expect(
          Book.upsertAll([{ name: "Rework", author_id: 1 }], { uniqueBy: missing as any }),
        ).rejects.toThrow(/No unique index/);
      }
    },
  );

  it.skipIf(!supportsInsertConflictTarget)(
    "insert all and upsert all finds index with inverted unique by columns",
    async () => {
      const before = (await Book.count()) as number;
      // [author_id, name] has a unique index; passing the columns reversed must
      // still resolve to it (sorted-column match).
      await Book.insertAll([{ name: "Remote", author_id: 1 }], { uniqueBy: ["name", "author_id"] });
      await Book.upsertAll([{ name: "Rework", author_id: 1 }], { uniqueBy: ["name", "author_id"] });
      expect(((await Book.count()) as number) - before).toBe(2);
    },
  );

  it.skipIf(!supportsInsertConflictTarget)(
    "insert all and upsert all works with composite primary keys when unique by is provided",
    async () => {
      const before = (await Cart.count()) as number;
      await Cart.insertAll([{ id: 1, shop_id: 1, title: "My cart" }], {
        uniqueBy: ["shop_id", "id"],
      });
      await Cart.upsertAll([{ id: 3, shop_id: 2, title: "My other cart" }], {
        uniqueBy: ["shop_id", "id"],
      });
      expect(((await Cart.count()) as number) - before).toBe(2);

      // The configured PK is "id"; the DB PK is composite [shop_id, id], so a
      // bang insert with no unique_by raises on the unmatched "id".
      await expect(Cart.insertAllBang([{ id: 2, shop_id: 1, title: "My cart" }])).rejects.toThrow(
        /No unique index found for id/,
      );
    },
  );

  it.skipIf(supportsInsertConflictTarget)(
    "insert all and upsert all works with composite primary keys when unique by is not provided",
    async () => {
      const before = (await Cart.count()) as number;
      await Cart.insertAll([{ id: 1, shop_id: 1, title: "My cart" }]);
      await Cart.insertAllBang([{ id: 2, shop_id: 1, title: "My cart 2" }]);
      await Cart.upsertAll([{ id: 3, shop_id: 2, title: "My other cart" }]);
      expect(await Cart.count()).toBe(before + 3);
    },
  );

  it.skip("insert logs message including model name", () => {
    // BLOCKED: SQL log assertion (capture_log_output). RFC 0030 d2-insert-all-canonical-models.
  });

  it.skip("insert all logs message including model name", () => {
    // BLOCKED: SQL log assertion. RFC 0030 d2-insert-all-canonical-models.
  });

  it.skip("insert all and upsert all with aliased attributes", () => {
    // BLOCKED: RETURNING does not resolve aliased attributes — `returning: :title`
    // (alias for `name`) emits `RETURNING "title"` instead of `"name" AS "title"`,
    // so SQLite errors "no such column: title". The INSERT column list resolves
    // the alias, but Builder.returning() does not.
    // RFC 0030 d2-insert-all-returning-result.
  });

  it("insert all and upsert all with sti", async () => {
    const before = (await Category.count()) as number;
    await SpecialCategory.insertAll([{ name: "First" }, { name: "Second", type: null }]);
    expect(await Category.count()).toBe(before + 2);

    const [first, second] = (await Category.last(2)) as any[];
    expect(first.type).toBe("SpecialCategory");
    expect(second.type).toBeNull();

    await SpecialCategory.upsertAll([
      { id: 103, name: "First" },
      { id: 104, name: "Second", type: null },
    ]);

    const category3 = (await Category.find(103)) as any;
    expect(category3.type).toBe("SpecialCategory");

    const category4 = (await Category.find(104)) as any;
    expect(category4.type).toBeNull();
  });

  it.skip("upsert logs message including model name", () => {
    // BLOCKED: SQL log assertion. RFC 0030 d2-insert-all-canonical-models.
  });

  // Rails guards this with `unless in_memory_db?` (insert_all_test.rb:359).
  // trails' default SQLite worker is file-backed, never `:memory:`, so the
  // guard is a no-op here and the test runs on every adapter.
  it("upsert and db warnings", async () => {
    try {
      await withDbWarningsAction("raise", async () => {
        await expect(
          Book.upsert({ id: 1001, name: "Remote", author_id: 1 }),
        ).resolves.not.toThrow();
      });
    } finally {
      // We need to explicitly remove the record, because `withDbWarningsAction`
      // prevents the wrapping transaction from being rolled back.
      await Book.delete(1001);
    }
  });

  it.skip("upsert all logs message including model name", () => {
    // BLOCKED: SQL log assertion. RFC 0030 d2-insert-all-canonical-models.
  });

  it("upsert all updates existing records", async () => {
    const newName = "Agile Web Development with Rails, 4th Edition";
    await Book.upsertAll([{ id: 1, name: newName }]);
    expect(((await Book.find(1)) as any).name).toBe(newName);
  });

  it.skipIf(!supportsInsertConflictTarget)(
    "upsert all updates existing record by primary key",
    async () => {
      await Book.upsertAll([{ id: 1, name: "New edition" }], { uniqueBy: "id" });
      expect(((await Book.find(1)) as any).name).toBe("New edition");
    },
  );

  it.skipIf(supportsInsertConflictTarget)(
    "upsert all does notupdates existing record by when there is no key",
    async () => {
      await Speedometer.create({ speedometer_id: "s3", name: "Very fast" });
      await Speedometer.upsertAll([{ speedometer_id: "s3", name: "New Speedometer" }]);
      expect(((await Speedometer.find("s3")) as any).name).toBe("Very fast");
    },
  );

  it.skipIf(!supportsInsertConflictTarget)(
    "upsert all updates existing record by configured primary key fails when database supports insert conflict target",
    async () => {
      // speedometer_id is the configured PK but has no backing unique index on
      // the id-less table, so the conflict-target lookup raises.
      await expect(
        Speedometer.upsertAll([{ speedometer_id: "s1", name: "New Speedometer" }]),
      ).rejects.toThrow(/No unique index found for speedometer_id/);
    },
  );

  // Speedometer's configured PK (speedometer_id) is not a database primary key,
  // so Rails InsertAll#readonly_columns (schema_cache primary_keys = []) does NOT
  // exclude it from the ON DUPLICATE KEY UPDATE set. (On conflict-target adapters
  // any insert/upsert on this id-less table raises in find_unique_index_for
  // before the update set is built — see the configured-primary-key tests above —
  // so this convergence is only observable on MySQL.)
  it.skipIf(!isMysql)(
    "upsert all on a table without a database primary key treats the configured primary key as updatable",
    async () => {
      await assertQueriesMatch(
        /ON DUPLICATE KEY UPDATE[\s\S]*speedometer_id/,
        undefined,
        false,
        async () => {
          await Speedometer.upsertAll([{ speedometer_id: "s9", name: "Fast" }]);
        },
      );
    },
  );

  it("upsert all does not update readonly attributes", async () => {
    const newName = "Agile Web Development with Rails, 4th Edition";
    await ReadonlyNameBook.upsertAll([{ id: 1, name: newName }]);
    expect(((await Book.find(1)) as any).name).not.toBe(newName);
  });

  it.skipIf(!supportsInsertConflictTarget)("upsert all does not update primary keys", async () => {
    await Book.upsertAll([{ id: 101, name: "Perelandra", author_id: 7 }]);
    await Book.upsertAll([{ id: 103, name: "Perelandra", author_id: 7, isbn: "1974522598" }], {
      uniqueBy: "index_books_on_author_id_and_name",
    });

    const book = (await Book.findBy({ name: "Perelandra" })) as any;
    expect(book.id).toBe(101);
    expect(book.isbn).toBe("1974522598");
  });

  it("upsert all passing both on duplicate and update only will raise an error", async () => {
    const { sql } = await import("@blazetrails/arel");
    await expect(
      Book.upsertAll([{ id: 101, name: "Perelandra", author_id: 7, isbn: "1974522598" }], {
        onDuplicate: sql("NAME=values(name)"),
        updateOnly: "name",
      }),
    ).rejects.toThrow(ArgumentError);
  });

  it("upsert all only updates the column provided via update only", async () => {
    await Book.upsertAll([{ id: 101, name: "Perelandra", author_id: 7, isbn: "1974522598" }]);
    await Book.upsertAll([{ id: 101, name: "Perelandra 2", author_id: 7, isbn: "111111" }], {
      updateOnly: "name",
    });
    const book = (await Book.find(101)) as any;
    expect(book.name).toBe("Perelandra 2");
    expect(book.isbn).toBe("1974522598");
  });

  it("upsert all only updates the list of columns provided via update only", async () => {
    await Book.upsertAll([{ id: 101, name: "Perelandra", author_id: 7, isbn: "1974522598" }]);
    await Book.upsertAll([{ id: 101, name: "Perelandra 2", author_id: 6, isbn: "111111" }], {
      updateOnly: ["name", "isbn"],
    });
    const book = (await Book.find(101)) as any;
    expect(book.name).toBe("Perelandra 2");
    expect(book.isbn).toBe("111111");
    expect(book.author_id).toBe(7);
  });

  it.skipIf(!supportsInsertConflictTarget || !supportsPartialIndex)(
    "upsert all does not perform an upsert if a partial index doesnt apply",
    async () => {
      await Book.upsertAll([
        {
          name: "Out of the Silent Planet",
          author_id: 7,
          isbn: "1974522598",
          published_on: Temporal.Instant.from("1938-04-01T00:00:00Z"),
        },
      ]);
      // The second row's published_on is NULL, so the partial unique index on
      // isbn does not apply — it inserts rather than updating the first row.
      await Book.upsertAll([{ name: "Perelandra", author_id: 7, isbn: "1974522598" }], {
        uniqueBy: "index_books_on_isbn",
      });

      const names = ((await Book.where({ isbn: "1974522598" }).toArray()) as any[])
        .map((b) => b.name)
        .sort();
      expect(names).toEqual(["Out of the Silent Planet", "Perelandra"]);
    },
  );

  it("upsert all does not touch updated at when values do not change", async () => {
    const updatedAt = Temporal.Instant.from("2018-01-01T00:00:00Z");
    await Book.insertAll(
      [
        {
          id: 101,
          name: "Out of the Silent Planet",
          published_on: "1938-04-01",
          updated_at: updatedAt,
        },
      ],
      { recordTimestamps: false },
    );
    await Book.upsertAll([
      { id: 101, name: "Out of the Silent Planet", published_on: "1938-04-01" },
    ]);
    expect(getYear(((await Book.find(101)) as any).updated_at)).toBe(2018);
  });

  it("upsert all touches updated at and updated on when values change", async () => {
    const old = Temporal.Instant.from("2018-01-01T00:00:00Z");
    await Book.insertAll(
      [
        {
          id: 101,
          name: "Out of the Silent Planet",
          published_on: "1938-04-01",
          updated_at: old,
          updated_on: "2018-01-01",
        },
      ],
      { recordTimestamps: false },
    );
    await Book.upsertAll([
      { id: 101, name: "Out of the Silent Planet", published_on: "1938-04-08" },
    ]);
    const year = new Date().getUTCFullYear();
    expect(getYear(((await Book.find(101)) as any).updated_at)).toBe(year);
    expect(getYear(((await Book.find(101)) as any).updated_on)).toBe(year);
  });

  it("upsert all respects updated at precision when touched implicitly", async () => {
    await Book.insertAll(
      [
        {
          id: 101,
          name: "Out of the Silent Planet",
          published_on: "1938-04-01",
          updated_at: Temporal.Instant.from("2018-01-01T00:00:00Z"),
        },
      ],
      { recordTimestamps: false },
    );
    let hasSubsecond = false;
    for (let i = 1; i <= 100 && !hasSubsecond; i++) {
      await Book.upsertAll([{ id: 101, name: `Out of the Silent Planet (Edition ${i})` }]);
      const ua = ((await Book.find(101)) as any).updated_at as Temporal.Instant | null;
      if (ua) hasSubsecond = ua.epochMilliseconds % 1000 !== 0;
    }
    expect(hasSubsecond).toBe(true);
  });

  it("upsert all uses given updated at over implicit updated at", async () => {
    const updatedAt = Temporal.Instant.from("2025-01-01T00:00:00Z");
    await Book.insertAll(
      [
        {
          id: 101,
          name: "Out of the Silent Planet",
          published_on: "1938-04-01",
          updated_at: Temporal.Instant.from("2018-01-01T00:00:00Z"),
        },
      ],
      { recordTimestamps: false },
    );
    await Book.upsertAll([
      {
        id: 101,
        name: "Out of the Silent Planet",
        published_on: "1938-04-08",
        updated_at: updatedAt,
      },
    ]);
    expect(getYear(((await Book.find(101)) as any).updated_at)).toBe(2025);
  });

  it("upsert all uses given updated on over implicit updated on", async () => {
    await Book.insertAll(
      [
        {
          id: 101,
          name: "Out of the Silent Planet",
          published_on: "1938-04-01",
          updated_on: "2018-01-01",
        },
      ],
      { recordTimestamps: false },
    );
    await Book.upsertAll([
      {
        id: 101,
        name: "Out of the Silent Planet",
        published_on: "1938-04-08",
        updated_on: "2025-06-01",
      },
    ]);
    expect(getYear(((await Book.find(101)) as any).updated_on)).toBe(2025);
  });

  it("upsert all implicitly sets timestamps on create when model record timestamps is true", async () => {
    await withRecordTimestamps(Ship, true, async () => {
      await Ship.upsertAll([{ id: 101, name: "RSS Boaty McBoatface" }]);
      const ship = (await Ship.find(101)) as any;
      const year = new Date().getUTCFullYear();
      expect(getYear(ship.created_at)).toBe(year);
      expect(getYear(ship.created_on)).toBe(year);
      expect(getYear(ship.updated_at)).toBe(year);
      expect(getYear(ship.updated_on)).toBe(year);
    });
  });

  it("upsert all does not implicitly set timestamps on create when model record timestamps is true but overridden", async () => {
    await withRecordTimestamps(Ship, true, async () => {
      await Ship.upsertAll([{ id: 101, name: "RSS Boaty McBoatface" }], {
        recordTimestamps: false,
      });
      const ship = (await Ship.find(101)) as any;
      expect(ship.created_at).toBeNull();
      expect(ship.created_on).toBeNull();
      expect(ship.updated_at).toBeNull();
      expect(ship.updated_on).toBeNull();
    });
  });

  it("upsert all does not implicitly set timestamps on create when model record timestamps is false", async () => {
    await withRecordTimestamps(Ship, false, async () => {
      await Ship.upsertAll([{ id: 101, name: "RSS Boaty McBoatface" }]);
      const ship = (await Ship.find(101)) as any;
      expect(ship.created_at).toBeNull();
      expect(ship.created_on).toBeNull();
      expect(ship.updated_at).toBeNull();
      expect(ship.updated_on).toBeNull();
    });
  });

  it("upsert all implicitly sets timestamps on create when model record timestamps is false but overridden", async () => {
    await withRecordTimestamps(Ship, false, async () => {
      await Ship.upsertAll([{ id: 101, name: "RSS Boaty McBoatface" }], { recordTimestamps: true });
      const ship = (await Ship.find(101)) as any;
      const year = new Date().getUTCFullYear();
      expect(getYear(ship.created_at)).toBe(year);
      expect(getYear(ship.created_on)).toBe(year);
      expect(getYear(ship.updated_at)).toBe(year);
      expect(getYear(ship.updated_on)).toBe(year);
    });
  });

  it("upsert all respects created at precision when touched implicitly", async () => {
    let hasSubsecond = false;
    await withRecordTimestamps(Ship, true, async () => {
      for (let i = 1; i <= 100 && !hasSubsecond; i++) {
        await Ship.upsertAll([{ id: 200 + i, name: "Boaty" }]);
        const ca = ((await Ship.find(200 + i)) as any).created_at as Temporal.Instant | null;
        if (ca) hasSubsecond = ca.epochMilliseconds % 1000 !== 0;
      }
    });
    expect(hasSubsecond).toBe(true);
  });

  it("upsert all implicitly sets timestamps on update when model record timestamps is true", async () => {
    await withRecordTimestamps(Ship, true, async () => {
      const seed = Temporal.Instant.from("2016-04-17T00:00:00Z");
      await Ship.insertAll(
        [{ id: 101, name: "RSS Boaty McBoatface", created_at: seed, created_on: "2016-04-17" }],
        { recordTimestamps: false },
      );
      await Ship.upsertAll([{ id: 101, name: "RSS Sir David Attenborough" }]);
      const ship = (await Ship.find(101)) as any;
      const year = new Date().getUTCFullYear();
      expect(getYear(ship.created_at)).toBe(2016);
      expect(getYear(ship.created_on)).toBe(2016);
      expect(getYear(ship.updated_at)).toBe(year);
      expect(getYear(ship.updated_on)).toBe(year);
    });
  });

  it("upsert all does not implicitly set timestamps on update when model record timestamps is true but overridden", async () => {
    await withRecordTimestamps(Ship, true, async () => {
      const seed = Temporal.Instant.from("2016-04-17T00:00:00Z");
      await Ship.insertAll(
        [
          {
            id: 101,
            name: "RSS Boaty McBoatface",
            created_at: seed,
            created_on: "2016-04-17",
            updated_at: seed,
            updated_on: "2016-04-17",
          },
        ],
        { recordTimestamps: false },
      );
      await Ship.upsertAll([{ id: 101, name: "RSS Sir David Attenborough" }], {
        recordTimestamps: false,
      });
      const ship = (await Ship.find(101)) as any;
      expect(getYear(ship.created_at)).toBe(2016);
      expect(getYear(ship.created_on)).toBe(2016);
      expect(getYear(ship.updated_at)).toBe(2016);
      expect(getYear(ship.updated_on)).toBe(2016);
    });
  });

  it("upsert all does not implicitly set timestamps on update when model record timestamps is false", async () => {
    await withRecordTimestamps(Ship, false, async () => {
      await Ship.insertAll([{ id: 101, name: "RSS Boaty McBoatface" }], {
        recordTimestamps: false,
      });
      await Ship.upsertAll([{ id: 101, name: "RSS Sir David Attenborough" }]);
      const ship = (await Ship.find(101)) as any;
      expect(ship.created_at).toBeNull();
      expect(ship.created_on).toBeNull();
      expect(ship.updated_at).toBeNull();
      expect(ship.updated_on).toBeNull();
    });
  });

  it("upsert all implicitly sets timestamps on update when model record timestamps is false but overridden", async () => {
    await withRecordTimestamps(Ship, false, async () => {
      await Ship.insertAll([{ id: 101, name: "RSS Boaty McBoatface" }], {
        recordTimestamps: false,
      });
      await Ship.upsertAll([{ id: 101, name: "RSS Sir David Attenborough" }], {
        recordTimestamps: true,
      });
      const ship = (await Ship.find(101)) as any;
      expect(ship.created_at).toBeNull();
      expect(ship.created_on).toBeNull();
      expect(getYear(ship.updated_at)).toBe(new Date().getUTCFullYear());
      expect(getYear(ship.updated_on)).toBe(new Date().getUTCFullYear());
    });
  });

  it("upsert all implicitly sets timestamps even when columns are aliased", async () => {
    await Developer.upsertAll([{ id: 101, name: "Alice" }]);
    const alice = (await Developer.find(101)) as any;

    expect(alice.created_at).not.toBeNull();
    expect(alice.created_on).not.toBeNull();
    expect(alice.updated_at).not.toBeNull();
    expect(alice.updated_on).not.toBeNull();

    await alice.updateBang({
      created_at: null,
      created_on: null,
      updated_at: null,
      updated_on: null,
    });

    await Developer.upsertAll([{ id: alice.id, name: alice.name, salary: alice.salary * 2 }]);
    await alice.reload();

    expect(alice.created_at).toBeNull();
    expect(alice.created_on).toBeNull();
    expect(alice.updated_at).not.toBeNull();
    expect(alice.updated_on).not.toBeNull();
  });

  it("insert all raises on unknown attribute", async () => {
    await expect(Book.insertAllBang([{ unknown_attribute: "Test" }])).rejects.toThrow(
      UnknownAttributeError,
    );
  });

  // Rails gates test_upsert_all_works_with_partitioned_indexes on
  // supports_insert_on_duplicate_update? && supports_insert_conflict_target? &&
  // supports_partitioned_indexes? → PostgreSQL >= 11 only. The canonical
  // `measurements` partitioned table (postgresql_specific_schema.rb:186-198) has
  // no partition DSL in our defineSchema, so it is built via raw PG DDL below.
  it.skipIf(adapterType !== "postgres")("upsert all works with partitioned indexes", async () => {
    // supports_partitioned_indexes? is PostgreSQL >= 11; every PG lane we run
    // (CI uses postgres:17) clears that, so the adapterType gate above suffices.
    const conn = Base.connection as any;

    await conn.executeMutation('DROP TABLE IF EXISTS "measurements" CASCADE');
    await conn.executeMutation(
      'CREATE TABLE "measurements" (' +
        '"city_id" character varying NOT NULL, ' +
        '"logdate" date NOT NULL, ' +
        '"peaktemp" integer, ' +
        '"unitsales" integer' +
        ") PARTITION BY LIST (city_id)",
    );
    await conn.executeMutation(
      'CREATE UNIQUE INDEX "index_measurements_on_logdate_and_city_id" ' +
        'ON "measurements" ("logdate", "city_id")',
    );
    await conn.executeMutation(
      'CREATE TABLE "measurements_toronto" PARTITION OF "measurements" FOR VALUES IN (1)',
    );
    await conn.executeMutation(
      'CREATE TABLE "measurements_concepcion" PARTITION OF "measurements" FOR VALUES IN (2)',
    );
    conn.schemaCache?.clear();

    // Rails uses the empty `models/measurement.rb` and introspects the
    // partitioned table's columns + (absent) primary key. Our PK introspection
    // still defaults a no-PK table to "id", so the columns and `primaryKey = ""`
    // (no PK, mirroring the partitioned table) are declared here instead — the
    // alternative the story sanctions over DB introspection.
    class Measurement extends Base {
      static {
        this.primaryKey = "";
        this.attribute("city_id", "string");
        this.attribute("logdate", "date");
        this.attribute("peaktemp", "integer");
        this.attribute("unitsales", "integer");
      }
    }

    const today = Temporal.Now.plainDateISO();
    const oneDayAgo = today.subtract({ days: 1 });
    const twoDaysAgo = today.subtract({ days: 2 });
    const threeDaysAgo = today.subtract({ days: 3 });

    await Measurement.upsertAll(
      [
        { city_id: "1", logdate: oneDayAgo, peaktemp: 1, unitsales: 1 },
        { city_id: "2", logdate: twoDaysAgo, peaktemp: 2, unitsales: 2 },
        { city_id: "2", logdate: threeDaysAgo, peaktemp: 0, unitsales: 0 },
      ],
      { uniqueBy: ["logdate", "city_id"] },
    );

    const torontoRows = (
      await Measurement.where({ city_id: 1 }).pluck("logdate", "peaktemp", "unitsales")
    ).map((r: any) => [String(r[0]), r[1], r[2]]);
    expect(torontoRows).toEqual([[oneDayAgo.toString(), 1, 1]]);

    const concepcionRows = (
      await Measurement.where({ city_id: 2 }).pluck("logdate", "peaktemp", "unitsales")
    ).map((r: any) => [String(r[0]), r[1], r[2]]);
    expect(concepcionRows).toEqual([
      [twoDaysAgo.toString(), 2, 2],
      [threeDaysAgo.toString(), 0, 0],
    ]);

    await conn.executeMutation('DROP TABLE IF EXISTS "measurements" CASCADE');
  });

  // trails-only regression (no Rails counterpart): guards insert_all.rb:61 —
  // `primary_keys` reads the schema cache, so a model whose configured
  // primary_key ("name") differs from the table's real PK ("id") still emits
  // `RETURNING "id"`. Before the schema-cache fix this emitted `RETURNING "name"`.
  it.skipIf(!supportsInsertReturning)(
    "insert all returning uses schema-cache primary keys not the model primary key",
    async () => {
      await assertQueriesMatch(/RETURNING "id"/, undefined, false, async () => {
        await DivergentPrimaryKeyBook.insertAll([
          { name: "Divergent", isbn: "9990000000001", author_id: 1 },
        ]);
      });
      await assertNoQueriesMatch(/RETURNING "isbn"/, false, async () => {
        await DivergentPrimaryKeyBook.insertAll([
          { name: "Divergent II", isbn: "9990000000002", author_id: 1 },
        ]);
      });
    },
  );

  it("insert all with enum values", async () => {
    await Book.insertAllBang([
      { status: "published", isbn: "1234566", name: "Rework", author_id: 1 },
      { status: "proposed", isbn: "1234567", name: "Remote", author_id: 2 },
    ]);
    const statuses = (
      await Book.where({ isbn: ["1234566", "1234567"] })
        .order("id")
        .toArray()
    ).map((b: any) => b.status);
    expect(statuses).toEqual(["published", "proposed"]);
  });

  it("insert all on relation", async () => {
    const author = await Author.create({ name: "Jimmy" });
    const before = (await (author as any).books.count()) as number;
    await (author as any).books.insertAllBang([{ name: "My little book", isbn: "1974522598" }]);
    expect(await (author as any).books.count()).toBe(before + 1);
  });

  it("insert all on relation precedence", async () => {
    const author = await Author.create({ name: "Jimmy" });
    const secondAuthor = await Author.create({ name: "Bob" });
    const before = (await (author as any).books.count()) as number;
    await (author as any).books.insertAllBang([
      { name: "My little book", isbn: "1974522598", author_id: (secondAuthor as any).id },
    ]);
    expect(await (author as any).books.count()).toBe(before + 1);
  });

  it("insert all create with", async () => {
    const before = (await Book.where({ format: "X" }).count()) as number;
    await Book.createWith({ format: "X" }).insertAllBang([{ name: "A" }, { name: "B" }]);
    expect(await Book.where({ format: "X" }).count()).toBe(before + 2);
  });

  it("insert all has many through", async () => {
    const book = (await Book.first()) as any;
    await expect(book.subscribers.insertAllBang([{ nick: "Jimmy" }])).rejects.toThrow(
      ArgumentError,
    );
  });

  it("upsert all on relation", async () => {
    const author = await Author.create({ name: "Jimmy" });
    const before = (await (author as any).books.count()) as number;
    await (author as any).books.upsertAll([{ name: "My little book", isbn: "1974522598" }]);
    expect(await (author as any).books.count()).toBe(before + 1);
  });

  it("upsert all on relation precedence", async () => {
    const author = await Author.create({ name: "Jimmy" });
    const secondAuthor = await Author.create({ name: "Bob" });
    const before = (await (author as any).books.count()) as number;
    await (author as any).books.upsertAll([
      { name: "My little book", isbn: "1974522598", author_id: (secondAuthor as any).id },
    ]);
    expect(await (author as any).books.count()).toBe(before + 1);
  });

  it("upsert all create with", async () => {
    const before = (await Book.where({ format: "X" }).count()) as number;
    await Book.createWith({ format: "X" }).upsertAll([{ name: "A" }, { name: "B" }]);
    expect(await Book.where({ format: "X" }).count()).toBe(before + 2);
  });

  it("upsert all has many through", async () => {
    const book = (await Book.first()) as any;
    await expect(book.subscribers.upsertAll([{ nick: "Jimmy" }])).rejects.toThrow(ArgumentError);
  });

  it("upsert all updates using provided sql", async () => {
    const { sql } = await import("@blazetrails/arel");
    const operator = adapterType === "sqlite" ? "MAX" : "GREATEST";
    await Book.upsertAll(
      [
        { id: 1, status: 1 },
        { id: 2, status: 1 },
      ],
      {
        onDuplicate: sql(`status = ${operator}(books.status, 1)`),
      },
    );
    expect(((await Book.find(1)) as any).status).toBe("published");
    expect(((await Book.find(2)) as any).status).toBe("written");
  });

  // Rails gates to MySQL: VALUES() is MySQL-only ON DUPLICATE KEY UPDATE syntax.
  it.skipIf(!isMysql)("upsert all updates using values function on duplicate raw sql", async () => {
    const { sql } = await import("@blazetrails/arel");
    const b1 = await Book.create({ name: "Name" });
    const b2 = await Book.create({ name: null as any });
    await Book.upsertAll(
      [
        { id: (b1 as any).id, name: "No Name" },
        { id: (b2 as any).id, name: "No Name" },
      ],
      { onDuplicate: sql("name = IFNULL(name, values(name))") },
    );
    expect(((await Book.find((b1 as any).id)) as any).name).toBe("Name");
    expect(((await Book.find((b2 as any).id)) as any).name).toBe("No Name");
  });

  it.skip("upsert all updates using provided sql and unique by", () => {
    // BLOCKED: unique-index introspection — unique_by [name, author_id].
    // RFC 0030 d2-insert-all-unique-index-introspection.
  });

  it.skipIf(supportsInsertConflictTarget)(
    "upsert all with unique by fails cleanly for adapters not supporting insert conflict target",
    async () => {
      await expect(
        Book.upsertAll([{ name: "Rework", author_id: 1 }], { uniqueBy: "isbn" }),
      ).rejects.toThrow(/does not support :uniqueBy/);
    },
  );

  it.skip("insert all when table name contains database", () => {
    // BLOCKED: test-harness multi-DB sharding — Rails (MySQL-only) qualifies the
    // table with connection_db_config.database, but the handler suite shards
    // `books` into a per-worker database that currentDatabase() does not name.
    // RFC 0030 d2-insert-all-canonical-models.
  });
});

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
 *   - schema-cache unique-index introspection; TEST_SCHEMA also drops the
 *     books unique/partial/expression indexes — d2-insert-all-unique-index-introspection
 *   - SQL logging assertions, db-warnings, has_many_through guards,
 *     partitioned indexes, Speedometer no-DB-key — d2-insert-all-canonical-models
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "./index.js";
import { UnknownAttributeError } from "./errors.js";
import { adapterType } from "./test-adapter.js";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { assertQueriesMatch } from "./testing/query-assertions.js";
import { Base } from "./base.js";
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
const isMysql = adapterType === "mysql";

// ReadonlyNameBook < Book with attr_readonly :name (insert_all_test.rb:14).
class ReadonlyNameBook extends Book {
  static {
    this.attrReadonly("name");
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
  useHandlerFixtures(["authors", "books"], { schema: canonicalSchema });

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
    // BLOCKED: returning-Result — Rails reads the inserted id via
    // `insert!(..., returning: :id).first["id"]`; insert_all returns a row
    // count, not an ActiveRecord::Result. RFC 0030 d2-insert-all-returning-result.
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
    expect(await Book.insertAll([])).toBe(0);
    expect(await Book.insertAllBang([])).toBe(0);
    expect(await Book.upsertAll([])).toBe(0);
  });

  it.skip("insert all raises on duplicate records", () => {
    // BLOCKED: unique-index introspection — Rails relies on the unique index on
    // [author_id, name] to raise RecordNotUnique, but TEST_SCHEMA drops secondary
    // indexes. RFC 0030 d2-insert-all-unique-index-introspection.
  });

  it.skip("insert all returns ActiveRecord Result", () => {
    // BLOCKED: returning-Result. RFC 0030 d2-insert-all-returning-result.
  });

  it.skip("insert all returns primary key if returning is supported", () => {
    // BLOCKED: returning-Result. RFC 0030 d2-insert-all-returning-result.
  });

  it.skip("insert all returns nothing if returning is empty", () => {
    // BLOCKED: returning-Result. RFC 0030 d2-insert-all-returning-result.
  });

  it.skip("insert all returns nothing if returning is false", () => {
    // BLOCKED: returning-Result. RFC 0030 d2-insert-all-returning-result.
  });

  it.skip("insert all returns requested fields", () => {
    // BLOCKED: returning-Result. RFC 0030 d2-insert-all-returning-result.
  });

  it.skip("insert all returns requested sql fields", () => {
    // BLOCKED: returning-Result. RFC 0030 d2-insert-all-returning-result.
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

  it.skip("insert all with skip duplicates and autonumber id not given", () => {
    // BLOCKED: unique-index introspection — relies on the [author_id, name]
    // unique index. RFC 0030 d2-insert-all-unique-index-introspection.
  });

  it.skip("insert all with skip duplicates and autonumber id given", () => {
    // BLOCKED: unique-index introspection — relies on the [author_id, name]
    // unique index. RFC 0030 d2-insert-all-unique-index-introspection.
  });

  it.skip("skip duplicates strategy does not secretly upsert", () => {
    // BLOCKED: unique-index introspection — relies on the [author_id, name]
    // unique index. RFC 0030 d2-insert-all-unique-index-introspection.
  });

  it.skip("insert all will raise if duplicates are skipped only for a certain conflict target", () => {
    // BLOCKED: unique-index introspection — unique_by an index name.
    // RFC 0030 d2-insert-all-unique-index-introspection.
  });

  it.skip("insert all and upsert all with index finding options", () => {
    // BLOCKED: unique-index introspection. RFC 0030 d2-insert-all-unique-index-introspection.
  });

  it.skip("insert all and upsert all with expression index", () => {
    // BLOCKED: unique-index introspection (expression index dropped by TEST_SCHEMA).
    // RFC 0030 d2-insert-all-unique-index-introspection.
  });

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

  it.skip("insert all and upsert all finds index with inverted unique by columns", () => {
    // BLOCKED: unique-index introspection. RFC 0030 d2-insert-all-unique-index-introspection.
  });

  it.skip("insert all and upsert all works with composite primary keys when unique by is provided", () => {
    // BLOCKED: unique-index introspection — composite-PK conflict target +
    // "No unique index found for id" on the bang path.
    // RFC 0030 d2-insert-all-unique-index-introspection.
  });

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
    // BLOCKED: returning-Result — the returning sub-block reads result.columns.
    // RFC 0030 d2-insert-all-returning-result.
  });

  it.skip("insert all and upsert all with sti", () => {
    // BLOCKED: insert_all STI type injection — resolveSti() treats the canonical
    // SpecialCategory (STI via registerSubclass, no enableSti) as a base class,
    // so the inheritance column is not auto-filled and rows with differing keys
    // fail verifyAttributes. RFC 0030 d2-insert-all-canonical-models.
  });

  it.skip("upsert logs message including model name", () => {
    // BLOCKED: SQL log assertion. RFC 0030 d2-insert-all-canonical-models.
  });

  it.skip("upsert and db warnings", () => {
    // BLOCKED: db-warnings facility — Rails wraps the upsert in
    // with_db_warnings_action(:raise) (insert_all_test.rb:360); no such setting
    // exists, leaving only a vacuous no-op assertion.
    // RFC 0030 d2-insert-all-canonical-models.
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

  it.skip("upsert all updates existing record by configured primary key fails when database supports insert conflict target", () => {
    // BLOCKED: unique-index introspection — Rails raises "No unique index found
    // for speedometer_id" because the configured PK has no backing unique index
    // in the schema cache. RFC 0030 d2-insert-all-unique-index-introspection.
  });

  it("upsert all does not update readonly attributes", async () => {
    const newName = "Agile Web Development with Rails, 4th Edition";
    await ReadonlyNameBook.upsertAll([{ id: 1, name: newName }]);
    expect(((await Book.find(1)) as any).name).not.toBe(newName);
  });

  it.skip("upsert all does not update primary keys", () => {
    // BLOCKED: unique-index introspection — unique_by an index name.
    // RFC 0030 d2-insert-all-unique-index-introspection.
  });

  it("upsert all passing both on duplicate and update only will raise an error", async () => {
    const { sql } = await import("@blazetrails/arel");
    await expect(
      Book.upsertAll([{ id: 101, name: "Perelandra", author_id: 7, isbn: "1974522598" }], {
        onDuplicate: sql("NAME=values(name)"),
        updateOnly: "name",
      }),
    ).rejects.toThrow();
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

  it.skip("upsert all does not perform an upsert if a partial index doesnt apply", () => {
    // BLOCKED: unique-index introspection (partial index). RFC 0030 d2-insert-all-unique-index-introspection.
  });

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

  it.skip("upsert all implicitly sets timestamps even when columns are aliased", () => {
    // BLOCKED: alias-form mismatch — the canonical Developer aliases the magic
    // columns in camelCase (`createdAt` → `legacyCreatedAt`), but insert_all's
    // _physicalTimestampCols resolves snake-case `created_at`, so it never maps
    // to `legacy_created_at` and no timestamp is seeded. Needs snake-case
    // alias resolution (or a snake alias on Developer).
    // RFC 0030 d2-insert-all-canonical-models.
  });

  it("insert all raises on unknown attribute", async () => {
    await expect(Book.insertAllBang([{ unknown_attribute: "Test" }])).rejects.toThrow(
      UnknownAttributeError,
    );
  });

  it.skip("upsert all works with partitioned indexes", () => {
    // BLOCKED: PG partitioned indexes + Measurement table (not in TEST_SCHEMA).
    // RFC 0030 d2-insert-all-canonical-models.
  });

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

  it.skip("insert all has many through", () => {
    // BLOCKED: has_many_through insert_all ArgumentError guard.
    // RFC 0030 d2-insert-all-canonical-models.
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

  it.skip("upsert all has many through", () => {
    // BLOCKED: has_many_through upsert_all ArgumentError guard.
    // RFC 0030 d2-insert-all-canonical-models.
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

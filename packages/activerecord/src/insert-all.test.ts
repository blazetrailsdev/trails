import { describe, it, expect, beforeAll } from "vitest";
import { UnknownAttributeError, RecordNotUnique } from "./errors.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { adapterType } from "./test-adapter.js";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { fixtures } from "./test-fixtures.js";
import "./support/canonical-model-index.js";
import { withDbWarningsAction } from "./support/with-db-warnings-action.js";
import { assertQueriesMatch, assertNoQueriesMatch } from "./testing/query-assertions.js";
import { quoteTableName } from "./support/quote-regex.js";
import { regexpEscape } from "@blazetrails/ruby-compat";
import { captureLogOutput } from "./testing/sql-capture.js";
import { adapterSupports, itIfSupports } from "./support/supports.js";
import { Base } from "./base.js";
import { Result } from "./result.js";
import { Author } from "./test-helpers/models/author.js";
import { Book } from "./test-helpers/models/book.js";
import { Cart } from "./test-helpers/models/cart.js";
import { Category, SpecialCategory } from "./test-helpers/models/category.js";
import { Developer } from "./test-helpers/models/developer.js";
import { Measurement } from "./test-helpers/models/measurement.js";
import { Ship } from "./test-helpers/models/ship.js";
import { Speedometer } from "./test-helpers/models/speedometer.js";

const supportsInsertReturning = adapterSupports("insert_returning");
const isMysql = adapterType === "mysql";

class ReadonlyNameBook extends Book {
  static {
    this.attrReadonly("name");
  }
}

class DivergentPrimaryKeyBook extends Book {
  static {
    this.primaryKey = "isbn";
  }
}

async function assertInsertAllReturningAlias(): Promise<void> {
  if (!supportsInsertReturning) return;
  const before = (await Book.count()) as number;
  const result = await Book.insertAll([{ title: "Remote", author_id: 1 }], {
    returning: "title",
  });
  expect(result.columns).toContain("title");
  expect(await Book.count()).toBe(before + 1);
}

function getYear(val: unknown): number {
  if (val == null) return 0;
  if (val instanceof RubyTime) return val.getutc().year;
  if (val instanceof Temporal.Instant) return val.toZonedDateTimeISO("UTC").year;
  if (typeof val === "string") return parseInt(val.slice(0, 4), 10);
  if (val instanceof Date) return val.getUTCFullYear();
  if (typeof val === "object" && val !== null && "year" in (val as any)) {
    return (val as any).year as number;
  }
  return 0;
}

function usec(instant: RubyTime): number {
  return instant.usec;
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
  fixtures(["authors", "books"]);

  beforeAll(async () => {
    ReadonlyNameBook.attrReadonly("name");
    await Promise.all([
      Cart.loadSchema(),
      Category.loadSchema(),
      SpecialCategory.loadSchema(),
      Developer.loadSchema(),
      Ship.loadSchema(),
      Speedometer.loadSchema(),
    ]);
  });

  itIfSupports("insert_on_duplicate_skip", "insert", async () => {
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

  itIfSupports(
    "insert_returning",
    "insert with type casting and serialize is consistent",
    async () => {
      const bookName = ["Array"];
      const createdBookId = ((await Book.createBang({ name: bookName })) as any).id;
      const insertResult = await Book.insertBang({ name: bookName }, { returning: "id" });
      const insertedBookId = insertResult.toArray()[0]["id"];
      const createdBook = (await Book.findByBang({ id: createdBookId })) as any;
      const insertedBook = (await Book.findByBang({ id: insertedBookId })) as any;
      expect(createdBook.name).toEqual(insertedBook.name);
    },
  );

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

  itIfSupports("insert_on_duplicate_update", "insert all should handle empty arrays", async () => {
    expect((await Book.insertAll([])).length).toBe(0);
    expect((await Book.insertAllBang([])).length).toBe(0);
    expect((await Book.upsertAll([])).length).toBe(0);
  });

  it("insert all raises on duplicate records", async () => {
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

  itIfSupports(
    "insert_returning",
    "insert all returns primary key if returning is supported",
    async () => {
      const result = await Book.insertAllBang([{ name: "Rework", author_id: 1 }]);
      expect(result.columns).toEqual(["id"]);
    },
  );

  itIfSupports("insert_returning", "insert all returns nothing if returning is empty", async () => {
    const result = await Book.insertAllBang([{ name: "Rework", author_id: 1 }], {
      returning: [],
    });
    expect(result.columns).toEqual([]);
  });

  itIfSupports("insert_returning", "insert all returns nothing if returning is false", async () => {
    const result = await Book.insertAllBang([{ name: "Rework", author_id: 1 }], {
      returning: false,
    });
    expect(result.columns).toEqual([]);
  });

  itIfSupports("insert_returning", "insert all returns requested fields", async () => {
    const result = await Book.insertAllBang([{ name: "Rework", author_id: 1 }], {
      returning: ["id", "name"],
    });
    expect(result.pluck("name")).toEqual(["Rework"]);
  });

  itIfSupports("insert_returning", "insert all returns requested sql fields", async () => {
    const { sql } = await import("@blazetrails/arel");
    const result = await Book.insertAllBang([{ name: "Rework", author_id: 1 }], {
      returning: sql("UPPER(name) as name"),
    });
    expect(result.pluck("name")).toEqual(["REWORK"]);
  });

  itIfSupports("insert_on_duplicate_skip", "insert all can skip duplicate records", async () => {
    const before = (await Book.count()) as number;
    await Book.insertAll([{ id: 1, name: "Agile Web Development with Rails" }]);
    expect(await Book.count()).toBe(before);
  });

  itIfSupports.skipIf(adapterType !== "mysql")(
    "insert_on_duplicate_skip",
    "insert all generates correct sql",
    async () => {
      await assertQueriesMatch(/ON DUPLICATE KEY UPDATE/, undefined, false, async () => {
        await Book.insertAll([{ id: 1, name: "Agile Web Development with Rails" }]);
      });
    },
  );

  itIfSupports.skipIf(adapterType !== "mysql")(
    "insert_on_duplicate_skip",
    "insert all succeeds when passed no attributes",
    async () => {
      await expect(Book.insertAll([{}])).resolves.not.toThrow();
    },
  );

  itIfSupports(
    "insert_on_duplicate_skip",
    "insert all with skip duplicates and autonumber id not given",
    async () => {
      const before = (await Book.count()) as number;
      await Book.insertAll([
        { author_id: 8, name: "Refactoring" },
        { author_id: 8, name: "Refactoring" },
      ]);
      expect(((await Book.count()) as number) - before).toBe(1);
    },
  );

  itIfSupports(
    "insert_on_duplicate_skip",
    "insert all with skip duplicates and autonumber id given",
    async () => {
      const before = (await Book.count()) as number;
      await Book.insertAll([
        { id: 200, author_id: 8, name: "Refactoring" },
        { id: 201, author_id: 8, name: "Refactoring" },
      ]);
      expect(((await Book.count()) as number) - before).toBe(1);
    },
  );

  itIfSupports(
    "insert_on_duplicate_skip",
    "skip duplicates strategy does not secretly upsert",
    async () => {
      const book = await Book.create({ format: "EXPECTED", author_id: 8, name: "Refactoring" });
      const before = (await Book.count()) as number;
      await Book.insertAll([{ format: "UNEXPECTED", author_id: 8, name: "Refactoring" }]);
      expect((await Book.count()) as number).toBe(before);
      await book.reload();
      expect(book.format).toBe("EXPECTED");
    },
  );

  itIfSupports.skipIf(!adapterSupports("insert_on_duplicate_skip"))(
    "insert_conflict_target",
    "insert all will raise if duplicates are skipped only for a certain conflict target",
    async () => {
      await expect(
        Book.insertAll([{ id: 1, name: "Agile Web Development with Rails" }], {
          uniqueBy: "index_books_on_author_id_and_name",
        }),
      ).rejects.toThrow(RecordNotUnique);
    },
  );

  itIfSupports(
    "insert_conflict_target",
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

  itIfSupports.skipIf(!adapterSupports("expression_index"))(
    "insert_conflict_target",
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

  itIfSupports(
    "insert_conflict_target",
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

  itIfSupports(
    "insert_conflict_target",
    "insert all and upsert all finds index with inverted unique by columns",
    async () => {
      const before = (await Book.count()) as number;
      await Book.insertAll([{ name: "Remote", author_id: 1 }], { uniqueBy: ["name", "author_id"] });
      await Book.upsertAll([{ name: "Rework", author_id: 1 }], { uniqueBy: ["name", "author_id"] });
      expect(((await Book.count()) as number) - before).toBe(2);
    },
  );

  itIfSupports(
    "insert_conflict_target",
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

      await expect(Cart.insertAllBang([{ id: 2, shop_id: 1, title: "My cart" }])).rejects.toThrow(
        /No unique index found for id/,
      );
    },
  );

  itIfSupports.skipIf(adapterSupports("insert_conflict_target"))(
    "insert_on_duplicate_skip",
    "insert all and upsert all works with composite primary keys when unique by is not provided",
    async () => {
      const before = (await Cart.count()) as number;
      await Cart.insertAll([{ id: 1, shop_id: 1, title: "My cart" }]);
      await Cart.insertAllBang([{ id: 2, shop_id: 1, title: "My cart 2" }]);
      await Cart.upsertAll([{ id: 3, shop_id: 2, title: "My other cart" }]);
      expect(await Cart.count()).toBe(before + 3);
    },
  );

  itIfSupports("insert_conflict_target", "insert logs message including model name", async () => {
    const output = await captureLogOutput(async () => {
      await Book.insert({ name: "Rework", author_id: 1 });
    });
    expect(output).toContain("Book Insert");
  });

  itIfSupports(
    "insert_conflict_target",
    "insert all logs message including model name",
    async () => {
      const output = await captureLogOutput(async () => {
        await Book.insertAll([
          { name: "Remote", author_id: 1 },
          { name: "Renote", author_id: 1 },
        ]);
      });
      expect(output).toContain("Book Bulk Insert");
    },
  );

  itIfSupports(
    "insert_on_duplicate_update",
    "insert all and upsert all with aliased attributes",
    async () => {
      await assertInsertAllReturningAlias();

      await Book.upsertAll([{ id: 101, title: "Perelandra", author_id: 7, isbn: "1974522598" }]);
      await Book.upsertAll([{ id: 101, title: "Perelandra 2", author_id: 6, isbn: "111111" }], {
        updateOnly: ["title", "isbn"],
      });

      const book = (await Book.find(101)) as any;
      expect(book.title).toBe("Perelandra 2");
      expect(book.isbn).toBe("111111");
      expect(book.author_id).toBe(7);
    },
  );

  itIfSupports("insert_on_duplicate_update", "insert all and upsert all with sti", async () => {
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

  itIfSupports(
    "insert_on_duplicate_update",
    "upsert logs message including model name",
    async () => {
      const output = await captureLogOutput(async () => {
        await Book.upsert({ name: "Remote", author_id: 1 });
      });
      expect(output).toContain("Book Upsert");
    },
  );

  itIfSupports("insert_on_duplicate_update", "upsert and db warnings", async () => {
    try {
      await withDbWarningsAction("raise", async () => {
        await expect(
          Book.upsert({ id: 1001, name: "Remote", author_id: 1 }),
        ).resolves.not.toThrow();
      });
    } finally {
      await Book.delete(1001);
    }
  });

  itIfSupports(
    "insert_on_duplicate_update",
    "upsert all logs message including model name",
    async () => {
      const output = await captureLogOutput(async () => {
        await Book.upsertAll([
          { name: "Remote", author_id: 1 },
          { name: "Renote", author_id: 1 },
        ]);
      });
      expect(output).toContain("Book Bulk Upsert");
    },
  );

  itIfSupports("insert_on_duplicate_update", "upsert all updates existing records", async () => {
    const newName = "Agile Web Development with Rails, 4th Edition";
    await Book.upsertAll([{ id: 1, name: newName }]);
    expect(((await Book.find(1)) as any).name).toBe(newName);
  });

  itIfSupports(
    "insert_conflict_target",
    "upsert all updates existing record by primary key",
    async () => {
      await Book.upsertAll([{ id: 1, name: "New edition" }], { uniqueBy: "id" });
      expect(((await Book.find(1)) as any).name).toBe("New edition");
    },
  );

  itIfSupports.skipIf(adapterSupports("insert_conflict_target"))(
    "insert_on_duplicate_update",
    "upsert all does notupdates existing record by when there is no key",
    async () => {
      await Speedometer.create({ speedometer_id: "s3", name: "Very fast" });
      await Speedometer.upsertAll([{ speedometer_id: "s3", name: "New Speedometer" }]);
      expect(((await Speedometer.find("s3")) as any).name).toBe("Very fast");
    },
  );

  itIfSupports.skipIf(!adapterSupports("insert_on_duplicate_update"))(
    "insert_conflict_target",
    "upsert all updates existing record by configured primary key fails when database supports insert conflict target",
    async () => {
      await expect(
        Speedometer.upsertAll([{ speedometer_id: "s1", name: "New Speedometer" }]),
      ).rejects.toThrow(/No unique index found for speedometer_id/);
    },
  );

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

  itIfSupports(
    "insert_on_duplicate_update",
    "upsert all does not update readonly attributes",
    async () => {
      const newName = "Agile Web Development with Rails, 4th Edition";
      await ReadonlyNameBook.upsertAll([{ id: 1, name: newName }]);
      expect(((await Book.find(1)) as any).name).not.toBe(newName);
    },
  );

  itIfSupports.skipIf(!adapterSupports("insert_on_duplicate_update"))(
    "insert_conflict_target",
    "upsert all does not update primary keys",
    async () => {
      await Book.upsertAll([{ id: 101, name: "Perelandra", author_id: 7 }]);
      await Book.upsertAll([{ id: 103, name: "Perelandra", author_id: 7, isbn: "1974522598" }], {
        uniqueBy: "index_books_on_author_id_and_name",
      });

      const book = (await Book.findBy({ name: "Perelandra" })) as any;
      expect(Number(book.id)).toBe(101);
      expect(book.isbn).toBe("1974522598");
    },
  );

  it("upsert all passing both on duplicate and update only will raise an error", async () => {
    const { sql } = await import("@blazetrails/arel");
    await expect(
      Book.upsertAll([{ id: 101, name: "Perelandra", author_id: 7, isbn: "1974522598" }], {
        onDuplicate: sql("NAME=values(name)"),
        updateOnly: "name",
      }),
    ).rejects.toThrow(ArgumentError);
  });

  itIfSupports(
    "insert_on_duplicate_update",
    "upsert all only updates the column provided via update only",
    async () => {
      await Book.upsertAll([{ id: 101, name: "Perelandra", author_id: 7, isbn: "1974522598" }]);
      await Book.upsertAll([{ id: 101, name: "Perelandra 2", author_id: 7, isbn: "111111" }], {
        updateOnly: "name",
      });
      const book = (await Book.find(101)) as any;
      expect(book.name).toBe("Perelandra 2");
      expect(book.isbn).toBe("1974522598");
    },
  );

  itIfSupports(
    "insert_on_duplicate_update",
    "upsert all only updates the list of columns provided via update only",
    async () => {
      await Book.upsertAll([{ id: 101, name: "Perelandra", author_id: 7, isbn: "1974522598" }]);
      await Book.upsertAll([{ id: 101, name: "Perelandra 2", author_id: 6, isbn: "111111" }], {
        updateOnly: ["name", "isbn"],
      });
      const book = (await Book.find(101)) as any;
      expect(book.name).toBe("Perelandra 2");
      expect(book.isbn).toBe("111111");
      expect(book.author_id).toBe(7);
    },
  );

  itIfSupports.skipIf(
    !adapterSupports("insert_conflict_target") || !adapterSupports("partial_index"),
  )(
    "insert_on_duplicate_update",
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
      await Book.upsertAll([{ name: "Perelandra", author_id: 7, isbn: "1974522598" }], {
        uniqueBy: "index_books_on_isbn",
      });

      const names = ((await Book.where({ isbn: "1974522598" })) as any[]).map((b) => b.name).sort();
      expect(names).toEqual(["Out of the Silent Planet", "Perelandra"]);
    },
  );

  itIfSupports(
    "insert_on_duplicate_update",
    "upsert all does not touch updated at when values do not change",
    async () => {
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
    },
  );

  itIfSupports(
    "insert_on_duplicate_update",
    "upsert all touches updated at and updated on when values change",
    async () => {
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
    },
  );

  itIfSupports(
    "insert_on_duplicate_update",
    "upsert all respects updated at precision when touched implicitly",
    async () => {
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
        const ua = ((await Book.find(101)) as any).updated_at as RubyTime | null;
        if (ua) hasSubsecond = usec(ua) > 0;
      }
      expect(hasSubsecond).toBe(true);
    },
  );

  itIfSupports(
    "insert_on_duplicate_update",
    "upsert all uses given updated at over implicit updated at",
    async () => {
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
    },
  );

  itIfSupports(
    "insert_on_duplicate_update",
    "upsert all uses given updated on over implicit updated on",
    async () => {
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
    },
  );

  itIfSupports(
    "insert_on_duplicate_update",
    "upsert all implicitly sets timestamps on create when model record timestamps is true",
    async () => {
      await withRecordTimestamps(Ship, true, async () => {
        await Ship.upsertAll([{ id: 101, name: "RSS Boaty McBoatface" }]);
        const ship = (await Ship.find(101)) as any;
        const year = new Date().getUTCFullYear();
        expect(getYear(ship.created_at)).toBe(year);
        expect(getYear(ship.created_on)).toBe(year);
        expect(getYear(ship.updated_at)).toBe(year);
        expect(getYear(ship.updated_on)).toBe(year);
      });
    },
  );

  itIfSupports(
    "insert_on_duplicate_update",
    "upsert all does not implicitly set timestamps on create when model record timestamps is true but overridden",
    async () => {
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
    },
  );

  itIfSupports(
    "insert_on_duplicate_update",
    "upsert all does not implicitly set timestamps on create when model record timestamps is false",
    async () => {
      await withRecordTimestamps(Ship, false, async () => {
        await Ship.upsertAll([{ id: 101, name: "RSS Boaty McBoatface" }]);
        const ship = (await Ship.find(101)) as any;
        expect(ship.created_at).toBeNull();
        expect(ship.created_on).toBeNull();
        expect(ship.updated_at).toBeNull();
        expect(ship.updated_on).toBeNull();
      });
    },
  );

  itIfSupports(
    "insert_on_duplicate_update",
    "upsert all implicitly sets timestamps on create when model record timestamps is false but overridden",
    async () => {
      await withRecordTimestamps(Ship, false, async () => {
        await Ship.upsertAll([{ id: 101, name: "RSS Boaty McBoatface" }], {
          recordTimestamps: true,
        });
        const ship = (await Ship.find(101)) as any;
        const year = new Date().getUTCFullYear();
        expect(getYear(ship.created_at)).toBe(year);
        expect(getYear(ship.created_on)).toBe(year);
        expect(getYear(ship.updated_at)).toBe(year);
        expect(getYear(ship.updated_on)).toBe(year);
      });
    },
  );

  itIfSupports(
    "insert_on_duplicate_update",
    "upsert all respects created at precision when touched implicitly",
    async () => {
      let hasSubsecond = false;
      await withRecordTimestamps(Ship, true, async () => {
        for (let i = 1; i <= 100 && !hasSubsecond; i++) {
          await Ship.upsertAll([{ id: 200 + i, name: "Boaty" }]);
          const ca = ((await Ship.find(200 + i)) as any).created_at as RubyTime | null;
          if (ca) hasSubsecond = usec(ca) > 0;
        }
      });
      expect(hasSubsecond).toBe(true);
    },
  );

  itIfSupports(
    "insert_on_duplicate_update",
    "upsert all implicitly sets timestamps on update when model record timestamps is true",
    async () => {
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
    },
  );

  itIfSupports(
    "insert_on_duplicate_update",
    "upsert all does not implicitly set timestamps on update when model record timestamps is true but overridden",
    async () => {
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
    },
  );

  itIfSupports(
    "insert_on_duplicate_update",
    "upsert all does not implicitly set timestamps on update when model record timestamps is false",
    async () => {
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
    },
  );

  itIfSupports(
    "insert_on_duplicate_update",
    "upsert all implicitly sets timestamps on update when model record timestamps is false but overridden",
    async () => {
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
    },
  );

  itIfSupports(
    "insert_on_duplicate_update",
    "upsert all implicitly sets timestamps even when columns are aliased",
    async () => {
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
    },
  );

  it("insert all raises on unknown attribute", async () => {
    await expect(Book.insertAllBang([{ unknown_attribute: "Test" }])).rejects.toThrow(
      UnknownAttributeError,
    );
  });

  itIfSupports(
    "insert_conflict_target,insert_on_duplicate_update,partitioned_indexes",
    "upsert all works with partitioned indexes",
    async () => {
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
    },
  );

  it.skipIf(!supportsInsertReturning)(
    "insert all returning uses schema-cache primary keys not the model primary key",
    async () => {
      const returningId = new RegExp(`RETURNING ${regexpEscape(quoteTableName("id"))}`);
      await assertQueriesMatch(returningId, undefined, false, async () => {
        await DivergentPrimaryKeyBook.insertAll([
          { name: "Divergent", isbn: "9990000000001", author_id: 1 },
        ]);
      });
      const returningIsbn = new RegExp(`RETURNING ${regexpEscape(quoteTableName("isbn"))}`);
      await assertNoQueriesMatch(returningIsbn, false, async () => {
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
    const statuses = (await Book.where({ isbn: ["1234566", "1234567"] }).order("id")).map(
      (b: any) => b.status,
    );
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

  itIfSupports("insert_on_duplicate_update", "upsert all on relation", async () => {
    const author = await Author.create({ name: "Jimmy" });
    const before = (await (author as any).books.count()) as number;
    await (author as any).books.upsertAll([{ name: "My little book", isbn: "1974522598" }]);
    expect(await (author as any).books.count()).toBe(before + 1);
  });

  itIfSupports("insert_on_duplicate_update", "upsert all on relation precedence", async () => {
    const author = await Author.create({ name: "Jimmy" });
    const secondAuthor = await Author.create({ name: "Bob" });
    const before = (await (author as any).books.count()) as number;
    await (author as any).books.upsertAll([
      { name: "My little book", isbn: "1974522598", author_id: (secondAuthor as any).id },
    ]);
    expect(await (author as any).books.count()).toBe(before + 1);
  });

  itIfSupports("insert_on_duplicate_update", "upsert all create with", async () => {
    const before = (await Book.where({ format: "X" }).count()) as number;
    await Book.createWith({ format: "X" }).upsertAll([{ name: "A" }, { name: "B" }]);
    expect(await Book.where({ format: "X" }).count()).toBe(before + 2);
  });

  itIfSupports("insert_on_duplicate_update", "upsert all has many through", async () => {
    const book = (await Book.first()) as any;
    await expect(book.subscribers.upsertAll([{ nick: "Jimmy" }])).rejects.toThrow(ArgumentError);
  });

  itIfSupports("insert_on_duplicate_update", "upsert all updates using provided sql", async () => {
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

  itIfSupports.skipIf(adapterType !== "mysql")(
    "insert_on_duplicate_update",
    "upsert all updates using values function on duplicate raw sql",
    async () => {
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
    },
  );

  itIfSupports(
    "insert_conflict_target,insert_on_duplicate_update",
    "upsert all updates using provided sql and unique by",
    async () => {
      const { sql } = await import("@blazetrails/arel");
      const book = (await Book.find(2)) as any;
      expect(book.status).toBe("proposed");

      await Book.upsertAll([{ name: book.name, author_id: book.author_id }], {
        uniqueBy: ["name", "author_id"],
        onDuplicate: sql("status = 2"),
      });
      expect(((await Book.find(2)) as any).status).toBe("published");
    },
  );

  it.skipIf(adapterSupports("insert_conflict_target"))(
    "upsert all with unique by fails cleanly for adapters not supporting insert conflict target",
    async () => {
      const connection = await Base.leaseConnection();
      const error = await Book.upsertAll([{ name: "Rework", author_id: 1 }], {
        uniqueBy: "isbn",
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ArgumentError);
      expect((error as Error).message).toContain(
        `${connection.constructor.name} does not support :unique_by`,
      );
    },
  );

  it.skipIf(adapterType !== "mysql")("insert all when table name contains database", async () => {
    const databaseName = Book.connectionDbConfig().database;
    Book.tableName = `${databaseName}.books`;

    let raised: unknown;
    try {
      await Book.loadSchema();
      await Book.insertAllBang([{ name: "Rework", author_id: 1 }]);
    } catch (e) {
      raised = e;
    } finally {
      Book.tableName = "books";
    }
    expect(raised).toBeUndefined();
  });
});

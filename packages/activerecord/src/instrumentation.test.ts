/**
 * Faithful port of vendor/rails/activerecord/test/cases/instrumentation_test.rb.
 * Test names mirror the Rails `test_*` methods so `test:compare` maps them.
 */
import { describe, it, expect, afterEach } from "vitest";

import { Notifications } from "@blazetrails/activesupport";
import { Base, registerModel } from "./index.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { Book } from "./test-helpers/models/book.js";
import { Author } from "./test-helpers/models/author.js";
import { ClothingItem } from "./test-helpers/models/clothing-item.js";

describe("InstrumentationTest", () => {
  registerModel("Author", Author);
  registerModel("Book", Book);
  registerModel("ClothingItem", ClothingItem);
  useHandlerFixtures(["books", "authors"], { schema: canonicalSchema });

  afterEach(() => {
    Notifications.unsubscribeAll();
  });

  it("payload name on load", async () => {
    await Book.create({ name: "test book" });
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (String(event.payload.sql).match(/SELECT/)) {
        expect(event.payload.name).toBe("Book Load");
      }
    });
    await Book.first();
  });

  it("payload name on create", async () => {
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (String(event.payload.sql).match(/INSERT/)) {
        expect(event.payload.name).toBe("Book Create");
      }
    });
    await Book.create({ name: "test book" });
  });

  it("payload name on update", async () => {
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (String(event.payload.sql).match(/UPDATE/)) {
        expect(event.payload.name).toBe("Book Update");
      }
    });
    const book = await Book.create({ name: "test book", format: "paperback" });
    await book.updateAttribute("format", "ebook");
  });

  it("payload name on update all", async () => {
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (String(event.payload.sql).match(/UPDATE/)) {
        expect(event.payload.name).toBe("Book Update All");
      }
    });
    await Book.updateAll({ format: "ebook" });
  });

  it("payload name on destroy", async () => {
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (String(event.payload.sql).match(/DELETE/)) {
        expect(event.payload.name).toBe("Book Destroy");
      }
    });
    const book = await Book.create({ name: "test book" });
    await book.destroy();
  });

  it("payload name on delete all", async () => {
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (String(event.payload.sql).match(/DELETE/)) {
        expect(event.payload.name).toBe("Book Delete All");
      }
    });
    await Book.deleteAll();
  });

  it("payload name on pluck", async () => {
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (String(event.payload.sql).match(/SELECT/)) {
        expect(event.payload.name).toBe("Book Pluck");
      }
    });
    await Book.pluck("name");
  });

  it("payload name on count", async () => {
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (String(event.payload.sql).match(/SELECT/)) {
        expect(event.payload.name).toBe("Book Count");
      }
    });
    await Book.count();
  });

  it("payload name on grouped count", async () => {
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (String(event.payload.sql).match(/SELECT/)) {
        expect(event.payload.name).toBe("Book Count");
      }
    });
    await Book.group("status").count();
  });

  it("payload row count on select all", async () => {
    for (let i = 0; i < 10; i++) await Book.create({ name: "row count book 1" });
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (String(event.payload.sql).match(/SELECT/)) {
        expect(event.payload.row_count).toBe(10);
      }
    });
    await Book.where({ name: "row count book 1" });
  });

  it("payload row count on pluck", async () => {
    for (let i = 0; i < 10; i++) await Book.create({ name: "row count book 2" });
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (String(event.payload.sql).match(/SELECT/)) {
        expect(event.payload.row_count).toBe(10);
      }
    });
    await Book.where({ name: "row count book 2" }).pluck("name");
  });

  it("payload row count on raw sql", async () => {
    for (let i = 0; i < 10; i++) await Book.create({ name: "row count book 3" });
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (String(event.payload.sql).match(/SELECT/)) {
        expect(event.payload.row_count).toBe(10);
      }
    });
    await Base.connection.execute("SELECT * FROM books WHERE name='row count book 3';");
  });

  it("payload row count on cache", async () => {
    const events: any[] = [];
    const callback = (event: any) => {
      const payload = event.payload;
      if (String(payload.sql).includes("SELECT")) events.push(payload);
    };

    await Book.create({ name: "row count book" });
    Notifications.subscribe("sql.active_record", callback);
    await (Base.connection as any).cache(async () => {
      await Book.first();
      await Book.first();
    });

    expect(events.length).toBe(2);
    expect(events[0].cached).toBeFalsy();
    expect(events[1].cached).toBe(true);

    expect(events[0].row_count).toBe(1);
    expect(events[1].row_count).toBe(1);
  });

  it("payload connection with query cache disabled", async () => {
    const connection = ClothingItem.connection;
    Notifications.subscribe("sql.active_record", (event: any) => {
      expect(event.payload.connection).toBe(connection);
    });
    await Book.first();
  });

  it("payload connection with query cache enabled", async () => {
    const connection = ClothingItem.connection;
    Notifications.subscribe("sql.active_record", (event: any) => {
      expect(event.payload.connection).toBe(connection);
    });
    await (Book.connection as any).cache(async () => {
      await Book.first();
      await Book.first();
    });
  });

  it("no instantiation notification when no records", async () => {
    const author = await Author.create({ id: 100, name: "David" });

    let called = false;
    Notifications.subscribe("instantiation.active_record", () => {
      called = true;
    });

    await Author.where({ id: 0 });
    await author.books;

    expect(called).toBe(false);
  });
});

// Rails defines these two cases in a `TransactionInSqlActiveRecordPayloadTests`
// module included into a transactional and a non-transactional TestCase.
function transactionInSqlActiveRecordPayloadTests(): void {
  it("payload without an open transaction", async () => {
    let asserted = false;

    Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload.name === "Book Count") {
        expect(event.payload.transaction ?? null).toBeNull();
        asserted = true;
      }
    });

    await Book.count();

    expect(asserted).toBe(true);
  });

  it("payload with an open transaction", async () => {
    let asserted = false;
    let expectedTransaction: unknown = null;

    Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload.name === "Book Count") {
        expect(event.payload.transaction).toBe(expectedTransaction);
        asserted = true;
      }
    });

    await Book.transaction(async (transaction) => {
      expectedTransaction = transaction;
      await Book.count();
    });

    expect(asserted).toBe(true);
  });
}

describe("TransactionInSqlActiveRecordPayloadTest", () => {
  registerModel("Book", Book);
  useHandlerFixtures(["books"], { schema: canonicalSchema });

  afterEach(() => {
    Notifications.unsubscribeAll();
  });

  transactionInSqlActiveRecordPayloadTests();
});

describe("TransactionInSqlActiveRecordPayloadNonTransactionalTest", () => {
  registerModel("Book", Book);
  // Rails: `self.use_transactional_tests = false` — neither case may run inside
  // the rollback-on-teardown outer transaction.
  useHandlerFixtures(["books"], {
    schema: canonicalSchema,
    usesTransaction: ["payload without an open transaction", "payload with an open transaction"],
  });

  afterEach(() => {
    Notifications.unsubscribeAll();
  });

  transactionInSqlActiveRecordPayloadTests();
});

/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, afterEach } from "vitest";

import { Notifications } from "@blazetrails/activesupport";
import { Base } from "./index.js";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("InstrumentationTest", () => {
  afterEach(() => {
    Notifications.unsubscribeAll();
  });

  it("instrument returns block result", () => {
    const result = Notifications.instrument("test.event", {}, () => 42);
    expect(result).toBe(42);
  });

  it("instrument yields the payload for further modification", () => {
    let captured: Record<string, unknown> = {};
    Notifications.subscribe("test.payload", (event) => {
      captured = { ...event.payload };
    });
    const payload: Record<string, unknown> = { key: "value" };
    Notifications.instrument("test.payload", payload, () => {
      payload.extra = "added";
    });
    expect(captured.key).toBe("value");
    expect(captured.extra).toBe("added");
  });

  it("instrumenter exposes its id", () => {
    let eventId: string | undefined;
    Notifications.subscribe("test.id", (event) => {
      eventId = event.transactionId;
    });
    Notifications.instrument("test.id", {});
    expect(typeof eventId).toBe("string");
    expect(eventId!.length).toBeGreaterThan(0);
  });

  it("nested events can be instrumented", () => {
    const events: string[] = [];
    Notifications.subscribe("outer", (event) => {
      events.push("outer");
      expect(event.children.length).toBe(1);
      expect(event.children[0].name).toBe("inner");
    });
    Notifications.subscribe("inner", (event) => {
      events.push("inner");
    });
    Notifications.instrument("outer", {}, () => {
      Notifications.instrument("inner", {}, () => {});
    });
    expect(events).toContain("outer");
    expect(events).toContain("inner");
  });

  it("instrument publishes when exception is raised", () => {
    let published = false;
    Notifications.subscribe("test.error", () => {
      published = true;
    });
    expect(() => {
      Notifications.instrument("test.error", {}, () => {
        throw new Error("boom");
      });
    }).toThrow("boom");
    expect(published).toBe(true);
  });

  it("event is pushed even without block", () => {
    let published = false;
    Notifications.subscribe("test.noblock", () => {
      published = true;
    });
    Notifications.instrument("test.noblock", { data: 1 });
    expect(published).toBe(true);
  });

  it("payload name on load", async () => {
    const adapter = freshAdapter();
    class Book extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    let capturedName: string | undefined;
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload?.sql?.includes("SELECT")) capturedName = event.payload.name;
    });
    await Book.first();
    expect(capturedName).toBe("Book Load");
  });

  it("payload name on create", async () => {
    const adapter = freshAdapter();
    class Book extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    let capturedName: string | undefined;
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload?.sql?.includes("INSERT")) capturedName = event.payload.name;
    });
    await Book.create({ name: "test" });
    expect(capturedName).toBe("Book Create");
  });

  it("payload name on update", async () => {
    const adapter = freshAdapter();
    class Book extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const book = await Book.create({ name: "test" });
    let capturedName: string | undefined;
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload?.sql?.includes("UPDATE")) capturedName = event.payload.name;
    });
    await book.updateAttribute("name", "updated");
    expect(capturedName).toBe("Book Update");
  });

  it("payload name on update all", async () => {
    const adapter = freshAdapter();
    class Book extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await Book.create({ name: "test" });
    let capturedName: string | undefined;
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload?.sql?.includes("UPDATE")) capturedName = event.payload.name;
    });
    await Book.updateAll({ name: "bulk" });
    expect(capturedName).toBe("Book Update All");
  });

  it("payload name on destroy", async () => {
    const adapter = freshAdapter();
    class Book extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const book = await Book.create({ name: "test" });
    let capturedName: string | undefined;
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload?.sql?.includes("DELETE")) capturedName = event.payload.name;
    });
    await book.destroy();
    expect(capturedName).toBe("Book Destroy");
  });

  it("payload name on delete all", async () => {
    const adapter = freshAdapter();
    class Book extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await Book.create({ name: "test" });
    let capturedName: string | undefined;
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload?.sql?.includes("DELETE")) capturedName = event.payload.name;
    });
    await Book.deleteAll();
    expect(capturedName).toBe("Book Delete All");
  });

  it("payload name on pluck", async () => {
    const adapter = freshAdapter();
    class Book extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await Book.create({ name: "test" });
    let capturedName: string | undefined;
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload?.sql?.includes("SELECT")) capturedName = event.payload.name;
    });
    await Book.pluck("name");
    expect(capturedName).toBe("Book Pluck");
  });

  it("payload name on count", async () => {
    const adapter = freshAdapter();
    class Book extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await Book.create({ name: "test" });
    let capturedName: string | undefined;
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload?.sql?.includes("COUNT")) capturedName = event.payload.name;
    });
    await Book.count();
    expect(capturedName).toBe("Book Count");
  });

  it("payload name on grouped count", async () => {
    const adapter = freshAdapter();
    class Book extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("type", "string");
        this.adapter = adapter;
      }
    }
    await Book.create({ name: "a", type: "fiction" });
    await Book.create({ name: "b", type: "fiction" });
    let capturedName: string | undefined;
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload?.sql?.includes("COUNT")) capturedName = event.payload.name;
    });
    await Book.group("type").count();
    expect(capturedName).toBe("Book Count");
  });

  it("payload row count on select all", async () => {
    const adapter = freshAdapter();
    class Book extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await Book.create({ name: "a" });
    await Book.create({ name: "b" });
    await Book.create({ name: "c" });
    let capturedRowCount: number | undefined;
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload?.sql?.includes("SELECT") && !event.payload?.sql?.includes("COUNT")) {
        capturedRowCount = event.payload.row_count;
      }
    });
    await Book.where({}).toArray();
    expect(capturedRowCount).toBe(3);
  });

  it("payload row count on pluck", async () => {
    const adapter = freshAdapter();
    class Book extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await Book.create({ name: "a" });
    await Book.create({ name: "b" });
    await Book.create({ name: "c" });
    let capturedRowCount: number | undefined;
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload?.name === "Book Pluck") {
        capturedRowCount = event.payload.row_count;
      }
    });
    await Book.pluck("name");
    expect(capturedRowCount).toBe(3);
  });

  it.skip("payload row count on raw sql", () => {
    /* needs raw SQL connection */
  });

  it.skip("payload row count on cache", () => {
    /* needs query cache */
  });

  it("payload connection with query cache disabled", async () => {
    const adapter = freshAdapter();
    class Book extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    let capturedConnection: unknown;
    Notifications.subscribe("sql.active_record", (event: any) => {
      capturedConnection = event.payload.connection;
    });
    await Book.create({ name: "test" });
    // In the test environment the notification fires from the inner SQLite3Adapter
    // (the actual database connection), not from the SchemaAdapter wrapper.
    expect(capturedConnection).toBe((adapter as any).inner ?? adapter);
  });

  it.skip("payload connection with query cache enabled", () => {
    /* needs query cache */
  });

  it("no instantiation notification when no records", async () => {
    const adapter = freshAdapter();
    class Author extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await Author.create({ name: "David" });
    let called = false;
    Notifications.subscribe("instantiation.active_record", () => {
      called = true;
    });
    await Author.where({ id: 0 }).toArray();
    expect(called).toBe(false);
  });
});

describe("TransactionInSqlActiveRecordPayloadTest", () => {
  afterEach(() => {
    Notifications.unsubscribeAll();
  });

  it("payload without an open transaction", async () => {
    const adapter = freshAdapter();
    class Book extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    let capturedTransaction: unknown;
    Notifications.subscribe("sql.active_record", (event: any) => {
      capturedTransaction = event.payload.transaction;
    });
    await Book.create({ name: "test" });
    expect(capturedTransaction ?? null).toBeNull();
  });

  it.skip("payload with an open transaction", () => {
    /* needs transaction object in payload */
  });
});

describe("TransactionInSqlActiveRecordPayloadNonTransactionalTest", () => {
  afterEach(() => {
    Notifications.unsubscribeAll();
  });

  it("payload without an open transaction", async () => {
    const adapter = freshAdapter();
    class Book extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    let capturedTransaction: unknown = "unset";
    Notifications.subscribe("sql.active_record", (event: any) => {
      capturedTransaction = event.payload.transaction;
    });
    await Book.create({ name: "test" });
    expect(capturedTransaction ?? null).toBeNull();
  });

  it.skip("payload with an open transaction", () => {
    // Requires transaction object exposed in sql.active_record payload.
  });
});

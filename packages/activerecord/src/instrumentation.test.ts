/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";

import { Notifications } from "@blazetrails/activesupport";
import { Base } from "./index.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";

const TEST_SCHEMA = {
  books: { name: "string", type: "string", format: "string", status: "string" },
  authors: { name: "string" },
} as const;

describe("InstrumentationTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(TEST_SCHEMA);
  });

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
    Notifications.subscribe("inner", () => {
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
    class Book extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    await Book.create({ name: "test book" });
    let capturedName: string | undefined;
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload?.sql?.includes("SELECT")) capturedName = event.payload.name;
    });
    await Book.first();
    expect(capturedName).toBe("Book Load");
  });

  it("payload name on create", async () => {
    class Book extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    let capturedName: string | undefined;
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload?.sql?.includes("INSERT")) capturedName = event.payload.name;
    });
    await Book.create({ name: "test book" });
    expect(capturedName).toBe("Book Create");
  });

  it("payload name on update", async () => {
    class Book extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("format", "string");
      }
    }
    const book = await Book.create({ name: "test book", format: "paperback" });
    let capturedName: string | undefined;
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload?.sql?.includes("UPDATE")) capturedName = event.payload.name;
    });
    await book.updateAttribute("format", "ebook");
    expect(capturedName).toBe("Book Update");
  });

  it("payload name on update all", async () => {
    class Book extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("format", "string");
      }
    }
    let capturedName: string | undefined;
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload?.sql?.includes("UPDATE")) capturedName = event.payload.name;
    });
    await Book.updateAll({ format: "ebook" });
    expect(capturedName).toBe("Book Update All");
  });

  it("payload name on destroy", async () => {
    class Book extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    const book = await Book.create({ name: "test book" });
    let capturedName: string | undefined;
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload?.sql?.includes("DELETE")) capturedName = event.payload.name;
    });
    await book.destroy();
    expect(capturedName).toBe("Book Destroy");
  });

  it("payload name on delete all", async () => {
    class Book extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    let capturedName: string | undefined;
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload?.sql?.includes("DELETE")) capturedName = event.payload.name;
    });
    await Book.deleteAll();
    expect(capturedName).toBe("Book Delete All");
  });

  it("payload name on pluck", async () => {
    class Book extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    let capturedName: string | undefined;
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload?.sql?.includes("SELECT")) capturedName = event.payload.name;
    });
    await Book.pluck("name");
    expect(capturedName).toBe("Book Pluck");
  });

  it("payload name on count", async () => {
    class Book extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    let capturedName: string | undefined;
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload?.name === "Book Count") capturedName = event.payload.name;
    });
    await Book.count();
    expect(capturedName).toBe("Book Count");
  });

  it("payload name on grouped count", async () => {
    class Book extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("status", "string");
      }
    }
    let capturedName: string | undefined;
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload?.name === "Book Count") capturedName = event.payload.name;
    });
    await Book.group("status").count();
    expect(capturedName).toBe("Book Count");
  });

  it("payload row count on select all", async () => {
    class Book extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    for (let i = 0; i < 10; i++) await Book.create({ name: "row count book 1" });
    let capturedRowCount: number | undefined;
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload?.sql?.includes("SELECT") && !event.payload?.sql?.includes("COUNT")) {
        capturedRowCount = event.payload.row_count;
      }
    });
    await Book.where({ name: "row count book 1" }).toArray();
    expect(capturedRowCount).toBe(10);
  });

  it("payload row count on pluck", async () => {
    class Book extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    for (let i = 0; i < 10; i++) await Book.create({ name: "row count book 2" });
    let capturedRowCount: number | undefined;
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload?.name === "Book Pluck") {
        capturedRowCount = event.payload.row_count;
      }
    });
    await Book.where({ name: "row count book 2" }).pluck("name");
    expect(capturedRowCount).toBe(10);
  });

  it.skip("payload row count on raw sql", () => {
    // BLOCKED: relation — ActiveSupport::Notifications instrumentation gap
    // ROOT-CAUSE: relation.ts or abstract-adapter.ts#instrumentQuery not fully publishing AR notification events
    // SCOPE: ~30 LOC fix in abstract-adapter.ts; affects ~5 tests in instrumentation.test.ts
    /* needs raw SQL connection */
  });

  it.skip("payload row count on cache", () => {
    // BLOCKED: relation — ActiveSupport::Notifications instrumentation gap
    // ROOT-CAUSE: relation.ts or abstract-adapter.ts#instrumentQuery not fully publishing AR notification events
    // SCOPE: ~30 LOC fix in abstract-adapter.ts; affects ~5 tests in instrumentation.test.ts
    /* needs query cache */
  });

  it("payload connection with query cache disabled", async () => {
    class Book extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    const connection = Base.connection;
    let capturedConnection: unknown;
    Notifications.subscribe("sql.active_record", (event: any) => {
      capturedConnection = event.payload.connection;
    });
    await Book.first();
    expect(capturedConnection).toBe((connection as any).inner ?? connection);
  });

  it.skip("payload connection with query cache enabled", () => {
    // BLOCKED: relation — ActiveSupport::Notifications instrumentation gap
    // ROOT-CAUSE: relation.ts or abstract-adapter.ts#instrumentQuery not fully publishing AR notification events
    // SCOPE: ~30 LOC fix in abstract-adapter.ts; affects ~5 tests in instrumentation.test.ts
    /* needs query cache */
  });

  it("no instantiation notification when no records", async () => {
    class Author extends Base {
      static {
        this.attribute("name", "string");
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
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(TEST_SCHEMA);
  });

  afterEach(() => {
    Notifications.unsubscribeAll();
  });

  it("payload without an open transaction", async () => {
    class Book extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    let asserted = false;
    let capturedTransaction: unknown = "unset";
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload?.name === "Book Count") {
        capturedTransaction = event.payload.transaction;
        asserted = true;
      }
    });
    await Book.count();
    expect(asserted).toBe(true);
    expect(capturedTransaction ?? null).toBeNull();
  });

  it.skip("payload with an open transaction", () => {
    // BLOCKED: relation — ActiveSupport::Notifications instrumentation gap
    // ROOT-CAUSE: relation.ts or abstract-adapter.ts#instrumentQuery not fully publishing AR notification events
    // SCOPE: ~30 LOC fix in abstract-adapter.ts; affects ~5 tests in instrumentation.test.ts
    /* needs transaction object in payload */
  });
});

describe("TransactionInSqlActiveRecordPayloadNonTransactionalTest", () => {
  setupHandlerSuite();
  beforeAll(async () => {
    await defineSchema(TEST_SCHEMA);
  });

  afterEach(() => {
    Notifications.unsubscribeAll();
  });

  it("payload without an open transaction", async () => {
    class Book extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    let asserted = false;
    let capturedTransaction: unknown = "unset";
    Notifications.subscribe("sql.active_record", (event: any) => {
      if (event.payload?.name === "Book Count") {
        capturedTransaction = event.payload.transaction;
        asserted = true;
      }
    });
    await Book.count();
    expect(asserted).toBe(true);
    expect(capturedTransaction ?? null).toBeNull();
  });

  it.skip("payload with an open transaction", () => {
    // BLOCKED: relation — ActiveSupport::Notifications instrumentation gap
    // ROOT-CAUSE: relation.ts or abstract-adapter.ts#instrumentQuery not fully publishing AR notification events
    // SCOPE: ~30 LOC fix in abstract-adapter.ts; affects ~5 tests in instrumentation.test.ts
    // Requires transaction object exposed in sql.active_record payload.
  });
});

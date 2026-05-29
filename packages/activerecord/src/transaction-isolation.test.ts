import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Base, TransactionIsolationError } from "./index.js";
import { adapterType } from "./test-adapter.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";
import { describeIfPg, PG_TEST_URL } from "./adapters/postgresql/test-helper.js";

// Runs when the adapter does NOT support transaction isolation (or is SQLite3).
// Rails: TransactionIsolationUnsupportedTest
describe("TransactionIsolationUnsupportedTest", () => {
  setupHandlerSuite();
  beforeAll(async () => {
    await defineSchema({ tags: TEST_SCHEMA.tags });
  });

  it.skipIf(adapterType !== "sqlite")("setting the isolation level raises an error", async () => {
    class Tag extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    await expect(
      Tag.transaction(
        async () => {
          await Tag.count();
        },
        { isolation: "serializable" },
      ),
    ).rejects.toThrow(TransactionIsolationError);
  });
});

// Rails: TransactionIsolationTest (joining/nested subtests).
// Rails guards the full class with supports_transaction_isolation? && !SQLite3,
// but these two subtests exercise a framework-level check that fires before any
// DB call, so they pass on every adapter and provide broader coverage here.
describe("TransactionIsolationTest", () => {
  setupHandlerSuite();
  beforeAll(async () => {
    await defineSchema({ tags: TEST_SCHEMA.tags });
  });

  it("setting isolation when joining a transaction raises an error", async () => {
    class Tag extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    await Tag.transaction(async () => {
      await expect(Tag.transaction(async () => {}, { isolation: "serializable" })).rejects.toThrow(
        TransactionIsolationError,
      );
    });
  });

  it("setting isolation when starting a nested transaction raises error", async () => {
    class Tag extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    await Tag.transaction(async () => {
      await expect(
        Tag.transaction(async () => {}, { requiresNew: true, isolation: "serializable" }),
      ).rejects.toThrow(TransactionIsolationError);
    });
  });
});

// Rails: TransactionIsolationTest, guarded by supports_transaction_isolation? && !SQLite3.
// Mirrors vendor/rails/activerecord/test/cases/transaction_isolation_test.rb.
// Tag and Tag2 each establish their own connection to the same database so
// their transactions run on independent physical connections — matching Rails'
// `Tag.establish_connection :arunit` / `Tag2.establish_connection :arunit` pattern.
describeIfPg("TransactionIsolationTest", () => {
  setupHandlerSuite();

  class Tag extends Base {
    static {
      this.attribute("name", "string");
    }
  }

  class Tag2 extends Base {
    static {
      this._tableName = "tags";
      this.attribute("name", "string");
    }
  }

  beforeAll(async () => {
    await Tag.establishConnection(PG_TEST_URL);
    await Tag2.establishConnection(PG_TEST_URL);
    await defineSchema(Tag.connection, { tags: TEST_SCHEMA.tags });
  });

  afterAll(async () => {
    try {
      await Tag.destroyAll();
    } finally {
      Tag.removeConnection();
      Tag2.removeConnection();
    }
  });

  beforeEach(async () => {
    await Tag.destroyAll();
  });

  // PG aliases READ UNCOMMITTED to READ COMMITTED — Rails notes this test only
  // asserts that the second connection's auto-committed insert becomes visible.
  it("read uncommitted", async () => {
    await Tag.transaction(
      async () => {
        expect(await Tag.count()).toBe(0);
        await Tag2.create({});
        expect(await Tag.count()).toBe(1);
      },
      { isolation: "read_uncommitted" },
    );
  });

  // A dirty read must not happen: Tag2's uncommitted insert is invisible to Tag.
  it("read committed", async () => {
    await Tag.transaction(
      async () => {
        expect(await Tag.count()).toBe(0);
        await Tag2.transaction(async () => {
          await Tag2.create({});
          expect(await Tag.count()).toBe(0);
        });
      },
      { isolation: "read_committed" },
    );
    expect(await Tag.count()).toBe(1);
  });

  // A non-repeatable read must not happen: a committed update from the second
  // connection is invisible to the first connection's repeatable-read snapshot.
  it("repeatable read", async () => {
    const tag = await Tag.create({ name: "jon" });

    await Tag.transaction(
      async () => {
        await tag.reload();
        const t2 = await Tag2.find(tag.id);
        await t2.update({ name: "emily" });

        await tag.reload();
        expect(tag.name).toBe("jon");
      },
      { isolation: "repeatable_read" },
    );

    await tag.reload();
    expect(tag.name).toBe("emily");
  });

  // No-error smoke test for serializable — DBs enforce serializability differently.
  it("serializable", async () => {
    await Tag.transaction(
      async () => {
        await Tag.create({});
      },
      { isolation: "serializable" },
    );
  });
});

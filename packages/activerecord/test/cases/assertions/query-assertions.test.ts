import { describe, it, expect, afterEach } from "vitest";
import { adapterType } from "../../support/test-adapter.js";
import {
  assertQueriesCount,
  assertNoQueries,
  assertQueriesMatch,
  assertNoQueriesMatch,
} from "../../../lib/testing/query-assertions.js";
import { Notifications } from "@blazetrails/activesupport";
import { Assertion, assertRaises } from "@blazetrails/activesupport/testing/assertions";

function instrumentSql(sql: string, name?: string, cached = false): void {
  Notifications.instrument("sql.active_record", { sql, name: name ?? "SQL", cached });
}

describe("QueryAssertionsTest", () => {
  afterEach(() => {
    Notifications.unsubscribeAll();
  });

  it("assert queries count", async () => {
    await assertQueriesCount(1, async () => {
      instrumentSql("SELECT 1");
    });

    let error = await assertRaises([Assertion], {}, () =>
      assertQueriesCount(2, async () => {
        instrumentSql("SELECT 1");
      }),
    );
    expect(error.message).toMatch(/1 instead of 2 queries/);

    error = await assertRaises([Assertion], {}, () =>
      assertQueriesCount(0, async () => {
        instrumentSql("SELECT 1");
      }),
    );
    expect(error.message).toMatch(/1 instead of 0 queries/);
  });

  it("assert queries count any", async () => {
    await assertQueriesCount(async () => {
      instrumentSql("SELECT 1");
    });

    await expect(assertQueriesCount(async () => {})).rejects.toThrow("1 or more queries expected");
  });

  it("assert no queries", async () => {
    await assertNoQueries(async () => {});

    await expect(
      assertNoQueries(async () => {
        instrumentSql("SELECT 1");
      }),
    ).rejects.toThrow(/1 instead of 0/);
  });

  it("assert queries match", async () => {
    await assertQueriesMatch(/LIMIT/i, { count: 1 }, async () => {
      instrumentSql("SELECT * FROM posts LIMIT 1");
    });

    await assertQueriesMatch(/LIMIT/i, async () => {
      instrumentSql("SELECT * FROM posts LIMIT 1");
    });

    let error = await assertRaises([Assertion], {}, () =>
      assertQueriesMatch(/LIMIT/i, { count: 2 }, async () => {
        instrumentSql("SELECT * FROM posts LIMIT 1");
      }),
    );
    expect(error.message).toMatch(/1 instead of 2 queries/);

    error = await assertRaises([Assertion], {}, () =>
      assertQueriesMatch(/LIMIT/i, { count: 0 }, async () => {
        instrumentSql("SELECT * FROM posts LIMIT 1");
      }),
    );
    expect(error.message).toMatch(/1 instead of 0 queries/);
  });

  it("assert queries match with matcher", async () => {
    const error = await assertRaises([Assertion], {}, () =>
      assertQueriesMatch(/WHERE "posts"\."id" = \? LIMIT \?/, { count: 1 }, async () => {
        instrumentSql('SELECT * FROM posts WHERE "posts"."id" = $1 LIMIT 1');
      }),
    );
    expect(error.message).toMatch(/0 instead of 1 queries/);
  });

  it("assert queries match when there are no queries", async () => {
    await expect(assertQueriesMatch(/something/, async () => {})).rejects.toThrow(
      "1 or more queries expected, but none were executed",
    );
  });

  it("assert no queries match", async () => {
    await assertNoQueriesMatch(/something/, async () => {
      instrumentSql("SELECT 1");
    });

    const error = await assertRaises([Assertion], {}, () =>
      assertNoQueriesMatch(/ORDER BY/i, async () => {
        instrumentSql("SELECT * FROM posts ORDER BY id");
      }),
    );
    expect(error.message).toMatch(/1 instead of 0/);
  });

  it("assert no queries match matcher", async () => {
    await expect(
      assertNoQueriesMatch(/ORDER BY/i, async () => {
        instrumentSql("SELECT * FROM posts ORDER BY id");
      }),
    ).rejects.toThrow(/1 instead of 0/);
  });

  it.skipIf(adapterType !== "postgres")("assert queries count include schema", async () => {
    await assertQueriesCount(null, { includeSchema: true }, async () => {
      instrumentSql("SELECT attname FROM pg_attribute", "SCHEMA");
    });

    await expect(
      assertQueriesCount(async () => {
        instrumentSql("SELECT attname FROM pg_attribute", "SCHEMA");
      }),
    ).rejects.toThrow("1 or more queries expected");
  });

  it.skipIf(adapterType !== "postgres")("assert no queries include schema", async () => {
    await assertNoQueries(async () => {});

    await expect(
      assertNoQueries(async () => {
        instrumentSql("SELECT 1");
      }),
    ).rejects.toThrow(/\d+ instead of 0/);

    await expect(
      assertNoQueries({ includeSchema: true }, async () => {
        instrumentSql("SELECT attname FROM pg_attribute", "SCHEMA");
      }),
    ).rejects.toThrow(/\d+ instead of 0/);
  });

  it.skipIf(adapterType !== "postgres")("assert queries match include schema", async () => {
    await expect(
      assertQueriesMatch(/SELECT/i, async () => {
        instrumentSql("SELECT attname FROM pg_attribute", "SCHEMA");
      }),
    ).rejects.toThrow("1 or more queries expected");

    await assertQueriesMatch(/SELECT/i, { includeSchema: true }, async () => {
      instrumentSql("SELECT attname FROM pg_attribute", "SCHEMA");
    });
  });

  it.skipIf(adapterType !== "postgres")("assert no queries match include schema", async () => {
    await assertNoQueriesMatch(/SELECT/i, async () => {
      instrumentSql("SELECT attname FROM pg_attribute", "SCHEMA");
    });

    await expect(
      assertNoQueriesMatch(/SELECT/i, { includeSchema: true }, async () => {
        instrumentSql("SELECT attname FROM pg_attribute", "SCHEMA");
      }),
    ).rejects.toThrow(/\d+ instead of 0/);
  });
});

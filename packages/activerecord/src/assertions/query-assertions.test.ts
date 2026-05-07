import { describe, it, expect, afterEach } from "vitest";
import {
  SQLCounter,
  assertQueriesCount,
  assertNoQueries,
  assertQueriesMatch,
  assertNoQueriesMatch,
} from "../testing/query-assertions.js";
import { Notifications } from "@blazetrails/activesupport";

/** Instrument an sql.active_record event the way the adapter does. */
function instrumentSql(sql: string, name?: string, cached = false): void {
  Notifications.instrument("sql.active_record", { sql, name: name ?? "SQL", cached });
}

describe("QueryAssertionsTest", () => {
  afterEach(() => {
    Notifications.unsubscribeAll();
  });

  it("assert queries count", async () => {
    await assertQueriesCount(1, false, async () => {
      instrumentSql("SELECT 1");
    });

    await expect(
      assertQueriesCount(2, false, async () => {
        instrumentSql("SELECT 1");
      }),
    ).rejects.toThrow(/1 instead of 2 queries/);

    await expect(
      assertQueriesCount(0, false, async () => {
        instrumentSql("SELECT 1");
      }),
    ).rejects.toThrow(/1 instead of 0 queries/);
  });

  it("assert queries count any", async () => {
    await assertQueriesCount(undefined, false, async () => {
      instrumentSql("SELECT 1");
    });

    await expect(assertQueriesCount(undefined, false, async () => {})).rejects.toThrow(
      "1 or more queries expected",
    );
  });

  it("assert no queries", async () => {
    await assertNoQueries(false, async () => {});

    await expect(
      assertNoQueries(false, async () => {
        instrumentSql("SELECT 1");
      }),
    ).rejects.toThrow(/1 instead of 0/);
  });

  it("assert queries match", async () => {
    await assertQueriesMatch(/LIMIT/i, 1, false, async () => {
      instrumentSql("SELECT * FROM posts LIMIT 1");
    });

    await assertQueriesMatch(/LIMIT/i, undefined, false, async () => {
      instrumentSql("SELECT * FROM posts LIMIT 1");
    });

    await expect(
      assertQueriesMatch(/LIMIT/i, 2, false, async () => {
        instrumentSql("SELECT * FROM posts LIMIT 1");
      }),
    ).rejects.toThrow(/1 instead of 2 queries/);

    await expect(
      assertQueriesMatch(/LIMIT/i, 0, false, async () => {
        instrumentSql("SELECT * FROM posts LIMIT 1");
      }),
    ).rejects.toThrow(/1 instead of 0 queries/);
  });

  it("assert queries match with matcher", async () => {
    await expect(
      assertQueriesMatch(/WHERE "posts"\."id" = \? LIMIT \?/, 1, false, async () => {
        instrumentSql('SELECT * FROM posts WHERE "posts"."id" = $1 LIMIT 1');
      }),
    ).rejects.toThrow(/0 instead of 1 queries/);
  });

  it("assert queries match when there are no queries", async () => {
    await expect(assertQueriesMatch(/something/, undefined, false, async () => {})).rejects.toThrow(
      "1 or more queries expected, but none were executed",
    );
  });

  it("assert no queries match", async () => {
    await assertNoQueriesMatch(/something/, false, async () => {
      instrumentSql("SELECT 1");
    });

    await expect(
      assertNoQueriesMatch(/ORDER BY/i, false, async () => {
        instrumentSql("SELECT * FROM posts ORDER BY id");
      }),
    ).rejects.toThrow(/1 instead of 0/);
  });

  it("assert no queries match matcher", async () => {
    await expect(
      assertNoQueriesMatch(/ORDER BY/i, false, async () => {
        instrumentSql("SELECT * FROM posts ORDER BY id");
      }),
    ).rejects.toThrow(/1 instead of 0/);
  });

  it("assert queries count include schema", async () => {
    await assertQueriesCount(undefined, true, async () => {
      instrumentSql("SELECT attname FROM pg_attribute", "SCHEMA");
    });

    await expect(
      assertQueriesCount(undefined, false, async () => {
        instrumentSql("SELECT attname FROM pg_attribute", "SCHEMA");
      }),
    ).rejects.toThrow("1 or more queries expected");
  });

  it("assert no queries include schema", async () => {
    await assertNoQueries(false, async () => {});

    await expect(
      assertNoQueries(false, async () => {
        instrumentSql("SELECT 1");
      }),
    ).rejects.toThrow(/\d+ instead of 0/);

    await expect(
      assertNoQueries(true, async () => {
        instrumentSql("SELECT attname FROM pg_attribute", "SCHEMA");
      }),
    ).rejects.toThrow(/\d+ instead of 0/);
  });

  it("assert queries match include schema", async () => {
    await expect(
      assertQueriesMatch(/SELECT/i, undefined, false, async () => {
        instrumentSql("SELECT attname FROM pg_attribute", "SCHEMA");
      }),
    ).rejects.toThrow("1 or more queries expected");

    await assertQueriesMatch(/SELECT/i, undefined, true, async () => {
      instrumentSql("SELECT attname FROM pg_attribute", "SCHEMA");
    });
  });

  it("assert no queries match include schema", async () => {
    await assertNoQueriesMatch(/SELECT/i, false, async () => {
      instrumentSql("SELECT attname FROM pg_attribute", "SCHEMA");
    });

    await expect(
      assertNoQueriesMatch(/SELECT/i, true, async () => {
        instrumentSql("SELECT attname FROM pg_attribute", "SCHEMA");
      }),
    ).rejects.toThrow(/\d+ instead of 0/);
  });

  it("assert queries match global regex does not alternate due to lastIndex statefulness", async () => {
    // Ruby Regexp#=== is always stateless; JS RegExp.test with /g advances lastIndex.
    // assertQueriesMatch must reset lastIndex before each test call.
    await assertQueriesMatch(/SELECT/gi, 3, false, async () => {
      instrumentSql("SELECT 1");
      instrumentSql("SELECT 2");
      instrumentSql("SELECT 3");
    });
  });

  it("SQLCounter skips cached queries", () => {
    const counter = new SQLCounter();
    counter.call("sql.active_record", "id1", { sql: "SELECT 1", cached: true });
    expect(counter.logAll).toHaveLength(0);
    expect(counter.log).toHaveLength(0);
  });

  it("SQLCounter separates schema from non-schema", () => {
    const counter = new SQLCounter();
    counter.call("sql.active_record", "id1", {
      sql: "SELECT attname FROM pg_attribute",
      name: "SCHEMA",
    });
    counter.call("sql.active_record", "id2", { sql: "SELECT 1", name: "SQL" });
    expect(counter.logAll).toHaveLength(2);
    expect(counter.log).toHaveLength(1);
    expect(counter.log[0]).toBe("SELECT 1");
  });
});

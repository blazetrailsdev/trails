import { describe, it, expect } from "vitest";
import {
  SQLCounter,
  assertQueriesCount,
  assertNoQueries,
  assertQueriesMatch,
  assertNoQueriesMatch,
} from "../testing/query-assertions.js";
import { Notifications } from "@blazetrails/activesupport";

function publishSql(sql: string, name = "SELECT"): void {
  Notifications.publish("sql.active_record", { sql, name, cached: false, binds: [] });
}

describe("QueryAssertionsTest", () => {
  it("assert queries count any", async () => {
    await assertQueriesCount(1, async () => {
      publishSql("SELECT 1");
    });
  });

  it("assert no queries", async () => {
    await assertNoQueries(async () => {
      // no queries
    });
  });

  it("assert queries count fails on mismatch", async () => {
    await expect(
      assertQueriesCount(2, async () => {
        publishSql("SELECT 1");
      }),
    ).rejects.toThrow("instead of 2 queries");
  });

  it("assert no queries fails when queries are made", async () => {
    await expect(
      assertNoQueries(async () => {
        publishSql("SELECT 1");
      }),
    ).rejects.toThrow("instead of 0 queries");
  });

  it("counter records multiple queries", async () => {
    const counter = new SQLCounter();
    counter.call("", new Date(), new Date(), "", {
      sql: "SELECT 1",
      name: "SELECT",
      cached: false,
      binds: [],
    });
    counter.call("", new Date(), new Date(), "", {
      sql: "SELECT 2",
      name: "SELECT",
      cached: false,
      binds: [],
    });
    expect(counter.log).toEqual(["SELECT 1", "SELECT 2"]);
    expect(counter.logAll).toEqual(["SELECT 1", "SELECT 2"]);
  });

  it("counter does not record cached queries", async () => {
    const counter = new SQLCounter();
    counter.call("", new Date(), new Date(), "", {
      sql: "SELECT 1",
      name: "SELECT",
      cached: true,
      binds: [],
    });
    expect(counter.log).toEqual([]);
  });

  it("assert queries match", async () => {
    await assertQueriesMatch(/SELECT/, async () => {
      publishSql("SELECT 1");
    });
  });

  it("assert queries match with matcher", async () => {
    await assertQueriesMatch(/LIMIT/, { count: 1 }, async () => {
      publishSql("SELECT * FROM t LIMIT 1");
    });
  });

  it("assert queries match when there are no queries", async () => {
    await expect(
      assertQueriesMatch(/SELECT/, async () => {
        // no queries
      }),
    ).rejects.toThrow("1 or more queries expected");
  });

  it("assert no queries match", async () => {
    await assertNoQueriesMatch(/DELETE/, async () => {
      publishSql("SELECT 1");
    });
  });

  it("assert no queries match matcher", async () => {
    await expect(
      assertNoQueriesMatch(/SELECT/, async () => {
        publishSql("SELECT 1");
      }),
    ).rejects.toThrow("instead of 0 queries");
  });

  it.skip("assert queries count include schema", () => {});
  it.skip("assert no queries include schema", () => {});
  it.skip("assert queries match include schema", () => {});
  it.skip("assert no queries match include schema", () => {});
});

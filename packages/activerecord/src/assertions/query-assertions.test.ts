import { describe, it, expect, beforeEach } from "vitest";
import { SQLCounter, assertQueries, assertNoQueries } from "../testing/query-assertions.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

describe("QueryAssertionsTest", () => {
  let adapter: DatabaseAdapter;
  let counter: SQLCounter;
  let wrapped: DatabaseAdapter;

  beforeEach(() => {
    adapter = createTestAdapter();
    counter = new SQLCounter();
    wrapped = counter.wrap(adapter);
  });

  it("assert queries count any", async () => {
    await assertQueries(counter, 1, async () => {
      await wrapped.execute("SELECT 1");
    });
  });

  it("assert no queries", async () => {
    await assertNoQueries(counter, async () => {
      // no queries
    });
  });

  it("assert queries count fails on mismatch", async () => {
    await expect(
      assertQueries(counter, 2, async () => {
        await wrapped.execute("SELECT 1");
      }),
    ).rejects.toThrow("Expected 2 queries, but got 1");
  });

  it("assert no queries fails when queries are made", async () => {
    await expect(
      assertNoQueries(counter, async () => {
        await wrapped.execute("SELECT 1");
      }),
    ).rejects.toThrow("Expected 0 queries, but got 1");
  });

  it("counter records multiple queries", async () => {
    await assertQueries(counter, 3, async () => {
      await wrapped.execute("SELECT 1");
      await wrapped.execute("SELECT 2");
      await wrapped.executeMutation('CREATE TABLE IF NOT EXISTS "t" ("id" INTEGER PRIMARY KEY)');
    });
    expect(counter.queries).toEqual([
      "SELECT 1",
      "SELECT 2",
      'CREATE TABLE IF NOT EXISTS "t" ("id" INTEGER PRIMARY KEY)',
    ]);
  });

  it("counter does not record when not listening", async () => {
    await wrapped.execute("SELECT 1");
    expect(counter.count).toBe(0);
  });

  it.skip("assert queries match", () => {});
  it.skip("assert queries match with matcher", () => {});
  it.skip("assert queries match when there are no queries", () => {});
  it.skip("assert no queries match", () => {});
  it.skip("assert no queries match matcher", () => {});
  it.skip("assert queries count include schema", () => {});
  it.skip("assert no queries include schema", () => {});
  it.skip("assert queries match include schema", () => {});
  it.skip("assert no queries match include schema", () => {});
});

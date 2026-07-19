/**
 * trails-only: Rails memoizes @_returning_columns_for_insert per-class
 * (model_schema.rb:437) and clears it in reload_schema_from_cache
 * (model_schema.rb:554). There is no upstream test for the memo itself, so
 * these guard the caching + invalidation contract.
 */
import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import { fixtures } from "./test-helpers/fixtures.js";

describe("_returningColumnsForInsert memoization", () => {
  fixtures([]);

  class Topic extends Base {}

  // Both are mixed in via `this`-typed statics, so they are not on the
  // Base class type; narrow to just the surface these tests drive.
  const schemaHost = Topic as unknown as {
    _returningColumnsForInsert(connection: {
      returnValueAfterInsert(column: { name: string }): boolean;
    }): string[];
    resetColumnInformation(): void;
  };

  it("computes the auto-populated filter only once per class", async () => {
    await Topic.loadSchema();
    let calls = 0;
    const connection = {
      returnValueAfterInsert(column: { name: string }) {
        calls += 1;
        return column.name === "id";
      },
    };

    expect(schemaHost._returningColumnsForInsert(connection)).toEqual(["id"]);
    const first = calls;
    expect(first).toBeGreaterThan(0);

    expect(schemaHost._returningColumnsForInsert(connection)).toEqual(["id"]);
    expect(calls).toBe(first);
  });

  it("recomputes after resetColumnInformation", async () => {
    await Topic.loadSchema();
    let calls = 0;
    const connection = {
      returnValueAfterInsert(column: { name: string }) {
        calls += 1;
        return column.name === "id";
      },
    };

    schemaHost._returningColumnsForInsert(connection);
    const first = calls;

    schemaHost.resetColumnInformation();
    await Topic.loadSchema();

    expect(schemaHost._returningColumnsForInsert(connection)).toEqual(["id"]);
    expect(calls).toBeGreaterThan(first);
  });
});

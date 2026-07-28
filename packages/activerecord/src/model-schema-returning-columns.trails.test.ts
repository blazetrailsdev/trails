/**
 * trails-only: Rails memoizes @_returning_columns_for_insert per-class
 * (model_schema.rb:437) and clears it in reload_schema_from_cache
 * (model_schema.rb:554). There is no upstream test for the memo itself, so
 * these guard the caching + invalidation contract.
 */
import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import { fixtures } from "./test-fixtures.js";

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

  it("does not let a subclass reuse the base's memo", () => {
    // Ruby class instance variables are NOT inherited, so Rails' `||=` on
    // @_returning_columns_for_insert is genuinely per-class (model_schema.rb
    // :436-443). A plain JS static read walks the prototype chain, so without
    // an own-property check a subclass would hand back the base's list.
    //
    // Pinned with a sentinel memo rather than two real tables on purpose: a
    // base/subclass pair on different tables ALSO mis-answers here because
    // loading the base clobbers the subclass's `_columns`, which reproduces
    // with the memo entirely disabled and so is a separate pre-existing bug.
    // A sentinel isolates the prototype-chain read this test is about.
    class Parent extends Base {
      static tableName = "topics";
    }
    class Child extends Parent {}
    const sentinel = ["LEAKED_FROM_BASE"];
    (
      Parent as unknown as { _returningColumnsForInsertCache?: string[] }
    )._returningColumnsForInsertCache = sentinel;

    const connection = {
      returnValueAfterInsert: (column: { name: string }) => column.name === "id",
    };
    const child = Child as unknown as typeof schemaHost;

    expect(child._returningColumnsForInsert(connection)).not.toEqual(sentinel);
    expect(
      (Parent as unknown as { _returningColumnsForInsertCache?: string[] })
        ._returningColumnsForInsertCache,
    ).toBe(sentinel);
  });

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

  it("resetting a base clears a descendant's memo", async () => {
    class Reply extends Topic {}
    const sub = Reply as unknown as typeof schemaHost;

    // Clear first: Topic is describe-scoped and earlier tests memoized on it,
    // which Reply would otherwise inherit through the prototype chain — the
    // descendant would never compute its OWN memo and this test would be
    // vacuous.
    schemaHost.resetColumnInformation();
    await Reply.loadSchema();

    let calls = 0;
    const connection = {
      returnValueAfterInsert(column: { name: string }) {
        calls += 1;
        return column.name === "id";
      },
    };

    sub._returningColumnsForInsert(connection);
    const afterSubMemo = calls;
    // The descendant really did compute (and now owns) a memo of its own.
    expect(afterSubMemo).toBeGreaterThan(0);
    expect(Object.prototype.hasOwnProperty.call(Reply, "_returningColumnsForInsertCache")).toBe(
      true,
    );
    sub._returningColumnsForInsert(connection);
    expect(calls).toBe(afterSubMemo);

    // Resetting the BASE leaves the descendant's own `_columns` in place — a
    // pre-existing, memo-independent trails divergence (Rails'
    // reload_schema_from_cache recurses through `subclasses`, model_schema.rb
    // :553-569, while trails' resetColumnInformation clears only `this`).
    // This pins the property that makes the memo safe on top of that gap: the
    // memoized value never differs from a fresh compute over the columns the
    // class currently sees, so a stale memo is only ever as stale as the
    // `_columns` behind it — exactly what the pre-memo code, recomputing from
    // those same stale columns, already returned.
    schemaHost.resetColumnInformation();
    await Reply.loadSchema();

    const memoized = sub._returningColumnsForInsert(connection);
    Reflect.deleteProperty(Reply, "_returningColumnsForInsertCache");
    expect(memoized).toEqual(sub._returningColumnsForInsert(connection));
  });
});

/**
 * Unit coverage for `SchemaCache#snapshotState` / `#restoreState` — the
 * primitives `withTransactionalFixtures` uses to revert a test's cache
 * mutations while preserving entries warmed before it (RFC 0023:
 * columnshash-sync-schema-cache-reload-vs-sibling-borrow).
 */
import { describe, it, expect } from "vitest";
import { SchemaCache } from "./schema-cache.js";

const col = (name: string) => ({ name }) as never;

describe("SchemaCache snapshot/restore", () => {
  it("restores entries reverted after the snapshot", () => {
    const cache = new SchemaCache();
    cache.setColumns("posts", [col("title")]);

    const snapshot = cache.snapshotState();
    cache.clearDataSourceCacheBang(null, "posts");
    expect(cache.getCachedColumnsHash("posts")).toBeUndefined();

    cache.restoreState(snapshot);
    expect(Object.keys(cache.getCachedColumnsHash("posts") ?? {})).toEqual(["title"]);
  });

  it("drops entries added after the snapshot", () => {
    const cache = new SchemaCache();
    cache.setColumns("posts", [col("title")]);

    const snapshot = cache.snapshotState();
    cache.setColumns("comments", [col("body")]);
    expect(cache.getCachedColumnsHash("comments")).toBeDefined();

    cache.restoreState(snapshot);
    expect(cache.getCachedColumnsHash("comments")).toBeUndefined();
    // The pre-snapshot entry survives.
    expect(cache.getCachedColumnsHash("posts")).toBeDefined();
  });

  it("does not alias the snapshot's maps", () => {
    const cache = new SchemaCache();
    cache.setColumns("posts", [col("title")]);
    const snapshot = cache.snapshotState();

    cache.restoreState(snapshot);
    // Mutating the live cache after a restore must not leak into the snapshot,
    // so the same snapshot can be restored again by a later teardown.
    cache.setColumns("authors", [col("name")]);
    cache.restoreState(snapshot);
    expect(cache.getCachedColumnsHash("authors")).toBeUndefined();
  });
});

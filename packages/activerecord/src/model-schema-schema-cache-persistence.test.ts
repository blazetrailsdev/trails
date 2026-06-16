/**
 * Convergence: a fresh same-table model's sync `columnsHash()` reads the table's
 * real columns from the persistent schema cache — matching Rails' shared-cache
 * semantics — instead of relying on the trails-only `borrowSameTableColumns`
 * workaround.
 *
 * `withTransactionalFixtures` now snapshots/restores the schema cache on
 * teardown rather than blanket-clearing it (see `snapshotSchemaCache`), so an
 * entry warmed in `beforeAll` survives across every test. The reader model here
 * declares no own attributes and has no borrowable sibling (its only same-table
 * sibling declares `ignoredColumns`, which `borrowSameTableColumns` skips), so a
 * non-empty `columnsHash()` can only have come from the live cache entry.
 *
 * Tracked: RFC 0023 columnshash-sync-schema-cache-reload-vs-sibling-borrow.
 */
import { describe, it, expect, beforeAll } from "vitest";
import "./index.js";
import { Base } from "./base.js";
import { registerModel } from "./associations.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";

// Only same-table sibling — declares `ignoredColumns`, so it is never a valid
// borrow source: `borrowSameTableColumns` returns null when every loaded
// same-table sibling has its own ignores.
class IgnoringPost extends Base {
  static {
    this._tableName = "posts";
    this.ignoredColumns = ["body"];
  }
}

// Fresh reader: no own attribute declarations, so its only route to the real
// columns is the persistent schema cache (or the now-unreachable borrow).
class CachePeekPost extends Base {
  static {
    this._tableName = "posts";
  }
}

registerModel(IgnoringPost);
registerModel(CachePeekPost);

describe("columnsHash from persistent schema cache", () => {
  useHandlerFixtures(["posts"], { schema: canonicalSchema });

  beforeAll(async () => {
    // Warm the connection's schema cache for `posts` once, before any test's
    // snapshot is taken — this is the entry that must persist across tests.
    await (
      IgnoringPost as unknown as { loadSchemaFromAdapter(): Promise<void> }
    ).loadSchemaFromAdapter();
  });

  it("a fresh same-table model reads real columns without a borrowable sibling", () => {
    // The warmed entry is still present at the start of this test (a blanket
    // clear would have wiped it).
    const cached = Base.connection.schemaCache?.getCachedColumnsHash("posts");
    expect(cached && Object.keys(cached)).toContain("title");

    const columns = (
      CachePeekPost as unknown as { columnsHash(): Record<string, unknown> }
    ).columnsHash();
    // `body` is a real column the reader does NOT ignore; the only sibling
    // ignores it, so a borrow would have returned null and synthesized empty.
    expect(Object.keys(columns)).toEqual(expect.arrayContaining(["title", "body"]));
  });
});

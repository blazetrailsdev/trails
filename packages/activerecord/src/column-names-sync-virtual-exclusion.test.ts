/**
 * Trails-specific coverage for the async/sync schema-load boundary.
 *
 * Rails' `column_names` is always `columns.map(&:name)` and the first call
 * performs a synchronous, blocking schema load, so a virtual `attribute()`
 * (declared with no backing DB column) never appears in it. trails' DB layer is
 * async; the equivalent load is `ensureSchemaLoaded()`. The boot-time canonical
 * schema loader eagerly warms the adapter schema cache (the analogue of Rails
 * loading `db/schema_cache.yml`), so a synchronous `Model.columnNames()` on a
 * connected model with a real table is DB-faithful without a prior reflection —
 * matching Rails' `columns.map(&:name)`.
 *
 * `fixtures([], { useTransactionalTests: false })` here on purpose: the
 * transactional variant's per-test `clearSchemaCache` teardown would wipe the
 * boot-warmed cache, which is exactly the cold-cache state this test must avoid.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { Base } from "./index.js";

import { fixtures } from "./test-fixtures.js";

vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");

describe("column_names sync virtual exclusion", () => {
  fixtures([], { useTransactionalTests: false });
  beforeAll(async () => {
    // Warm the shared schema cache for `posts` (the boot-time analogue of Rails
    // loading `db/schema_cache.yml`) so a synchronous `columnNames()` on a cold
    // model reflects the real DB columns. `columnsHash` populates the exact
    // `_columnsHash` that model-schema.ts reads and short-circuits when warm.
    const conn = Base.connection as unknown as {
      schemaCache: { columnsHash(pool: unknown, table: string): Promise<unknown> };
      pool: unknown;
    };
    await conn.schemaCache.columnsHash(conn.pool, "posts");
  });

  it("excludes virtual attributes from a synchronous column_names on a cold model", () => {
    class Post extends Base {
      static override tableName = "posts";
      static {
        this.attribute("title", "string");
        this.attribute("virtual_note", "string");
      }
    }

    // Synchronous — no `await Post.create(...)` and no `ensureSchemaLoaded()`
    // first. The eagerly-warmed schema cache makes columnsHash take the
    // DB-sourced branch, so the virtual attribute (no backing column) falls out.
    const columnNames = (Post as unknown as { columnNames(): string[] }).columnNames();

    expect(columnNames).toContain("title");
    expect(columnNames).toContain("body");
    expect(columnNames).not.toContain("virtual_note");
  });

  it("keeps the virtual attribute in attribute_names", () => {
    class Post extends Base {
      static override tableName = "posts";
      static {
        this.attribute("title", "string");
        this.attribute("virtual_note", "string");
      }
    }

    const columnNames = (Post as unknown as { columnNames(): string[] }).columnNames();
    const attributeNames = (Post as unknown as { attributeNames(): string[] }).attributeNames();

    expect(columnNames).not.toContain("virtual_note");
    expect(attributeNames).toContain("virtual_note");
    expect(new Set(attributeNames)).toEqual(new Set([...columnNames, "virtual_note"]));
  });
});

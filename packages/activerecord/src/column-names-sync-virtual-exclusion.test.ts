/**
 * Trails-specific coverage for the async/sync schema-load boundary.
 *
 * Rails' `column_names` is always `columns.map(&:name)` and the first call
 * performs a synchronous, blocking schema load, so a virtual `attribute()`
 * (declared with no backing DB column) never appears in it. trails' DB layer is
 * async; the equivalent load is `ensureSchemaLoaded()`. `defineSchema` eagerly
 * warms the adapter schema cache (the boot-time analogue of Rails loading
 * `db/schema_cache.yml`), so a synchronous `Model.columnNames()` on a connected
 * model with a real table is DB-faithful without a prior reflection — matching
 * Rails' `columns.map(&:name)`.
 *
 * No `useHandlerTransactionalFixtures()` here on purpose: its per-test
 * `clearSchemaCache` teardown would wipe the `beforeAll`-warmed cache, which is
 * exactly the cold-cache state this test must avoid.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { Base } from "./index.js";

import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";

vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");

describe("column_names sync virtual exclusion", () => {
  setupHandlerSuite();
  beforeAll(async () => {
    await defineSchema({ posts: TEST_SCHEMA.posts });
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

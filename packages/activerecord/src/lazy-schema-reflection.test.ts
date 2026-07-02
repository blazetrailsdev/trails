/**
 * Lazy async schema reflection: the query/persistence path awaits a
 * one-shot `ensureSchemaLoaded()` so consumers don't have to call
 * `loadSchema` explicitly. See
 * packages/activerecord-cli/README.md (lazy reflection / ensureSchemaLoaded).
 */
import { describe, it, expect } from "vitest";
import { Base } from "./index.js";

import { setupFixtures } from "./test-helpers/fixtures.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";

describe("lazy async schema reflection", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();

  it("find_by without an explicit load_schema", async () => {
    // No `this.attribute(...)` and no explicit `Topic.loadSchema()` —
    // create/findBy must reflect the schema lazily on the query path.
    class Topic extends Base {
      static override tableName = "topics";
    }

    const created = await Topic.create({ title: "Lazy" });
    expect(created.isPersisted()).toBe(true);

    const found = await Topic.findBy({ title: "Lazy" });
    expect(found).not.toBeNull();
    expect((found as unknown as { title: string }).title).toBe("Lazy");
  });

  it("find without an explicit load_schema", async () => {
    class Topic extends Base {
      static override tableName = "topics";
    }

    const created = await Topic.create({ title: "Found" });
    const found = await Topic.find(created.id);
    expect((found as unknown as { title: string }).title).toBe("Found");
  });
});

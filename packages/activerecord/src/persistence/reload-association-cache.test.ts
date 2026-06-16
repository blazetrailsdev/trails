/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/persistence/reload_association_cache_test.rb
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../index.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";
import { TEST_SCHEMA } from "../test-helpers/test-schema.js";
import { Publication } from "../test-helpers/models/publication.js";
import { Editor } from "../test-helpers/models/editor.js";
import { Editorship } from "../test-helpers/models/editorship.js";

describe("ReloadAssociationCacheTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();

  registerModel("Publication", Publication);
  registerModel("Editor", Editor);
  registerModel("Editorship", Editorship);

  beforeAll(async () => {
    await defineSchema({
      publications: TEST_SCHEMA.publications,
      editorships: TEST_SCHEMA.editorships,
      editors: TEST_SCHEMA.editors,
    });
  });

  it("reload sets correct owner for association cache", async () => {
    const publication = await Publication.createBang({ name: "Rails Way" });
    expect((publication as any).name).toBe("Rails Way (touched)");
    await publication.reload();
    expect((publication as any).name).toBe("Rails Way");
    await publication.transaction(async () => {
      (publication as any).editors = [
        (publication as any).buildEditorInChief({ name: "Alex Black" }),
      ];
      await publication.saveBang();
    });
    expect((publication as any).name).toBe("Rails Way (touched)");
  });
});

import { describe, it, expect, beforeAll } from "vitest";
import { registerModel, transaction } from "../index.js";
import { createTestAdapter, type TestDatabaseAdapter } from "../test-adapter.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { withTransactionalFixtures } from "../test-helpers/with-transactional-fixtures.js";
import { TEST_SCHEMA } from "../test-helpers/test-schema.js";
import { Publication } from "../test-helpers/models/publication.js";
import { Editor } from "../test-helpers/models/editor.js";
import { Editorship } from "../test-helpers/models/editorship.js";

describe("ReloadAssociationCacheTest", () => {
  let adapter: TestDatabaseAdapter;

  beforeAll(async () => {
    adapter = createTestAdapter();
    Publication.adapter = adapter;
    Editor.adapter = adapter;
    Editorship.adapter = adapter;
    registerModel(Publication);
    registerModel(Editor);
    registerModel(Editorship);
    await defineSchema(adapter, {
      publications: TEST_SCHEMA.publications,
      editorships: TEST_SCHEMA.editorships,
      editors: TEST_SCHEMA.editors,
    });
  });
  withTransactionalFixtures(() => adapter);

  it("reload sets correct owner for association cache", async () => {
    const publication = await Publication.create({ name: "Rails Way" });
    expect(publication.readAttribute("name")).toBe("Rails Way (touched)");
    await publication.reload();
    expect(publication.readAttribute("name")).toBe("Rails Way");
    const pub = publication as unknown as {
      editors: Editor[];
      buildEditorInChief(attrs: { name: string }): Editor;
    };
    await transaction(Publication, async () => {
      pub.editors = [pub.buildEditorInChief({ name: "Alex Black" })];
      await publication.saveBang();
    });
    expect(publication.readAttribute("name")).toBe("Rails Way (touched)");
  });
});

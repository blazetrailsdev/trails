import { describe, it, expect, beforeAll } from "vitest";
import { registerModel, transaction } from "../index.js";
import { createTestAdapter, type TestDatabaseAdapter } from "../test-adapter.js";
import { withTransactionalFixtures } from "../test-helpers/with-transactional-fixtures.js";
import { Publication } from "../test-helpers/models/publication.js";
import { Editor } from "../test-helpers/models/editor.js";
import { Editorship } from "../test-helpers/models/editorship.js";

describe("ReloadAssociationCacheTest", () => {
  let adapter: TestDatabaseAdapter;

  beforeAll(async () => {
    adapter = await createTestAdapter();
    Publication.adapter = adapter;
    Editor.adapter = adapter;
    Editorship.adapter = adapter;
    registerModel(Publication);
    registerModel(Editor);
    registerModel(Editorship);
    // This wrapper adapter shares the boot DB (which already carries the
    // canonical publications/editorships/editors) but has its own signature
    // cache, so re-lay the three canonical tables through it — mirroring
    // schema.rb's create_table shapes — to prime that cache.
    // These are canonical, boot-owned tables re-laid to prime the wrapper's
    // cache; a teardown drop would remove them from the shared boot DB, so no
    // dropTable here (the boot schema owns/restores them).
    // eslint-disable-next-line blazetrails/require-table-teardown
    await adapter.createTable("publications", { force: true }, (t) => {
      t.column("name", "string");
      t.integer("editor_in_chief_id");
    });
    // eslint-disable-next-line blazetrails/require-table-teardown
    await adapter.createTable("editorships", { force: true }, (t) => {
      t.string("publication_id");
      t.string("editor_id");
    });
    // eslint-disable-next-line blazetrails/require-table-teardown
    await adapter.createTable("editors", { force: true }, (t) => {
      t.string("name");
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

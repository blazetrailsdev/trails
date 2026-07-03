import { describe, it, expect, beforeAll } from "vitest";
import { Base, registerModel, transaction } from "../index.js";
import { setupFixtures } from "../test-helpers/fixtures.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";
import { Publication } from "../test-helpers/models/publication.js";
import { Editor } from "../test-helpers/models/editor.js";
import { Editorship } from "../test-helpers/models/editorship.js";

describe("ReloadAssociationCacheTest", () => {
  // Ride the boot-laid canonical `publications` / `editorships` / `editors`
  // on `Base.connection` (single-pool test model) rather than a sidecar
  // `_pool` lease. The former in-test `createTable` re-lay only existed to
  // prime the sidecar wrapper's separate signature cache — unnecessary now
  // that the suite rides the boot connection.
  setupFixtures();

  beforeAll(() => {
    Publication.adapter = Base.connection;
    Editor.adapter = Base.connection;
    Editorship.adapter = Base.connection;
    registerModel(Publication);
    registerModel(Editor);
    registerModel(Editorship);
  });
  useHandlerTransactionalFixtures();

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

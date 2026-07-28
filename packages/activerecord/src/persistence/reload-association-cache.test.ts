import { describe, it, expect, beforeAll } from "vitest";
import { registerModel, transaction } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Publication } from "../test-helpers/models/publication.js";
import { Editor } from "../test-helpers/models/editor.js";
import { Editorship } from "../test-helpers/models/editorship.js";

describe("ReloadAssociationCacheTest", () => {
  // Ride the boot-laid canonical `publications` / `editorships` / `editors`
  // on `Base.connection` (single-pool test model) rather than a sidecar
  // `_pool` lease. `fixtures({})` establishes the handler and per-test
  // transactional rollback (no seed rows). The former in-test `createTable`
  // re-lay only existed to prime the sidecar wrapper's separate signature
  // cache — unnecessary now that the suite rides the boot connection.
  fixtures({});

  beforeAll(() => {
    registerModel(Publication);
    registerModel(Editor);
    registerModel(Editorship);
  });

  it("reload sets correct owner for association cache", async () => {
    const publication = await Publication.create({ name: "Rails Way" });
    expect(publication.readAttribute("name")).toBe("Rails Way (touched)");
    await publication.reload();
    expect(publication.readAttribute("name")).toBe("Rails Way");
    const pub = publication as unknown as {
      editors: { replace(records: Editor[]): Promise<void> };
      buildEditorInChief(attrs: { name: string }): Editor;
    };
    await transaction(Publication, async () => {
      // Rails' `publication.editors = [...]` persists the replacement at
      // assignment; that needs `await` in JS, so the `=` setter throws
      // (RFC 0068). Use the awaitable Rails-named replacement.
      await pub.editors.replace([pub.buildEditorInChief({ name: "Alex Black" })]);
      await publication.saveBang();
    });
    expect(publication.readAttribute("name")).toBe("Rails Way (touched)");
  });
});

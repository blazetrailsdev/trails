import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeAll } from "vitest";
import { transaction } from "../index.js";
import { fixtures } from "../test-helpers/use-fixtures.js";
import { Publication } from "../test-helpers/models/publication.js";
import { Editor } from "../test-helpers/models/editor.js";
import { Editorship } from "../test-helpers/models/editorship.js";

describe("ReloadAssociationCacheTest", () => {
  fixtures({});

  beforeAll(() => {
    constSet(TopLevel, "Publication", Publication);
    constSet(TopLevel, "Editor", Editor);
    constSet(TopLevel, "Editorship", Editorship);
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
      await pub.editors.replace([pub.buildEditorInChief({ name: "Alex Black" })]);
      await publication.saveBang();
    });
    expect(publication.readAttribute("name")).toBe("Rails Way (touched)");
  });
});

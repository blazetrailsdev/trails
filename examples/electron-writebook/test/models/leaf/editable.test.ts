import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hours, minutes } from "@blazetrails/activesupport";
import { freezeTime, travel, travelBack } from "@blazetrails/activesupport/testing/time-helpers";
import { fixture, loadFixtures } from "../../test-helper.ts";
import { Edit } from "../../../app/models/edit.ts";
import type { Leaf } from "../../../app/models/leaf.ts";
import type { Page } from "../../../app/models/page.ts";

describe("Leaf::EditableTest", () => {
  const leaves = (label: string) => fixture<Leaf>("leaves", label);
  const bodyOf = async (leaf: Leaf) => (await ((await leaf.leafable) as Page).body()).content;
  const host = {};

  beforeEach(loadFixtures);
  afterEach(() => travelBack.call(host));

  it("editing a leafable records the edit", async () => {
    const leaf = await leaves("welcome_page");
    await leaf.edit({ leafableParams: { body: "New body" } });

    expect(await bodyOf(await leaves("welcome_page"))).toBe("New body");

    const last = (await leaf.edits.last()) as Edit;
    expect(last.isRevision()).toBe(true);
    expect((await ((await last.leafable) as Page).body()).content).toBe(
      "This is _such_ a great handbook.",
    );
  });

  it("edits that are close together don't create new revisions", async () => {
    const leaf = await leaves("welcome_page");
    const edits = async () => (await leaf.edits.count()) as number;

    let before = await edits();
    await leaf.edit({ leafableParams: { body: "First change" } });
    expect(await edits()).toBe(before + 1);

    freezeTime.call(host);
    travel.call(host, minutes(1));

    before = await edits();
    await (await leaves("welcome_page")).edit({ leafableParams: { body: "Second change" } });
    expect(await edits()).toBe(before);

    expect(await bodyOf(await leaves("welcome_page"))).toBe("Second change");

    travel.call(host, hours(1));

    before = await edits();
    await (await leaves("welcome_page")).edit({ leafableParams: { body: "Third change" } });
    expect(await edits()).toBe(before + 1);
  });

  it("changing a leaf title doesn't create a revision", async () => {
    const before = await Edit.count();
    await (await leaves("welcome_page")).edit({ leafParams: { title: "New title" } });
    expect(await Edit.count()).toBe(before);

    expect((await leaves("welcome_page")).title).toBe("New title");
  });

  it("changes that don't affect the leafable don't create a revision", async () => {
    const before = await Edit.count();
    await (await leaves("welcome_page")).edit({ leafableParams: {} });
    expect(await Edit.count()).toBe(before);
  });

  it("trashing a leaf records the edit", async () => {
    const leaf = await leaves("welcome_page");
    await leaf.trashedBang();

    expect(leaf.isTrashed()).toBe(true);

    const last = (await leaf.edits.last()) as Edit;
    expect(last.action).toBe("trash");
    expect((await ((await last.leafable) as Page).body()).content).toBe(
      "This is _such_ a great handbook.",
    );
  });
});

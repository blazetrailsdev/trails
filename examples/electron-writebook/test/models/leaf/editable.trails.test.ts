import { beforeEach, describe, expect, it } from "vitest";
import { Parameters } from "@blazetrails/actionpack";
import { fixture, loadFixtures } from "../../test-helper.ts";
import type { Leaf } from "../../../app/models/leaf.ts";
import type { Section } from "../../../app/models/section.ts";

describe("Leaf::Editable with controller params", () => {
  beforeEach(loadFixtures);

  it("records no edit when permitted params leave the leafable unchanged", async () => {
    const leaf = await fixture<Leaf>("leaves", "welcome_section");
    const body = ((await leaf.leafable) as Section).body;
    const before = (await leaf.edits.count()) as number;

    await leaf.edit({ leafableParams: new Parameters({ body }).permitBang() });

    expect(await leaf.edits.count()).toBe(before);
  });

  it("records an edit when permitted params change the leafable", async () => {
    const leaf = await fixture<Leaf>("leaves", "welcome_section");
    const before = (await leaf.edits.count()) as number;

    await leaf.edit({ leafableParams: new Parameters({ body: "Changed" }).permitBang() });

    expect(await leaf.edits.count()).toBe(before + 1);
  });
});

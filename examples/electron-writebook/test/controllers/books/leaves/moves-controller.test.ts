import { beforeEach, describe, expect, it } from "vitest";
import { ApplicationIntegrationTest, fixture, loadFixtures } from "../../../test-helper.ts";
import type { Book } from "../../../../app/models/book.ts";
import type { Leaf } from "../../../../app/models/leaf.ts";

describe("Books::Leaves::MovesControllerTest", () => {
  let t: ApplicationIntegrationTest;
  const leaves = (label: string) => fixture<Leaf>("leaves", label);
  const positioned = async () =>
    (await (await fixture<Book>("books", "handbook")).leaves.positioned().toArray()).map(
      (leaf) => leaf.id,
    );
  const ids = async (...labels: string[]) =>
    Promise.all(labels.map(async (label) => (await leaves(label)).id));

  beforeEach(async () => {
    await loadFixtures();
    t = new ApplicationIntegrationTest(expect.getState().currentTestName!);
    await t.signIn("kevin");
  });

  it("moving a single item", async () => {
    const handbook = await fixture<Book>("books", "handbook");
    expect(await positioned()).toEqual(
      await ids("welcome_section", "welcome_page", "summary_page", "reading_picture"),
    );

    await t.post(`/books/${handbook.id}/leaves/moves`, {
      params: { id: (await leaves("welcome_page")).id, position: 0 },
    });
    t.assertResponse(":no_content");

    expect(await positioned()).toEqual(
      await ids("welcome_page", "welcome_section", "summary_page", "reading_picture"),
    );
  });

  it("moving multiple items", async () => {
    const handbook = await fixture<Book>("books", "handbook");
    expect(await positioned()).toEqual(
      await ids("welcome_section", "welcome_page", "summary_page", "reading_picture"),
    );

    await t.post(`/books/${handbook.id}/leaves/moves`, {
      params: { id: await ids("summary_page", "reading_picture"), position: 1 },
    });
    t.assertResponse(":no_content");

    expect(await positioned()).toEqual(
      await ids("welcome_section", "summary_page", "reading_picture", "welcome_page"),
    );
  });
});

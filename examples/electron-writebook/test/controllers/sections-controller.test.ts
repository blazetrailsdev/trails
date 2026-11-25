import { beforeEach, describe, expect, it } from "vitest";
import { ApplicationIntegrationTest, fixture, loadFixtures } from "../test-helper.ts";
import type { Book } from "../../app/models/book.ts";
import type { Leaf } from "../../app/models/leaf.ts";
import { Section } from "../../app/models/section.ts";

describe("SectionsControllerTest", () => {
  let t: ApplicationIntegrationTest;
  const books = (label: string) => fixture<Book>("books", label);
  const leaves = (label: string) => fixture<Leaf>("leaves", label);
  const leafablePath = async (leaf: Leaf) => `/books/${leaf.book_id}/sections/${leaf.id}`;

  beforeEach(async () => {
    await loadFixtures();
    t = new ApplicationIntegrationTest("sections");
    await t.signIn("kevin");
  });

  it("create", async () => {
    await t.post(`/books/${(await books("handbook")).id}/sections.turbo_stream`);
    t.assertResponse(":success");

    const newSection = (await Section.last()) as Section;
    expect(await newSection.title()).toBe("Section");
    expect((await (await newSection.leaf)!.book).id).toBe((await books("handbook")).id);
  });

  it("update", async () => {
    await t.put(await leafablePath(await leaves("welcome_section")), {
      params: { leaf: { title: "Title" }, section: { body: "Section body" } },
    });
    t.assertResponse(":success");

    const section = (await (await (await leaves("welcome_section")).reload()).leafable) as Section;
    expect(await section.title()).toBe("Title");
    expect(section.body).toBe("Section body");
  });

  it("update with no body supplied", async () => {
    await t.put(await leafablePath(await leaves("welcome_section")), {
      params: { leaf: { title: "New title" } },
    });
    t.assertResponse(":success");

    const section = (await (await (await leaves("welcome_section")).reload()).leafable) as Section;
    expect(await section.title()).toBe("New title");
    expect(section.body).toBe("New title");
  });
});

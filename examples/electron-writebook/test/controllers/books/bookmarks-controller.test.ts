import { beforeEach, describe, expect, it } from "vitest";
import { ApplicationIntegrationTest, fixture, loadFixtures } from "../../test-helper.ts";
import type { Book } from "../../../app/models/book.ts";
import type { Leaf } from "../../../app/models/leaf.ts";

describe("Books::BookmarksControllerTest", () => {
  let t: ApplicationIntegrationTest;
  const books = (label: string) => fixture<Book>("books", label);
  const leaves = (label: string) => fixture<Leaf>("leaves", label);
  const bookBookmarkUrl = (book: Book) => `/books/${book.id}/bookmark`;
  const links = () =>
    [...t.response.body.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map((m) => m[1]).join("\n");

  beforeEach(async () => {
    await loadFixtures();
    t = new ApplicationIntegrationTest("bookmarks");
    await t.signIn("kevin");
  });

  it("show includes a link to read the last read leaf", async () => {
    t.cookies.set(
      `reading_progress_${(await books("handbook")).id}`,
      `${(await leaves("welcome_page")).id}/3`,
    );

    await t.get(bookBookmarkUrl(await books("handbook")));

    t.assertResponse(":success");
    expect(links()).toMatch(/Resume reading/);
  });

  it("show includes a link to start reading if the last read leaf has been trashed", async () => {
    await (await leaves("welcome_page")).trashedBang();
    t.cookies.set(
      `reading_progress_${(await books("handbook")).id}`,
      `${(await leaves("welcome_page")).id}/3`,
    );

    await t.get(bookBookmarkUrl(await books("handbook")));

    t.assertResponse(":success");
    expect(links()).toMatch(/Start reading/);
  });

  it("show includes a link to start reading if no reading progress has been recorded", async () => {
    await t.get(bookBookmarkUrl(await books("handbook")));

    t.assertResponse(":success");
    expect(links()).toMatch(/Start reading/);
  });
});

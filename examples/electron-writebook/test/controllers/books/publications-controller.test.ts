import { beforeEach, describe, expect, it } from "vitest";
import { ApplicationIntegrationTest, fixture, loadFixtures } from "../../test-helper.ts";
import type { Book } from "../../../app/models/book.ts";

describe("Books::PublicationsTest", () => {
  let t: ApplicationIntegrationTest;
  let book: Book;
  const bookSlugUrl = (b: Book) => `http://www.example.com/${b.id}/${b.slug}`;

  beforeEach(async () => {
    await loadFixtures();
    book = await fixture<Book>("books", "manual");
    t = new ApplicationIntegrationTest("publications");
    await t.signIn("david");
  });

  it("publish a book", async () => {
    expect((await book.reload()).published).toBe(false);
    await t.patch(`/books/${book.id}/publication`, { params: { book: { published: "1" } } });
    expect((await book.reload()).published).toBe(true);

    await book.reload();
    t.assertRedirectedTo(bookSlugUrl(book));
    expect(book.slug).toBe("manual");
  });

  it("edit book slug", async () => {
    await book.updateBang({ published: true });

    await t.get(`/books/${book.id}/publication/edit`);
    t.assertResponse(":success");

    await t.patch(`/books/${book.id}/publication`, { params: { book: { slug: "new-slug" } } });

    await book.reload();
    t.assertRedirectedTo(bookSlugUrl(book));
    expect(book.slug).toBe("new-slug");
  });
});

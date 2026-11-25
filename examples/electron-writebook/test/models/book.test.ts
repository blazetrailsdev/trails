import { beforeEach, describe, expect, it } from "vitest";
import { fixture, loadFixtures } from "../test-helper.ts";
import { Book } from "../../app/models/book.ts";
import type { Leaf } from "../../app/models/leaf.ts";
import { Page } from "../../app/models/page.ts";

describe("BookTest", () => {
  const books = (label: string) => fixture<Book>("books", label);
  const leaves = (label: string) => fixture<Leaf>("leaves", label);
  const updateBody = async (label: string, body: string) =>
    (await (await leaves(label)).leafable).updateBang({ body });

  beforeEach(loadFixtures);

  it("slug is generated from title", async () => {
    const book = (await Book.createBang({ title: "Hello, World!" })) as Book;
    expect(book.slug).toBe("hello-world");
  });

  it("press a leafable", async () => {
    const page = new Page();
    await page.setBody("Important words");
    const leaf = await (await books("manual")).press(page, { title: "Introduction" });

    expect((leaf as unknown as { isPage(): boolean }).isPage()).toBe(true);
    expect(String((await ((await leaf.leafable) as Page).body()).content)).toBe("Important words");
    expect(leaf.title).toBe("Introduction");
  });

  it("markable combines all leafables", async () => {
    await updateBody("welcome_page", "Welcome page content");
    await updateBody("summary_page", "Summary page content");

    expect(await (await books("handbook")).markable()).toContain("Welcome page content");
    expect(await (await books("handbook")).markable()).toContain("Summary page content");
  });

  it("markable joins leafables with double newlines", async () => {
    await updateBody("welcome_page", "Welcome content");
    await updateBody("summary_page", "Summary content");

    expect(await (await books("handbook")).markable()).toContain(
      "Welcome content\n\nSummary content",
    );
  });

  it("markable only includes active leaves", async () => {
    await updateBody("welcome_page", "Active content");
    await (await leaves("summary_page")).trashedBang();

    expect(await (await books("handbook")).markable()).toContain("Active content");
    expect(await (await books("handbook")).markable()).not.toContain(
      (await leaves("summary_page")).title,
    );
  });

  it("markable returns empty string for book with no leaves", async () => {
    expect(await (await books("manual")).markable()).toBe("");
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Attachment } from "@blazetrails/activestorage";
import { Blob } from "@blazetrails/activestorage/app/models/active-storage/blob.js";
import { TestHelper as ActiveJobTestHelper } from "@blazetrails/activejob/test-helper";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { include, StringIO } from "@blazetrails/ruby-compat";
import { fixture, loadFixtures, PIXEL_BMP } from "../test-helper.ts";
import { Markdown } from "../../lib/trails-ext/action-text-markdown.ts";
import { Edit } from "../../app/models/edit.ts";
import { Leaf as LeafModel } from "../../app/models/leaf.ts";
import { Book } from "../../app/models/book.ts";
import { Page } from "../../app/models/page.ts";
import { Picture } from "../../app/models/picture.ts";

class BookTestCase extends TestCase {
  book(): void {}
}
include(BookTestCase, ActiveJobTestHelper);

describe("BookTest", () => {
  let jobs: ActiveJobTestHelper;
  const books = (label: string) => fixture<Book>("books", label);
  const leaves = (label: string) => fixture<LeafModel>("leaves", label);
  const updateBody = async (label: string, body: string) =>
    (await (await leaves(label)).leafable).updateBang({ body });

  beforeEach(async () => {
    jobs = new BookTestCase("book") as unknown as ActiveJobTestHelper;
    await jobs.beforeSetup();
    await loadFixtures();
  });
  afterEach(async () => {
    await jobs.afterTeardown();
  });

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

  it("destroying a book removes superseded revisions along with their content and files", async () => {
    const page = (await (await leaves("welcome_page")).page)!;
    const body = await page.body();
    await body.uploads.attach({
      io: new StringIO(PIXEL_BMP),
      filename: "pixel.bmp",
      content_type: "image/bmp",
    });
    const uploadBlob = (await body.uploads.blobs)[0];
    await (await leaves("welcome_page")).edit({ leafableParams: { body: "Revised body" } });

    const picture = (await (await leaves("reading_picture")).picture)!;
    await picture.image.load();
    const imageBlob = (await (await picture.image.attachment)!.blob)!;
    await (
      await leaves("reading_picture")
    ).edit({ leafableParams: { caption: "Revised caption" } });

    const revisionLeafable = async (label: string) =>
      (await ((await leaves(label)).edits.revision().sole() as Promise<Edit>)).leafable;
    expect(((await revisionLeafable("welcome_page")) as Page).id).toBe(page.id);
    expect(((await revisionLeafable("reading_picture")) as { id: unknown }).id).toBe(picture.id);

    const leafIds = [(await leaves("welcome_page")).id, (await leaves("reading_picture")).id];
    await jobs.performEnqueuedJobs({}, async () => {
      await (await books("handbook")).destroy();
    });

    expect(await Edit.isExists({ leaf_id: leafIds })).toBe(false);
    expect(await Page.isExists(page.id)).toBe(false);
    expect(await Markdown.isExists({ record_type: "Page", record_id: page.id })).toBe(false);
    expect(await Picture.isExists(picture.id)).toBe(false);
    expect(await Attachment.isExists({ blob_id: [uploadBlob.id, imageBlob.id] })).toBe(false);
    expect(await Blob.isExists(uploadBlob.id)).toBe(false);
    expect(await Blob.isExists(imageBlob.id)).toBe(false);
    expect(await Blob.service!.isExist(uploadBlob.key)).toBe(false);
    expect(await Blob.service!.isExist(imageBlob.key)).toBe(false);
  });

  it("destroying a book removes the content a trashed leaf shares with its trash edit", async () => {
    const page = (await (await leaves("welcome_page")).page)!;
    await (await leaves("welcome_page")).trashedBang();

    const trash = (await (await leaves("welcome_page")).edits.trash().sole()) as Edit;
    expect(((await trash.leafable) as Page).id).toBe(page.id);

    const leafId = (await leaves("welcome_page")).id;
    await (await books("handbook")).destroy();

    expect(await LeafModel.isExists(leafId)).toBe(false);
    expect(await Edit.isExists({ leaf_id: leafId })).toBe(false);
    expect(await Page.isExists(page.id)).toBe(false);
    expect(await Markdown.isExists({ record_type: "Page", record_id: page.id })).toBe(false);
  });
});

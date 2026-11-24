import { beforeEach, describe, expect, it } from "vitest";
import { UploadedFile } from "@blazetrails/rack-test";
import { ApplicationIntegrationTest, resetDatabase } from "../test-helper.ts";
import { Book } from "../../app/models/book.ts";
import { Edit } from "../../app/models/edit.ts";
import { Leaf } from "../../app/models/leaf.ts";
import { Page } from "../../app/models/page.ts";
import { Picture } from "../../app/models/picture.ts";

const TURBO = { Accept: "text/vnd.turbo-stream.html" };

async function bookWithPage(t: ApplicationIntegrationTest): Promise<[Book, Leaf]> {
  await t.firstRun();
  await t.post("/books", { params: { book: { title: "Notes" } } });
  const book = (await Book.first())!;
  await t.post(`/books/${book.id}/pages`, {
    params: { leaf: { title: "One" }, page: { body: "first" } },
    headers: TURBO,
  });
  return [book, (await Leaf.last())!];
}

describe("PagesFlowTest", () => {
  beforeEach(resetDatabase);

  it("updates a page in place and keeps a revision once it is old enough", async () => {
    const t = new ApplicationIntegrationTest("edit");
    const [book, leaf] = await bookWithPage(t);

    await t.put(`/books/${book.id}/pages/${leaf.id}`, {
      params: { page: { body: "second" } },
      headers: TURBO,
    });
    expect(t.response.status).toBe(200);
    expect(await Edit.count()).toBe(1);
    await leaf.reload();
    expect((await ((await leaf.leafable) as Page).body()).content).toBe("second");

    await Edit.updateAll({ created_at: new Date(Date.now() - 3_600_000) });
    await t.put(`/books/${book.id}/pages/${leaf.id}`, {
      params: { page: { body: "third" }, leaf: { title: "Uno" } },
    });
    expect(t.response.status).toBe(204);
    expect(await Edit.count()).toBe(2);
    await leaf.reload();
    expect(leaf.title).toBe("Uno");

    await t.get(`/pages/${leaf.id}/edits/latest`);
    expect(t.response.status).toBe(200);
    expect(t.response.body).toContain("second");
    expect(t.response.body).toContain("third");
  });

  it("uploads a picture page", async () => {
    const t = new ApplicationIntegrationTest("picture");
    await t.firstRun();
    await t.post("/books", { params: { book: { title: "Album" } } });
    const book = (await Book.first())!;
    const file = new UploadedFile("test/fixtures/files/cover.png", "image/png");
    await t.post(`/books/${book.id}/pictures`, {
      params: { picture: { image: file, caption: "A cover" } },
      headers: TURBO,
    });
    expect(t.response.status).toBe(200);
    const picture = (await Picture.first())!;
    expect(picture.caption).toBe("A cover");
    await picture.image.load();
    expect(picture.image.isAttached()).toBe(true);
  });

  it.skip("shows a picture page with its large variant", async () => {
    const t = new ApplicationIntegrationTest("picture");
    await t.firstRun();
    await t.post("/books", { params: { book: { title: "Album" } } });
    const book = (await Book.first())!;
    const file = new UploadedFile("test/fixtures/files/cover.png", "image/png");
    await t.post(`/books/${book.id}/pictures`, {
      params: { picture: { image: file, caption: "A cover" } },
      headers: TURBO,
    });
    const leaf = (await Leaf.last())!;
    await t.get(`/${book.id}/album/${leaf.id}/picture`);
    expect(t.response.status).toBe(200);
    expect(t.response.body).toContain("/trails/active_storage/representations/");
  });
});

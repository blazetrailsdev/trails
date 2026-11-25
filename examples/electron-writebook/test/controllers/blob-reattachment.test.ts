import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ActiveStorage, Current as ActiveStorageCurrent } from "@blazetrails/activestorage";
import { isPresent } from "@blazetrails/activesupport";
import { StringIO } from "@blazetrails/ruby-compat";
import {
  ApplicationIntegrationTest,
  fixture,
  fixtureFileUpload,
  leafablePath,
  loadFixtures,
} from "../test-helper.ts";
import type { Access } from "../../app/models/access.ts";
import { Book } from "../../app/models/book.ts";
import type { Leaf } from "../../app/models/leaf.ts";

const fileFixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../fixtures/files/${name}`, import.meta.url)));

type Blob = {
  id: unknown;
  filename: { toString(): string };
  signedId(): string;
  url(): Promise<string>;
};
type Attached = {
  load(): Promise<void>;
  isAttached(): boolean;
  attachment: Promise<{ blob: Promise<Blob> } | null>;
};

// Anyone who has seen a file has its signed blob id: it's in the file's URL. Attaching
// a file by that id to a book of your own would make it readable through that book,
// whatever access you have to the book it came from.
describe("BlobReattachmentTest", () => {
  let t: ApplicationIntegrationTest;
  let cover: Blob;
  let diskPath: string;
  const books = (label: string) => fixture<Book>("books", label);
  const blobOf = async (attached: Attached) => {
    await attached.load();
    return await (await attached.attachment)!.blob;
  };
  const filenameOf = async (attached: Attached) => String((await blobOf(attached)).filename);

  const attachHandbookCover = async () =>
    (await books("handbook")).cover.attach({
      io: new StringIO(fileFixture("white-rabbit.webp")),
      filename: "white-rabbit.webp",
      content_type: "image/webp",
    });

  const assertNotReattached = async () => {
    const records = await Promise.all(
      (await ActiveStorage.Attachment!.where({ blob_id: cover.id }).toArray()).map(
        async (attachment) =>
          (await (attachment as unknown as { record: Promise<Book> }).record).id,
      ),
    );
    expect(records).toEqual([(await books("manual")).id]);

    if (isPresent(t.cookies.get("session_token"))) await t.signOut();
    await t.get(diskPath);
    t.assertResponse(":not_found");
  };

  beforeEach(async () => {
    await loadFixtures();
    t = new ApplicationIntegrationTest(expect.getState().currentTestName!);
    ActiveStorageCurrent.urlOptions = { host: "www.example.com", protocol: "http" };

    await (
      await books("manual")
    ).cover.attach({
      io: new StringIO(fileFixture("reading.webp")),
      filename: "reading.webp",
      content_type: "image/webp",
    });
    cover = await blobOf((await books("manual")).cover as unknown as Attached);
    const url = new URL(await cover.url());
    diskPath = `${url.pathname}${url.search}`;
  });

  it("a reader whose access is revoked can't get a cover back by putting it on a new book", async () => {
    await t.signIn("jz");
    await t.get(diskPath);
    t.assertResponse(":success");

    await (await fixture<Access>("accesses", "jz_manual")).destroyBang();

    const before = (await Book.count()) as number;
    await t.post("/books", { params: { book: { title: "Mine", cover: cover.signedId() } } });
    expect(await Book.count()).toBe(before + 1);

    const last = (await Book.last()) as Book;
    await last.cover.load();
    expect(last.cover.isAttached()).toBe(false);
    await assertNotReattached();
  });

  it("a cover can't be replaced with another book's file", async () => {
    await attachHandbookCover();
    await t.signIn("kevin");

    await t.patch(`/books/${(await books("handbook")).id}`, {
      params: { book: { cover: cover.signedId() } },
    });

    expect(await filenameOf((await books("handbook")).cover as unknown as Attached)).toBe(
      "white-rabbit.webp",
    );
    await assertNotReattached();
  });

  it("a new picture can't use another book's file", async () => {
    await t.signIn("kevin");

    await t.post(`/books/${(await books("handbook")).id}/pictures.turbo_stream`, {
      params: { leaf: { title: "Mine" }, picture: { image: cover.signedId() } },
    });

    await assertNotReattached();
  });

  it("a picture can't be replaced with another book's file", async () => {
    await t.signIn("kevin");

    const leaf = await fixture<Leaf>("leaves", "reading_picture");
    await t.put(leafablePath(leaf), { params: { picture: { image: cover.signedId() } } });

    const picture = (await (await fixture<Leaf>("leaves", "reading_picture")).picture)!;
    expect(await filenameOf(picture.image as unknown as Attached)).toBe("reading.webp");
    await assertNotReattached();
  });

  it("a cover uploaded with a new book is attached", async () => {
    await t.signIn("kevin");

    await t.post("/books", {
      params: {
        book: { title: "Mine", cover: await fixtureFileUpload("reading.webp", "image/webp") },
      },
    });

    expect(await filenameOf(((await Book.last()) as Book).cover as unknown as Attached)).toBe(
      "reading.webp",
    );
  });

  it("a cover uploaded to an existing book replaces its cover", async () => {
    await attachHandbookCover();
    await t.signIn("kevin");

    await t.patch(`/books/${(await books("handbook")).id}`, {
      params: { book: { cover: await fixtureFileUpload("reading.webp", "image/webp") } },
    });

    expect(await filenameOf((await books("handbook")).cover as unknown as Attached)).toBe(
      "reading.webp",
    );
  });

  it("a picture uploaded with a new picture page is attached", async () => {
    await t.signIn("kevin");

    const leavesCount = async () => (await (await books("handbook")).leaves.count()) as number;
    const before = await leavesCount();
    await t.post(`/books/${(await books("handbook")).id}/pictures.turbo_stream`, {
      params: {
        leaf: { title: "Mine" },
        picture: { image: await fixtureFileUpload("reading.webp", "image/webp") },
      },
    });
    expect(await leavesCount()).toBe(before + 1);

    const last = (await (await books("handbook")).leaves.last()) as Leaf;
    expect(await filenameOf((await last.picture)!.image as unknown as Attached)).toBe(
      "reading.webp",
    );
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ActiveStorage,
  Current as ActiveStorageCurrent,
  type One,
} from "@blazetrails/activestorage";
import { StringIO } from "@blazetrails/ruby-compat";
import { ApplicationIntegrationTest, fixture, loadFixtures, urlHelpers } from "../test-helper.ts";
import type { Access } from "../../app/models/access.ts";
import type { Book } from "../../app/models/book.ts";
import type { Page } from "../../app/models/page.ts";
import type { Picture } from "../../app/models/picture.ts";

const fileFixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../fixtures/files/${name}`, import.meta.url)));
const reading = () => ({
  io: new StringIO(fileFixture("reading.webp")),
  filename: "reading.webp",
  content_type: "image/webp",
});

type Urlable = { url(): Promise<string> };

describe("ActiveStorageAuthorizationTest", () => {
  let t: ApplicationIntegrationTest;
  const books = (label: string) => fixture<Book>("books", label);

  const attachCover = async (): Promise<One> => {
    const handbook = await books("handbook");
    await handbook.cover.attach(reading());
    const cover = (await books("handbook")).cover;
    await cover.load();
    await (await cover.attachment)!.blob;
    return cover;
  };

  const attachPicture = async (): Promise<One> => {
    const picture = await fixture<Picture>("pictures", "reading");
    await picture.image.attach(reading());
    const image = (await fixture<Picture>("pictures", "reading")).image;
    await image.load();
    await (await image.attachment)!.blob;
    return image;
  };

  const attachUploadToWelcomePage = async () => {
    const markdown = await (await fixture<Page>("pages", "welcome")).body();
    await markdown.saveBang();
    const uploads = (
      markdown as unknown as {
        uploads: { attach(a: unknown): Promise<unknown>; last(): Promise<{ slug: string }> };
      }
    ).uploads;
    await uploads.attach(reading());
    return await uploads.last();
  };

  // Rails' integration session leaves a request's ActiveStorage::Current.url_options
  // in place (its mock response never closes the body, so the executor never
  // completes), which is what lets Writebook's `disk_path_for` follow a request.
  // trails' session completes it, so the setup's url_options are seated again here.
  const diskPathFor = async (attachable: Urlable | One) => {
    ActiveStorageCurrent.urlOptions = { host: "www.example.com", protocol: "http" };
    const url = new URL(await (attachable as Urlable).url());
    return `${url.pathname}${url.search}`;
  };

  const header = (name: string) => t.response.headers.get(name);

  beforeEach(async () => {
    await loadFixtures();
    t = new ApplicationIntegrationTest(expect.getState().currentTestName!);
    ActiveStorageCurrent.urlOptions = { host: "www.example.com", protocol: "http" };
    await (await books("handbook")).updateBang({ published: true });
  });

  it("a published book's cover is served to anyone", async () => {
    const cover = await attachCover();

    await t.get(urlHelpers().trailsBlobPath(cover, { onlyPath: true }));
    t.assertResponse(":redirect");

    await t.get(await diskPathFor(cover));
    t.assertResponse(":success");
    expect(Buffer.from(t.response.body, "latin1").equals(fileFixture("reading.webp"))).toBe(true);
  });

  it("unpublishing a book revokes its cover's URLs", async () => {
    const cover = await attachCover();
    const [redirectPath, diskPath] = [
      urlHelpers().trailsBlobPath(cover, { onlyPath: true }),
      await diskPathFor(cover),
    ];

    await (await books("handbook")).updateBang({ published: false });

    await t.get(redirectPath);
    t.assertResponse(":not_found");

    await t.get(diskPath);
    t.assertResponse(":not_found");
  });

  it("unpublishing a book revokes its picture variants' URLs", async () => {
    const variant = await (
      (await attachPicture()).variant("large") as unknown as { processed(): Promise<Urlable> }
    ).processed();
    const [redirectPath, diskPath] = [
      urlHelpers().trailsRepresentationPath(variant, { onlyPath: true }),
      await diskPathFor(variant),
    ];

    await (await books("handbook")).updateBang({ published: false });

    await t.get(redirectPath);
    t.assertResponse(":not_found");

    await t.get(diskPath);
    t.assertResponse(":not_found");
  });

  it("unpublishing a book revokes the disk URL behind a page upload", async () => {
    const upload = await attachUploadToWelcomePage();
    await t.get(`/u/${upload.slug}`);
    t.assertResponse(":redirect");
    const diskPath = header("location")!;

    await t.get(diskPath);
    t.assertResponse(":success");

    await (await books("handbook")).updateBang({ published: false });

    await t.get(diskPath);
    t.assertResponse(":not_found");
  });

  it("an unpublished book's images are served to its readers, but not publicly cached", async () => {
    await (await books("handbook")).updateBang({ published: false });
    const cover = await attachCover();

    await t.signIn("jz");
    await t.get(await diskPathFor(cover));

    t.assertResponse(":success");
    expect(String(header("cache-control") ?? "")).not.toMatch("public");
  });

  it("a reader whose access is revoked can't load an unpublished book's images", async () => {
    await (await books("handbook")).updateBang({ published: false });
    const cover = await attachCover();

    await t.signIn("jz");
    await (await fixture<Access>("accesses", "jz_handbook")).destroyBang();
    await t.get(await diskPathFor(cover));

    t.assertResponse(":not_found");
  });

  it("a published book's images are not left in shared caches", async () => {
    const cover = await attachCover();

    await t.get(await diskPathFor(cover));

    t.assertResponse(":success");
    expect(String(header("cache-control") ?? "")).not.toMatch("public");
  });

  it("a blob attached to nothing is not served", async () => {
    const blob = await ActiveStorage.Blob!.createAndUploadBang(reading());
    try {
      await t.get(urlHelpers().trailsBlobPath(blob, { onlyPath: true }));
      t.assertResponse(":not_found");

      await t.get(await diskPathFor(blob));
      t.assertResponse(":not_found");
    } finally {
      await blob?.purge();
    }
  });

  it("proxy routes are not served", async () => {
    const cover = await attachCover();
    const variant = await (
      (await attachPicture()).variant("large") as unknown as { processed(): Promise<Urlable> }
    ).processed();

    await t.get(urlHelpers().trailsStorageProxyPath(cover, { onlyPath: true }));
    t.assertResponse(":not_found");

    await t.get(urlHelpers().trailsStorageProxyPath(variant, { onlyPath: true }));
    t.assertResponse(":not_found");
  });
});

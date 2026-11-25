import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hours } from "@blazetrails/activesupport";
import { travel, travelBack } from "@blazetrails/activesupport/testing/time-helpers";
import { ActiveStorage } from "@blazetrails/activestorage";
import { StringIO } from "@blazetrails/ruby-compat";
import {
  ApplicationIntegrationTest,
  fixture,
  fixtureFileUpload,
  loadFixtures,
} from "../../../test-helper.ts";
import type { Access } from "../../../../app/models/access.ts";
import type { Book } from "../../../../app/models/book.ts";
import type { Page } from "../../../../app/models/page.ts";
import { Markdown } from "../../../../lib/trails-ext/action-text-markdown.ts";

const fileFixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../fixtures/files/${name}`, import.meta.url)));

type Attachment = { slug: string; record: Promise<unknown> };
type Uploads = {
  attach(attachable: unknown): Promise<unknown>;
  last(): Promise<Attachment>;
};

describe("ActionText::Markdown::UploadsControllerTest", () => {
  let t: ApplicationIntegrationTest;
  const host = {};
  const books = (label: string) => fixture<Book>("books", label);
  const pages = (label: string) => fixture<Page>("pages", label);
  const accesses = (label: string) => fixture<Access>("accesses", label);
  const attachmentCount = async () => (await ActiveStorage.Attachment!.count()) as number;

  const uploadsSignedIdFor = (record: Page) =>
    (
      record as unknown as {
        toSignedGlobalId(options: object): { toString(): string };
      }
    )
      .toSignedGlobalId({
        expiresIn: Markdown.UPLOADS_SIGNED_ID_EXPIRY,
        for: Markdown.UPLOADS_SIGNED_ID_PURPOSE,
      })
      .toString();

  const upload = async (recordGid: string, file?: unknown) =>
    t.post("/uploads", {
      params: {
        record_gid: recordGid,
        attribute_name: "body",
        file: file ?? (await fixtureFileUpload("reading.webp", "image/webp")),
      },
      xhr: true,
    });

  const attachUploadToWelcomePage = async (): Promise<Attachment> => {
    const markdown = await (await pages("welcome")).body();
    await markdown.saveBang();
    const uploads = (markdown as unknown as { uploads: Uploads }).uploads;
    await uploads.attach(await fixtureFileUpload("reading.webp", "image/webp"));
    return await (
      (await (await pages("welcome")).body()) as unknown as { uploads: Uploads }
    ).uploads.last();
  };

  const uploadPath = (attachment: Attachment) => `/u/${attachment.slug}`;
  const header = (name: string) => t.response.headers.get(name);

  beforeEach(async () => {
    await loadFixtures();
    t = new ApplicationIntegrationTest(expect.getState().currentTestName!);
    await t.signIn("kevin");
  });

  afterEach(() => travelBack.call(host));

  it("attach a file", async () => {
    const before = await attachmentCount();
    await upload(uploadsSignedIdFor(await pages("welcome")));
    expect(await attachmentCount()).toBe(before + 1);

    t.assertResponse(":success");

    // Uploads should use relative URLs, to allow for future hostname changes
    expect((JSON.parse(t.response.body) as { fileUrl: string }).fileUrl.startsWith("/")).toBe(true);
  });

  it("a signed id minted for some other purpose can't be used to upload", async () => {
    const before = await attachmentCount();
    const page = (await pages("welcome")) as unknown as {
      toSignedGlobalId(options?: object): { toString(): string };
    };
    await upload(page.toSignedGlobalId().toString());
    expect(await attachmentCount()).toBe(before);

    t.assertResponse(":not_found");
  });

  it("an expired signed id can't be used to upload", async () => {
    const recordGid = uploadsSignedIdFor(await pages("welcome"));

    travel.call(host, Markdown.UPLOADS_SIGNED_ID_EXPIRY.plus(hours(1)));
    const before = await attachmentCount();
    await upload(recordGid);
    expect(await attachmentCount()).toBe(before);
    travelBack.call(host);

    t.assertResponse(":not_found");
  });

  it("a revoked collaborator can't upload with a signed id minted while an editor", async () => {
    const recordGid = uploadsSignedIdFor(await pages("welcome"));
    await (await accesses("kevin_handbook")).destroyBang();

    const before = await attachmentCount();
    await upload(recordGid);
    expect(await attachmentCount()).toBe(before);

    t.assertResponse(":not_found");
  });

  it("a downgraded editor can't upload", async () => {
    const recordGid = uploadsSignedIdFor(await pages("welcome"));
    await (await accesses("kevin_handbook")).updateBang({ level: "reader" });

    const before = await attachmentCount();
    await upload(recordGid);
    expect(await attachmentCount()).toBe(before);

    t.assertResponse(":forbidden");
  });

  it("a reader can't upload", async () => {
    await t.signIn("jz");

    const before = await attachmentCount();
    await upload(uploadsSignedIdFor(await pages("welcome")));
    expect(await attachmentCount()).toBe(before);

    t.assertResponse(":forbidden");
  });

  it("an upload must be a file, not the signed id of another book's file", async () => {
    const manual = await books("manual");
    await manual.cover.attach({
      io: new StringIO(fileFixture("reading.webp")),
      filename: "reading.webp",
      content_type: "image/webp",
    });
    await manual.cover.load();
    const cover = (await (await manual.cover.attachment)!.blob) as unknown as {
      signedId(): string;
      id: unknown;
    };

    const before = await attachmentCount();
    await upload(uploadsSignedIdFor(await pages("welcome")), cover.signedId());
    expect(await attachmentCount()).toBe(before);

    t.assertResponse(":unprocessable_entity");
    const records = await Promise.all(
      (await ActiveStorage.Attachment!.where({ blob_id: cover.id }).toArray()).map(
        async (attachment) => ((await (attachment as unknown as Attachment).record) as Book).id,
      ),
    );
    expect(records).toEqual([manual.id]);
  });

  it("view attached file", async () => {
    await (await books("handbook")).updateBang({ published: true });
    const attachment = await attachUploadToWelcomePage();

    await t.get(uploadPath(attachment));

    t.assertResponse(":redirect");
    expect(header("location")).toMatch(/\/trails\/active_storage\/.*\/reading\.webp/);
  });

  it("an attachment of a published book is publicly cacheable", async () => {
    await (await books("handbook")).updateBang({ published: true });
    const attachment = await attachUploadToWelcomePage();

    await t.get(uploadPath(attachment));

    expect(header("cache-control")).toMatch("public");
  });

  it("a publicly cached redirect doesn't take its host from X-Forwarded-Host", async () => {
    await (await books("handbook")).updateBang({ published: true });
    const attachment = await attachUploadToWelcomePage();

    t.resetBang();
    await t.get(uploadPath(attachment), { headers: { "X-Forwarded-Host": "attacker.example" } });

    t.assertResponse(":found");
    expect(header("cache-control")).toMatch("public");
    expect(header("location")).toMatch(/^\/trails\/active_storage\/disk\/.*\/reading\.webp$/);
    expect(header("location")).not.toContain("attacker.example");
  });

  it("a publicly cached redirect doesn't take its host from the Host header", async () => {
    await (await books("handbook")).updateBang({ published: true });
    const attachment = await attachUploadToWelcomePage();

    t.resetBang();
    t.hostBang("attacker.example");
    await t.get(uploadPath(attachment));

    t.assertResponse(":found");
    expect(header("cache-control")).toMatch("public");
    expect(header("location")!.startsWith("/trails/active_storage/disk/")).toBe(true);
  });

  it("a privately cached redirect is path-only too", async () => {
    await (await books("handbook")).updateBang({ published: false });
    const attachment = await attachUploadToWelcomePage();

    await t.signIn("jz");
    await t.get(uploadPath(attachment), { headers: { "X-Forwarded-Host": "attacker.example" } });

    t.assertResponse(":found");
    expect(header("cache-control")).toMatch("private");
    expect(header("location")!.startsWith("/trails/active_storage/disk/")).toBe(true);
  });

  it("the path-only redirect serves the attached file", async () => {
    await (await books("handbook")).updateBang({ published: true });
    const attachment = await attachUploadToWelcomePage();

    t.resetBang();
    await t.get(uploadPath(attachment));
    await t.get(header("location")!);

    t.assertResponse(":success");
    expect(Buffer.from(t.response.body, "latin1").equals(fileFixture("reading.webp"))).toBe(true);
  });

  it("an attachment of an unpublished book is not served to anonymous clients", async () => {
    await (await books("handbook")).updateBang({ published: false });
    const attachment = await attachUploadToWelcomePage();

    t.resetBang();
    await t.get(uploadPath(attachment));

    t.assertResponse(":not_found");
  });

  it("an attachment of an unpublished book is not served to a user without access", async () => {
    await (await books("handbook")).updateBang({ published: false });
    const attachment = await attachUploadToWelcomePage();

    await (await accesses("kevin_handbook")).destroyBang();
    await t.get(uploadPath(attachment));

    t.assertResponse(":not_found");
  });

  it("an attachment whose owning book can't be resolved is not served", async () => {
    await (await books("handbook")).updateBang({ published: false });
    const attachment = await attachUploadToWelcomePage();

    // Sever the leaf without cascading the destroy, leaving the attachment live but
    // its owning book unresolvable. The guard must fail closed on the nil book.
    await (await (await pages("welcome")).leaf)!.delete();
    expect(await (await (await pages("welcome")).reload()).owningBook()).toBeNull();

    t.resetBang();
    await t.get(uploadPath(attachment));

    t.assertResponse(":not_found");
  });

  it("an attachment of an unpublished book is served to a reader, but not publicly cached", async () => {
    await (await books("handbook")).updateBang({ published: false });
    const attachment = await attachUploadToWelcomePage();

    await t.signIn("jz");
    await t.get(uploadPath(attachment));

    t.assertResponse(":redirect");
    expect(String(header("cache-control") ?? "")).not.toMatch("public");
  });
});

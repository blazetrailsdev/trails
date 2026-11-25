import { beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { ActiveStorage, Current as ActiveStorageCurrent } from "@blazetrails/activestorage";
import { StringIO } from "@blazetrails/ruby-compat";
import { ApplicationIntegrationTest, fixture, loadFixtures } from "../test-helper.ts";
import type { Book } from "../../app/models/book.ts";

const ATTACHMENT_BYTES = "hello!";

const blobParams = () => ({
  blob: {
    filename: "quota.bin",
    byte_size: Buffer.byteLength(ATTACHMENT_BYTES),
    checksum: createHash("md5").update(ATTACHMENT_BYTES).digest("base64"),
    content_type: "application/octet-stream",
  },
});

describe("ActiveStorageAuthenticationTest", () => {
  let t: ApplicationIntegrationTest;
  const blobCount = async () => (await ActiveStorage.Blob!.count()) as number;
  const requestUri = (url: string) => {
    const parsed = new URL(url, "http://www.example.com");
    return `${parsed.pathname}${parsed.search}`;
  };
  const directUploadPath = () =>
    requestUri(
      (JSON.parse(t.response.body) as { direct_upload: { url: string } }).direct_upload.url,
    );

  beforeEach(async () => {
    await loadFixtures();
    t = new ApplicationIntegrationTest(expect.getState().currentTestName!);
  });

  it("direct upload metadata endpoint rejects anonymous callers", async () => {
    await t.get("/session/new");
    t.assertResponse(":success");

    const before = await blobCount();
    await t.post("/trails/active_storage/direct_uploads", { params: blobParams(), as: "json" });
    expect(await blobCount()).toBe(before);

    t.assertResponse(":unauthorized");
  });

  it("direct upload metadata endpoint allows authenticated users", async () => {
    await t.signIn("david");

    const before = await blobCount();
    await t.post("/trails/active_storage/direct_uploads", { params: blobParams(), as: "json" });
    expect(await blobCount()).toBe(before + 1);

    t.assertResponse(":success");
  });

  it("disk service upload endpoint rejects anonymous callers", async () => {
    await t.signIn("david");
    await t.post("/trails/active_storage/direct_uploads", { params: blobParams(), as: "json" });
    t.assertResponse(":success");
    const uploadPath = directUploadPath();

    const anonymous = new ApplicationIntegrationTest("anonymous");
    await anonymous.put(uploadPath, {
      params: ATTACHMENT_BYTES,
      headers: { "Content-Type": "application/octet-stream" },
    });

    expect(anonymous.response.status).toBe(401);
  });

  it("disk service upload endpoint allows authenticated callers", async () => {
    await t.signIn("david");
    await t.post("/trails/active_storage/direct_uploads", { params: blobParams(), as: "json" });
    t.assertResponse(":success");
    const uploadPath = directUploadPath();

    await t.put(uploadPath, {
      params: ATTACHMENT_BYTES,
      headers: { "Content-Type": "application/octet-stream" },
    });

    t.assertResponse(":no_content");
  });

  it("disk service download endpoint doesn't require authentication", async () => {
    ActiveStorageCurrent.urlOptions = { host: "www.example.com", protocol: "https" };
    const handbook = await fixture<Book>("books", "handbook");
    await handbook.updateBang({ published: true });
    await handbook.cover.attach({
      io: new StringIO(ATTACHMENT_BYTES),
      filename: "hi.txt",
      content_type: "text/plain",
    });
    await handbook.cover.load();
    const blob = (await (await handbook.cover.attachment)!.blob)!;
    const downloadPath = requestUri(await blob.url());

    const anonymous = new ApplicationIntegrationTest("anonymous");
    await anonymous.get(downloadPath);

    expect(anonymous.response.status).toBe(200);
    expect(anonymous.response.body).toBe(ATTACHMENT_BYTES);
  });
});

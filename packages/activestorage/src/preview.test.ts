import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Base } from "@blazetrails/activerecord";
import { readingRole } from "@blazetrails/activerecord/active-record";
import { freezeTime, travelBack } from "@blazetrails/activesupport";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { ActiveStorage } from "./active-storage.js";
import type { Attachment } from "./attachment.js";
import type { Blob } from "./blob.js";
import { Current } from "./current.js";
import { UnpreviewableError } from "./errors.js";
import { Preview } from "./preview.js";
import "./test-helpers/database/setup.js";
import { createFileBlob, readImage } from "./test-helpers/test-helper.js";

const resizeToLimit = { resizeToLimit: [640, 280] };

function delegated(preview: Preview) {
  return preview.image as Preview["image"] &
    Blob & { variantRecords: { toArray(): Promise<unknown[]> } };
}

async function assertPreview(
  preview: Preview,
  filename: string,
  contentType: string,
  width: number,
  height: number,
) {
  expect(preview.image.isAttached()).toBe(true);
  expect(delegated(preview).filename.toString()).toEqual(filename);
  expect(delegated(preview).contentType).toEqual(contentType);

  const image = await readImage(delegated(preview));
  expect(await image.width()).toEqual(width);
  expect(await image.height()).toEqual(height);
}

describe("ActiveStorage::PreviewTest", () => {
  const variableContentTypesWas = ActiveStorage.variableContentTypes;

  beforeEach(() => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    ActiveStorage.variableContentTypes = ["image/png", "image/jpeg"];
    Current.urlOptions = { protocol: "https://", host: "example.com", port: null };
  });

  afterEach(() => {
    ActiveStorage.variableContentTypes = variableContentTypesWas;
    Current.urlOptions = null;
  });

  it("previewing a PDF", async () => {
    const blob = await createFileBlob({ filename: "report.pdf", contentType: "application/pdf" });
    const preview = await blob.preview(resizeToLimit).processed();

    await assertPreview(preview, "report.png", "image/png", 612, 792);
  });

  it("previewing a cropped PDF", async () => {
    const blob = await createFileBlob({ filename: "cropped.pdf", contentType: "application/pdf" });
    const preview = await blob.preview(resizeToLimit).processed();

    await assertPreview(preview, "cropped.png", "image/png", 430, 145);
  });

  it("previewing a PDF-based Illustrator file", async () => {
    const blob = await createFileBlob({
      fixture: "report.pdf",
      filename: "file.ai",
      contentType: "application/illustrator",
    });
    const preview = await blob.preview(resizeToLimit).processed();

    await assertPreview(preview, "file.png", "image/png", 612, 792);
  });

  it("previewing an MP4 video", async () => {
    const blob = await createFileBlob({ filename: "video.mp4", contentType: "video/mp4" });
    const preview = await blob.preview(resizeToLimit).processed();

    await assertPreview(preview, "video.jpg", "image/jpeg", 640, 480);
  });

  it("previewing an unpreviewable blob", async () => {
    const blob = await createFileBlob();
    expect(() => blob.preview(resizeToLimit)).toThrow(UnpreviewableError);
    expect(() => blob.preview(resizeToLimit)).toThrow(
      /blob with ID=\d+ and content_type=image\/jpeg/,
    );
  });

  it("previewing on the writer DB", async () => {
    const blob = await createFileBlob({ filename: "report.pdf", contentType: "application/pdf" });

    await Base.connectedTo({ role: readingRole(), preventWrites: true }, async () => {
      await blob.preview(resizeToLimit).processed();
    });

    await blob.reload();
    await blob.previewImage.load();
    expect(blob.previewImage.isAttached()).toBe(true);
  });

  it("#processed also processes the preview's image variant", async () => {
    const blob = await createFileBlob({ filename: "report.pdf", contentType: "application/pdf" });
    const preview = blob.preview(resizeToLimit);

    await preview.processed();

    const variant = await (delegated(preview) as unknown as Attachment).variant(resizeToLimit);
    expect(await (variant as unknown as { isProcessed(): Promise<boolean> }).isProcessed()).toBe(
      true,
    );
  });

  it("image-related methods raise UnprocessedError when preview is not processed", async () => {
    const blob = await createFileBlob({ filename: "report.pdf", contentType: "application/pdf" });
    const preview = blob.preview(resizeToLimit);

    await expect(preview.url()).rejects.toThrow(Preview.UnprocessedError);
    await expect(preview.key()).rejects.toThrow(Preview.UnprocessedError);
    await expect(preview.download()).rejects.toThrow(Preview.UnprocessedError);
  });

  it("previewing with empty transformations does not generate a variant", async () => {
    const blob = await createFileBlob({ filename: "report.pdf", contentType: "application/pdf" });
    const preview = blob.preview({});

    await preview.processed();
    const previewImage = blob.previewImage as Preview["image"] & Blob;

    freezeTime();
    try {
      expect(await preview.url()).toEqual(await previewImage.url());
    } finally {
      travelBack();
    }
    expect(await preview.key()).toEqual(previewImage.key);
    expect(await preview.download()).toEqual(await previewImage.download());
    expect(await delegated(preview).variantRecords.toArray()).toEqual([]);
  });

  it("preview of PDF is created on the same service", async () => {
    const blob = await createFileBlob({
      filename: "report.pdf",
      contentType: "application/pdf",
      serviceName: "local_public",
    });
    const preview = await blob.preview(resizeToLimit).processed();

    expect(delegated(preview).service_name).toEqual("local_public");
  });

  it("preview of MP4 video is created on the same service", async () => {
    const blob = await createFileBlob({
      filename: "video.mp4",
      contentType: "video/mp4",
      serviceName: "local_public",
    });
    const preview = await blob.preview(resizeToLimit).processed();

    expect(delegated(preview).service_name).toEqual("local_public");
  });
});

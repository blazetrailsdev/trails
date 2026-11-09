import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {} from "@blazetrails/vitest-matchers";
import { Base } from "@blazetrails/activerecord";
import { readingRole } from "@blazetrails/activerecord/active-record";
import { assertChanges, assertRaises } from "@blazetrails/activesupport/testing/assertions";
import { freezeTime, travelBack } from "@blazetrails/activesupport/testing/time-helpers";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { ActiveStorage } from "../../lib/active-storage.js";
import type { Attachment } from "../../lib/attachment.js";
import type { Blob } from "../../lib/blob.js";
import { Current } from "../../lib/current.js";
import { UnpreviewableError } from "../../lib/errors.js";
import { Preview } from "../../lib/preview.js";
import "../support/database/setup.js";
import { createFileBlob, readImage } from "../support/test-helper.js";

const resizeToLimit = { resizeToLimit: [640, 280] };

function delegated(preview: Preview) {
  return preview.image as Preview["image"] &
    Blob & { variantRecords: { toArray(): Promise<unknown[]> } };
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

    expect(preview.image.isAttached()).toBeTruthy();
    expect(delegated(preview).filename.toString()).toEqual("report.png");
    expect(delegated(preview).contentType).toEqual("image/png");

    const image = await readImage(delegated(preview));
    expect(await image.width()).toEqual(612);
    expect(await image.height()).toEqual(792);
  });

  it("previewing a cropped PDF", async () => {
    const blob = await createFileBlob({ filename: "cropped.pdf", contentType: "application/pdf" });
    const preview = await blob.preview(resizeToLimit).processed();

    expect(preview.image.isAttached()).toBeTruthy();
    expect(delegated(preview).filename.toString()).toEqual("cropped.png");
    expect(delegated(preview).contentType).toEqual("image/png");

    const image = await readImage(delegated(preview));
    expect(await image.width()).toEqual(430);
    expect(await image.height()).toEqual(145);
  });

  it("previewing a PDF-based Illustrator file", async () => {
    const blob = await createFileBlob({
      fixture: "report.pdf",
      filename: "file.ai",
      contentType: "application/illustrator",
    });
    const preview = await blob.preview(resizeToLimit).processed();

    expect(preview.image.isAttached()).toBeTruthy();
    expect(delegated(preview).filename.toString()).toEqual("file.png");
    expect(delegated(preview).contentType).toEqual("image/png");

    const image = await readImage(delegated(preview));
    expect(await image.width()).toEqual(612);
    expect(await image.height()).toEqual(792);
  });

  it("previewing an MP4 video", async () => {
    const blob = await createFileBlob({ filename: "video.mp4", contentType: "video/mp4" });
    const preview = await blob.preview(resizeToLimit).processed();

    expect(preview.image.isAttached()).toBeTruthy();
    expect(delegated(preview).filename.toString()).toEqual("video.jpg");
    expect(delegated(preview).contentType).toEqual("image/jpeg");

    const image = await readImage(delegated(preview));
    expect(await image.width()).toEqual(640);
    expect(await image.height()).toEqual(480);
  });

  it("previewing an unpreviewable blob", async () => {
    const blob = await createFileBlob();
    await assertRaises(
      [UnpreviewableError],
      { match: /blob with ID=\d+ and content_type=image\/jpeg/ },
      () => blob.preview(resizeToLimit),
    );
  });

  it("previewing on the writer DB", async () => {
    const blob = await createFileBlob({ filename: "report.pdf", contentType: "application/pdf" });

    await Base.connectedTo({ role: readingRole(), preventWrites: true }, async () => {
      await blob.preview(resizeToLimit).processed();
    });

    await blob.reload();
    await blob.previewImage.load();
    expect(blob.previewImage.isAttached()).toBeTruthy();
  });

  it("#processed also processes the preview's image variant", async () => {
    const blob = await createFileBlob({ filename: "report.pdf", contentType: "application/pdf" });
    const preview = blob.preview(resizeToLimit);

    await assertChanges(
      async () => {
        await preview.image.load();
        const variant = preview.image.isAttached()
          ? await (delegated(preview) as unknown as Attachment).variant(resizeToLimit)
          : null;
        return !!(
          variant &&
          (await (variant as unknown as { isProcessed(): Promise<boolean> }).isProcessed())
        );
      },
      null,
      { to: true },
      async () => {
        await preview.processed();
      },
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
    expect(await delegated(preview).variantRecords.toArray()).toBeEmpty();
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

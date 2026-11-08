import { describe, expect, it } from "vitest";
import { Image } from "@blazetrails/mini-magick/image";
import { PreviewError } from "../../lib/errors.js";
import "../support/database/setup.js";
import { createFileBlob } from "../support/test-helper.js";
import { PopplerPDFPreviewer } from "../../lib/previewer/poppler-pdf-previewer.js";

describe("ActiveStorage::Previewer::PopplerPDFPreviewerTest", () => {
  it("previewing a PDF document", async () => {
    const blob = await createFileBlob({ filename: "report.pdf", contentType: "application/pdf" });

    await new PopplerPDFPreviewer(blob).preview({}, async (attachable) => {
      expect(attachable.contentType).toEqual("image/png");
      expect(attachable.filename).toEqual("report.png");

      const image = await Image.read(attachable.io as never);
      expect(await image.width()).toEqual(612);
      expect(await image.height()).toEqual(792);
    });
  });

  it("previewing a cropped PDF document", async () => {
    const blob = await createFileBlob({ filename: "cropped.pdf", contentType: "application/pdf" });

    await new PopplerPDFPreviewer(blob).preview({}, async (attachable) => {
      expect(attachable.contentType).toEqual("image/png");
      expect(attachable.filename).toEqual("cropped.png");

      const image = await Image.read(attachable.io as never);
      expect(await image.width()).toEqual(430);
      expect(await image.height()).toEqual(145);
    });
  });

  it("previewing an Illustrator document that's a PDF subtype", async () => {
    const blob = await createFileBlob({
      fixture: "report.pdf",
      filename: "file.ai",
      contentType: "application/illustrator",
    });

    await new PopplerPDFPreviewer(blob).preview({}, async (attachable) => {
      expect(attachable.contentType).toEqual("image/png");
      expect(attachable.filename).toEqual("file.png");

      const image = await Image.read(attachable.io as never);
      expect(await image.width()).toEqual(612);
      expect(await image.height()).toEqual(792);
    });
  });

  it("previewing a PDF that can't be previewed", async () => {
    const blob = await createFileBlob({ filename: "video.mp4", contentType: "application/pdf" });

    await expect(new PopplerPDFPreviewer(blob).preview()).rejects.toThrow(PreviewError);
  });
});

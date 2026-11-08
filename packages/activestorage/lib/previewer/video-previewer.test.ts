import { describe, expect, it } from "vitest";
import { Marcel } from "@blazetrails/marcel";
import { Image } from "@blazetrails/mini-magick/image";
import { PreviewError } from "../errors.js";
import "../test-helpers/database/setup.js";
import { createFileBlob } from "../test-helpers/test-helper.js";
import { VideoPreviewer } from "./video-previewer.js";

describe("ActiveStorage::Previewer::VideoPreviewerTest", () => {
  it("previewing an MP4 video", async () => {
    const blob = await createFileBlob({ filename: "video.mp4", contentType: "video/mp4" });

    await new VideoPreviewer(blob).preview({}, async (attachable) => {
      expect(attachable.contentType).toEqual("image/jpeg");
      expect(attachable.filename).toEqual("video.jpg");

      const image = await Image.read(attachable.io as never);
      expect(await image.width()).toEqual(640);
      expect(await image.height()).toEqual(480);
      expect(Marcel.Magic.byExtension(await image.type())!.type).toEqual("image/jpeg");
    });
  });

  it("previewing a video that can't be previewed", async () => {
    const blob = await createFileBlob({ filename: "report.pdf", contentType: "video/mp4" });

    await expect(new VideoPreviewer(blob).preview()).rejects.toThrow(PreviewError);
  });
});

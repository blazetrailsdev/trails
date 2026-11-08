import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import "../../test-helpers/database/setup.js";
import { ActiveStorage } from "../../active-storage.js";
import {
  createBlob,
  createFileBlob,
  extractMetadataFrom,
  subscribeEventsFrom,
} from "../../test-helpers/test-helper.js";

describe("ActiveStorage::Analyzer::ImageAnalyzer::ImageMagickTest", () => {
  let previousProcessor: string;

  beforeEach(() => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    previousProcessor = ActiveStorage.variantProcessor;
    ActiveStorage.variantProcessor = "mini_magick";
  });

  afterEach(() => {
    ActiveStorage.variantProcessor = previousProcessor;
  });

  it("analyzing a JPEG image", async () => {
    const blob = await createFileBlob({ filename: "racecar.jpg", contentType: "image/jpeg" });
    const metadata = await extractMetadataFrom(blob);

    expect(metadata.get("width")).toBe(4104);
    expect(metadata.get("height")).toBe(2736);
  });

  it("analyzing a rotated JPEG image", async () => {
    const blob = await createFileBlob({
      filename: "racecar_rotated.jpg",
      contentType: "image/jpeg",
    });
    const metadata = await extractMetadataFrom(blob);

    expect(metadata.get("width")).toBe(2736);
    expect(metadata.get("height")).toBe(4104);
  });

  it("analyzing an SVG image without an XML declaration", async () => {
    const blob = await createFileBlob({ filename: "icon.svg", contentType: "image/svg+xml" });
    const metadata = await extractMetadataFrom(blob);

    expect(metadata.get("width")).toBe(792);
    expect(metadata.get("height")).toBe(584);
  });

  it("analyzing an unsupported image type", async () => {
    const blob = await createBlob({
      data: "bad",
      filename: "bad_file.bad",
      contentType: "image/bad_type",
    });
    const metadata = await extractMetadataFrom(blob);

    expect(metadata.get("width")).toBeUndefined();
    expect(metadata.get("height")).toBeUndefined();
  });

  it("instrumenting analysis", async () => {
    const events = subscribeEventsFrom("analyze.active_storage") as { payload: unknown }[];

    const blob = await createFileBlob({ filename: "racecar.jpg", contentType: "image/jpeg" });
    await blob.analyze();

    expect(events.length).toBe(1);
    expect(events[0].payload).toEqual({ analyzer: "mini_magick" });
  });
});

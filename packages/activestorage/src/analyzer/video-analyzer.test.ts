import { beforeEach, describe, expect, it } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import "../test-helpers/database/setup.js";
import { ActiveStorage } from "../active-storage.js";
import {
  createFileBlob,
  extractMetadataFrom,
  subscribeEventsFrom,
} from "../test-helpers/test-helper.js";

describe("ActiveStorage::Analyzer::VideoAnalyzerTest", () => {
  beforeEach(() => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
  });

  it("analyzing a video", async () => {
    const blob = await createFileBlob({ filename: "video.mp4", contentType: "video/mp4" });
    const metadata = await extractMetadataFrom(blob);

    expect(metadata.get("width")).toBe(640);
    expect(metadata.get("height")).toBe(480);
    expect(metadata.get("displayAspectRatio")).toEqual([4, 3]);
    expect(metadata.get("duration")).toBe(5.166648);
    expect(metadata.get("audio")).toBeTruthy();
    expect(metadata.get("video")).toBeTruthy();
    expect(metadata.has("angle")).toBe(false);
  });

  it("analyzing a rotated video", async () => {
    const blob = await createFileBlob({ filename: "rotated_video.mp4", contentType: "video/mp4" });
    const metadata = await extractMetadataFrom(blob);

    expect(metadata.get("width")).toBe(480);
    expect(metadata.get("height")).toBe(640);
    expect(metadata.get("displayAspectRatio")).toEqual([4, 3]);
    expect([90, -90]).toContain(metadata.get("angle"));
  });

  it("analyzing a rotated HDR video", async () => {
    const blob = await createFileBlob({
      filename: "rotated_hdr_video.mov",
      contentType: "video/quicktime",
    });
    const metadata = await extractMetadataFrom(blob);

    expect(metadata.get("width")).toBe(1080.0);
    expect(metadata.get("height")).toBe(1920.0);
    expect([90, -90]).toContain(metadata.get("angle"));
  });

  it("analyzing a video with rectangular samples", async () => {
    const blob = await createFileBlob({
      filename: "video_with_rectangular_samples.mp4",
      contentType: "video/mp4",
    });
    const metadata = await extractMetadataFrom(blob);

    expect(metadata.get("width")).toBe(1280);
    expect(metadata.get("height")).toBe(720);
    expect(metadata.get("displayAspectRatio")).toEqual([16, 9]);
  });

  it("analyzing a video with an undefined display aspect ratio", async () => {
    const blob = await createFileBlob({
      filename: "video_with_undefined_display_aspect_ratio.mp4",
      contentType: "video/mp4",
    });
    const metadata = await extractMetadataFrom(blob);

    expect(metadata.get("width")).toBe(640);
    expect(metadata.get("height")).toBe(480);
    expect(metadata.get("displayAspectRatio") ?? null).toBeNull();
  });

  it("analyzing a video with a container-specified duration", async () => {
    const blob = await createFileBlob({ filename: "video.webm", contentType: "video/webm" });
    const metadata = await extractMetadataFrom(blob);

    expect(metadata.get("width")).toBe(640);
    expect(metadata.get("height")).toBe(480);
    expect(metadata.get("duration")).toBe(5.229);
    expect(metadata.get("audio")).toBeTruthy();
    expect(metadata.get("video")).toBeTruthy();
  });

  it("analyzing a video without a video stream", async () => {
    const blob = await createFileBlob({
      filename: "video_without_video_stream.mp4",
      contentType: "video/mp4",
    });
    const metadata = await extractMetadataFrom(blob);

    expect(metadata.has("width")).toBe(false);
    expect(metadata.has("height")).toBe(false);
    expect(metadata.get("duration")).toBeGreaterThanOrEqual(1.0);
    expect(metadata.get("duration")).toBeLessThanOrEqual(1.022);
    expect(metadata.get("video")).toBeFalsy();
    expect(metadata.get("audio")).toBeTruthy();
  });

  it("analyzing a video without an audio stream", async () => {
    const blob = await createFileBlob({
      filename: "video_without_audio_stream.mp4",
      contentType: "video/mp4",
    });
    const metadata = await extractMetadataFrom(blob);

    expect(metadata.get("video")).toBeTruthy();
    expect(metadata.get("audio")).toBeFalsy();
  });

  it("instrumenting analysis", async () => {
    const events = subscribeEventsFrom("analyze.active_storage") as { payload: unknown }[];

    const blob = await createFileBlob({
      filename: "video_without_audio_stream.mp4",
      contentType: "video/mp4",
    });
    await blob.analyze();

    expect(events.length).toBe(1);
    expect(events[0].payload).toEqual({ analyzer: "ffprobe" });
  });
});

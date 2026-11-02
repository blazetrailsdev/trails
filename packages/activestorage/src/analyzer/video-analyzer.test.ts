import { beforeEach, describe, expect, it } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { Range } from "@blazetrails/ruby-compat";
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

    expect(metadata.get("width")).toEqual(640);
    expect(metadata.get("height")).toEqual(480);
    expect(metadata.get("displayAspectRatio")).toEqual([4, 3]);
    expect(metadata.get("duration")).toEqual(5.166648);
    expect(metadata.get("audio")).toBeTruthy();
    expect(metadata.get("video")).toBeTruthy();
    expect([...metadata.keys()]).not.toContainEqual("angle");
  });

  it("analyzing a rotated video", async () => {
    const blob = await createFileBlob({ filename: "rotated_video.mp4", contentType: "video/mp4" });
    const metadata = await extractMetadataFrom(blob);

    expect(metadata.get("width")).toEqual(480);
    expect(metadata.get("height")).toEqual(640);
    expect(metadata.get("displayAspectRatio")).toEqual([4, 3]);
    expect([90, -90]).toContainEqual(metadata.get("angle"));
  });

  it("analyzing a rotated HDR video", async () => {
    const blob = await createFileBlob({
      filename: "rotated_hdr_video.mov",
      contentType: "video/quicktime",
    });
    const metadata = await extractMetadataFrom(blob);

    expect(metadata.get("width")).toEqual(1080.0);
    expect(metadata.get("height")).toEqual(1920.0);
    expect([90, -90]).toContainEqual(metadata.get("angle"));
  });

  it("analyzing a video with rectangular samples", async () => {
    const blob = await createFileBlob({
      filename: "video_with_rectangular_samples.mp4",
      contentType: "video/mp4",
    });
    const metadata = await extractMetadataFrom(blob);

    expect(metadata.get("width")).toEqual(1280);
    expect(metadata.get("height")).toEqual(720);
    expect(metadata.get("displayAspectRatio")).toEqual([16, 9]);
  });

  it("analyzing a video with an undefined display aspect ratio", async () => {
    const blob = await createFileBlob({
      filename: "video_with_undefined_display_aspect_ratio.mp4",
      contentType: "video/mp4",
    });
    const metadata = await extractMetadataFrom(blob);

    expect(metadata.get("width")).toEqual(640);
    expect(metadata.get("height")).toEqual(480);
    expect(metadata.get("displayAspectRatio") ?? null).toBeNull();
  });

  it("analyzing a video with a container-specified duration", async () => {
    const blob = await createFileBlob({ filename: "video.webm", contentType: "video/webm" });
    const metadata = await extractMetadataFrom(blob);

    expect(metadata.get("width")).toEqual(640);
    expect(metadata.get("height")).toEqual(480);
    // prettier-ignore
    expect(metadata.get("duration")).toEqual(5.229000);
    expect(metadata.get("audio")).toBeTruthy();
    expect(metadata.get("video")).toBeTruthy();
  });

  it("analyzing a video without a video stream", async () => {
    const blob = await createFileBlob({
      filename: "video_without_video_stream.mp4",
      contentType: "video/mp4",
    });
    const metadata = await extractMetadataFrom(blob);

    expect([...metadata.keys()]).not.toContainEqual("width");
    expect([...metadata.keys()]).not.toContainEqual("height");
    expect([true]).toContainEqual(new Range(1.0, 1.022).cover(metadata.get("duration") as number));
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

    expect(events.length).toEqual(1);
    expect(events[0].payload).toEqual({ analyzer: "ffprobe" });
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import "../test-helpers/database/setup.js";
import { ActiveStorage } from "../active-storage.js";
import { createFileBlob } from "../test-helpers/test-helper.js";
import { AudioAnalyzer } from "./audio-analyzer.js";
import { VideoAnalyzer } from "./video-analyzer.js";

describe("analyzers without ffprobe", () => {
  const logged: string[] = [];
  const previousLogger = ActiveStorage.logger;

  beforeEach(() => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    ActiveStorage.paths["ffprobe"] = "trails-no-such-ffprobe";
    ActiveStorage.logger = { info: (message: string) => logged.push(message) } as never;
    logged.length = 0;
  });

  afterEach(() => {
    delete ActiveStorage.paths["ffprobe"];
    ActiveStorage.logger = previousLogger;
  });

  it("AudioAnalyzer logs and answers no metadata", async () => {
    const blob = await createFileBlob({ filename: "audio.mp3", contentType: "audio/mp3" });

    expect(await new AudioAnalyzer(blob).metadata()).toEqual({});
    expect(logged).toContain("Skipping audio analysis because ffprobe isn't installed");
  });

  it("VideoAnalyzer logs and answers audio and video false", async () => {
    const blob = await createFileBlob({ filename: "video.mp4", contentType: "video/mp4" });

    expect(await new VideoAnalyzer(blob).metadata()).toEqual({ audio: false, video: false });
    expect(logged).toContain("Skipping video analysis because ffprobe isn't installed");
  });
});

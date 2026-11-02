import { beforeEach, describe, expect, it } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import "../test-helpers/database/setup.js";
import { ActiveStorage } from "../active-storage.js";
import {
  createFileBlob,
  extractMetadataFrom,
  subscribeEventsFrom,
} from "../test-helpers/test-helper.js";

describe("ActiveStorage::Analyzer::AudioAnalyzerTest", () => {
  beforeEach(() => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
  });

  it("analyzing an audio", async () => {
    const blob = await createFileBlob({ filename: "audio.mp3", contentType: "audio/mp3" });
    const metadata = await extractMetadataFrom(blob);

    expect(metadata.get("duration")).toBe(0.914286);
    expect(metadata.get("bitRate")).toBe(128000);
    expect(metadata.get("sampleRate")).toBe(44100);
    expect(metadata.get("tags")).not.toBeNull();
    expect(metadata.get("tags")).not.toBeUndefined();
    expect((metadata.get("tags") as { get(k: string): unknown }).get("encoder")).toBe("Lavc57.64");
  });

  it("instrumenting analysis", async () => {
    const events = subscribeEventsFrom("analyze.active_storage") as { payload: unknown }[];

    const blob = await createFileBlob({ filename: "audio.mp3", contentType: "audio/mp3" });
    await blob.analyze();

    expect(events.length).toBe(1);
    expect(events[0].payload).toEqual({ analyzer: "ffprobe" });
  });
});

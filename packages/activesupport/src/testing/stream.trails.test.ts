import { describe, it, expect } from "vitest";
import { stderr, stdout } from "@blazetrails/ruby-compat";
import { capture, quietly, silenceStream } from "./stream.js";

describe("ActiveSupport::Testing::Stream", () => {
  it("capture(:stderr) collects stderr writes and console.warn, then restores", async () => {
    const originalWarn = console.warn;
    const originalWrite = stderr.write;
    const captured = await capture(":stderr", async () => {
      stderr.write("direct\n");
      console.warn("via", "warn");
    });
    expect(captured).toBe("direct\nvia warn\n");
    expect(console.warn).toBe(originalWarn);
    expect(stderr.write).toBe(originalWrite);
  });

  it("capture takes the String arm", async () => {
    const captured = await capture("stdout", () => {
      stdout.write("out\n");
    });
    expect(captured).toBe("out\n");
  });

  it("silence_stream and quietly restore the streams after the block raises", async () => {
    const originalLog = console.log;
    const originalError = console.error;
    await expect(
      silenceStream(stdout, () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(console.log).toBe(originalLog);
    expect(await quietly(() => 42)).toBe(42);
    expect(console.log).toBe(originalLog);
    expect(console.error).toBe(originalError);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { instrument } from "./job-runtime.js";
import * as RuntimeRegistry from "../runtime-registry.js";

describe("JobRuntimeTest", () => {
  beforeEach(() => RuntimeRegistry.reset());

  it("sets dbRuntime in payload for perform operations", () => {
    const payload: Record<string, unknown> = {};
    instrument.call({}, "perform", payload, () => {
      RuntimeRegistry.record("SELECT", 5.0);
    });
    expect(payload["dbRuntime"]).toBe(5.0);
  });

  it("does not set dbRuntime for non-perform operations", () => {
    const payload: Record<string, unknown> = {};
    instrument.call({}, "enqueue", payload, () => {});
    expect(payload["dbRuntime"]).toBeUndefined();
  });

  it("returns the block result for perform", () => {
    const result = instrument.call({}, "perform", {}, () => "done");
    expect(result).toBe("done");
  });

  it("returns the block result for non-perform", () => {
    const result = instrument.call({}, "enqueue", {}, () => 42);
    expect(result).toBe(42);
  });

  it("returns undefined when no block given", () => {
    expect(instrument.call({}, "perform", {})).toBeUndefined();
  });
});

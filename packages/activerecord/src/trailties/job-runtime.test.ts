import { describe, it, expect, beforeEach } from "vitest";
import { instrument } from "./job-runtime.js";
import * as RuntimeRegistry from "../runtime-registry.js";

const super_ = (_operation: string, _payload: Record<string, unknown>, block?: () => unknown) =>
  block?.();

describe("JobRuntimeTest", () => {
  beforeEach(() => RuntimeRegistry.reset());

  it("sets dbRuntime in payload for perform operations", () => {
    const payload: Record<string, unknown> = {};
    instrument.call({}, super_, "perform", payload, () => {
      RuntimeRegistry.setSqlRuntime(RuntimeRegistry.sqlRuntime() + 5.0);
      RuntimeRegistry.setQueriesCount(RuntimeRegistry.queriesCount() + 1);
    });
    expect(payload["dbRuntime"]).toBe(5.0);
  });

  it("does not set dbRuntime for non-perform operations", () => {
    const payload: Record<string, unknown> = {};
    instrument.call({}, super_, "enqueue", payload, () => {});
    expect(payload["dbRuntime"]).toBeUndefined();
  });

  it("returns the block result for perform", () => {
    const result = instrument.call({}, super_, "perform", {}, () => "done");
    expect(result).toBe("done");
  });

  it("returns the block result for non-perform", () => {
    const result = instrument.call({}, super_, "enqueue", {}, () => 42);
    expect(result).toBe(42);
  });

  it("returns undefined when no block given", () => {
    expect(instrument.call({}, super_, "perform", {})).toBeUndefined();
  });
});

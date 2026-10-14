import { describe, it, expect, beforeEach } from "vitest";
import { include } from "@blazetrails/ruby-compat";
import { JobRuntime } from "./job-runtime.js";
import * as RuntimeRegistry from "../runtime-registry.js";

class Instrumentation {
  instrument(_operation: string, _payload: Record<string, unknown> = {}, block?: () => unknown) {
    return block?.();
  }
}
class Job extends Instrumentation {}
include(Job, JobRuntime);

describe("JobRuntimeTest", () => {
  beforeEach(() => RuntimeRegistry.reset());

  it("sets dbRuntime in payload for perform operations", () => {
    const payload: Record<string, unknown> = {};
    new Job().instrument("perform", payload, () => {
      RuntimeRegistry.setSqlRuntime(RuntimeRegistry.sqlRuntime() + 5.0);
      RuntimeRegistry.setQueriesCount(RuntimeRegistry.queriesCount() + 1);
    });
    expect(payload["dbRuntime"]).toBe(5.0);
  });

  it("does not set dbRuntime for non-perform operations", () => {
    const payload: Record<string, unknown> = {};
    new Job().instrument("enqueue", payload, () => {});
    expect(payload["dbRuntime"]).toBeUndefined();
  });

  it("returns the block result for perform", () => {
    const result = new Job().instrument("perform", {}, () => "done");
    expect(result).toBe("done");
  });

  it("returns the block result for non-perform", () => {
    const result = new Job().instrument("enqueue", {}, () => 42);
    expect(result).toBe(42);
  });

  it("returns undefined when no block given", () => {
    expect(new Job().instrument("perform", {})).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import "./test-helpers/dummy-application.js";
import { Engine, SolidQueue } from "./index.js";
import { Base } from "./processes/base.js";

describe("SolidQueue::Engine", () => {
  it("runs its initializers in engine.rb order", () => {
    expect(Engine.initializers.tsort().map((initializer) => initializer.name)).toEqual([
      "solid_queue.config",
      "solid_queue.app_executor",
      "solid_queue.logger",
      "solid_queue.active_job.extensions",
      "solid_queue.include_interruptible_concern",
    ]);
  });

  it("includes Interruptible into Processes::Base and seats the app executor", () => {
    expect(typeof Base.prototype.interruptibleSleep).toBe("function");
    expect(SolidQueue.appExecutor).not.toBeNull();
    expect(SolidQueue.onThreadError).toBeTypeOf("function");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import "./test-helpers/dummy-application.js";
import { Engine, SolidQueue } from "./index.js";
import { Base } from "./processes/base.js";
import { Record } from "./record.js";

async function runConfigInitializer(): Promise<void> {
  const initializer = Engine.initializers.find((i) => i.name === "solid_queue.config")!;
  await initializer.bind(Engine.instance()).run();
}

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

  describe("solid_queue.config", () => {
    const configured = Engine.config.solidQueue.connectsTo;

    afterEach(() => {
      vi.restoreAllMocks();
      Engine.config.solidQueue.connectsTo = configured;
      SolidQueue.connectsTo = configured!;
    });

    it("connects Record to the configured connects_to", async () => {
      const connectsTo = vi.spyOn(Record, "connectsTo").mockResolvedValue([]);
      Engine.config.solidQueue.connectsTo = { database: { writing: "queue" } };
      await runConfigInitializer();
      expect(connectsTo).toHaveBeenCalledWith({ database: { writing: "queue" } });
    });

    it("does not connect Record without connects_to", async () => {
      const connectsTo = vi.spyOn(Record, "connectsTo").mockResolvedValue([]);
      Engine.config.solidQueue.connectsTo = null;
      await runConfigInitializer();
      expect(connectsTo).not.toHaveBeenCalled();
    });
  });
});

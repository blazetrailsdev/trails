import { afterEach, describe, expect, it, vi } from "vitest";
import "./support/dummy-application.js";
import { Engine, SolidQueue } from "../lib/index.js";
import { Base } from "../lib/processes/base.js";
import { Record } from "../lib/record.js";
import { Task } from "@blazetrails/rake";
import { LOAD_PATH } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";
import "@blazetrails/trailties/generators";
import { Engine as TrailsEngine } from "@blazetrails/trailties/engine";
import { InstallGenerator } from "../lib/generators/solid-queue/install/install-generator.js";

async function runConfigInitializer(): Promise<void> {
  const initializer = Engine.initializers.find((i) => i.name === "solid_queue.config")!;
  await initializer.bind(Engine.instance()).run();
}

describe("SolidQueue::Engine", () => {
  const loadPath = [...LOAD_PATH];

  afterEach(() => {
    LOAD_PATH.splice(0, LOAD_PATH.length, ...loadPath);
  });

  it("runs its initializers in engine.rb order", () => {
    expect(Engine.initializers.tsort().map((initializer) => initializer.name)).toEqual([
      "solid_queue.config",
      "solid_queue.app_executor",
      "solid_queue.logger",
      "solid_queue.active_job.extensions",
      "solid_queue.include_interruptible_concern",
    ]);
  });

  it("loads solid_queue/tasks from its rake_tasks block", async () => {
    await Engine.instance().runTasksBlocks({});

    expect(Task.isTaskDefined("solid_queue:install")).toBe(true);
    expect(Task.isTaskDefined("solid_queue:start")).toBe(true);
    expect((await Task.get("solid_queue:start")).prerequisites).toEqual(["environment"]);
  });

  it("solid_queue:install runs the solid_queue:install generator", async () => {
    await Engine.instance().runTasksBlocks({});
    const invoke = vi.spyOn(Trails.Command!, "invoke").mockResolvedValue(undefined);

    await (await Task.get("solid_queue:install")).execute();

    expect(invoke).toHaveBeenCalledWith("generate", ["solid_queue:install"]);
  });

  it("reaches its install generator through the load path", async () => {
    const setLoadPath = TrailsEngine.initializers.find((i) => i.name === "set_load_path")!;
    await setLoadPath
      .bind(Engine.instance())
      .run({ config: { addAutoloadPathsToLoadPath: false } });

    expect(await Trails.Generators!.findByNamespace("solid_queue:install")).toBe(InstallGenerator);
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

import { describe, expect, it } from "vitest";
import { Task } from "@blazetrails/rake";
import "@blazetrails/trailties";
import { Engine } from "../lib/engine.js";

describe("SolidCache::Engine", () => {
  it("loads lib/tasks/solid_cache_tasks.rake from its tasks path", async () => {
    await Engine.instance().runTasksBlocks({});

    expect(Task.isTaskDefined("solid-cache:install")).toBe(true);
  });
});

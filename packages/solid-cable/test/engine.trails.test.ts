import { TopLevel } from "@blazetrails/activesupport";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Task } from "@blazetrails/rake";
import "@blazetrails/trailties";
import { Engine } from "../lib/engine.js";
import { Record } from "../lib/record.js";
import { SolidCable } from "../lib/solid-cable.js";
import { ConfigStub } from "./support/config-stubs.js";

async function runConfigInitializer(options: { [key: string]: unknown }): Promise<void> {
  const old = TopLevel.Trails;
  TopLevel.Trails = {
    ...old,
    application: new ConfigStub(options),
  } as unknown as typeof TopLevel.Trails;
  try {
    const initializer = Engine.initializers.find((i) => i.name === "solid_cable.config")!;
    await initializer.bind(Engine).run();
  } finally {
    TopLevel.Trails = old;
    await SolidCable.loadCableConfig();
  }
}

describe("SolidCable::Engine", () => {
  afterEach(() => vi.restoreAllMocks());

  it("loads lib/tasks/solid_cable_tasks.rake from its tasks path", async () => {
    await Engine.instance().runTasksBlocks({});

    expect(Task.isTaskDefined("solid-cable:install")).toBe(true);
    expect(Task.isTaskDefined("solid-cable:update")).toBe(true);
  });

  it("connects Record to the configured connects_to", async () => {
    const connectsTo = vi.spyOn(Record, "connectsTo").mockResolvedValue([]);
    await runConfigInitializer({ connectsTo: { database: { writing: "cable" } } });
    expect(connectsTo).toHaveBeenCalledWith({ database: { writing: "cable" } });
  });

  it("does not connect Record without connects_to", async () => {
    const connectsTo = vi.spyOn(Record, "connectsTo").mockResolvedValue([]);
    await runConfigInitializer({});
    expect(connectsTo).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from "vitest";
import { Application } from "./application.js";
import { MultiTask } from "./multi-task.js";
import { Rake } from "./rake-module.js";
import { Task } from "./task.js";
import { captureOutput } from "./test-helpers/application.js";

describe("Application (trails)", () => {
  it("job stats reports concurrently invoked prerequisites", async () => {
    const app = new Application();
    Rake.application = app;
    app.options.jobStats = true;
    Task.defineTask("a");
    Task.defineTask("b");
    MultiTask.defineTask({ c: ["a", "b"] });
    const [out] = await captureOutput(() =>
      app.runWithThreads(async () => (await Task.get("c")).invoke()),
    );
    expect(out).toBe("Maximum active threads: 2 + main\nTotal threads in play:  2 + main\n");
  });
});

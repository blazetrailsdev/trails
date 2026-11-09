import { describe, expect, it } from "vitest";
import { Application } from "../lib/application.js";
import { MultiTask } from "../lib/multi-task.js";
import { Rake } from "../lib/rake-module.js";
import { Task } from "../lib/task.js";
import { captureOutput } from "./support/application.js";

describe("Application (trails)", () => {
  it("job stats reports concurrently invoked prerequisites", async () => {
    const app = new Application();
    Rake.application = app;
    app.options.jobStats = true;
    app.options.threadPoolSize = 2;
    Task.defineTask("a");
    Task.defineTask("b");
    MultiTask.defineTask({ c: ["a", "b"] });
    const [out] = await captureOutput(() =>
      app.runWithThreads(async () => (await Task.get("c")).invoke()),
    );
    expect(out).toBe("Maximum active threads: 2 + main\nTotal threads in play:  2 + main\n");
  });
});

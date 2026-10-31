import { describe, expect, it } from "vitest";
import { Application } from "./application.js";
import { captureOutput } from "./test-helpers/application.js";

describe("Application (trails)", () => {
  it("job stats reports concurrently invoked prerequisites", async () => {
    const app = new Application();
    app.options.jobStats = true;
    app._threadStatistics.maxActiveThreads = 2;
    app._threadStatistics.totalThreadsInPlay = 3;
    const [out] = await captureOutput(() => app.runWithThreads(async () => {}));
    expect(out).toBe("Maximum active threads: 2 + main\nTotal threads in play:  3 + main\n");
  });
});

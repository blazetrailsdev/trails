import { globalIoExecutor } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { TestCase } from "./test-helper.js";
import { TestServer } from "./stubs/test-server.js";

describe("ActionCable::TestCase#wait_for_async", () => {
  it("waits for a posted task's promise to settle", async () => {
    const tc = new TestCase("wait");
    let done = false;
    new TestServer().eventLoop.post(null, async () => {
      await new Promise((r) => setTimeout(r, 150));
      done = true;
    });
    await tc.waitForAsync();
    expect(done).toBe(true);
  });

  it("posts to the global io executor", () => {
    const loop = new TestServer().eventLoop;
    expect(loop.post(null, () => null)).toBe(globalIoExecutor());
  });

  it("raises when a task never settles", async () => {
    const tc = new TestCase("wait");
    const executor = { completedTaskCount: 0, scheduledTaskCount: 1 };
    await expect(tc.waitForExecutor(executor)).rejects.toThrow(
      "Executor could not complete all tasks in 2 seconds",
    );
  });
});

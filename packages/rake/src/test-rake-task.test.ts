import { describe, expect, it } from "vitest";
import { RuntimeError } from "@blazetrails/ruby-compat";
import { Task } from "./task.js";
import { TestTaskManager } from "./test-helpers/task-manager.js";

describe("TestRakeTask", () => {
  it("suggests valid rake task names", async () => {
    const tm = new TestTaskManager();
    tm.defineTask(Task, "test");

    const promise = tm.get("testt");
    await expect(promise).rejects.toThrow(RuntimeError);
    const error = (await promise.catch((err: unknown) => err)) as Error;

    expect(error.message).toMatch(/Don't know how to build task 'testt'/);
    expect(error.message).toMatch(/Did you mean\? {2}test/);
  });
});

import { describe, expect, it } from "vitest";
import { TestTaskManager } from "./task-manager-test-helper.js";

const task = (...args: unknown[]) => new TestTaskManager().resolveArgs(args);
const ab = ["a", "b"];

describe("TestRakeTaskManagerArgumentResolution", () => {
  it("good arg patterns", () => {
    expect(task("t")).toEqual(["t", [], [], null]);
    expect(task({ t: "x" })).toEqual(["t", [], ["x"], null]);
    expect(task({ t: ["x", "y"] })).toEqual(["t", [], ["x", "y"], null]);

    expect(task("t", { orderOnly: ["m"] })).toEqual(["t", [], [], ["m"]]);
    expect(task({ t: ["x", "y"], orderOnly: ["m", "n"] })).toEqual([
      "t",
      [],
      ["x", "y"],
      ["m", "n"],
    ]);

    expect(task("t", ab)).toEqual(["t", ab, [], null]);
    expect(task("t", new Map([[ab, "x"]]))).toEqual(["t", ab, ["x"], null]);
    expect(task("t", new Map([[ab, ["x", "y"]]]))).toEqual(["t", ab, ["x", "y"], null]);

    expect(task("t", ab, { orderOnly: ["m"] })).toEqual(["t", ab, [], ["m"]]);
    expect(
      task(
        "t",
        new Map<unknown, unknown>([
          [ab, "x"],
          ["orderOnly", ["m"]],
        ]),
      ),
    ).toEqual(["t", ab, ["x"], ["m"]]);
    expect(
      task(
        "t",
        new Map<unknown, unknown>([
          [ab, ["x", "y"]],
          ["orderOnly", ["m", "n"]],
        ]),
      ),
    ).toEqual(["t", ab, ["x", "y"], ["m", "n"]]);
  });
});

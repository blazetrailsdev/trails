import { describe, expect, it } from "vitest";
import type { ThorClass } from "@blazetrails/thor";
import { RunnerCommand } from "../../lib/commands/runner.js";

describe("RunnerCommand", () => {
  it("keeps help out of its commands", () => {
    const commands = Object.keys((RunnerCommand as unknown as ThorClass).commands());
    expect(commands).toEqual(["runner"]);
  });
});

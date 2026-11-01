import { describe, expect, it, vi } from "vitest";
import { TestUnitReporter } from "../test-unit/reporter.js";
import { Runner } from "../test-unit/runner.js";
import { TestCommand } from "./test.js";

describe("TestCommand", () => {
  it("is found under the test namespace with the reporter's executable", () => {
    expect(TestCommand.namespace()).toBe("test");
    expect(TestCommand.executable()).toBe(TestUnitReporter.executable);
    expect(TestCommand.executable("models")).toBe("bin/rails test:models");
  });

  it("passes a folder command's path to the runner", async () => {
    const run = vi.spyOn(Runner, "run").mockResolvedValue();
    const parse = vi.spyOn(Runner, "parseOptions").mockImplementation(() => {});
    try {
      await TestCommand.perform("models", ["-n", "x"], {});
      expect(run).toHaveBeenCalledWith(["test/models", "-n", "x"]);
      await TestCommand.perform("test", ["test/a.test.ts"], {});
      expect(run).toHaveBeenLastCalledWith(["test/a.test.ts"]);
    } finally {
      run.mockRestore();
      parse.mockRestore();
    }
  });
});

import { describe, expect, it, vi } from "vitest";
import { Dir, File, getFs } from "@blazetrails/ruby-compat";
import { buildTemplates } from "@blazetrails/trails-tsc";
import { TestUnitReporter } from "../test-unit/reporter.js";
import { Runner } from "../test-unit/runner.js";
import { TestCommand } from "./test.js";

vi.mock("@blazetrails/ruby-compat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@blazetrails/ruby-compat")>()),
  rbFSystem: vi.fn().mockResolvedValue(true),
}));

describe("TestCommand", () => {
  it("is found under the test namespace with the reporter's executable", () => {
    expect(TestCommand.namespace()).toBe("rails:test");
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

  it("help prints the test command's USAGE", async () => {
    const dir = Dir.mktmpdir();
    const source = await TestCommand.usagePath();
    const usage = File.join(dir, "USAGE");
    const usagePath = vi.spyOn(TestCommand, "usagePath").mockResolvedValue(usage);
    try {
      expect(source).toMatch(/commands\/test\/USAGE$/);
      await getFs().writeFile!(usage, await getFs().readFile(source!, "utf8"));
      await buildTemplates([usage]);
      const command = new TestCommand();
      const say = vi.spyOn(command, "say").mockImplementation(() => {});
      await command.help("test");
      expect(say.mock.calls.map(([message]) => message).join("\n")).toContain(
        `${TestUnitReporter.executable} test/models/user.test.ts:27`,
      );
    } finally {
      usagePath.mockRestore();
      await getFs().rm!(dir, { recursive: true, force: true });
    }
  });
});

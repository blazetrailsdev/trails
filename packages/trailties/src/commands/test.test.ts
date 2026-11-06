import { capture } from "@blazetrails/activesupport";
import { stdout as STDOUT } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { setAppPath } from "../app-path.js";
import { UnrecognizedCommandError } from "../command.js";
import { Runner } from "../test-unit/runner.js";
import { RakeCommand } from "./rake.js";
import { TestCommand } from "./test.js";

describe("Trails::Command::TestTest", () => {
  let prepare: MockInstance<typeof RakeCommand.perform>;

  beforeEach(() => {
    setAppPath("/app/config/application");
    vi.spyOn(Runner, "run").mockImplementation(async () => {
      STDOUT.write("0 runs, 0 failures, 0 errors, 0 skips\n");
    });
    vi.spyOn(Runner, "parseOptions").mockImplementation(() => {});
    prepare = vi.spyOn(RakeCommand, "perform").mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setAppPath(undefined);
  });

  function runTestCommand(subcommand = "test", ...args: string[]): Promise<string> {
    return capture("stdout", () => TestCommand.perform(subcommand, args, {}));
  }

  function assertSuccessfulRun(testCommandOutput: string): void {
    expect(testCommandOutput).toMatch("0 failures, 0 errors");
  }

  async function assertRunsPrepareTask(block: () => Promise<string>): Promise<string> {
    prepare.mockClear();
    const output = await block();
    assertSuccessfulRun(output);
    expect(prepare).toHaveBeenCalledWith("test:prepare", [], {});
    return output;
  }

  async function assertSkipsPrepareTask(block: () => Promise<string>): Promise<string> {
    prepare.mockClear();
    const output = await block();
    assertSuccessfulRun(output);
    expect(prepare).not.toHaveBeenCalled();
    return output;
  }

  it("test command with no args runs test:prepare task", async () => {
    await assertRunsPrepareTask(() => runTestCommand("test"));
  });

  it("test command with path arg skips test:prepare task", async () => {
    await assertSkipsPrepareTask(() => runTestCommand("test", "test/some.test.ts"));
    await assertSkipsPrepareTask(() => runTestCommand("test", "test/some"));
    await assertSkipsPrepareTask(() => runTestCommand("test", "test/some.test.ts:1"));
    await assertSkipsPrepareTask(() => runTestCommand("test", "./test/*.test.ts"));
  });

  it("test command with options runs test:prepare task", async () => {
    await assertRunsPrepareTask(() =>
      runTestCommand("test", "--seed", "1234", "-e", "development"),
    );
  });

  it("test command with name option skips test:prepare task", async () => {
    await assertSkipsPrepareTask(() => runTestCommand("test", "-n", "test_some_code"));
    await assertSkipsPrepareTask(() => runTestCommand("test", "-n", "/some_code/"));
    await assertSkipsPrepareTask(() => runTestCommand("test", "-n", "some code"));
    await assertSkipsPrepareTask(() => runTestCommand("test", "--name", "test_some_code"));
    await assertSkipsPrepareTask(() => runTestCommand("test", "--name=test_some_code"));
  });

  it("test command runs successfully when no tasks defined", async () => {
    prepare.mockRejectedValueOnce(new UnrecognizedCommandError("test:prepare", []));
    assertSuccessfulRun(await runTestCommand("test"));
  });

  it("test:all runs test:prepare task", async () => {
    await assertRunsPrepareTask(() => runTestCommand("all"));
  });

  it("test:all with name option skips test:prepare task", async () => {
    await assertSkipsPrepareTask(() => runTestCommand("all", "-n", "test_some_code"));
  });

  it("test:* runs test:prepare task", async () => {
    await assertRunsPrepareTask(() => runTestCommand("models"));
  });

  it("test:* with name option skips test:prepare task", async () => {
    await assertSkipsPrepareTask(() => runTestCommand("models", "-n", "test_some_code"));
  });
});

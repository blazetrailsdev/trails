import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { UnrecognizedCommandError } from "../command.js";
import { Runner } from "../test-unit/runner.js";
import { RakeCommand } from "./rake.js";
import { TestCommand } from "./test.js";

describe("TestTest", () => {
  let prepare: MockInstance<typeof RakeCommand.perform>;

  beforeEach(() => {
    vi.spyOn(Runner, "run").mockResolvedValue();
    vi.spyOn(Runner, "parseOptions").mockImplementation(() => {});
    prepare = vi.spyOn(RakeCommand, "perform").mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function runTestCommand(subcommand = "test", ...args: string[]): Promise<void> {
    return TestCommand.perform(subcommand, args, {});
  }

  async function assertRunsPrepareTask(block: () => Promise<void>): Promise<void> {
    prepare.mockClear();
    await block();
    expect(prepare).toHaveBeenCalledWith("test:prepare", [], {});
  }

  async function assertSkipsPrepareTask(block: () => Promise<void>): Promise<void> {
    prepare.mockClear();
    await block();
    expect(prepare).not.toHaveBeenCalled();
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
    await expect(runTestCommand("test")).resolves.toBeUndefined();
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

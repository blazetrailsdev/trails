import { afterEach, describe, expect, it } from "vitest";
import { Logger } from "./logger.js";
import {
  __INTERNAL_resetProcessAdapter_TEST_ONLY,
  registerProcessAdapter,
  type ProcessAdapter,
} from "./process-adapter.js";

function makeCapturingAdapter(): { adapter: ProcessAdapter; written: string[] } {
  const written: string[] = [];
  const stream = {
    write: (chunk: string) => {
      written.push(chunk);
      return true;
    },
    isTTY: false,
  };
  const adapter: ProcessAdapter = {
    envSnapshot: () => ({}),
    argvSnapshot: () => [],
    cwd: () => "/capture",
    chdir: () => {},
    platform: () => "capture",
    setEnv: () => {},
    exit: () => {
      throw new Error("exit");
    },
    setExitCode: () => {},
    onSignal: () => () => {},
    stdout: stream,
    stderr: stream,
    stdin: { isTTY: false, read: async () => null },
  };
  return { adapter, written };
}

describe("Logger default output", () => {
  afterEach(() => {
    __INTERNAL_resetProcessAdapter_TEST_ONLY();
  });

  it("routes through the registered process adapter", () => {
    const { adapter, written } = makeCapturingAdapter();
    registerProcessAdapter(adapter);

    new Logger().info("== 1 Foo: migrating ==");

    expect(written.join("")).toBe("== 1 Foo: migrating ==\n");
  });

  it("routes through an adapter registered after the logger was built", () => {
    const logger = new Logger();
    const { adapter, written } = makeCapturingAdapter();
    registerProcessAdapter(adapter);

    logger.info("late");

    expect(written.join("")).toBe("late\n");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { Logger } from "./logger.js";
import { NameError } from "./core-ext/name-error.js";
import {
  __INTERNAL_resetProcessAdapter_TEST_ONLY,
  registerProcessAdapter,
  type ProcessAdapter,
} from "@blazetrails/ruby-compat";

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

describe("LoggerSilence", () => {
  it("does not silence when the silencer is off", () => {
    const output: string[] = [];
    const logger = new Logger({ write: (s) => void output.push(s) });

    logger.setSilencer(false);
    try {
      logger.silence(Logger.ERROR, () => {
        logger.debug("THIS IS HERE");
      });
    } finally {
      logger.setSilencer(true);
    }

    expect(output.join("")).toContain("THIS IS HERE");
    expect(Logger.silencer).toBe(true);
  });

  it("yields the logger to the block", () => {
    const logger = new Logger({ write: () => {} });
    let yielded: Logger | null = null;

    logger.silence(Logger.ERROR, (l) => {
      yielded = l;
    });

    expect(yielded).toBe(logger);
  });
});

describe("LoggerThreadSafeLevel", () => {
  it("raises on an unknown level", () => {
    const logger = new Logger({ write: () => {} });

    expect(() => {
      logger.localLevel = ":nope" as never;
    }).toThrowError(NameError);
    expect(() => {
      logger.localLevel = ":nope" as never;
    }).toThrowError("uninitialized constant Logger::Severity::NOPE");
  });

  it("raises ArgumentError on a String level, which is not the Symbol arm", () => {
    const logger = new Logger({ write: () => {} });

    expect(() => {
      logger.localLevel = "debug" as never;
    }).toThrowError('Invalid log level: "debug"');
  });

  it("accepts both the Symbol and the String spelling on level=", () => {
    const logger = new Logger({ write: () => {} });

    logger.level = ":error";
    expect(logger.level).toBe(Logger.ERROR);
    logger.level = "warn";
    expect(logger.level).toBe(Logger.WARN);
    expect(() => {
      logger.level = "nope";
    }).toThrowError("invalid log level: nope");
  });

  it("raises ArgumentError on a level that is neither an Integer nor a Symbol", () => {
    const logger = new Logger({ write: () => {} });

    expect(() => {
      logger.localLevel = true as never;
    }).toThrowError("Invalid log level: true");
  });

  it("clears the local level when assigned null", () => {
    const logger = new Logger({ write: () => {} });

    logger.localLevel = Logger.ERROR;
    expect(logger.localLevel).toBe(Logger.ERROR);

    logger.localLevel = null;
    expect(logger.localLevel).toBeNull();
  });
});

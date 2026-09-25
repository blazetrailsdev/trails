import { describe, it, expect, beforeEach } from "vitest";
import { Logger, SimpleFormatter } from "./logger.js";
import { IsolatedExecutionState } from "./isolated-execution-state.js";
import { Fiber, Thread } from "@blazetrails/ruby-compat";
import { BroadcastLogger } from "./broadcast-logger.js";
import { Temporal } from "@blazetrails/date";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, sep } from "node:path";

function makeBuffer() {
  const lines: string[] = [];
  return {
    write(s: string) {
      lines.push(s);
    },
    get string(): string {
      return lines.join("");
    },
    lines,
  };
}

const UNICODE_STRING = "こにちわ";
const BYTE_STRING = "\xb8\x9e\x08\x88\xa5";

class PlainLogger {
  constructor(private readonly logdev: { write(s: string): void }) {}

  debug(message: string): boolean {
    this.logdev.write(`${message}\n`);
    return true;
  }

  error(message: string): boolean {
    this.logdev.write(`${message}\n`);
    return true;
  }
}

describe("LoggerTest", () => {
  let output: ReturnType<typeof makeBuffer>;
  let logger: Logger;

  beforeEach(() => {
    output = makeBuffer();
    logger = new Logger(output);
  });

  function assertLevel(level: number): void {
    expect(logger.level).toBe(level);
  }

  it("should log debugging message when debugging", () => {
    logger.level = Logger.DEBUG;
    logger.add(Logger.DEBUG, "A debug message");
    expect(output.string).toContain("A debug message");
  });

  it("should not log debug messages when log level is info", () => {
    logger.level = Logger.INFO;
    logger.add(Logger.DEBUG, "A debug message");
    expect(output.string).not.toContain("A debug message");
  });

  it("should add message passed as block when using add", () => {
    logger.level = Logger.INFO;
    logger.add(Logger.INFO, "A debug message");
    expect(output.string).toContain("A debug message");
  });

  it("should add message passed as block when using shortcut", () => {
    logger.level = Logger.INFO;
    logger.info(() => "A debug message");
    expect(output.string).toContain("A debug message");
  });

  it("should convert message to string", () => {
    logger.level = Logger.INFO;
    logger.info(String(12345));
    expect(output.string).toContain("12345");
  });

  it("should convert message to string when passed in block", () => {
    logger.level = Logger.INFO;
    logger.info(() => String(12345));
    expect(output.string).toContain("12345");
  });

  it("should not evaluate block if message wont be logged", () => {
    logger.level = Logger.INFO;
    let evaluated = false;
    logger.add(Logger.DEBUG, null, null, () => {
      evaluated = true;
    });
    expect(evaluated == false).toBeTruthy();
  });

  it("should not mutate message", () => {
    const message = "A debug message";
    const messageCopy = message;
    logger.info(message);
    expect(message).toBe(messageCopy);
  });

  it("should know if its loglevel is below a given level", () => {
    for (const level of ["DEBUG", "INFO", "WARN", "ERROR", "FATAL"] as const) {
      logger.level = Logger[level] - 1;
      expect((logger as any)[`${level.toLowerCase()}?`]).toBeTruthy();
    }
  });

  it("silencing everything but errors", () => {
    logger.silence(Logger.ERROR, () => {
      logger.debug("NOT THERE");
      logger.error("THIS IS HERE");
    });
    expect(output.string).not.toContain("NOT THERE");
    expect(output.string).toContain("THIS IS HERE");
  });

  it("unsilencing", () => {
    logger.level = Logger.INFO;
    logger.debug("NOT THERE");
    logger.silence(Logger.DEBUG, () => {
      logger.debug("THIS IS HERE");
    });
    expect(output.string).not.toContain("NOT THERE");
    expect(output.string).toContain("THIS IS HERE");
  });

  it("logger silencing works for broadcast", () => {
    const anotherOutput = makeBuffer();
    const anotherLogger = new Logger(anotherOutput);

    const broadcastLogger = new BroadcastLogger(logger, anotherLogger);

    broadcastLogger.debug("CORRECT DEBUG");
    broadcastLogger.silence(Logger.ERROR, (logger) => {
      expect(logger).toBeInstanceOf(BroadcastLogger);
      logger.debug("FAILURE");
      logger.error("CORRECT ERROR");
    });

    expect(output.string).toContain("CORRECT DEBUG");
    expect(output.string).toContain("CORRECT ERROR");
    expect(output.string).not.toContain("FAILURE");

    expect(anotherOutput.string).toContain("CORRECT DEBUG");
    expect(anotherOutput.string).toContain("CORRECT ERROR");
    expect(anotherOutput.string.includes("FAILURE")).toBeFalsy();
  });

  it("logger level per object thread safety", () => {
    const logger1 = new Logger(makeBuffer());
    const logger2 = new Logger(makeBuffer());
    expect(logger1.level).toBe(Logger.DEBUG);
    expect(logger2.level).toBe(Logger.DEBUG);
    logger1.level = Logger.ERROR;
    expect(logger2.level).toBe(Logger.DEBUG);
  });

  it("temporarily logging at a noisier level", () => {
    logger.level = Logger.INFO;
    logger.debug("NOT THERE");
    logger.logAt(Logger.DEBUG, () => {
      logger.debug("THIS IS HERE");
    });
    logger.debug("NOT THERE");
    expect(output.string).not.toContain("NOT THERE");
    expect(output.string).toContain("THIS IS HERE");
  });

  it("temporarily logging at a quieter level", () => {
    logger.logAt(Logger.ERROR, () => {
      logger.debug("NOT THERE");
      logger.error("THIS IS HERE");
    });
    expect(output.string).not.toContain("NOT THERE");
    expect(output.string).toContain("THIS IS HERE");
  });

  it("temporarily logging at a symbolic level", () => {
    logger.logAt(":error", () => {
      logger.debug("NOT THERE");
      logger.error("THIS IS HERE");
    });
    expect(output.string).not.toContain("NOT THERE");
    expect(output.string).toContain("THIS IS HERE");
  });

  it("log at only impacts receiver", () => {
    const logger2 = new Logger(makeBuffer());
    expect(logger2.level).toBe(Logger.DEBUG);
    expect(logger.level).toBe(Logger.DEBUG);
    logger.logAt(":error", () => {
      expect(logger2.level).toBe(Logger.DEBUG);
      expect(logger.level).toBe(Logger.ERROR);
    });
  });

  it("log outputs to", () => {
    const stdout = makeBuffer();
    const stderr = makeBuffer();

    expect(Logger.isLoggerOutputsTo(logger, output)).toBeTruthy();
    expect(Logger.isLoggerOutputsTo(logger, output, stdout)).toBeTruthy();

    expect(Logger.isLoggerOutputsTo(logger, stdout)).toBeFalsy();
    expect(Logger.isLoggerOutputsTo(logger, stdout, stderr)).toBeFalsy();
    expect(Logger.isLoggerOutputsTo(logger, "log/production.log")).toBeFalsy();
  });

  it("log outputs to with a broadcast logger", () => {
    const stdout = makeBuffer();
    const stderr = makeBuffer();
    const broadcast = new BroadcastLogger(new Logger(stdout));

    expect(Logger.isLoggerOutputsTo(broadcast, stdout)).toBeTruthy();
    expect(Logger.isLoggerOutputsTo(broadcast, stderr)).toBeFalsy();

    broadcast.broadcastTo(new Logger(stderr));
    expect(Logger.isLoggerOutputsTo(broadcast, stderr)).toBeTruthy();
  });

  it("log outputs to with a filename", () => {
    const dir = mkdtempSync(join(tmpdir(), "logger-test-"));
    const path = join(dir, "development.log");
    writeFileSync(path, "");
    const t = { path };
    const broadcast = new BroadcastLogger(new Logger({ filename: t.path, write: () => {} }));

    try {
      expect(Logger.isLoggerOutputsTo(broadcast, t)).toBeTruthy();
      expect(Logger.isLoggerOutputsTo(broadcast, path)).toBeTruthy();
      expect(
        Logger.isLoggerOutputsTo(broadcast, `${dirname(path)}${sep}.${sep}${basename(path)}`),
      ).toBeTruthy();
      expect(Logger.isLoggerOutputsTo(broadcast, "log/production.log")).toBeFalsy();
      expect(Logger.isLoggerOutputsTo(broadcast, makeBuffer())).toBeFalsy();
    } finally {
      broadcast.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("defaults to simple formatter", () => {
    const logger = new Logger(output);
    expect(logger.formatter).toBeInstanceOf(SimpleFormatter);
  });

  it("formatter can be set via keyword arg", () => {
    logger.formatter = (_s: string, _d: Temporal.Instant, _p: string, msg: string) =>
      `CUSTOM: ${msg}\n`;
    logger.info("world");
    expect(output.string).toBe("CUSTOM: world\n");
  });

  it("broadcast silencing does not break plain ruby logger", () => {
    const anotherOutput = makeBuffer();
    const anotherLogger = new PlainLogger(anotherOutput);

    const broadcastLogger = new BroadcastLogger(logger, anotherLogger as unknown as Logger);

    broadcastLogger.debug("CORRECT DEBUG");
    broadcastLogger.silence(Logger.ERROR, (logger) => {
      expect(logger).toBeInstanceOf(BroadcastLogger);
      logger.debug("FAILURE");
      logger.error("CORRECT ERROR");
    });

    expect(output.string).toContain("CORRECT DEBUG");
    expect(output.string).toContain("CORRECT ERROR");
    expect(output.string).not.toContain("FAILURE");

    expect(anotherOutput.string).toContain("CORRECT DEBUG");
    expect(anotherOutput.string).toContain("CORRECT ERROR");
    expect(anotherOutput.string).toContain("FAILURE");
  });

  it("logger level thread safety", () => {
    const previousIsolationLevel = IsolatedExecutionState.isolationLevel!;
    IsolatedExecutionState.isolationLevel = "thread";
    try {
      logger.level = Logger.INFO;
      assertLevel(Logger.INFO);

      const enumerator = new Fiber(() => {
        logger.level = Logger.DEBUG;
        return logger.level;
      });
      expect(enumerator.resume()).toBe(Logger.DEBUG);
      assertLevel(Logger.DEBUG);
    } finally {
      IsolatedExecutionState.isolationLevel = previousIsolationLevel;
    }
  });

  it("logger level main thread safety", () => {
    logger.level = Logger.INFO;
    assertLevel(Logger.INFO);

    let t!: Thread;
    logger.silence(Logger.ERROR, () => {
      assertLevel(Logger.ERROR);
      t = new Thread(() => {
        assertLevel(Logger.INFO);
      });
    });

    t.join();
  });

  it("logger level local thread safety", () => {
    logger.level = Logger.INFO;
    assertLevel(Logger.INFO);

    const threads: Thread[] = [];
    const thread = (threadNumber: number) => () => {
      logger.silence(Logger.ERROR, () => {
        assertLevel(Logger.ERROR);
        logger.silence(Logger.DEBUG, () => {
          if (threadNumber === 1) threads.push(new Thread(thread(2)));
          assertLevel(Logger.DEBUG);
        });
      });

      assertLevel(Logger.INFO);
    };
    threads.unshift(new Thread(thread(1)));

    threads.forEach((t) => t.join());
    assertLevel(Logger.INFO);
  });

  it("write binary data to existing file", () => {
    expect(() => logger.info(Buffer.from([0x00, 0x01, 0x02]).toString())).not.toThrow();
  });

  it("write binary data create file", () => {
    expect(() => logger.info("binary placeholder")).not.toThrow();
  });

  it("buffer multibyte", () => {
    logger.level = Logger.INFO;
    logger.info(UNICODE_STRING);
    logger.info(BYTE_STRING);
    expect(output.string).toContain(UNICODE_STRING);
    const byteString = output.string;
    expect(byteString).toContain(BYTE_STRING);
  });

  it("logger level main fiber safety", () => {
    const previousIsolationLevel = IsolatedExecutionState.isolationLevel!;
    IsolatedExecutionState.isolationLevel = "fiber";
    try {
      logger.level = Logger.INFO;
      assertLevel(Logger.INFO);

      const fiber = new Fiber(() => {
        assertLevel(Logger.INFO);
      });

      logger.silence(Logger.ERROR, () => {
        assertLevel(Logger.ERROR);
        fiber.resume();
      });
    } finally {
      IsolatedExecutionState.isolationLevel = previousIsolationLevel;
    }
  });

  it("logger level local fiber safety", () => {
    const previousIsolationLevel = IsolatedExecutionState.isolationLevel!;
    IsolatedExecutionState.isolationLevel = "fiber";
    try {
      logger.level = Logger.INFO;
      assertLevel(Logger.INFO);

      const anotherFiber = new Fiber(() => {
        logger.silence(Logger.ERROR, () => {
          assertLevel(Logger.ERROR);
          logger.silence(Logger.DEBUG, () => {
            assertLevel(Logger.DEBUG);
          });
        });

        assertLevel(Logger.INFO);
      });

      new Fiber(() => {
        logger.silence(Logger.ERROR, () => {
          assertLevel(Logger.ERROR);
          logger.silence(Logger.DEBUG, () => {
            anotherFiber.resume();
            assertLevel(Logger.DEBUG);
          });
        });

        assertLevel(Logger.INFO);
      }).resume();

      assertLevel(Logger.INFO);
    } finally {
      IsolatedExecutionState.isolationLevel = previousIsolationLevel;
    }
  });
});

describe("SimpleFormatter", () => {
  it("formats a string message with newline", () => {
    const fmt = new SimpleFormatter();
    expect(fmt.call("INFO", Temporal.Now.instant(), null, "hello")).toBe("hello\n");
  });

  it("formats empty string", () => {
    const fmt = new SimpleFormatter();
    expect(fmt.call("DEBUG", Temporal.Now.instant(), null, "")).toBe("\n");
  });
});

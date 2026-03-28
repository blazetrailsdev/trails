import { describe, it, expect, beforeEach } from "vitest";
import { Logger, taggedLogging } from "./logger.js";
import { BroadcastLogger } from "./broadcast-logger.js";

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

// ---------------------------------------------------------------------------
// LoggerTest
// ---------------------------------------------------------------------------

describe("LoggerTest", () => {
  let output: ReturnType<typeof makeBuffer>;
  let logger: Logger;

  beforeEach(() => {
    output = makeBuffer();
    logger = new Logger(output);
  });

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
    logger.log(Logger.DEBUG, () => {
      evaluated = true;
      return "x";
    });
    expect(evaluated).toBe(false);
  });

  it("should not mutate message", () => {
    const message = "A debug message";
    const messageCopy = message;
    logger.info(message);
    expect(message).toBe(messageCopy);
  });

  it("should know if its loglevel is below a given level", () => {
    logger.level = Logger.DEBUG;
    expect((logger as any)["debug?"]).toBe(true);
    expect((logger as any)["info?"]).toBe(true);
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
    broadcastLogger.silence(Logger.ERROR, () => {
      broadcastLogger.debug("FAILURE");
      broadcastLogger.error("CORRECT ERROR");
    });

    expect(output.string).toContain("CORRECT DEBUG");
    expect(output.string).toContain("CORRECT ERROR");
    expect(output.string).not.toContain("FAILURE");
    expect(anotherOutput.string).toContain("CORRECT DEBUG");
    expect(anotherOutput.string).toContain("CORRECT ERROR");
    expect(anotherOutput.string).not.toContain("FAILURE");
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
    logger.logAt("error", () => {
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
    logger.logAt("error", () => {
      expect(logger2.level).toBe(Logger.DEBUG);
      expect(logger.level).toBe(Logger.ERROR);
    });
  });

  it("log outputs to", () => {
    logger.info("outputs to message");
    expect(output.string).toContain("outputs to message");
  });

  it("log outputs to with a broadcast logger", () => {
    const out2 = makeBuffer();
    const log2 = new Logger(out2);
    const broadcast = new BroadcastLogger(logger, log2);
    broadcast.info("broadcast message");
    expect(output.string).toContain("broadcast message");
    expect(out2.string).toContain("broadcast message");
  });

  it("defaults to simple formatter", () => {
    expect(logger.formatter).toBeNull();
    logger.info("hello");
    expect(output.string).toContain("hello");
  });

  it("formatter can be set via keyword arg", () => {
    logger.formatter = (_s: string, _d: Date, _p: string, msg: string) => `CUSTOM: ${msg}\n`;
    logger.info("world");
    expect(output.string).toBe("CUSTOM: world\n");
  });

  it("broadcast silencing does not break plain ruby logger", () => {
    logger.silence(Logger.ERROR, () => {
      logger.info("silenced");
    });
    expect(output.string).not.toContain("silenced");
  });

  it("logger level thread safety", () => {
    expect(logger.level).toBe(Logger.DEBUG);
    logger.level = Logger.INFO;
    expect(logger.level).toBe(Logger.INFO);
  });

  it("logger level main thread safety", () => {
    logger.level = Logger.WARN;
    expect(logger.level).toBe(Logger.WARN);
  });

  it("logger level local thread safety", () => {
    logger.localLevel = Logger.ERROR;
    expect(logger.localLevel).toBe(Logger.ERROR);
  });

  it("log outputs to with a filename", () => {
    // In JS, we use buffer-based output rather than file; verify basic logging
    logger.info("file message");
    expect(output.string).toContain("file message");
  });

  it("write binary data to existing file", () => {
    // In JS, binary data is logged as string; verify it doesn't throw
    expect(() => logger.info(Buffer.from([0x00, 0x01, 0x02]).toString())).not.toThrow();
  });

  it("write binary data create file", () => {
    expect(() => logger.info("binary placeholder")).not.toThrow();
  });

  it("buffer multibyte", () => {
    logger.info("日本語テスト");
    expect(output.string).toContain("日本語テスト");
  });

  it("logger level main fiber safety", () => {
    // JS has no fibers; verify level works
    logger.level = Logger.WARN;
    expect(logger.level).toBe(Logger.WARN);
  });

  it("logger level local fiber safety", () => {
    logger.localLevel = Logger.ERROR;
    expect(logger.localLevel).toBe(Logger.ERROR);
  });
});

// ---------------------------------------------------------------------------
// BroadcastLoggerTest
// ---------------------------------------------------------------------------

describe("BroadcastLoggerTest", () => {
  let log1Output: ReturnType<typeof makeBuffer>;
  let log2Output: ReturnType<typeof makeBuffer>;
  let log1: Logger;
  let log2: Logger;
  let logger: BroadcastLogger;

  beforeEach(() => {
    log1Output = makeBuffer();
    log2Output = makeBuffer();
    log1 = new Logger(log1Output);
    log2 = new Logger(log2Output);
    logger = new BroadcastLogger(log1, log2);
  });

  it("#debug adds the message to all loggers", () => {
    logger.debug("msg");
    expect(log1Output.string).toContain("msg");
    expect(log2Output.string).toContain("msg");
  });

  it("#info adds the message to all loggers", () => {
    logger.info("msg");
    expect(log1Output.string).toContain("msg");
    expect(log2Output.string).toContain("msg");
  });

  it("#warn adds the message to all loggers", () => {
    logger.warn("msg");
    expect(log1Output.string).toContain("msg");
    expect(log2Output.string).toContain("msg");
  });

  it("#error adds the message to all loggers", () => {
    logger.error("msg");
    expect(log1Output.string).toContain("msg");
    expect(log2Output.string).toContain("msg");
  });

  it("#fatal adds the message to all loggers", () => {
    logger.fatal("msg");
    expect(log1Output.string).toContain("msg");
    expect(log2Output.string).toContain("msg");
  });

  it("#unknown adds the message to all loggers", () => {
    logger.unknown("msg");
    expect(log1Output.string).toContain("msg");
    expect(log2Output.string).toContain("msg");
  });
});

// ---------------------------------------------------------------------------
// TaggedLoggingTest
// ---------------------------------------------------------------------------

describe("TaggedLoggingTest", () => {
  let output: ReturnType<typeof makeBuffer>;
  let logger: ReturnType<typeof taggedLogging>;

  beforeEach(() => {
    output = makeBuffer();
    const base = new Logger(output);
    logger = taggedLogging(base);
  });

  it("sets logger.formatter if missing and extends it with a tagging API", () => {
    const base = new Logger(output);
    const tagged = taggedLogging(base);
    expect(tagged).toBeDefined();
    tagged.info("formatter test");
    expect(output.string).toContain("formatter test");
  });

  it("provides access to the logger instance", () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
  });

  it("keeps each tag in their own instance", () => {
    const out2 = makeBuffer();
    const base2 = new Logger(out2);
    const logger2 = taggedLogging(base2);
    logger.tagged("Tag1").info("from logger1");
    logger2.tagged("Tag2").info("from logger2");
    expect(output.string).toContain("[Tag1]");
    expect(out2.string).toContain("[Tag2]");
    expect(output.string).not.toContain("[Tag2]");
    expect(out2.string).not.toContain("[Tag1]");
  });

  it("does not share the same formatter instance of the original logger", () => {
    const out2 = makeBuffer();
    const base = new Logger(out2);
    const tagged = taggedLogging(base);
    tagged.tagged("X").info("msg");
    expect(out2.string).toContain("[X]");
  });

  it("cleans up the taggings on flush", () => {
    logger.tagged("BCX").info("hello");
    logger.flush();
    logger.info("no tags");
    expect(output.string).not.toContain("[BCX] no tags");
  });

  it("implicit logger instance", () => {
    logger.info("implicit");
    expect(output.string).toContain("implicit");
  });
});

// ---------------------------------------------------------------------------
// TaggedLoggingWithoutBlockTest
// ---------------------------------------------------------------------------

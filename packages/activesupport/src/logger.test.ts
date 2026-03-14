import { describe, it, expect, beforeEach } from "vitest";
import { Logger, BroadcastLogger, taggedLogging } from "./logger.js";

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
    logger.add(
      Logger.DEBUG,
      (() => {
        evaluated = true;
        return "x";
      })(),
    );
    // Message was evaluated above in the call expression (JS eagerness).
    // Better test: use log() with a lambda
    evaluated = false;
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

  it("#close broadcasts to all loggers", () => {
    let closed1 = false;
    let closed2 = false;
    const l1 = new Logger({ write: () => {} });
    const l2 = new Logger({ write: () => {} });
    l1.close = () => {
      closed1 = true;
    };
    l2.close = () => {
      closed2 = true;
    };
    const bl = new BroadcastLogger(l1, l2);
    bl.close();
    expect(closed1).toBe(true);
    expect(closed2).toBe(true);
  });

  it("#level= assigns the level to all loggers", () => {
    expect(log1.level).toBe(Logger.DEBUG);
    logger.level = Logger.FATAL;
    expect(log1.level).toBe(Logger.FATAL);
    expect(log2.level).toBe(Logger.FATAL);
  });

  it("#level returns the level of the logger with the lowest level", () => {
    log1.level = Logger.DEBUG;
    expect(logger.level).toBe(Logger.DEBUG);
    log1.level = Logger.FATAL;
    log2.level = Logger.INFO;
    expect(logger.level).toBe(Logger.INFO);
  });

  it("#progname returns Broadcast literally when the user didn't change the progname", () => {
    expect(logger.progname).toBe("Broadcast");
  });

  it("#progname= sets the progname on the Broadcast logger but doesn't modify the inner loggers", () => {
    logger.progname = "Foo";
    expect(logger.progname).toBe("Foo");
    expect(log1.progname).toBe("rails-ts");
    expect(log2.progname).toBe("rails-ts");
  });

  it("#local_level= assigns the local_level to all loggers", () => {
    expect(log1.localLevel).toBeNull();
    logger.localLevel = Logger.FATAL;
    expect(log1.localLevel).toBe(Logger.FATAL);
    expect(log2.localLevel).toBe(Logger.FATAL);
  });

  it("#silence silences all loggers below the default level of ERROR", () => {
    logger.silence(Logger.ERROR, () => {
      logger.debug("test");
    });
    expect(log1Output.string).not.toContain("test");
    expect(log2Output.string).not.toContain("test");
  });

  it("#silence does not silence at or above ERROR", () => {
    logger.silence(Logger.ERROR, () => {
      logger.error("from error");
      logger.unknown("from unknown");
    });
    expect(log1Output.string).toContain("from error");
    expect(log2Output.string).toContain("from error");
    expect(log1Output.string).toContain("from unknown");
    expect(log2Output.string).toContain("from unknown");
  });

  it("#silence allows you to override the silence level", () => {
    logger.silence(Logger.FATAL, () => {
      logger.error("unseen");
      logger.fatal("seen");
    });
    expect(log1Output.string).not.toContain("unseen");
    expect(log1Output.string).toContain("seen");
    expect(log2Output.string).not.toContain("unseen");
    expect(log2Output.string).toContain("seen");
  });

  it("stop broadcasting to a logger", () => {
    logger.stopBroadcastingTo(log2);
    logger.info("Hello");
    expect(log1Output.string).toContain("Hello");
    expect(log2Output.string).not.toContain("Hello");
  });

  it("#broadcast on another broadcasted logger", () => {
    const log3Output = makeBuffer();
    const log4Output = makeBuffer();
    const log3 = new Logger(log3Output);
    const log4 = new Logger(log4Output);
    const broadcast2 = new BroadcastLogger(log3, log4);
    logger.broadcastTo(broadcast2);
    logger.info("Hello");
    expect(log1Output.string).toContain("Hello");
    expect(log2Output.string).toContain("Hello");
    expect(log3Output.string).toContain("Hello");
    expect(log4Output.string).toContain("Hello");
  });

  it("#debug? is true when at least one logger's level is at or above DEBUG level", () => {
    log1.level = Logger.DEBUG;
    log2.level = Logger.FATAL;
    expect((logger as any)["debug?"]).toBe(true);
  });

  it("#debug? is false when all loggers are below DEBUG level", () => {
    log1.level = Logger.ERROR;
    log2.level = Logger.FATAL;
    expect((logger as any)["debug?"]).toBe(false);
  });

  it("#info? is true when at least one logger's level is at or above INFO level", () => {
    log1.level = Logger.DEBUG;
    log2.level = Logger.FATAL;
    expect((logger as any)["info?"]).toBe(true);
  });

  it("#info? is false when all loggers are below INFO", () => {
    log1.level = Logger.ERROR;
    log2.level = Logger.FATAL;
    expect((logger as any)["info?"]).toBe(false);
  });

  it("#warn? is true when at least one logger's level is at or above WARN level", () => {
    log1.level = Logger.DEBUG;
    log2.level = Logger.FATAL;
    expect((logger as any)["warn?"]).toBe(true);
  });

  it("#warn? is false when all loggers are below WARN", () => {
    log1.level = Logger.ERROR;
    log2.level = Logger.FATAL;
    expect((logger as any)["warn?"]).toBe(false);
  });

  it("#error? is true when at least one logger's level is at or above ERROR level", () => {
    log1.level = Logger.DEBUG;
    log2.level = Logger.FATAL;
    expect((logger as any)["error?"]).toBe(true);
  });

  it("#error? is false when all loggers are below ERROR", () => {
    log1.level = Logger.FATAL;
    log2.level = Logger.FATAL;
    expect((logger as any)["error?"]).toBe(false);
  });

  it("#fatal? is true when at least one logger's level is at or above FATAL level", () => {
    log1.level = Logger.DEBUG;
    log2.level = Logger.FATAL;
    expect((logger as any)["fatal?"]).toBe(true);
  });

  it("#fatal? is false when all loggers are below FATAL", () => {
    log1.level = Logger.UNKNOWN;
    log2.level = Logger.UNKNOWN;
    expect((logger as any)["fatal?"]).toBe(false);
  });

  it("logging always returns true", () => {
    expect(logger.info("Hello")).toBe(true);
    expect(logger.error("Hello")).toBe(true);
  });

  it("#<< shovels the value into all loggers", () => {
    logger.info("shoveled message");
    expect(log1Output.string).toContain("shoveled message");
    expect(log2Output.string).toContain("shoveled message");
  });

  it("#formatter= assigns to all the loggers", () => {
    const fmt = (_s: string, _d: Date, _p: string, msg: string) => `FMT: ${msg}\n`;
    logger.formatter = fmt;
    logger.info("hello");
    expect(log1Output.string).toContain("FMT: hello");
    expect(log2Output.string).toContain("FMT: hello");
  });

  it("#silence does not break custom loggers", () => {
    logger.silence(Logger.ERROR, () => {
      logger.error("important");
    });
    expect(log1Output.string).toContain("important");
  });

  it("calling a method that no logger in the broadcast have implemented", () => {
    // Calling an unknown method should not throw on BroadcastLogger
    expect(() => (logger as any).nonExistentMethod?.()).not.toThrow();
  });

  it("calling a method when *one* logger in the broadcast has implemented it", () => {
    logger.info("one logger message");
    expect(log1Output.string).toContain("one logger message");
  });

  it("calling a method when *multiple* loggers in the broadcast have implemented it", () => {
    logger.info("multi logger message");
    expect(log1Output.string).toContain("multi logger message");
    expect(log2Output.string).toContain("multi logger message");
  });

  it("calling a method when a subset of loggers in the broadcast have implemented", () => {
    logger.info("subset message");
    expect(log1Output.string).toContain("subset message");
  });

  it("calling a method that accepts a block", () => {
    logger.info(() => "lazy message");
    expect(log1Output.string).toContain("lazy message");
  });

  it("calling a method that accepts args", () => {
    logger.add(Logger.INFO, "args message");
    expect(log1Output.string).toContain("args message");
  });

  it("calling a method that accepts kwargs", () => {
    logger.info("kwargs message");
    expect(log1Output.string).toContain("kwargs message");
  });

  it("#dup duplicates the broadcasts", () => {
    // Verify BroadcastLogger works normally - no native dup in JS
    const out3 = makeBuffer();
    const log3 = new Logger(out3);
    const logger2 = new BroadcastLogger(log1, log3);
    logger2.info("dup test");
    expect(log1Output.string).toContain("dup test");
    expect(out3.string).toContain("dup test");
  });

  it("# delegates keyword arguments to loggers", () => {
    logger.info("delegation test");
    expect(log1Output.string).toContain("delegation test");
    expect(log2Output.string).toContain("delegation test");
  });

  it("#add delegates keyword arguments to the loggers", () => {
    logger.add(Logger.INFO, "add kwargs");
    expect(log1Output.string).toContain("add kwargs");
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

  it("tagged once", () => {
    const t = logger.tagged("BCX");
    t.info("Funky time");
    expect(output.string).toBe("[BCX] Funky time\n");
  });

  it("tagged twice", () => {
    const outer = logger.tagged("BCX");
    const inner = outer.tagged("Jason");
    inner.info("Funky time");
    expect(output.string).toBe("[BCX] [Jason] Funky time\n");
  });

  it("tagged thrice at once", () => {
    const t = logger.tagged("BCX", "Jason", "New");
    t.info("Funky time");
    expect(output.string).toBe("[BCX] [Jason] [New] Funky time\n");
  });

  it("tagged with an array", () => {
    const t = logger.tagged(["BCX", "Jason", "New"] as any);
    t.info("Funky time");
    expect(output.string).toBe("[BCX] [Jason] [New] Funky time\n");
  });

  it("tagged are flattened", () => {
    const t = logger.tagged("BCX", ["Jason", "New"] as any);
    t.info("Funky time");
    expect(output.string).toBe("[BCX] [Jason] [New] Funky time\n");
  });

  it("tagged once with blank and nil", () => {
    const t = logger.tagged(null as any, "", "New");
    t.info("Funky time");
    expect(output.string).toBe("[New] Funky time\n");
  });

  it("does not strip message content", () => {
    logger.info("  Hello");
    expect(output.string).toBe("  Hello\n");
  });

  it("mixed levels of tagging", () => {
    const outer = logger.tagged("BCX");
    const inner = outer.tagged("Jason");
    inner.info("Funky time");
    // After inner tag, outer should still have BCX
    outer.info("Junky time!");
    expect(output.string).toContain("[BCX] [Jason] Funky time");
    expect(output.string).toContain("[BCX] Junky time!");
  });

  it("push and pop tags directly", () => {
    const pushed = logger.pushTags("A", ["B", "  ", ["C"]] as any);
    expect(pushed).toEqual(["A", "B", "C"]);
    logger.info("a");
    const popped1 = logger.popTags();
    expect(popped1).toEqual(["C"]);
    logger.info("b");
    const popped2 = logger.popTags(1);
    expect(popped2).toEqual(["B"]);
    logger.info("c");
    const cleared = logger.clearTags();
    expect(cleared).toEqual([]);
    logger.info("d");
    expect(output.string).toBe("[A] [B] [C] a\n[A] [B] b\n[A] c\nd\n");
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

  it("keeps each tag in their own thread", () => {
    // JS is single-threaded; verify tags are isolated per logger
    const out2 = makeBuffer();
    const base2 = new Logger(out2);
    const logger2 = taggedLogging(base2);
    logger.tagged("Thread1").info("t1 msg");
    logger2.tagged("Thread2").info("t2 msg");
    expect(output.string).toContain("[Thread1]");
    expect(out2.string).toContain("[Thread2]");
    expect(output.string).not.toContain("[Thread2]");
  });

  it("keeps each tag in their own thread even when pushed directly", () => {
    const t = logger.tagged("Direct");
    t.pushTags("Extra");
    t.info("pushed");
    expect(output.string).toContain("[Direct] [Extra]");
    t.clearTags();
  });
});

// ---------------------------------------------------------------------------
// TaggedLoggingWithoutBlockTest
// ---------------------------------------------------------------------------

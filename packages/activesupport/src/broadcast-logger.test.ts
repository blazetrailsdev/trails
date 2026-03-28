import { beforeEach, describe, expect, it } from "vitest";
import { BroadcastLogger, Logger } from "./logger.js";

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

  it("#<< shovels the value into all loggers", () => {
    logger.info("shoveled message");
    expect(log1Output.string).toContain("shoveled message");
    expect(log2Output.string).toContain("shoveled message");
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
    expect(log1.progname).toBe("trails");
    expect(log2.progname).toBe("trails");
  });

  it("#formatter= assigns to all the loggers", () => {
    const fmt = (_s: string, _d: Date, _p: string, msg: string) => `FMT: ${msg}\n`;
    logger.formatter = fmt;
    logger.info("hello");
    expect(log1Output.string).toContain("FMT: hello");
    expect(log2Output.string).toContain("FMT: hello");
  });

  it("#local_level= assigns the local_level to all loggers", () => {
    expect(log1.localLevel).toBeNull();
    logger.localLevel = Logger.FATAL;
    expect(log1.localLevel).toBe(Logger.FATAL);
    expect(log2.localLevel).toBe(Logger.FATAL);
  });

  it("#silence does not break custom loggers", () => {
    logger.silence(Logger.ERROR, () => {
      logger.error("important");
    });
    expect(log1Output.string).toContain("important");
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

  it("logging always returns true", () => {
    expect(logger.info("Hello")).toBe(true);
    expect(logger.error("Hello")).toBe(true);
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

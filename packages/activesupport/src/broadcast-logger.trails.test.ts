import { describe, expect, it } from "vitest";
import { Logger } from "./logger.js";
import { BroadcastLogger } from "./broadcast-logger.js";

describe("BroadcastLogger severity setters", () => {
  const build = (): [BroadcastLogger, Logger, Logger] => {
    const log1 = new Logger({ write: () => {} });
    const log2 = new Logger({ write: () => {} });
    return [new BroadcastLogger(log1, log2), log1, log2];
  };

  it("#debug! sets the level on all loggers", () => {
    const [logger, log1, log2] = build();
    log1.level = Logger.FATAL;
    log2.level = Logger.FATAL;

    logger.debugBang();

    expect(log1.level).toBe(Logger.DEBUG);
    expect(log2.level).toBe(Logger.DEBUG);
  });

  it("#info! sets the level on all loggers", () => {
    const [logger, log1, log2] = build();
    logger.infoBang();
    expect([log1.level, log2.level]).toEqual([Logger.INFO, Logger.INFO]);
  });

  it("#warn! sets the level on all loggers", () => {
    const [logger, log1, log2] = build();
    logger.warnBang();
    expect([log1.level, log2.level]).toEqual([Logger.WARN, Logger.WARN]);
  });

  it("#error! sets the level on all loggers", () => {
    const [logger, log1, log2] = build();
    logger.errorBang();
    expect([log1.level, log2.level]).toEqual([Logger.ERROR, Logger.ERROR]);
  });

  it("#fatal! sets the level on all loggers", () => {
    const [logger, log1, log2] = build();
    logger.fatalBang();
    expect([log1.level, log2.level]).toEqual([Logger.FATAL, Logger.FATAL]);
  });

  it("#sev_threshold= assigns the level to all loggers", () => {
    const [logger, log1, log2] = build();
    logger.sevThreshold = Logger.FATAL;
    expect([log1.level, log2.level]).toEqual([Logger.FATAL, Logger.FATAL]);
  });
});

describe("BroadcastLogger#log", () => {
  it("is add's alias, dispatching each broadcast's add", () => {
    const calls: unknown[][] = [];
    class AddRecorder extends Logger {
      override add(...args: Parameters<Logger["add"]>): boolean {
        calls.push(args);
        return true;
      }
    }
    const logger = new BroadcastLogger(new AddRecorder({ write: () => {} }));
    expect(BroadcastLogger.prototype.log).toBe(BroadcastLogger.prototype.add);
    logger.log(Logger.INFO, "hi");
    expect(calls).toEqual([[Logger.INFO, "hi"]]);
  });
});

describe("prototype-chain method_missing", () => {
  it("a subclass with a #private field still answers the dynamic names", () => {
    class Custom extends Logger {
      foo(): string {
        return "foo";
      }
    }
    class Sub extends BroadcastLogger {
      #secret = 1;
      secret(): number {
        return this.#secret;
      }
    }
    const sub = new Sub(new Custom(null)) as Sub & { foo(): string; bar?: unknown };
    expect(sub.secret()).toBe(1);
    expect(sub.foo()).toBe("foo");
    expect(sub.bar).toBeUndefined();
    expect(sub instanceof BroadcastLogger).toBe(true);
    expect(Object.getPrototypeOf(sub)).toBe(Sub.prototype);
  });
});

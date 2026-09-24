import { beforeEach, describe, expect, it } from "vitest";
import { Logger } from "./logger.js";
import { BroadcastLogger } from "./broadcast-logger.js";
import { rbInspect as inspect } from "@blazetrails/ruby-compat";
import {
  assertChanges,
  assertEmpty,
  assertNotRespondTo,
  assertNotSame,
  assertRespondTo,
  assertSame,
  assertNil,
} from "./testing/assertions.js";

type Add = [number, unknown, unknown];

const SEVERITIES: [string, number][] = [
  ["debug", Logger.DEBUG],
  ["info", Logger.INFO],
  ["warn", Logger.WARN],
  ["error", Logger.ERROR],
  ["fatal", Logger.FATAL],
  ["unknown", Logger.UNKNOWN],
];

class CustomLogger {
  adds: Add[] = [];
  closed = false;
  chevrons: string[] = [];
  level: number | null = Logger.DEBUG;
  localLevel: number | null = Logger.DEBUG;
  progname: string | null = null;
  formatter: unknown = null;

  foo(): boolean {
    return true;
  }

  bar(block: () => void): void {
    block();
  }

  baz(_param: unknown): boolean {
    return true;
  }

  qux(_kwargs: { param: unknown }): boolean {
    return true;
  }

  debug(message: unknown): void {
    this.add(Logger.DEBUG, message);
  }

  info(message: unknown): void {
    this.add(Logger.INFO, message);
  }

  warn(message: unknown): void {
    this.add(Logger.WARN, message);
  }

  error(message: unknown): void {
    this.add(Logger.ERROR, message);
  }

  fatal(message: unknown): void {
    this.add(Logger.FATAL, message);
  }

  unknown(message: unknown): void {
    this.add(Logger.UNKNOWN, message);
  }

  append(x: string): void {
    this.chevrons.push(x);
  }

  add(messageLevel: number, message: unknown = null, progname: unknown = null): void {
    if (messageLevel >= (this.localLevel as number)) {
      this.adds.push([messageLevel, message ?? null, progname ?? null]);
    }
  }

  get "debug?"(): boolean {
    return (this.level as number) <= Logger.DEBUG;
  }

  get "info?"(): boolean {
    return (this.level as number) <= Logger.INFO;
  }

  get "warn?"(): boolean {
    return (this.level as number) <= Logger.WARN;
  }

  get "error?"(): boolean {
    return (this.level as number) <= Logger.ERROR;
  }

  get "fatal?"(): boolean {
    return (this.level as number) <= Logger.FATAL;
  }

  close(): void {
    this.closed = true;
  }
}

class FakeLogger extends CustomLogger {
  static silencer = true;

  silence(severity: number = Logger.ERROR, block: (logger: this) => void): void {
    if (!FakeLogger.silencer) return block(this);
    const oldLocalLevel = this.localLevel;
    this.localLevel = severity;
    try {
      block(this);
    } finally {
      this.localLevel = oldLocalLevel;
    }
  }
}

class KwargsAcceptingLogger extends CustomLogger {
  override debug(message: unknown, kwargs: unknown = {}): void {
    this.add(Logger.DEBUG, `${inspect(kwargs)} ${message}`);
  }

  override info(message: unknown, kwargs: unknown = {}): void {
    this.add(Logger.INFO, `${inspect(kwargs)} ${message}`);
  }

  override warn(message: unknown, kwargs: unknown = {}): void {
    this.add(Logger.WARN, `${inspect(kwargs)} ${message}`);
  }

  override error(message: unknown, kwargs: unknown = {}): void {
    this.add(Logger.ERROR, `${inspect(kwargs)} ${message}`);
  }

  override fatal(message: unknown, kwargs: unknown = {}): void {
    this.add(Logger.FATAL, `${inspect(kwargs)} ${message}`);
  }

  override unknown(message: unknown, kwargs: unknown = {}): void {
    this.add(Logger.UNKNOWN, `${inspect(kwargs)} ${message}`);
  }

  override add(severity: number, message: unknown = null, kwargs: unknown = null): void {
    if (kwargs != null && typeof kwargs === "object") {
      return super.add(severity, `${inspect(kwargs)} ${message}`);
    }
    super.add(severity, message);
  }
}

const asLogger = (l: CustomLogger): Logger => l as unknown as Logger;

describe("BroadcastLoggerTest", () => {
  let log1: FakeLogger;
  let log2: FakeLogger;
  let logger: BroadcastLogger;

  beforeEach(() => {
    log1 = new FakeLogger();
    log2 = new FakeLogger();
    logger = new BroadcastLogger(asLogger(log1), asLogger(log2));
  });

  it("# adds the message to all loggers", () => {
    for (const [method, level] of SEVERITIES) {
      log1.adds = [];
      log2.adds = [];
      (logger as any)[method]("msg");

      expect(log1.adds[0]).toEqual([level, "msg", null]);
      expect(log2.adds[0]).toEqual([level, "msg", null]);
    }
  });

  it("#close broadcasts to all loggers", () => {
    logger.close();

    expect(log1.closed).toBeTruthy();
    expect(log2.closed).toBeTruthy();
  });

  it("#<< shovels the value into all loggers", () => {
    logger.append("foo");

    expect(log1.chevrons).toEqual(["foo"]);
    expect(log2.chevrons).toEqual(["foo"]);
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
    assertNil(log1.progname);
    assertNil(log2.progname);

    logger.progname = "Foo";

    expect(logger.progname).toBe("Foo");
    assertNil(log1.progname);
    assertNil(log2.progname);
  });

  it("#formatter= assigns to all the loggers", () => {
    logger.formatter = Logger.FATAL as any;

    expect(log1.formatter).toBe(Logger.FATAL);
    expect(log2.formatter).toBe(Logger.FATAL);
  });

  it("#local_level= assigns the local_level to all loggers", () => {
    expect(log1.localLevel).toBe(Logger.DEBUG);
    logger.localLevel = Logger.FATAL;

    expect(log1.localLevel).toBe(Logger.FATAL);
    expect(log2.localLevel).toBe(Logger.FATAL);
  });

  it("severity methods get called on all loggers", async () => {
    class MyLogger extends Logger {
      infoCalled: boolean | null = null;

      override info(_msg?: string | (() => string)): boolean {
        this.infoCalled = true;
        return true;
      }
    }
    const myLogger = new MyLogger({ write: () => {} });

    logger.broadcastTo(myLogger);

    try {
      await assertChanges(
        () => myLogger.infoCalled,
        null,
        { from: null, to: true },
        () => {
          logger.info("message");
        },
      );
    } finally {
      logger.stopBroadcastingTo(myLogger);
    }
  });

  it("#silence does not break custom loggers", () => {
    const newLogger = new FakeLogger();
    const customLogger = new CustomLogger();
    assertRespondTo(newLogger, "silence");
    assertNotRespondTo(customLogger, "silence");

    const logger = new BroadcastLogger(asLogger(customLogger), asLogger(newLogger));

    logger.silence(Logger.ERROR, () => {
      logger.error("from error");
      logger.unknown("from unknown");
    });

    expect(customLogger.adds).toEqual([
      [Logger.ERROR, "from error", null],
      [Logger.UNKNOWN, "from unknown", null],
    ]);
    expect(newLogger.adds).toEqual([
      [Logger.ERROR, "from error", null],
      [Logger.UNKNOWN, "from unknown", null],
    ]);
  });

  it("#silence silences all loggers below the default level of ERROR", () => {
    logger.silence(Logger.ERROR, () => {
      logger.debug("test");
    });

    expect(log1.adds).toEqual([]);
    expect(log2.adds).toEqual([]);
  });

  it("#silence does not silence at or above ERROR", () => {
    logger.silence(Logger.ERROR, () => {
      logger.error("from error");
      logger.unknown("from unknown");
    });

    expect(log1.adds).toEqual([
      [Logger.ERROR, "from error", null],
      [Logger.UNKNOWN, "from unknown", null],
    ]);
    expect(log2.adds).toEqual([
      [Logger.ERROR, "from error", null],
      [Logger.UNKNOWN, "from unknown", null],
    ]);
  });

  it("#silence allows you to override the silence level", () => {
    logger.silence(Logger.FATAL, () => {
      logger.error("unseen");
      logger.fatal("seen");
    });

    expect(log1.adds).toEqual([[Logger.FATAL, "seen", null]]);
    expect(log2.adds).toEqual([[Logger.FATAL, "seen", null]]);
  });

  it("stop broadcasting to a logger", () => {
    logger.stopBroadcastingTo(asLogger(log2));

    logger.info("Hello");

    expect(log1.adds).toEqual([[1, "Hello", null]]);
    assertEmpty(log2.adds);
  });

  it("#broadcast on another broadcasted logger", () => {
    const log3 = new FakeLogger();
    const log4 = new FakeLogger();
    const broadcast2 = new BroadcastLogger(asLogger(log3), asLogger(log4));

    logger.broadcastTo(broadcast2);
    logger.info("Hello");

    expect(log1.adds).toEqual([[1, "Hello", null]]);
    expect(log2.adds).toEqual([[1, "Hello", null]]);
    expect(log3.adds).toEqual([[1, "Hello", null]]);
    expect(log4.adds).toEqual([[1, "Hello", null]]);
  });

  it("#debug? is true when at least one logger's level is at or above DEBUG level", () => {
    log1.level = Logger.DEBUG;
    log2.level = Logger.FATAL;

    expect(logger["debug?"]).toBeTruthy();
  });

  it("#debug? is false when all loggers are below DEBUG level", () => {
    log1.level = Logger.ERROR;
    log2.level = Logger.FATAL;

    expect(logger["debug?"]).toBeFalsy();
  });

  it("#info? is true when at least one logger's level is at or above INFO level", () => {
    log1.level = Logger.DEBUG;
    log2.level = Logger.FATAL;

    expect(logger["info?"]).toBeTruthy();
  });

  it("#info? is false when all loggers are below INFO", () => {
    log1.level = Logger.ERROR;
    log2.level = Logger.FATAL;

    expect(logger["info?"]).toBeFalsy();
  });

  it("#warn? is true when at least one logger's level is at or above WARN level", () => {
    log1.level = Logger.DEBUG;
    log2.level = Logger.FATAL;

    expect(logger["warn?"]).toBeTruthy();
  });

  it("#warn? is false when all loggers are below WARN", () => {
    log1.level = Logger.ERROR;
    log2.level = Logger.FATAL;

    expect(logger["warn?"]).toBeFalsy();
  });

  it("#error? is true when at least one logger's level is at or above ERROR level", () => {
    log1.level = Logger.DEBUG;
    log2.level = Logger.FATAL;

    expect(logger["error?"]).toBeTruthy();
  });

  it("#error? is false when all loggers are below ERROR", () => {
    log1.level = Logger.FATAL;
    log2.level = Logger.FATAL;

    expect(logger["error?"]).toBeFalsy();
  });

  it("#fatal? is true when at least one logger's level is at or above FATAL level", () => {
    log1.level = Logger.DEBUG;
    log2.level = Logger.FATAL;

    expect(logger["fatal?"]).toBeTruthy();
  });

  it("#fatal? is false when all loggers are below FATAL", () => {
    log1.level = Logger.UNKNOWN;
    log2.level = Logger.UNKNOWN;

    expect(logger["fatal?"]).toBeFalsy();
  });

  it("calling a method that no logger in the broadcast have implemented", () => {
    expect(() => (logger as any).nonExisting()).toThrow();
  });

  it("calling a method when *one* logger in the broadcast has implemented it", () => {
    const logger = new BroadcastLogger(asLogger(new CustomLogger()));

    expect((logger as any).foo()).toBeTruthy();
  });

  it("calling a method when *multiple* loggers in the broadcast have implemented it", () => {
    const logger = new BroadcastLogger(asLogger(new CustomLogger()), asLogger(new CustomLogger()));

    expect((logger as any).foo()).toEqual([true, true]);
  });

  it("calling a method when a subset of loggers in the broadcast have implemented", () => {
    const logger = new BroadcastLogger(asLogger(new CustomLogger()), asLogger(new FakeLogger()));

    expect((logger as any).foo()).toBeTruthy();
  });

  it("calling a method that accepts a block", () => {
    const logger = new BroadcastLogger(asLogger(new CustomLogger()));

    let called = false;
    (logger as any).bar(() => {
      called = true;
    });
    expect(called).toBeTruthy();
  });

  it("calling a method that accepts args", () => {
    const logger = new BroadcastLogger(asLogger(new CustomLogger()));

    expect((logger as any).baz("foo")).toBeTruthy();
  });

  it("calling a method that accepts kwargs", () => {
    const logger = new BroadcastLogger(asLogger(new CustomLogger()));

    expect((logger as any).qux({ param: "foo" })).toBeTruthy();
  });

  it("#dup duplicates the broadcasts", () => {
    const logger = new CustomLogger();
    logger.level = Logger.WARN;
    const broadcastLogger = new BroadcastLogger(asLogger(logger));

    const duplicate = (broadcastLogger as any).dup() as BroadcastLogger;

    expect(duplicate.broadcasts[0].level).toBe(Logger.WARN);
    assertNotSame(logger, duplicate.broadcasts[0]);
    assertSame(logger, broadcastLogger.broadcasts[0]);
  });

  it("logging always returns true", () => {
    expect(logger.info("Hello")).toBe(true);
    expect(logger.error("Hello")).toBe(true);
  });

  it("# delegates keyword arguments to loggers", () => {
    for (const [method, level] of SEVERITIES) {
      const logger = new BroadcastLogger(asLogger(new KwargsAcceptingLogger()));

      (logger as any)[method]("Hello", { foo: "bar" });
      expect((logger.broadcasts[0] as unknown as CustomLogger).adds).toEqual([
        [level, `${inspect({ foo: "bar" })} Hello`, null],
      ]);
    }
  });

  it("#add delegates keyword arguments to the loggers", () => {
    const logger = new BroadcastLogger(asLogger(new KwargsAcceptingLogger()));

    (logger as any).add(Logger.INFO, "Hello", { foo: "bar" });
    expect((logger.broadcasts[0] as unknown as CustomLogger).adds).toEqual([
      [Logger.INFO, `${inspect({ foo: "bar" })} Hello`, null],
    ]);
  });
});

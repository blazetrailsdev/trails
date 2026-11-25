import { rbObjDup } from "@blazetrails/ruby-compat/include";
import { NoMethodError } from "@blazetrails/ruby-compat/no-method-error";
import { rbObjRespondTo } from "@blazetrails/ruby-compat/object";
import { include } from "@blazetrails/ruby-compat/include";
import { Logger, type LogLevel } from "./logger.js";
import { LoggerSilence } from "./logger-silence.js";
import { ActiveSupport } from "./namespaces.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include LoggerSilence` (`broadcast_logger.rb:75`); the class/interface merge is how `include()` surfaces on the type side.
export class BroadcastLogger {
  declare static silencer: boolean;

  public broadcasts: (Logger | BroadcastLogger)[];

  progname: unknown;

  constructor(...loggers: (Logger | BroadcastLogger)[]) {
    this.broadcasts = [];
    this.progname = "Broadcast";

    this.broadcastTo(...loggers);
  }

  broadcastTo(...loggers: (Logger | BroadcastLogger)[]): this {
    this.broadcasts.push(...loggers);
    return this;
  }

  /** @missingRailsCall delete — PERMANENT */
  stopBroadcastingTo(logger: Logger | BroadcastLogger): this {
    this.broadcasts = this.broadcasts.filter((l) => l !== logger);
    return this;
  }

  set localLevel(level: number | LogLevel | null) {
    this.broadcasts.forEach((logger) => {
      if ("localLevel" in logger) logger.localLevel = level;
    });
  }

  get localLevel(): number | null {
    const loggers = this.broadcasts.filter((logger) => "localLevel" in logger);

    return loggers.map((logger) => logger.localLevel)[0] ?? null;
  }

  append(...args: unknown[]): unknown {
    return this.dispatch(
      (logger, ...args) => logger.append(...(args as Parameters<Logger["append"]>)),
      ...args,
    );
  }

  log(...args: unknown[]): unknown {
    return this.dispatch(
      (logger, ...args) => logger.log(...(args as Parameters<Logger["add"]>)),
      ...args,
    );
  }

  add(...args: unknown[]): unknown {
    return this.dispatch(
      (logger, ...args) => logger.add(...(args as Parameters<Logger["add"]>)),
      ...args,
    );
  }

  debug(...args: unknown[]): unknown {
    return this.dispatch(
      (logger, ...args) => logger.debug(...(args as Parameters<Logger["debug"]>)),
      ...args,
    );
  }

  info(...args: unknown[]): unknown {
    return this.dispatch(
      (logger, ...args) => logger.info(...(args as Parameters<Logger["info"]>)),
      ...args,
    );
  }

  warn(...args: unknown[]): unknown {
    return this.dispatch(
      (logger, ...args) => logger.warn(...(args as Parameters<Logger["warn"]>)),
      ...args,
    );
  }

  error(...args: unknown[]): unknown {
    return this.dispatch(
      (logger, ...args) => logger.error(...(args as Parameters<Logger["error"]>)),
      ...args,
    );
  }

  fatal(...args: unknown[]): unknown {
    return this.dispatch(
      (logger, ...args) => logger.fatal(...(args as Parameters<Logger["fatal"]>)),
      ...args,
    );
  }

  unknown(...args: unknown[]): unknown {
    return this.dispatch(
      (logger, ...args) => logger.unknown(...(args as Parameters<Logger["unknown"]>)),
      ...args,
    );
  }

  set level(level: number | LogLevel | string) {
    this.dispatch((logger) => (logger.level = level));
  }

  set sevThreshold(level: number | LogLevel | string) {
    this.dispatch((logger) => (logger.sevThreshold = level));
  }

  close(...args: unknown[]): unknown {
    return this.dispatch(
      (logger, ...args) => logger.close(...(args as Parameters<Logger["close"]>)),
      ...args,
    );
  }

  get formatter(): Logger["formatter"] {
    return this.dispatch((logger) => logger.formatter) as Logger["formatter"];
  }

  set formatter(formatter: Logger["formatter"]) {
    this.dispatch((logger) => (logger.formatter = formatter));
  }

  get level(): number {
    return Math.min(...this.broadcasts.map((logger) => logger.level));
  }

  isDebug(): boolean {
    return this.broadcasts.some((logger) => logger.isDebug());
  }

  /** @missingRailsArgs dispatch — PERMANENT */
  debugBang(): unknown {
    return this.dispatch((logger) => logger.debugBang());
  }

  isInfo(): boolean {
    return this.broadcasts.some((logger) => logger.isInfo());
  }

  /** @missingRailsArgs dispatch — PERMANENT */
  infoBang(): unknown {
    return this.dispatch((logger) => logger.infoBang());
  }

  isWarn(): boolean {
    return this.broadcasts.some((logger) => logger.isWarn());
  }

  /** @missingRailsArgs dispatch — PERMANENT */
  warnBang(): unknown {
    return this.dispatch((logger) => logger.warnBang());
  }

  isError(): boolean {
    return this.broadcasts.some((logger) => logger.isError());
  }

  /** @missingRailsArgs dispatch — PERMANENT */
  errorBang(): unknown {
    return this.dispatch((logger) => logger.errorBang());
  }

  isFatal(): boolean {
    return this.broadcasts.some((logger) => logger.isFatal());
  }

  /** @missingRailsArgs dispatch — PERMANENT */
  fatalBang(): unknown {
    return this.dispatch((logger) => logger.fatalBang());
  }

  initializeCopy(other: BroadcastLogger): void {
    this.broadcasts = [];
    this.progname = rbObjDup(other.progname);

    this.broadcastTo(...other.broadcasts.map((logger) => rbObjDup(logger)));
  }

  private dispatch(
    method: (logger: Logger | BroadcastLogger, ...args: unknown[]) => unknown,
    ...args: unknown[]
  ): unknown {
    const block = args.at(-1);
    if (typeof block === "function") {
      let called = false,
        result: unknown = null;
      args[args.length - 1] = (...blockArgs: unknown[]) => {
        if (called) {
          return result;
        } else {
          called = true;
          return (result = block(...blockArgs));
        }
      };
    }

    return this.broadcasts.map((logger) => method(logger, ...args))[0] ?? null;
  }

  methodMissing(name: string, ...args: unknown[]): unknown {
    const loggers = this.broadcasts.filter((logger) => rbObjRespondTo(logger, name));

    if (loggers.length === 0) {
      throw new NoMethodError(
        `undefined method '${name}' for an instance of ActiveSupport::BroadcastLogger`,
      );
    } else if (loggers.length === 1) {
      return (loggers[0] as unknown as Record<string, (...a: unknown[]) => unknown>)[name](...args);
    } else {
      return loggers.map((logger) =>
        (logger as unknown as Record<string, (...a: unknown[]) => unknown>)[name](...args),
      );
    }
  }

  respondToMissing(method: string, includeAll: boolean): boolean {
    return this.broadcasts.some((logger) => rbObjRespondTo(logger, method));
  }
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- the class/interface merge is how `include()` surfaces on the type side. */
export interface BroadcastLogger {
  silencer: boolean;
  logAt<T>(level: number | LogLevel, fn: () => T): T;
  silence<T>(severity?: number | LogLevel, fn?: (logger: this) => T): T | undefined;
}
include(BroadcastLogger, LoggerSilence);

ActiveSupport.BroadcastLogger = BroadcastLogger;

Object.setPrototypeOf(
  BroadcastLogger.prototype,
  new Proxy(Object.create(Object.getPrototypeOf(BroadcastLogger.prototype) as object) as object, {
    get(target, name, receiver: BroadcastLogger) {
      if (
        typeof name === "symbol" ||
        Reflect.has(target, name) ||
        receiver === BroadcastLogger.prototype ||
        !Object.hasOwn(receiver, "broadcasts")
      ) {
        return Reflect.get(target, name, receiver);
      }
      if (!receiver.respondToMissing(name, false)) return undefined;
      return (...args: unknown[]) => receiver.methodMissing(name, ...args);
    },
  }),
);

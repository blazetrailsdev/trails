import { NoMethodError, rbObjDup, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { include } from "@blazetrails/ruby-compat/include";
import { Logger, type LogLevel } from "./logger.js";
import { LoggerSilence } from "./logger-silence.js";
import { LoggerThreadSafeLevel } from "./logger-thread-safe-level.js";
import { ActiveSupport } from "./namespaces.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include LoggerSilence` (`broadcast_logger.rb:75`); the class/interface merge is how `include()` surfaces on the type side.
export class BroadcastLogger {
  declare static silencer: boolean;

  public broadcasts: (Logger | BroadcastLogger)[];

  protected _formatter: Logger["formatter"] = null;

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

  get level(): number {
    return Math.min(...this.broadcasts.map((logger) => logger.level));
  }

  set level(level: number | LogLevel | string) {
    this.dispatch((logger) => {
      logger.level = level;
    });
  }

  set sevThreshold(level: number | LogLevel | string) {
    this.level = level;
  }

  set localLevel(value: number | LogLevel | null) {
    this.dispatch((logger) => {
      if ("localLevel" in logger) {
        logger.localLevel = value;
      }
    });
  }

  get localLevel(): number | null {
    return Object.getOwnPropertyDescriptor(
      LoggerThreadSafeLevel.prototype,
      "localLevel",
    )!.get!.call(this) as number | null;
  }

  set formatter(value: Logger["formatter"]) {
    this.dispatch((logger) => {
      logger.formatter = value;
    });

    this._formatter = value;
  }

  get formatter(): Logger["formatter"] {
    return this._formatter;
  }

  add(...args: unknown[]): boolean {
    return this.dispatch((logger) => logger.add(...(args as Parameters<Logger["add"]>)));
  }

  declare log: BroadcastLogger["add"];

  debug(...args: unknown[]): boolean {
    return this.dispatch((logger) => logger.debug(...(args as Parameters<Logger["debug"]>)));
  }

  info(...args: unknown[]): boolean {
    return this.dispatch((logger) => logger.info(...(args as Parameters<Logger["info"]>)));
  }

  warn(...args: unknown[]): boolean {
    return this.dispatch((logger) => logger.warn(...(args as Parameters<Logger["warn"]>)));
  }

  error(...args: unknown[]): boolean {
    return this.dispatch((logger) => logger.error(...(args as Parameters<Logger["error"]>)));
  }

  fatal(...args: unknown[]): boolean {
    return this.dispatch((logger) => logger.fatal(...(args as Parameters<Logger["fatal"]>)));
  }

  unknown(...args: unknown[]): boolean {
    return this.dispatch((logger) => logger.unknown(...(args as Parameters<Logger["unknown"]>)));
  }

  isDebug(): boolean {
    return this.broadcasts.some((logger) => logger.isDebug());
  }

  debugBang(): void {
    this.dispatch((logger) => logger.debugBang());
  }

  isInfo(): boolean {
    return this.broadcasts.some((logger) => logger.isInfo());
  }

  infoBang(): void {
    this.dispatch((logger) => logger.infoBang());
  }

  isWarn(): boolean {
    return this.broadcasts.some((logger) => logger.isWarn());
  }

  warnBang(): void {
    this.dispatch((logger) => logger.warnBang());
  }

  isError(): boolean {
    return this.broadcasts.some((logger) => logger.isError());
  }

  errorBang(): void {
    this.dispatch((logger) => logger.errorBang());
  }

  isFatal(): boolean {
    return this.broadcasts.some((logger) => logger.isFatal());
  }

  fatalBang(): void {
    this.dispatch((logger) => logger.fatalBang());
  }

  close(): void {
    this.dispatch((logger) => logger.close());
  }

  append(s: string): void {
    this.dispatch((logger) => logger.append(s));
  }

  initializeCopy(other: BroadcastLogger): void {
    this.broadcasts = [];
    this.progname = rbObjDup(other.progname);
    this._formatter = rbObjDup(other.formatter);

    this.broadcastTo(...other.broadcasts.map((logger) => rbObjDup(logger)));
  }

  private dispatch(block: (logger: Logger | BroadcastLogger) => void): boolean {
    this.broadcasts?.forEach((logger) => block(logger));
    return true;
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

BroadcastLogger.prototype.log = BroadcastLogger.prototype.add;

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

import { NoMethodError, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Logger, type LogLevel } from "./logger.js";
import { ActiveSupport } from "./namespaces.js";

export class BroadcastLogger extends Logger {
  public broadcasts: Logger[] = [];

  static silencer: boolean = true;

  static setSilencer(silencer: boolean): void {
    this.silencer = silencer;
  }

  constructor(...loggers: Logger[]) {
    super(null);
    this._formatter = null;
    this.broadcasts = [];
    this.progname = "Broadcast";

    this.broadcastTo(...loggers);

    return new Proxy(this, {
      get(target, name, receiver) {
        if (typeof name === "symbol" || Reflect.has(target, name)) {
          return Reflect.get(target, name, receiver);
        }
        if (!target.respondToMissing(name, false)) return undefined;
        return (...args: unknown[]) => target.methodMissing(name, ...args);
      },
      has(target, name) {
        return (
          Reflect.has(target, name) ||
          (typeof name === "string" && target.respondToMissing(name, false))
        );
      },
    });
  }

  broadcastTo(...loggers: Logger[]): this {
    this.broadcasts.push(...loggers);
    return this;
  }

  /** @missingRailsCall delete — PERMANENT */
  stopBroadcastingTo(logger: Logger): this {
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
    return super.localLevel;
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

  get "debug?"(): boolean {
    return this.broadcasts.some((logger) => logger["debug?"]);
  }

  debugBang(): void {
    this.dispatch((logger) => logger.debugBang());
  }

  get "info?"(): boolean {
    return this.broadcasts.some((logger) => logger["info?"]);
  }

  infoBang(): void {
    this.dispatch((logger) => logger.infoBang());
  }

  get "warn?"(): boolean {
    return this.broadcasts.some((logger) => logger["warn?"]);
  }

  warnBang(): void {
    this.dispatch((logger) => logger.warnBang());
  }

  get "error?"(): boolean {
    return this.broadcasts.some((logger) => logger["error?"]);
  }

  errorBang(): void {
    this.dispatch((logger) => logger.errorBang());
  }

  get "fatal?"(): boolean {
    return this.broadcasts.some((logger) => logger["fatal?"]);
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

  dup(): this {
    const copy = new (this.constructor as new () => this)();
    copy.broadcasts = [];
    copy.progname = this.progname;
    copy._formatter = this.formatter;

    copy.broadcastTo(
      ...this.broadcasts.map(
        (logger) =>
          (logger as { dup?: () => Logger }).dup?.() ??
          (Object.assign(Object.create(Object.getPrototypeOf(logger) as object), logger) as Logger),
      ),
    );
    return copy;
  }

  private dispatch(block: (logger: Logger) => void): boolean {
    this.broadcasts.forEach((logger) => block(logger));
    return true;
  }

  private methodMissing(name: string, ...args: unknown[]): unknown {
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

  private respondToMissing(method: string, includeAll: boolean): boolean {
    return this.broadcasts.some((logger) => rbObjRespondTo(logger, method, includeAll));
  }
}

BroadcastLogger.prototype.log = BroadcastLogger.prototype.add;

ActiveSupport.BroadcastLogger = BroadcastLogger;

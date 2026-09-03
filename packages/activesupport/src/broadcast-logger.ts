import { Logger, type LogLevel } from "./logger.js";
import { _setBroadcastLoggerClass } from "./broadcast-logger-slot.js";

export class BroadcastLogger extends Logger {
  public broadcasts: Logger[] = [];

  static silencer: boolean = true;

  static setSilencer(silencer: boolean): void {
    this.silencer = silencer;
  }

  constructor(...loggers: Logger[]) {
    super(null);
    this.broadcasts = [];
    this.progname = "Broadcast";

    this.broadcastTo(...loggers);
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

  add(severity: number, message?: string | null, progname?: string): boolean {
    return this.dispatch((logger) => logger.add(severity, message, progname));
  }

  log(severity: number, message?: string | (() => string), progname?: string): boolean {
    return this.dispatch((logger) => logger.log(severity, message, progname));
  }

  debug(message?: string | (() => string)): boolean {
    return this.dispatch((logger) => logger.debug(message));
  }

  info(message?: string | (() => string)): boolean {
    return this.dispatch((logger) => logger.info(message));
  }

  warn(message?: string | (() => string)): boolean {
    return this.dispatch((logger) => logger.warn(message));
  }

  error(message?: string | (() => string)): boolean {
    return this.dispatch((logger) => logger.error(message));
  }

  fatal(message?: string | (() => string)): boolean {
    return this.dispatch((logger) => logger.fatal(message));
  }

  unknown(message?: string | (() => string)): boolean {
    return this.dispatch((logger) => logger.unknown(message));
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

  private dispatch(block: (logger: Logger) => void): boolean {
    this.broadcasts.forEach((logger) => block(logger));
    return true;
  }
}

_setBroadcastLoggerClass(BroadcastLogger);

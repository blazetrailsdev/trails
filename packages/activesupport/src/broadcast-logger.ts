/**
 * ActiveSupport::BroadcastLogger — fans out log messages to multiple loggers.
 */

import { Logger, LOG_LEVELS, type LogLevel } from "./logger.js";
import { _setBroadcastLoggerClass } from "./broadcast-logger-slot.js";

export class BroadcastLogger extends Logger {
  public broadcasts: Logger[] = [];

  /**
   * `broadcast_logger.rb:71` — `include ActiveSupport::LoggerSilence` gives
   * BroadcastLogger its own `cattr_accessor :silencer` slot.
   */
  static silencer: boolean = true;

  static setSilencer(silencer: boolean): void {
    this.silencer = silencer;
  }

  constructor(...loggers: Logger[]) {
    super(null);
    this.progname = "Broadcast";
    this.broadcasts = [...loggers];
  }

  broadcastTo(...loggers: Logger[]): this {
    this.broadcasts.push(...loggers);
    return this;
  }

  stopBroadcastingTo(logger: Logger): this {
    this.broadcasts = this.broadcasts.filter((l) => l !== logger);
    return this;
  }

  get level(): number {
    if (this.broadcasts.length === 0) return this._level;
    return Math.min(...this.broadcasts.map((l) => l.level));
  }

  set level(value: number | LogLevel) {
    const lvl = typeof value === "string" ? LOG_LEVELS[value] : value;
    this._level = lvl;
    this.dispatch((logger) => {
      logger.level = lvl;
    });
  }

  /** `broadcast_logger.rb:154` — `alias_method :sev_threshold=, :level=`. */
  set sevThreshold(level: number | LogLevel) {
    this.level = level;
  }

  set localLevel(value: number | LogLevel | null) {
    const lvl = value === null ? null : typeof value === "string" ? LOG_LEVELS[value] : value;
    this.dispatch((logger) => {
      if ("localLevel" in logger) {
        logger.localLevel = lvl;
      }
    });
  }

  get localLevel(): number | null {
    return super.localLevel;
  }

  set formatter(value: any) {
    this.broadcasts.forEach((l) => {
      (l as any).formatter = value;
    });
  }

  get formatter(): any {
    return null;
  }

  add(severity: number, message?: string | null, progname?: string): boolean {
    this.broadcasts.forEach((l) => l.add(severity, message, progname));
    return true;
  }

  log(severity: number, message?: string | (() => string), progname?: string): boolean {
    const msg = typeof message === "function" ? String(message()) : message;
    this.broadcasts.forEach((l) => l.log(severity, msg, progname));
    return true;
  }

  debug(message?: string | (() => string)): boolean {
    return this.log(Logger.DEBUG, message);
  }

  info(message?: string | (() => string)): boolean {
    return this.log(Logger.INFO, message);
  }

  warn(message?: string | (() => string)): boolean {
    return this.log(Logger.WARN, message);
  }

  error(message?: string | (() => string)): boolean {
    return this.log(Logger.ERROR, message);
  }

  fatal(message?: string | (() => string)): boolean {
    return this.log(Logger.FATAL, message);
  }

  unknown(message?: string | (() => string)): boolean {
    return this.log(Logger.UNKNOWN, message);
  }

  get debugEnabled(): boolean {
    return this.broadcasts.some((l) => l.level <= Logger.DEBUG);
  }

  /** `broadcast_logger.rb:173` — sets the log level to +DEBUG+ for the whole broadcast. */
  debugBang(): void {
    this.dispatch((logger) => logger.debugBang());
  }

  get infoEnabled(): boolean {
    return this.broadcasts.some((l) => l.level <= Logger.INFO);
  }

  /** `broadcast_logger.rb:184` — sets the log level to +INFO+ for the whole broadcast. */
  infoBang(): void {
    this.dispatch((logger) => logger.infoBang());
  }

  get warnEnabled(): boolean {
    return this.broadcasts.some((l) => l.level <= Logger.WARN);
  }

  /** `broadcast_logger.rb:195` — sets the log level to +WARN+ for the whole broadcast. */
  warnBang(): void {
    this.dispatch((logger) => logger.warnBang());
  }

  get errorEnabled(): boolean {
    return this.broadcasts.some((l) => l.level <= Logger.ERROR);
  }

  /** `broadcast_logger.rb:206` — sets the log level to +ERROR+ for the whole broadcast. */
  errorBang(): void {
    this.dispatch((logger) => logger.errorBang());
  }

  get fatalEnabled(): boolean {
    return this.broadcasts.some((l) => l.level <= Logger.FATAL);
  }

  /** `broadcast_logger.rb:217` — sets the log level to +FATAL+ for the whole broadcast. */
  fatalBang(): void {
    this.dispatch((logger) => logger.fatalBang());
  }

  close(): void {
    this.dispatch((logger) => logger.close());
  }

  append(s: string): void {
    this.dispatch((logger) => logger.append(s));
  }

  /** `broadcast_logger.rb:230` — private. */
  private dispatch(block: (logger: Logger) => void): boolean {
    this.broadcasts.forEach((logger) => block(logger));
    return true;
  }
}

_setBroadcastLoggerClass(BroadcastLogger);

// BroadcastLogger predicate getters
(["debug", "info", "warn", "error", "fatal"] as LogLevel[]).forEach((name) => {
  const level = LOG_LEVELS[name];
  Object.defineProperty(BroadcastLogger.prototype, `${name}?`, {
    get() {
      return this.broadcasts.some((l: Logger) => l.level <= level);
    },
    configurable: true,
  });
});

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
    this.broadcasts = [];
    this.progname = "Broadcast";

    this.broadcastTo(...loggers);
  }

  broadcastTo(...loggers: Logger[]): this {
    this.broadcasts.push(...loggers);
    return this;
  }

  /**
   * @missingRailsCall delete — PERMANENT: Ruby Array#delete removes by value:
   *   `@broadcasts.delete(logger)` (broadcast_logger.rb:105) ports to the
   *   `filter`ed reassignment in stopBroadcastingTo — JS arrays have no
   *   delete-by-value.
   */
  stopBroadcastingTo(logger: Logger): this {
    this.broadcasts = this.broadcasts.filter((l) => l !== logger);
    return this;
  }

  /**
   * `broadcast_logger.rb:108-110` — the min over the broadcasts, with no
   * storage of its own. Ruby's `[].min` is `nil`; TS cannot widen an inherited
   * `get level(): number` to `number | null` (TS2416), so the empty broadcast
   * reads as `Math.min()`'s `Infinity` — the same "no broadcast permits this
   * severity" answer, since every `level <= SEVERITY` test it feeds is false.
   */
  get level(): number {
    return Math.min(...this.broadcasts.map((logger) => logger.level));
  }

  /** `broadcast_logger.rb:151-153` — dispatches only; stores nothing. */
  set level(level: number | LogLevel) {
    this.dispatch((logger) => {
      logger.level = level;
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

  /** `broadcast_logger.rb:145` — dispatches, then keeps its own `@formatter`. */
  set formatter(value: Logger["formatter"]) {
    this.dispatch((logger) => {
      logger.formatter = value;
    });

    this._formatter = value;
  }

  /** `broadcast_logger.rb:79` — `attr_reader :formatter`. */
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

  /**
   * `broadcast_logger.rb:167-169` — delegates to each broadcast's own
   * predicate, so a broadcast that overrides it is honoured.
   */
  get "debug?"(): boolean {
    return this.broadcasts.some((logger) => logger["debug?"]);
  }

  /** `broadcast_logger.rb:173` — sets the log level to +DEBUG+ for the whole broadcast. */
  debugBang(): void {
    this.dispatch((logger) => logger.debugBang());
  }

  /**
   * `broadcast_logger.rb:178-180` — delegates to each broadcast's own
   * predicate, so a broadcast that overrides it is honoured.
   */
  get "info?"(): boolean {
    return this.broadcasts.some((logger) => logger["info?"]);
  }

  /** `broadcast_logger.rb:184` — sets the log level to +INFO+ for the whole broadcast. */
  infoBang(): void {
    this.dispatch((logger) => logger.infoBang());
  }

  /**
   * `broadcast_logger.rb:189-191` — delegates to each broadcast's own
   * predicate, so a broadcast that overrides it is honoured.
   */
  get "warn?"(): boolean {
    return this.broadcasts.some((logger) => logger["warn?"]);
  }

  /** `broadcast_logger.rb:195` — sets the log level to +WARN+ for the whole broadcast. */
  warnBang(): void {
    this.dispatch((logger) => logger.warnBang());
  }

  /**
   * `broadcast_logger.rb:200-202` — delegates to each broadcast's own
   * predicate, so a broadcast that overrides it is honoured.
   */
  get "error?"(): boolean {
    return this.broadcasts.some((logger) => logger["error?"]);
  }

  /** `broadcast_logger.rb:206` — sets the log level to +ERROR+ for the whole broadcast. */
  errorBang(): void {
    this.dispatch((logger) => logger.errorBang());
  }

  /**
   * `broadcast_logger.rb:211-213` — delegates to each broadcast's own
   * predicate, so a broadcast that overrides it is honoured.
   */
  get "fatal?"(): boolean {
    return this.broadcasts.some((logger) => logger["fatal?"]);
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

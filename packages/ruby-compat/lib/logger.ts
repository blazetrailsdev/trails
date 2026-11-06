import { Fiber } from "./fiber.js";
import { Formatter } from "./logger/formatter.js";
import { LogDevice } from "./logger/log-device.js";
import { Severity } from "./logger/severity.js";

/** @noRailsEquivalent PERMANENT */
export type LoggerFormatter =
  | {
      bivarianceHack(severity: string, datetime: unknown, progname: unknown, msg: unknown): string;
    }["bivarianceHack"]
  | { call(severity: string, datetime: unknown, progname: unknown, msg: unknown): string };

/** @noRailsEquivalent PERMANENT */
export type Logdev = { write(message: string): unknown } | string | null;

/** @noRailsEquivalent PERMANENT */
export interface LoggerKwargs {
  level?: number | string;
  progname?: string | null;
  formatter?: LoggerFormatter | null;
  datetimeFormat?: string | null;
  binmode?: boolean;
  shiftPeriodSuffix?: string;
}

const SEV_LABEL = ["DEBUG", "INFO", "WARN", "ERROR", "FATAL", "ANY"];

/**
 * Ruby stdlib `Logger` (`vendor/ruby/v3.3.11/lib/logger.rb:370`). A Ruby Time
 * is a JS `Date` here, so a formatter is handed one.
 *
 * @noRailsEquivalent PERMANENT
 */
export class Logger {
  /** @noRailsEquivalent PERMANENT */
  static readonly DEBUG = Severity.DEBUG;
  /** @noRailsEquivalent PERMANENT */
  static readonly INFO = Severity.INFO;
  /** @noRailsEquivalent PERMANENT */
  static readonly WARN = Severity.WARN;
  /** @noRailsEquivalent PERMANENT */
  static readonly ERROR = Severity.ERROR;
  /** @noRailsEquivalent PERMANENT */
  static readonly FATAL = Severity.FATAL;
  /** @noRailsEquivalent PERMANENT */
  static readonly UNKNOWN = Severity.UNKNOWN;
  /** @noRailsEquivalent PERMANENT */
  static readonly Severity = Severity;
  /** @noRailsEquivalent PERMANENT */
  static readonly Formatter = Formatter;
  /** @noRailsEquivalent PERMANENT */
  static readonly LogDevice = LogDevice;

  /** @noRailsEquivalent PERMANENT */
  progname: string | null = null;
  protected _formatter: LoggerFormatter | null = null;
  protected logdev: LogDevice | null = null;
  private _level: number = Severity.DEBUG;
  private levelOverride = new Map<Fiber, number>();
  private defaultFormatter!: Formatter;

  /** @noRailsEquivalent PERMANENT */
  get level(): number {
    return this.levelOverride.get(Fiber.current()) ?? this._level;
  }

  /** @noRailsEquivalent PERMANENT */
  set level(severity: number | string) {
    this._level = Severity.coerce(severity);
  }

  /** @noRailsEquivalent PERMANENT */
  withLevel<T>(severity: number | string, block: () => T): T {
    const prev = this.level;
    this.levelOverride.set(Fiber.current(), Severity.coerce(severity));
    try {
      return block();
    } finally {
      if (prev != null) {
        this.levelOverride.set(Fiber.current(), prev);
      } else {
        this.levelOverride.delete(Fiber.current());
      }
    }
  }

  /** @noRailsEquivalent PERMANENT */
  set datetimeFormat(datetimeFormat: string | null) {
    this.defaultFormatter.datetimeFormat = datetimeFormat;
  }

  /** @noRailsEquivalent PERMANENT */
  get datetimeFormat(): string | null {
    return this.defaultFormatter.datetimeFormat;
  }

  /** @noRailsEquivalent PERMANENT */
  get formatter(): LoggerFormatter | null {
    return this._formatter;
  }

  /** @noRailsEquivalent PERMANENT */
  set formatter(formatter: LoggerFormatter | null) {
    this._formatter = formatter;
  }

  /** @noRailsEquivalent PERMANENT */
  get "debug?"(): boolean {
    return this.level <= Logger.DEBUG;
  }

  /** @noRailsEquivalent PERMANENT */
  debugBang(): void {
    this.level = Logger.DEBUG;
  }

  /** @noRailsEquivalent PERMANENT */
  get "info?"(): boolean {
    return this.level <= Logger.INFO;
  }

  /** @noRailsEquivalent PERMANENT */
  infoBang(): void {
    this.level = Logger.INFO;
  }

  /** @noRailsEquivalent PERMANENT */
  get "warn?"(): boolean {
    return this.level <= Logger.WARN;
  }

  /** @noRailsEquivalent PERMANENT */
  warnBang(): void {
    this.level = Logger.WARN;
  }

  /** @noRailsEquivalent PERMANENT */
  get "error?"(): boolean {
    return this.level <= Logger.ERROR;
  }

  /** @noRailsEquivalent PERMANENT */
  errorBang(): void {
    this.level = Logger.ERROR;
  }

  /** @noRailsEquivalent PERMANENT */
  get "fatal?"(): boolean {
    return this.level <= Logger.FATAL;
  }

  /** @noRailsEquivalent PERMANENT */
  fatalBang(): void {
    this.level = Logger.FATAL;
  }

  /** @noRailsEquivalent PERMANENT */
  constructor(
    logdev: Logdev,
    shiftAge: number | string | LoggerKwargs = 0,
    shiftSize = 1048576,
    {
      level = Severity.DEBUG,
      progname = null,
      formatter = null,
      datetimeFormat = null,
      binmode = false,
      shiftPeriodSuffix = "%Y%m%d",
    }: LoggerKwargs = typeof shiftAge === "object" ? shiftAge : {},
  ) {
    if (typeof shiftAge === "object") shiftAge = 0;
    this.level = level;
    this.progname = progname;
    this.defaultFormatter = new Formatter();
    this.datetimeFormat = datetimeFormat;
    this.formatter = formatter;
    this.logdev = null;
    this.levelOverride = new Map();
    if (logdev != null && logdev !== "/dev/null") {
      this.logdev = new LogDevice(logdev, {
        shiftAge: shiftAge,
        shiftSize: shiftSize,
        shiftPeriodSuffix: shiftPeriodSuffix,
        binmode: binmode,
      });
    }
  }

  /** @noRailsEquivalent PERMANENT */
  reopen(logdev: unknown = null): this {
    this.logdev?.reopen(logdev);
    return this;
  }

  /** @noRailsEquivalent PERMANENT */
  add(
    severity: number | null,
    message: unknown = null,
    progname: unknown = null,
    block?: () => unknown,
  ): boolean {
    severity ??= Logger.UNKNOWN;
    if (this.logdev == null || severity < this.level) {
      return true;
    }
    if (progname == null) {
      progname = this.progname;
    }
    if (message == null) {
      if (block !== undefined) {
        message = block();
      } else {
        message = progname;
        progname = this.progname;
      }
    }
    this.logdev.write(
      this.formatMessage(this.formatSeverity(severity), new Date(), progname, message),
    );
    return true;
  }

  /** @noRailsEquivalent PERMANENT */
  declare log: Logger["add"];

  /** @noRailsEquivalent PERMANENT */
  append(msg: string): void {
    this.logdev?.write(msg);
  }

  /** @noRailsEquivalent PERMANENT */
  debug(progname: unknown = null, block?: () => unknown): boolean {
    return this.add(Logger.DEBUG, null, progname, block);
  }

  /** @noRailsEquivalent PERMANENT */
  info(progname: unknown = null, block?: () => unknown): boolean {
    return this.add(Logger.INFO, null, progname, block);
  }

  /** @noRailsEquivalent PERMANENT */
  warn(progname: unknown = null, block?: () => unknown): boolean {
    return this.add(Logger.WARN, null, progname, block);
  }

  /** @noRailsEquivalent PERMANENT */
  error(progname: unknown = null, block?: () => unknown): boolean {
    return this.add(Logger.ERROR, null, progname, block);
  }

  /** @noRailsEquivalent PERMANENT */
  fatal(progname: unknown = null, block?: () => unknown): boolean {
    return this.add(Logger.FATAL, null, progname, block);
  }

  /** @noRailsEquivalent PERMANENT */
  unknown(progname: unknown = null, block?: () => unknown): boolean {
    return this.add(Logger.UNKNOWN, null, progname, block);
  }

  /** @noRailsEquivalent PERMANENT */
  close(): void {
    this.logdev?.close();
  }

  private formatSeverity(severity: number): string {
    return SEV_LABEL[severity] ?? "ANY";
  }

  private formatMessage(severity: string, datetime: Date, progname: unknown, msg: unknown): string {
    const formatter = this.formatter ?? this.defaultFormatter;
    return typeof formatter === "function"
      ? formatter(severity, datetime, progname, msg)
      : formatter.call(severity, datetime, progname, msg);
  }
}

Logger.prototype.log = Logger.prototype.add;

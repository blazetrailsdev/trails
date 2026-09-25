import { Process, rbInspect, sprintf, stdout } from "@blazetrails/ruby-compat";
import { Temporal, strftime } from "@blazetrails/date";
import { File } from "@blazetrails/ruby-compat";
import { ActiveSupport } from "./namespaces.js";
import { include } from "@blazetrails/ruby-compat/include";
import { LoggerThreadSafeLevel } from "./logger-thread-safe-level.js";

export type LogLevel = ":debug" | ":info" | ":warn" | ":error" | ":fatal" | ":unknown";

export const LOG_LEVELS: Record<LogLevel, number> = {
  ":debug": 0,
  ":info": 1,
  ":warn": 2,
  ":error": 3,
  ":fatal": 4,
  ":unknown": 5,
};

const LEVEL_NAMES: Record<number, string> = {
  0: "debug",
  1: "info",
  2: "warn",
  3: "error",
  4: "fatal",
  5: "unknown",
};

export interface LoggerOutput {
  write(s: string): void;
  filename?: string;
}

const defaultOutput: LoggerOutput = {
  write: (s) => {
    stdout.write(s);
  },
};

export type LoggerFormatter =
  | ((severity: string, datetime: Temporal.Instant, progname: string | null, msg: any) => string)
  | {
      call(severity: string, datetime: Temporal.Instant, progname: string | null, msg: any): string;
    };

/** @noRailsEquivalent PERMANENT */
export class Formatter {
  static readonly Format = "%.1s, [%s #%d] %5s -- %s: %s\n";
  static readonly DatetimeFormat = "%Y-%m-%dT%H:%M:%S.%6N";

  datetimeFormat: string | null;

  constructor() {
    this.datetimeFormat = null;
  }

  call(severity: string, time: Temporal.Instant, progname: string | null, msg: unknown): string {
    return sprintf(
      Formatter.Format,
      severity,
      this.formatDatetime(time),
      Process.pid,
      severity,
      progname,
      this.msg2str(msg),
    );
  }

  private formatDatetime(time: Temporal.Instant): string {
    return strftime(time, this.datetimeFormat ?? Formatter.DatetimeFormat);
  }

  private msg2str(msg: unknown): string {
    if (typeof msg === "string") {
      return msg;
    } else if (msg instanceof Error) {
      return `${msg.message} (${msg.constructor.name})\n${msg.stack ?? ""}`;
    } else {
      return rbInspect(msg);
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include LoggerThreadSafeLevel` (`logger_silence.rb:9`); the class/interface merge is how `include()` surfaces on the type side.
export class Logger {
  progname: string | null = null;
  /** @noRailsEquivalent PERMANENT */
  static Formatter = Formatter;

  protected _formatter: LoggerFormatter | null = null;
  private _defaultFormatter: Formatter;

  get datetimeFormat(): string | null {
    return this._defaultFormatter.datetimeFormat;
  }
  set datetimeFormat(datetimeFormat: string | null) {
    this._defaultFormatter.datetimeFormat = datetimeFormat;
  }

  get formatter(): LoggerFormatter | null {
    return this._formatter;
  }
  set formatter(value: LoggerFormatter | null) {
    this._formatter = value;
  }

  protected _level: number = 0;
  protected output: LoggerOutput | null;

  static silencer: boolean = true;

  static setSilencer(silencer: boolean): void {
    this.silencer = silencer;
  }

  get silencer(): boolean {
    return (this.constructor as typeof Logger).silencer;
  }

  setSilencer(silencer: boolean): void {
    (this.constructor as typeof Logger).setSilencer(silencer);
  }

  static isLoggerOutputsTo(logger: Logger, ...sources: unknown[]): boolean {
    const loggers: Logger[] =
      logger instanceof ActiveSupport.BroadcastLogger ? logger.broadcasts : [logger];

    const logdevs = loggers.map((logger) => logger.output);
    const loggerSources = logdevs
      .map((logdev) => logdev?.filename ?? logdev)
      .filter((source) => source != null);

    const normalizedLoggerSources = Logger.normalizeSources(loggerSources);
    return Logger.normalizeSources(sources).some((source) =>
      normalizedLoggerSources.includes(source),
    );
  }

  static readonly DEBUG = 0;
  static readonly INFO = 1;
  static readonly WARN = 2;
  static readonly ERROR = 3;
  static readonly FATAL = 4;
  static readonly UNKNOWN = 5;

  constructor(output: LoggerOutput | null = defaultOutput) {
    this._defaultFormatter = new Formatter();
    this.output = output;
    this._formatter ??= new SimpleFormatter();
  }

  add(
    severity: number | null,
    message: unknown = null,
    progname: unknown = null,
    block?: () => unknown,
  ): boolean {
    severity ??= Logger.UNKNOWN;
    if (this.output == null || severity < this.level) {
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
    const severityName = (LEVEL_NAMES[severity] ?? "unknown").toUpperCase();
    this.output.write(this.formatMessage(severityName, Temporal.Now.instant(), progname, message));
    return true;
  }

  declare log: Logger["add"];

  debug(progname?: unknown): boolean {
    return typeof progname === "function"
      ? this.add(Logger.DEBUG, null, null, progname as () => unknown)
      : this.add(Logger.DEBUG, null, progname);
  }

  info(progname?: unknown): boolean {
    return typeof progname === "function"
      ? this.add(Logger.INFO, null, null, progname as () => unknown)
      : this.add(Logger.INFO, null, progname);
  }

  warn(progname?: unknown): boolean {
    return typeof progname === "function"
      ? this.add(Logger.WARN, null, null, progname as () => unknown)
      : this.add(Logger.WARN, null, progname);
  }

  error(progname?: unknown): boolean {
    return typeof progname === "function"
      ? this.add(Logger.ERROR, null, null, progname as () => unknown)
      : this.add(Logger.ERROR, null, progname);
  }

  fatal(progname?: unknown): boolean {
    return typeof progname === "function"
      ? this.add(Logger.FATAL, null, null, progname as () => unknown)
      : this.add(Logger.FATAL, null, progname);
  }

  unknown(progname?: unknown): boolean {
    return typeof progname === "function"
      ? this.add(Logger.UNKNOWN, null, null, progname as () => unknown)
      : this.add(Logger.UNKNOWN, null, progname);
  }

  get "debug?"(): boolean {
    return this.level <= Logger.DEBUG;
  }
  get "info?"(): boolean {
    return this.level <= Logger.INFO;
  }
  get "warn?"(): boolean {
    return this.level <= Logger.WARN;
  }
  get "error?"(): boolean {
    return this.level <= Logger.ERROR;
  }
  get "fatal?"(): boolean {
    return this.level <= Logger.FATAL;
  }

  silence(severity: number | LogLevel = Logger.ERROR, fn?: (logger: this) => void): void {
    if (this.silencer) {
      this.logAt(severity, () => fn?.(this));
    } else {
      fn?.(this);
    }
  }

  debugBang(): void {
    this.level = Logger.DEBUG;
  }

  infoBang(): void {
    this.level = Logger.INFO;
  }

  warnBang(): void {
    this.level = Logger.WARN;
  }

  errorBang(): void {
    this.level = Logger.ERROR;
  }

  fatalBang(): void {
    this.level = Logger.FATAL;
  }

  close(): void {}

  private formatMessage(
    severity: string,
    datetime: Temporal.Instant,
    progname: unknown,
    msg: unknown,
  ): string {
    const formatter = this.formatter ?? this._defaultFormatter;
    return typeof formatter === "function"
      ? formatter(severity, datetime, progname as string | null, msg)
      : formatter.call(severity, datetime, progname as string | null, msg);
  }

  append(s: string): void {
    this.output?.write(s);
  }

  private static normalizeSources(sources: unknown[]): unknown[] {
    return sources.map((source) => {
      if (typeof (source as { path?: unknown })?.path === "string") {
        source = (source as { path: string }).path;
      }
      if (typeof source === "string" && File.isExist(source)) source = File.realpath(source);
      return source;
    });
  }
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- the class/interface merge is how `include()` surfaces on the type side. */
export interface Logger {
  get level(): number;
  set level(severity: number | LogLevel | string);
  get localLevel(): number | null;
  set localLevel(level: number | LogLevel | null);
  logAt(level: number | LogLevel, fn: () => void): void;
}
include(Logger, LoggerThreadSafeLevel);

Logger.prototype.log = Logger.prototype.add;

export class SimpleFormatter extends Formatter {
  override call(
    severity: string,
    timestamp: Temporal.Instant,
    progname: string | null,
    msg: unknown,
  ): string {
    return `${typeof msg === "string" ? msg : rbInspect(msg)}\n`;
  }
}

export function simpleFormatter(): (
  severity: string,
  timestamp: Temporal.Instant,
  progname: string | null,
  msg: unknown,
) => string {
  const fmt = new SimpleFormatter();
  return fmt.call.bind(fmt);
}

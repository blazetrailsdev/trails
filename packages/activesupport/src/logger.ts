import {
  Logger as RubyLogger,
  rbInspect,
  stdout,
  type Logdev,
  type LoggerKwargs,
} from "@blazetrails/ruby-compat";
import { File } from "@blazetrails/ruby-compat";
import { ActiveSupport } from "./namespaces.js";
import { include } from "@blazetrails/ruby-compat/include";
import { LoggerThreadSafeLevel } from "./logger-thread-safe-level.js";

export type { LoggerFormatter } from "@blazetrails/ruby-compat";

export type LogLevel = ":debug" | ":info" | ":warn" | ":error" | ":fatal" | ":unknown";

export const LOG_LEVELS: Record<LogLevel, number> = {
  ":debug": 0,
  ":info": 1,
  ":warn": 2,
  ":error": 3,
  ":fatal": 4,
  ":unknown": 5,
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

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include LoggerThreadSafeLevel` (`logger_silence.rb:9`); the class/interface merge is how `include()` surfaces on the type side.
export class Logger extends RubyLogger {
  static toString(): string {
    return "ActiveSupport::Logger";
  }

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

    const logdevs = loggers.map((logger) => logger.logdev);
    const loggerSources = logdevs
      .map((logdev) => logdev?.filename ?? logdev?.dev)
      .filter((source) => source != null);

    return Logger.normalizeSources(sources).some((source) =>
      Logger.normalizeSources(loggerSources).includes(source),
    );
  }

  constructor(
    logdev: Logdev = defaultOutput,
    shiftAge?: number | string | LoggerKwargs,
    shiftSize?: number,
    kwargs?: LoggerKwargs,
  ) {
    super(logdev, shiftAge, shiftSize, kwargs);
    this.formatter ??= new SimpleFormatter();
  }

  override get level(): number {
    return this.localLevel ?? super.level;
  }

  override set level(severity: number | LogLevel | string) {
    super.level = severity;
  }

  silence<T>(severity: number | LogLevel = Logger.ERROR, fn?: (logger: this) => T): T | undefined {
    return this.silencer ? this.logAt(severity, () => fn?.(this)) : fn?.(this);
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
  get localLevel(): number | null;
  set localLevel(level: number | LogLevel | null);
  logAt<T>(level: number | LogLevel, fn: () => T): T;
}
include(Logger, LoggerThreadSafeLevel);

export class SimpleFormatter extends RubyLogger.Formatter {
  static toString(): string {
    return "ActiveSupport::Logger::SimpleFormatter";
  }

  override call(severity: string, timestamp: unknown, progname: unknown, msg: unknown): string {
    return `${typeof msg === "string" ? msg : rbInspect(msg)}\n`;
  }
}

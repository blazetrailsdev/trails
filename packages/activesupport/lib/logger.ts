import {
  Logger as RubyLogger,
  type Logdev,
  type LoggerKwargs,
} from "@blazetrails/ruby-compat/logger";
import { rbObjId, rbInspect, rbObjRespondTo } from "@blazetrails/ruby-compat/object";
import { stdout } from "@blazetrails/ruby-compat/process-adapter";
import { File } from "@blazetrails/ruby-compat/file";
import { ActiveSupport } from "./namespaces.js";
import { include } from "@blazetrails/ruby-compat/include";
import { LoggerSilence } from "./logger-silence.js";

import type { BroadcastLogger } from "./broadcast-logger.js";

export type { LoggerFormatter } from "@blazetrails/ruby-compat/logger";

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

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include LoggerSilence` (`logger.rb:9`); the class/interface merge is how `include()` surfaces on the type side.
export class Logger extends RubyLogger {
  declare static silencer: boolean;
  /** @internal */
  declare protected localLevelKey: string;

  static isLoggerOutputsTo(logger: Logger | BroadcastLogger, ...sources: unknown[]): boolean {
    const loggers: (Logger | BroadcastLogger)[] =
      logger instanceof ActiveSupport.BroadcastLogger ? logger.broadcasts : [logger];

    const logdevs = loggers.map((logger) => (logger as { logdev?: Logger["logdev"] }).logdev);
    const loggerSources = logdevs
      .map((logdev) => logdev?.filename ?? logdev?.dev)
      .filter((source) => source != null);

    return Logger.normalizeSources(sources).some((source) =>
      Logger.normalizeSources(loggerSources).includes(source),
    );
  }

  /** @inlinedFrom ActiveSupport::LoggerThreadSafeLevel#initialize rails/v8.0.5.2/activesupport/lib/active_support/logger_thread_safe_level.rb:10-13 */
  constructor(
    logdev: Logdev = defaultOutput,
    shiftAge?: number | string | LoggerKwargs,
    shiftSize?: number,
    kwargs?: LoggerKwargs,
  ) {
    super(logdev, shiftAge, shiftSize, kwargs);
    this.localLevelKey = `logger_thread_safe_level_${rbObjId(this)}`;
    this.formatter ??= new SimpleFormatter();
  }

  override get level(): number {
    return this.localLevel ?? super.level;
  }

  override set level(severity: number | LogLevel | string) {
    super.level = severity;
  }

  private static normalizeSources(sources: unknown[]): unknown[] {
    return sources.map((source) => {
      if (rbObjRespondTo(source, "path")) source = (source as { path(): unknown }).path();
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
  silencer: boolean;
  silence<T>(severity?: number | LogLevel, fn?: (logger: this) => T): T | undefined;
}
include(Logger, LoggerSilence);

ActiveSupport.Logger = Logger;

export class SimpleFormatter extends RubyLogger.Formatter {
  override call(severity: string, timestamp: unknown, progname: unknown, msg: unknown): string {
    return `${typeof msg === "string" ? msg : rbInspect(msg)}\n`;
  }
}

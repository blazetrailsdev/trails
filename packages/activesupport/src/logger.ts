import { stdout } from "@blazetrails/ruby-compat";
import { Temporal } from "@blazetrails/date";
import { File } from "@blazetrails/ruby-compat";
import { BroadcastLoggerClass } from "./broadcast-logger-slot.js";
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

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include LoggerThreadSafeLevel` (`logger_silence.rb:9`); the class/interface merge is how `include()` surfaces on the type side.
export class Logger {
  progname: string = "trails";
  protected _formatter:
    | ((severity: string, datetime: Temporal.Instant, progname: string, msg: string) => string)
    | null = null;
  get formatter():
    | ((severity: string, datetime: Temporal.Instant, progname: string, msg: string) => string)
    | null {
    return this._formatter;
  }
  set formatter(
    value:
      | ((severity: string, datetime: Temporal.Instant, progname: string, msg: string) => string)
      | null,
  ) {
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
      BroadcastLoggerClass !== null && logger instanceof BroadcastLoggerClass
        ? logger.broadcasts
        : [logger];

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
    this.output = output;
  }

  add(severity: number, message?: string | null, progname?: string): boolean {
    if (severity < this.level) return true;
    let msg: string;
    let formatterProgname: string;
    if (message != null) {
      msg = String(message);
      formatterProgname = progname ?? this.progname;
    } else {
      msg = progname ?? this.progname;
      formatterProgname = this.progname;
    }
    const severityName = (LEVEL_NAMES[severity] ?? "unknown").toUpperCase();
    const line = this.formatter
      ? this.formatter(severityName, Temporal.Now.instant(), formatterProgname, msg)
      : `${msg}\n`;
    this.output?.write(line);
    return true;
  }

  log(severity: number, message?: string | (() => string), progname?: string): boolean {
    if (severity < this.level) return true;
    const msg = typeof message === "function" ? String(message()) : message;
    return this.add(severity, msg, progname);
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

interface TaggedFormatter {
  tagged(...tags: string[]): this;
  push(...tags: string[]): void;
  pop(): string | undefined;
  clearTags(): void;
  currentTags: string[];
  formatMessage(msg: string): string;
}

export interface TaggedLogger extends Logger {
  tagged(
    ...tags: (string | string[] | null | undefined | ((logger: TaggedLogger) => void))[]
  ): TaggedLogger;
  pushTags(...tags: (string | string[] | null | undefined)[]): string[];
  popTags(count?: number): string[];
  clearTags(): string[];
  flush(): void;
  currentTags: string[];
}

function flattenTags(tags: (string | string[] | null | undefined)[]): string[] {
  const result: string[] = [];
  for (const t of tags) {
    if (Array.isArray(t)) {
      result.push(...flattenTags(t));
    } else if (t != null && String(t).trim() !== "") {
      result.push(String(t));
    }
  }
  return result;
}

export function taggedLogging(logger: Logger): TaggedLogger {
  return makeTaggedProxy(logger, []);
}

function makeTaggedProxy(logger: Logger, ownTags: string[]): TaggedLogger {
  const tagStack: string[] = [...ownTags];

  function formatMsg(msg: string): string {
    if (tagStack.length === 0) return msg;
    const prefix = tagStack.map((t) => `[${t}]`).join(" ");
    return `${prefix} ${msg}`;
  }

  function logMsg(severity: number, message?: string | (() => string)): boolean {
    if (severity < logger.level) return true;
    const raw = typeof message === "function" ? String(message()) : message;
    const msg = raw != null ? formatMsg(raw) : undefined;
    return logger.add(severity, msg);
  }

  const proxy: any = {
    get level() {
      return logger.level;
    },
    set level(v: any) {
      logger.level = v;
    },
    get localLevel() {
      return logger.localLevel;
    },
    set localLevel(v: any) {
      logger.localLevel = v;
    },
    get progname() {
      return logger.progname;
    },
    set progname(v: any) {
      logger.progname = v;
    },
    get formatter() {
      return (logger as any).formatter;
    },
    set formatter(v: any) {
      (logger as any).formatter = v;
    },

    add(severity: number, message?: string | null, _progname?: string): boolean {
      const msg = message != null ? formatMsg(String(message)) : undefined;
      return logger.add(severity, msg);
    },

    debug(message?: string | (() => string)): boolean {
      return logMsg(Logger.DEBUG, message);
    },
    info(message?: string | (() => string)): boolean {
      return logMsg(Logger.INFO, message);
    },
    warn(message?: string | (() => string)): boolean {
      return logMsg(Logger.WARN, message);
    },
    error(message?: string | (() => string)): boolean {
      return logMsg(Logger.ERROR, message);
    },
    fatal(message?: string | (() => string)): boolean {
      return logMsg(Logger.FATAL, message);
    },
    unknown(message?: string | (() => string)): boolean {
      return logMsg(Logger.UNKNOWN, message);
    },

    silence(tempLevel: any = Logger.ERROR, fn?: () => void): void {
      (logger as any).silence(tempLevel, fn);
    },
    close(): void {
      logger.close();
    },

    get currentTags(): string[] {
      return [...tagStack];
    },

    pushTags(...rawTags: (string | string[] | null | undefined)[]): string[] {
      const flat = flattenTags(rawTags);
      tagStack.push(...flat);
      return flat;
    },

    popTags(count = 1): string[] {
      return tagStack.splice(tagStack.length - count, count);
    },

    clearTags(): string[] {
      tagStack.splice(0, tagStack.length);
      return [];
    },

    flush(): void {
      tagStack.splice(0, tagStack.length);
      if (typeof (logger as any).flush === "function") {
        (logger as any).flush();
      }
    },

    tagged(
      ...rawTags: (string | string[] | null | undefined | ((logger: TaggedLogger) => void))[]
    ): TaggedLogger {
      const lastArg = rawTags[rawTags.length - 1];
      const hasBlock = typeof lastArg === "function";
      const tagArgs = (hasBlock ? rawTags.slice(0, -1) : rawTags) as (
        | string
        | string[]
        | null
        | undefined
      )[];
      const flat = flattenTags(tagArgs);

      if (hasBlock) {
        tagStack.push(...flat);
        try {
          (lastArg as (logger: TaggedLogger) => void)(proxy as TaggedLogger);
        } finally {
          tagStack.splice(tagStack.length - flat.length, flat.length);
        }
        return proxy as TaggedLogger;
      }

      return makeTaggedProxy(logger, [...tagStack, ...flat]);
    },
  };

  (["debug", "info", "warn", "error", "fatal"] as const).forEach((name) => {
    const level = LOG_LEVELS[`:${name}`];
    Object.defineProperty(proxy, `${name}?`, {
      get() {
        return logger.level <= level;
      },
      configurable: true,
    });
  });

  return proxy as TaggedLogger;
}

taggedLogging.logger = function (output: LoggerOutput): TaggedLogger {
  const logger = new Logger(output);
  return taggedLogging(logger);
};

export class SimpleFormatter {
  call(
    _severity: string,
    _timestamp: Temporal.Instant,
    _progname: string | null,
    msg: string,
  ): string {
    return `${msg}\n`;
  }
}

export function simpleFormatter(): (
  severity: string,
  timestamp: Temporal.Instant,
  progname: string | null,
  msg: string,
) => string {
  const fmt = new SimpleFormatter();
  return fmt.call.bind(fmt);
}

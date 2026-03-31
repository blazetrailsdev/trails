/**
 * Logger and TaggedLogging — mirroring ActiveSupport's logging API.
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal" | "unknown";

export const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
  unknown: 5,
};

const LEVEL_NAMES: Record<number, LogLevel> = {
  0: "debug",
  1: "info",
  2: "warn",
  3: "error",
  4: "fatal",
  5: "unknown",
};

export interface LoggerOutput {
  write(s: string): void;
}

/**
 * ActiveSupport::Logger — a structured logger with level filtering, silence blocks,
 * and formatter support. Mirrors the Rails API as closely as TypeScript allows.
 */
export class Logger {
  progname: string = "trails";
  protected _formatter:
    | ((severity: string, datetime: Date, progname: string, msg: string) => string)
    | null = null;
  get formatter():
    | ((severity: string, datetime: Date, progname: string, msg: string) => string)
    | null {
    return this._formatter;
  }
  set formatter(
    value: ((severity: string, datetime: Date, progname: string, msg: string) => string) | null,
  ) {
    this._formatter = value;
  }

  protected _level: number = 0; // DEBUG
  protected _localLevel: number | null = null;
  protected output: LoggerOutput | null;

  static readonly DEBUG = 0;
  static readonly INFO = 1;
  static readonly WARN = 2;
  static readonly ERROR = 3;
  static readonly FATAL = 4;
  static readonly UNKNOWN = 5;

  constructor(output: LoggerOutput | null = { write: (s) => process.stdout.write(s) }) {
    this.output = output;
  }

  get level(): number {
    return this._localLevel !== null ? this._localLevel : this._level;
  }

  set level(value: number | LogLevel) {
    if (typeof value === "string") {
      this._level = LOG_LEVELS[value];
    } else {
      this._level = value;
    }
  }

  get localLevel(): number | null {
    return this._localLevel;
  }

  set localLevel(value: number | LogLevel | null) {
    if (value === null) {
      this._localLevel = null;
    } else if (typeof value === "string") {
      this._localLevel = LOG_LEVELS[value];
    } else {
      this._localLevel = value;
    }
  }

  add(severity: number, message?: string | null, progname?: string): boolean {
    if (severity < this.level) return true;
    const msg = message != null ? String(message) : (progname ?? this.progname);
    const severityName = (LEVEL_NAMES[severity] ?? "unknown").toUpperCase();
    const line = this.formatter
      ? this.formatter(severityName, new Date(), this.progname, msg)
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

  get debugEnabled(): boolean {
    return this.level <= Logger.DEBUG;
  }
  get infoEnabled(): boolean {
    return this.level <= Logger.INFO;
  }
  get warnEnabled(): boolean {
    return this.level <= Logger.WARN;
  }
  get errorEnabled(): boolean {
    return this.level <= Logger.ERROR;
  }
  get fatalEnabled(): boolean {
    return this.level <= Logger.FATAL;
  }

  silence(tempLevel: number | LogLevel = Logger.ERROR, fn?: () => void): void {
    const prevLocal = this._localLevel;
    const lvl = typeof tempLevel === "string" ? LOG_LEVELS[tempLevel] : tempLevel;
    this._localLevel = lvl;
    try {
      fn?.();
    } finally {
      this._localLevel = prevLocal;
    }
  }

  logAt(level: number | LogLevel, fn: () => void): void {
    const prevLocal = this._localLevel;
    const lvl = typeof level === "string" ? LOG_LEVELS[level] : level;
    this._localLevel = lvl;
    try {
      fn();
    } finally {
      this._localLevel = prevLocal;
    }
  }

  close(): void {
    // no-op for in-memory; file loggers would close here
  }

  append(s: string): void {
    this.output?.write(s);
  }
}

// Add convenience predicate methods (debug?, info?, etc.)
(["debug", "info", "warn", "error", "fatal"] as LogLevel[]).forEach((name) => {
  const level = LOG_LEVELS[name];
  Object.defineProperty(Logger.prototype, `${name}?`, {
    get() {
      return this.level <= level;
    },
    configurable: true,
  });
});

/**
 * TaggedLogging — wraps a Logger to prepend tags to messages.
 * Mirrors ActiveSupport::TaggedLogging.
 */

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

/**
 * Creates a tagged logger that wraps the given logger.
 * Each instance has its own isolated tag stack. Calling tagged() returns a new
 * independent proxy with additional tags — the parent's stack is unaffected.
 */
export function taggedLogging(logger: Logger): TaggedLogger {
  return makeTaggedProxy(logger, []);
}

function makeTaggedProxy(logger: Logger, ownTags: string[]): TaggedLogger {
  // mutable stack local to this proxy instance
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

    /**
     * Without a block: returns a NEW independent proxy that includes the
     * current tags plus the new ones (tagStack is NOT modified).
     *
     * With a block (last arg is a function): pushes tags, calls the block
     * with the tagged logger, then pops tags.
     */
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

  (["debug", "info", "warn", "error", "fatal"] as LogLevel[]).forEach((name) => {
    const level = LOG_LEVELS[name];
    Object.defineProperty(proxy, `${name}?`, {
      get() {
        return logger.level <= level;
      },
      configurable: true,
    });
  });

  return proxy as TaggedLogger;
}

/**
 * Convenience factory — creates a new Logger writing to the given output and
 * wraps it with TaggedLogging.
 */
taggedLogging.logger = function (output: LoggerOutput): TaggedLogger {
  const logger = new Logger(output);
  return taggedLogging(logger);
};

export class SimpleFormatter {
  call(_severity: string, _timestamp: Date, _progname: string | null, msg: string): string {
    return `${msg}\n`;
  }
}

export function simpleFormatter(): (
  severity: string,
  timestamp: Date,
  progname: string | null,
  msg: string,
) => string {
  const fmt = new SimpleFormatter();
  return fmt.call.bind(fmt);
}

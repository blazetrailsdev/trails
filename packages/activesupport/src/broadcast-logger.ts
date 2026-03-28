/**
 * ActiveSupport::BroadcastLogger — fans out log messages to multiple loggers.
 */

import { Logger, LOG_LEVELS, type LogLevel } from "./logger.js";

export class BroadcastLogger extends Logger {
  public broadcasts: Logger[] = [];

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
    this.broadcasts.forEach((l) => {
      l.level = lvl;
    });
  }

  set localLevel(value: number | LogLevel | null) {
    const lvl = value === null ? null : typeof value === "string" ? LOG_LEVELS[value] : value;
    this._localLevel = lvl;
    this.broadcasts.forEach((l) => {
      l.localLevel = lvl;
    });
  }

  get localLevel(): number | null {
    return this._localLevel;
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
  get infoEnabled(): boolean {
    return this.broadcasts.some((l) => l.level <= Logger.INFO);
  }
  get warnEnabled(): boolean {
    return this.broadcasts.some((l) => l.level <= Logger.WARN);
  }
  get errorEnabled(): boolean {
    return this.broadcasts.some((l) => l.level <= Logger.ERROR);
  }
  get fatalEnabled(): boolean {
    return this.broadcasts.some((l) => l.level <= Logger.FATAL);
  }

  silence(tempLevel: number | LogLevel = Logger.ERROR, fn?: () => void): void {
    const lvl = typeof tempLevel === "string" ? LOG_LEVELS[tempLevel] : tempLevel;
    const prevLevels = this.broadcasts.map((l) => l.localLevel);
    this.broadcasts.forEach((l) => {
      if (typeof (l as any).silence === "function") {
        // will be handled by nesting
      }
      l.localLevel = lvl;
    });
    try {
      fn?.();
    } finally {
      this.broadcasts.forEach((l, i) => {
        l.localLevel = prevLevels[i];
      });
    }
  }

  close(): void {
    this.broadcasts.forEach((l) => l.close());
  }

  append(s: string): void {
    this.broadcasts.forEach((l) => l.append(s));
  }
}

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

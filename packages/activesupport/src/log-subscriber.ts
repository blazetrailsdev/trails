import { Subscriber, getClassState } from "./subscriber.js";
import type { Event } from "./notifications/instrumenter.js";
import type { Logger } from "./logger.js";

/**
 * Check whether a logger has a given level enabled.
 * Rails' LEVEL_CHECKS call `logger.debug?`, `logger.info?`, etc.
 * Our Logger class defines these as getter properties (`get "debug?"()`),
 * but Base.logger can be a simple duck-typed object without them.
 * Treat missing predicates as "enabled" (not silenced) so logging
 * isn't suppressed for valid loggers that lack ActiveSupport predicates.
 */
function isLevelEnabled(logger: Logger, level: string): boolean {
  // Try Rails-style predicate getter: `debug?`, `info?`, etc.
  const predicate = (logger as any)[`${level}?`];
  if (typeof predicate === "boolean") return predicate;

  // Try camelCase flag: `debugEnabled`, `infoEnabled`, etc.
  const flag = (logger as any)[`${level}Enabled`];
  if (typeof flag === "boolean") return flag;

  // Try numeric level comparison (Logger.DEBUG=0, INFO=1, etc.)
  if (typeof (logger as any).level === "number") {
    const priorities: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3, fatal: 4 };
    const required = priorities[level];
    if (required !== undefined) return (logger as any).level <= required;
  }

  // No way to tell — assume enabled (don't suppress logging)
  return true;
}

/**
 * ActiveSupport::LogSubscriber — a Subscriber that dispatches events
 * to a logger. Provides ANSI coloring helpers and log-level gating.
 *
 * Subclasses define methods like `sql(event)` and call `info()`/`debug()`
 * from them. `attachTo` wires up the subscription.
 */
export class LogSubscriber extends Subscriber {
  // -- ANSI color constants ------------------------------------------------

  static readonly MODES: Record<string, number> = {
    clear: 0,
    bold: 1,
    italic: 3,
    underline: 4,
  };

  static readonly BLACK = "\x1b[30m";
  static readonly RED = "\x1b[31m";
  static readonly GREEN = "\x1b[32m";
  static readonly YELLOW = "\x1b[33m";
  static readonly BLUE = "\x1b[34m";
  static readonly MAGENTA = "\x1b[35m";
  static readonly CYAN = "\x1b[36m";
  static readonly WHITE = "\x1b[37m";

  // -- Class-level config --------------------------------------------------

  static colorizeLogging = true;

  /**
   * Per-class map of method → level-check function.
   * Uses class_attribute semantics: each subclass gets its own copy
   * when subscribeLogLevel is called, so AR LogSubscriber's levels
   * don't bleed into ActionController LogSubscriber's levels.
   */
  static get logLevels(): Map<string, (logger: Logger) => boolean> {
    const state = getClassState(this) as any;
    if (!state._logLevels) {
      // class_attribute semantics: inherit parent's levels on first access
      const parent = Object.getPrototypeOf(this) as typeof LogSubscriber | undefined;
      state._logLevels =
        parent && typeof parent === "function" && "logLevels" in parent
          ? new Map(parent.logLevels)
          : new Map();
    }
    return state._logLevels;
  }

  static set logLevels(value: Map<string, (logger: Logger) => boolean>) {
    (getClassState(this) as any)._logLevels = value;
  }

  static readonly LEVEL_CHECKS: Record<string, (logger: Logger) => boolean> = {
    debug: (logger) => !isLevelEnabled(logger, "debug"),
    info: (logger) => !isLevelEnabled(logger, "info"),
    error: (logger) => !isLevelEnabled(logger, "error"),
  };

  private static _logger: Logger | null = null;

  static get logger(): Logger | null {
    return this._logger;
  }

  static set logger(value: Logger | null) {
    this._logger = value;
  }

  static logSubscribers(): Subscriber[] {
    return this.subscribers;
  }

  static flushAllBang(): void {
    const l = this.logger;
    if (l && typeof (l as any).flush === "function") {
      (l as any).flush();
    }
  }

  static attachTo(
    namespace: string,
    subscriber?: Subscriber,
    notifier?: any,
    options?: { inheritAll?: boolean },
  ): Subscriber {
    const result = super.attachTo(namespace, subscriber, notifier, options);
    this._setEventLevels();
    return result;
  }

  /**
   * Register a log-level gate for a method. When the logger level is above
   * the gate, events for that method are silenced.
   */
  static subscribeLogLevel(method: string, level: string): void {
    const check = this.LEVEL_CHECKS[level];
    if (!check) throw new Error(`Unknown level check: ${level}`);
    this.logLevels.set(method, check);
    this._setEventLevels();
  }

  protected static override _fetchPublicMethods(
    subscriber: Subscriber,
    inheritAll: boolean,
  ): string[] {
    // Exclude LogSubscriber's own instance methods, matching Rails'
    // `subscriber.public_methods(inherit_all) - LogSubscriber.public_instance_methods(true)`
    const baseKeys = new Set([
      ...Object.getOwnPropertyNames(Subscriber.prototype),
      ...Object.getOwnPropertyNames(LogSubscriber.prototype),
    ]);
    const keys = new Set<string>();
    let proto = Object.getPrototypeOf(subscriber);

    while (
      proto &&
      proto !== LogSubscriber.prototype &&
      proto !== Subscriber.prototype &&
      proto !== Object.prototype
    ) {
      for (const key of Object.getOwnPropertyNames(proto)) {
        if (
          key !== "constructor" &&
          !key.startsWith("_") &&
          !baseKeys.has(key) &&
          typeof (subscriber as any)[key] === "function"
        ) {
          keys.add(key);
        }
      }
      if (!inheritAll) break;
      proto = Object.getPrototypeOf(proto);
    }

    return Array.from(keys).map((k) => k.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase());
  }

  private static _setEventLevels(): void {
    // Rails: `subscriber.event_levels = log_levels.transform_keys { |k| "#{k}.#{namespace}" }`
    // Only updates the subscriber from the most recent attachTo call.
    const state = getClassState(this);
    const sub = state.subscriber as LogSubscriber | undefined;
    if (!sub) return;
    const levels = new Map<string, (logger: Logger) => boolean>();
    for (const [k, v] of this.logLevels) {
      levels.set(`${k}.${state.namespace}`, v);
    }
    sub.eventLevels = levels;
  }

  // -- Instance state ------------------------------------------------------

  eventLevels: Map<string, (logger: Logger) => boolean> = new Map();

  get logger(): Logger | null {
    return (this.constructor as typeof LogSubscriber).logger;
  }

  get colorizeLogging(): boolean {
    return (this.constructor as typeof LogSubscriber).colorizeLogging;
  }

  set colorizeLogging(value: boolean) {
    (this.constructor as typeof LogSubscriber).colorizeLogging = value;
  }

  silenced(event: Event | string): boolean {
    const l = this.logger;
    if (!l) return true;
    const name = typeof event === "string" ? event : event.name;
    const check = this.eventLevels.get(name);
    return check ? check(l) : false;
  }

  override call(event: Event): void {
    if (!this.logger) return;
    if (this.silenced(event)) return;
    try {
      super.call(event);
    } catch (e: any) {
      this._logException(event.name, e);
    }
  }

  override publishEvent(event: Event): void {
    if (!this.logger) return;
    if (this.silenced(event)) return;
    try {
      super.publishEvent(event);
    } catch (e: any) {
      this._logException(event.name, e);
    }
  }

  // -- Logging helpers (instance, proxied to logger) -----------------------

  protected _info(message?: string | (() => string)): boolean {
    const l = this.logger;
    if (!l) return false;
    return l.info(message);
  }

  protected _debug(message?: string | (() => string)): boolean {
    const l = this.logger;
    if (!l) return false;
    return l.debug(message);
  }

  protected _warn(message?: string | (() => string)): boolean {
    const l = this.logger;
    if (!l) return false;
    return l.warn(message);
  }

  protected _error(message?: string | (() => string)): boolean {
    const l = this.logger;
    if (!l) return false;
    return l.error(message);
  }

  protected _fatal(message?: string | (() => string)): boolean {
    const l = this.logger;
    if (!l) return false;
    return l.fatal(message);
  }

  protected _unknown(message?: string | (() => string)): boolean {
    const l = this.logger;
    if (!l) return false;
    return l.unknown(message);
  }

  // -- Color helper --------------------------------------------------------

  protected color(
    text: string,
    colorValue: string | symbol,
    modeOptions: Record<string, boolean> = {},
  ): string {
    if (!this.colorizeLogging) return text;
    let c: string;
    if (typeof colorValue === "string" && colorValue.startsWith("\x1b")) {
      c = colorValue;
    } else {
      const name = String(colorValue).toUpperCase();
      c = (this.constructor as any)[name] ?? "";
    }
    const mode = this._modeFrom(modeOptions);
    const clear = `\x1b[${LogSubscriber.MODES.clear}m`;
    return `${mode}${c}${text}${clear}`;
  }

  private _modeFrom(options: Record<string, boolean>): string {
    const modes: number[] = [];
    for (const [key, val] of Object.entries(options)) {
      if (val && LogSubscriber.MODES[key] !== undefined) {
        modes.push(LogSubscriber.MODES[key]);
      }
    }
    if (modes.length === 0) return "";
    return `\x1b[${modes.join(";")}m`;
  }

  private _logException(name: string, e: Error): void {
    const l = this.logger;
    if (l) {
      l.error(
        `Could not log ${JSON.stringify(name)} event. ${e.constructor.name}: ${e.message} ${e.stack}`,
      );
    }
  }
}

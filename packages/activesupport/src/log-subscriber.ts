import { Subscriber, getClassState } from "./subscriber.js";
import type { Event } from "./notifications/instrumenter.js";
import type { Logger } from "./logger.js";
import { trailsLogger } from "./trails-logger-slot.js";
import { transformKeys } from "./hash-utils.js";
import { publicInstanceMethods } from "@blazetrails/ruby-compat/include";

export class LogSubscriber extends Subscriber {
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

  static colorizeLogging = true;

  static get logLevels(): Map<string, (logger: Logger) => boolean> {
    const state = getClassState(this) as any;
    if (!state._logLevels) {
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
    debug: (logger) => !logger["debug?"],
    info: (logger) => !logger["info?"],
    error: (logger) => !logger["error?"],
  };

  private static _logger: Logger | null = null;

  static get logger(): Logger | null {
    return (this._logger ??= trailsLogger as Logger | null);
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
   * @internal
   * @missingRailsCall merge — PERMANENT
   */
  static subscribeLogLevel(method: string, level: string): void {
    const check = this.LEVEL_CHECKS[level];
    if (!check) throw new Error(`Unknown level check: ${level}`);
    this.logLevels.set(method, check);
    this._setEventLevels();
  }

  /** @missingRailsArgs public_instance_methods — PERMANENT */
  protected static override _fetchPublicMethods(
    subscriber: Subscriber,
    inheritAll: boolean,
  ): string[] {
    const baseKeys = new Set(publicInstanceMethods(LogSubscriber, true));
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
    const state = getClassState(this);
    const sub = state.subscriber as LogSubscriber | undefined;
    if (!sub) return;
    sub.eventLevels = transformKeys(this.logLevels, (k) => `${k}.${state.namespace}`);
  }

  eventLevels: Map<string, (logger: Logger) => boolean> = new Map();

  get logger(): Logger | null {
    return LogSubscriber.logger;
  }

  get colorizeLogging(): boolean {
    return (this.constructor as typeof LogSubscriber).colorizeLogging;
  }

  set colorizeLogging(value: boolean) {
    (this.constructor as typeof LogSubscriber).colorizeLogging = value;
  }

  /** @missingRailsCall call — PERMANENT */
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

  protected color(
    text: string,
    color: string | symbol,
    modeOptions: Record<string, boolean> = {},
  ): string {
    if (!this.colorizeLogging) return text;
    let c: string;
    if (typeof color === "string" && color.startsWith("\x1b")) {
      c = color;
    } else {
      const name = String(color).toUpperCase();
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

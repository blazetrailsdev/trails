import { wrap } from "./array-utils.js";
import { currentErrorReporter } from "./error-reporter.js";
import { deprecateMethods } from "./deprecation/method-wrappers.js";
import { ArgumentError } from "./hash-utils.js";
import { underscore } from "./inflector.js";
import { Logger } from "./logger.js";
import { Notifications } from "./notifications.js";
import { stderr } from "@blazetrails/ruby-compat";
import { trailsLogger } from "./trails-logger-slot.js";
import { ThreadLocalVar } from "./thread-local-var.js";

export type DeprecationBehavior = "raise" | "stderr" | "log" | "silence" | "notify" | "report";

export type DeprecationBehaviorCallable = (
  message: string,
  callstack: unknown[],
  deprecator: Deprecation,
) => void;

export class DeprecationException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeprecationException";
  }
}

export const DEFAULT_BEHAVIORS: Readonly<Record<DeprecationBehavior, DeprecationBehaviorCallable>> =
  {
    raise: (message, callstack, deprecator) => {
      const e = new DeprecationException(message);
      e.stack = callstack.map((l) => String(l)).join("\n");
      throw e;
    },

    stderr: (message, callstack, deprecator) => {
      stderr.write(message + "\n");
      if (deprecator.debug) stderr.write(callstack.join("\n  ") + "\n");
    },

    log: (message, callstack, deprecator) => {
      const logger = trailsLogger ?? new Logger(stderr);
      logger.warn(message);
      if (deprecator.debug) logger.debug(callstack.join("\n  "));
    },

    notify: (message, callstack, deprecator) => {
      Notifications.instrument(
        `deprecation.${underscore(deprecator.gemName).replace(/\//g, "_")}`,
        {
          message,
          callstack,
          gemName: deprecator.gemName,
          deprecationHorizon: deprecator.deprecationHorizon,
        },
      );
    },

    silence: (message, callstack, deprecator) => {},

    report: (message, callstack, deprecator) => {
      const error = new DeprecationException(message);
      error.stack = callstack.map((l) => String(l)).join("\n");
      currentErrorReporter.report(error);
    },
  };

type DeprecationBehaviorItem = DeprecationBehavior | ((...args: never[]) => void);

export type DeprecationBehaviorInput = DeprecationBehaviorItem | DeprecationBehaviorItem[] | null;

function arityCoerce(behavior: unknown): DeprecationBehaviorCallable {
  if (typeof behavior !== "function") {
    const inspected = typeof behavior === "string" ? `:${behavior}` : String(behavior);
    throw new ArgumentError(`${inspected} is not a valid deprecation behavior.`);
  }

  switch (arityOfCallable(behavior)) {
    case 2:
      return (message, callstack) => {
        behavior(message, callstack);
      };
    case 0:
    case 1:
    case 3:
      return behavior as DeprecationBehaviorCallable;
    default:
      return (message, callstack, deprecator) => {
        behavior(message, callstack, deprecator.deprecationHorizon, deprecator.gemName);
      };
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
function arityOfCallable(callable: Function): number {
  return callable.length;
}

type AllowMatcher = string | RegExp;

/** @noRailsEquivalent PERMANENT */
export interface CallerLocation {
  path: string;
  absolutePath?: string;
  lineno: number;
  label: string;
  toString(): string;
}

/** @noRailsEquivalent PERMANENT */
export function callerLocations(start = 1): CallerLocation[] {
  const stack = new Error().stack;
  if (stack == null) return [];
  return stack
    .split("\n")
    .slice(1 + start)
    .flatMap((line) => {
      const m = /\((.*):(\d+):\d+\)$|at (.*):(\d+):\d+$/.exec(line.trim());
      if (!m) return [];
      const path = m[1] ?? m[3];
      const lineno = Number(m[2] ?? m[4]);
      const label = /at ([^ (]+)/.exec(line.trim())?.[1] ?? "";
      return [{ path, lineno, label, toString: () => `${path}:${lineno}:in '${label}'` }];
    });
}

const TRAILS_GEM_ROOT = new URL(".", import.meta.url).pathname;

export class Deprecation {
  static _instance(): Deprecation {
    return (Deprecation.__instance ??= new Deprecation());
  }

  private static __instance?: Deprecation;

  deprecateMethods = deprecateMethods;

  private _behavior?: DeprecationBehaviorCallable[];
  private _disallowedBehavior?: DeprecationBehaviorCallable[];
  private _silenced = false;
  gemName: string;
  deprecationHorizon: string;
  debug = false;
  disallowedWarnings: AllowMatcher[] | ":all" = [];

  private _silenceCounter = new ThreadLocalVar(0);
  private _explicitlyAllowedWarnings = new ThreadLocalVar<AllowMatcher[] | ":all" | null>(null);

  get behavior(): DeprecationBehaviorCallable[] {
    return (this._behavior ??= [DEFAULT_BEHAVIORS.stderr]);
  }

  set behavior(behavior: DeprecationBehaviorInput) {
    this._behavior = wrap<DeprecationBehaviorItem>(behavior).map(
      (b) =>
        (typeof b === "string" && Object.hasOwn(DEFAULT_BEHAVIORS, b)
          ? DEFAULT_BEHAVIORS[b]
          : undefined) ?? arityCoerce(b),
    );
  }

  get disallowedBehavior(): DeprecationBehaviorCallable[] {
    return (this._disallowedBehavior ??= [DEFAULT_BEHAVIORS.raise]);
  }

  set disallowedBehavior(behavior: DeprecationBehaviorInput) {
    this._disallowedBehavior = wrap<DeprecationBehaviorItem>(behavior).map(
      (b) =>
        (typeof b === "string" && Object.hasOwn(DEFAULT_BEHAVIORS, b)
          ? DEFAULT_BEHAVIORS[b]
          : undefined) ?? arityCoerce(b),
    );
  }

  get silenced(): boolean {
    return this._silenced || this._silenceCounter.value !== 0;
  }

  set silenced(silenced: boolean) {
    this._silenced = silenced;
  }

  constructor(deprecationHorizon = "8.1", gemName = "Rails") {
    this.gemName = gemName;
    this.deprecationHorizon = deprecationHorizon;
    this.silenced = false;
    this.debug = false;
  }

  warn(message?: string, callstack?: CallerLocation[]): string | undefined {
    if (this.silenced) return;

    callstack ??= callerLocations(2);
    const fullMessage = this.deprecationMessage(callstack, message);
    if (this.isDeprecationDisallowed(message)) {
      for (const b of this.disallowedBehavior) b(fullMessage, callstack, this);
    } else {
      for (const b of this.behavior) b(fullMessage, callstack, this);
    }
    return fullMessage;
  }

  deprecationWarning(
    deprecatedMethodName: string,
    message?: string,
    callerBacktrace?: CallerLocation[],
  ): string {
    callerBacktrace ??= callerLocations(2);
    const msg = this.deprecatedMethodWarning(deprecatedMethodName, message);
    this.warn(msg, callerBacktrace);
    return msg;
  }

  private deprecatedMethodWarning(methodName: string, message?: string): string {
    const warning = `${methodName} is deprecated and will be removed from ${this.gemName} ${this.deprecationHorizon}`;
    if (message == null) return warning;
    if (message.startsWith(":")) return `${warning} (use ${message.slice(1)} instead)`;
    return `${warning} (${message})`;
  }

  private deprecationMessage(callstack: CallerLocation[], message?: string): string {
    message ??=
      "You are using deprecated behavior which will be removed from the next major or minor release.";
    return `DEPRECATION WARNING: ${message} ${this.deprecationCallerMessage(callstack) ?? ""}`;
  }

  private deprecationCallerMessage(callstack: CallerLocation[]): string | undefined {
    const [file, line, method] = this.extractCallstack(callstack);
    if (file != null) {
      if (line != null && method != null) {
        return `(called from ${method} at ${file}:${line})`;
      } else {
        return `(called from ${file}:${line})`;
      }
    }
  }

  private extractCallstack(callstack: CallerLocation[]): [string, number, string] | [] {
    if (callstack.length === 0) return [];

    const offendingLine =
      callstack.find((frame) => {
        const path = frame.absolutePath ?? frame.path;
        return path != null && !this.isIgnoredCallstack(path);
      }) ?? callstack[0];

    return [offendingLine.path, offendingLine.lineno, offendingLine.label];
  }

  private isIgnoredCallstack(path: string): boolean {
    return (
      path.startsWith(TRAILS_GEM_ROOT) || path.startsWith("node:") || path.includes("<internal:")
    );
  }

  private isDeprecationDisallowed(message?: string): boolean {
    if (this.isExplicitlyAllowed(message)) return false;
    if (this.disallowedWarnings === ":all") return true;
    return (
      message != null &&
      this.disallowedWarnings.some((rule) =>
        rule instanceof RegExp
          ? rule.test(message)
          : message.includes(rule.startsWith(":") ? rule.slice(1) : rule),
      )
    );
  }

  private isExplicitlyAllowed(message?: string): boolean {
    const allowances = this._explicitlyAllowedWarnings.value;
    if (allowances == null) return false;
    if (allowances === ":all") return true;
    return (
      message != null &&
      wrap(allowances).some((rule) =>
        rule instanceof RegExp
          ? rule.test(message)
          : message.includes(rule.startsWith(":") ? rule.slice(1) : rule),
      )
    );
  }

  silence<T>(fn: () => T): T {
    this.beginSilence();
    try {
      return fn();
    } finally {
      this.endSilence();
    }
  }

  beginSilence(): void {
    this._silenceCounter.value += 1;
  }

  endSilence(): void {
    this._silenceCounter.value -= 1;
  }

  allow<T>(
    allowedWarnings: AllowMatcher[] | ":all" = ":all",
    options: { if?: unknown } = {},
    block: () => T,
  ): T {
    let conditional = "if" in options ? options.if : true;
    if (typeof conditional === "function") conditional = (conditional as () => unknown)();
    if (conditional != null && conditional !== false) {
      return this._explicitlyAllowedWarnings.bind(allowedWarnings, block);
    } else {
      return block();
    }
  }

  deprecateMethod(target: object, methodName: string, message?: string): void {
    const self = this;
    const original = (target as Record<string, unknown>)[methodName];
    if (typeof original !== "function") return;
    (target as Record<string, unknown>)[methodName] = function (...args: unknown[]) {
      self.deprecationWarning(methodName, message);
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    };
  }
}

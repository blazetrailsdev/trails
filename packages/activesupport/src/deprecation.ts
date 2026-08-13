import { wrap } from "./array-utils.js";
import { deprecateMethods } from "./deprecation/method-wrappers.js";
import { ArgumentError } from "./hash-utils.js";
import { underscore } from "./inflector.js";
import { ActiveSupport } from "./index.js";
import { Logger } from "./logger.js";
import { Notifications } from "./notifications.js";
import { stderr } from "./process-adapter.js";
import { trailsLogger } from "./trails-logger-slot.js";

export type DeprecationBehavior = "raise" | "stderr" | "log" | "silence" | "notify" | "report";

/** Rails: `behaviors.rb:111-121` — every stored behavior is one of these. */
export type DeprecationBehaviorCallable = (
  message: string,
  callstack: unknown[],
  deprecator: Deprecation,
) => void;

export class DeprecationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeprecationError";
  }
}

/**
 * Default warning behaviors per Rails.env.
 *
 * Mirrors: `ActiveSupport::Deprecation::DEFAULT_BEHAVIORS`
 * (deprecation/behaviors.rb:13-63).
 *
 * A Ruby Hash keyed by Symbols, so a `Map` and not an object literal: an
 * object literal's `raise` key would read as a ported member named `raise` and
 * make every Rails `raise` in the package look like a call to it.
 *
 * `:log`'s `defined?(Rails.logger) && Rails.logger` is a call-time constant
 * resolution, which ESM cannot express — `@blazetrails/trailties` depends on
 * this package, not the reverse — so `Trails.logger` is read through the
 * zero-import slot it stores itself in (`trails-logger-slot.ts`).
 */
export const DEFAULT_BEHAVIORS: ReadonlyMap<DeprecationBehavior, DeprecationBehaviorCallable> =
  new Map<DeprecationBehavior, DeprecationBehaviorCallable>([
    [
      "raise",
      (message, callstack) => {
        const e = new DeprecationError(message);
        e.stack = callstack.map((l) => String(l)).join("\n");
        throw e;
      },
    ],

    [
      "stderr",
      (message, callstack, deprecator) => {
        stderr.write(message + "\n");
        if (deprecator.debug) stderr.write(callstack.join("\n  ") + "\n");
      },
    ],

    [
      "log",
      (message, callstack, deprecator) => {
        const logger = trailsLogger ?? new Logger(stderr);
        logger.warn(message);
        if (deprecator.debug) logger.debug(callstack.join("\n  "));
      },
    ],

    [
      "notify",
      (message, callstack, deprecator) => {
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
    ],

    ["silence", () => {}],

    [
      "report",
      (message, callstack) => {
        const error = new DeprecationError(message);
        error.stack = callstack.map((l) => String(l)).join("\n");
        ActiveSupport.errorReporter.report(error);
      },
    ],
  ]);

/** One element of what `behavior=` accepts (behaviors.rb:96-104). */
type DeprecationBehaviorItem = DeprecationBehavior | ((...args: never[]) => void);

/** Rails: the argument `behavior=` accepts (behaviors.rb:96-104). */
export type DeprecationBehaviorInput = DeprecationBehaviorItem | DeprecationBehaviorItem[] | null;

/**
 * Mirrors: `ActiveSupport::Deprecation::Behavior#arity_coerce`
 * (behaviors.rb:124-140).
 *
 * Ruby's negative arities model a splat, which JS has no analogue of —
 * `Function#length` counts required parameters — so Rails' `-2..3` arm is every
 * arity up to 3. The message interpolates `behavior.inspect`, and every
 * non-callable reaching here is one of the DEFAULT_BEHAVIORS Symbols, which a
 * trails port spells as a plain string, so `inspect` is the leading colon.
 */
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

/**
 * Mirrors: `arity_of_callable` (behaviors.rb:142-144).
 *
 * Takes the same duck-typed callable Ruby's `respond_to?(:call)` guard admits,
 * which is what `typeof behavior !== "function"` narrows `unknown` to.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
function arityOfCallable(callable: Function): number {
  return callable.length;
}

type AllowMatcher = string | RegExp;

/**
 * One frame of a callstack, as `warn` and `deprecation_warning` receive it.
 *
 * @noRailsEquivalent PERMANENT. Ruby's `Thread::Backtrace::Location`, which
 * `caller_locations` answers and `extract_callstack` reads `path` / `lineno` /
 * `label` / `absolute_path` off. JS has no such value, so trails parses the
 * same four fields out of a V8 stack line.
 */
export interface CallerLocation {
  path: string;
  absolutePath?: string;
  lineno: number;
  label: string;
  toString(): string;
}

/**
 * @noRailsEquivalent Ruby's `Kernel#caller_locations(start)`. V8 exposes the
 * same information only as the pre-rendered `Error#stack` text, so the frames
 * are parsed back out of it; `start` counts frames the same way, past this
 * function and its caller, and defaults to 1 as Ruby's does.
 */
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

/**
 * Rails: `RAILS_GEM_ROOT` (deprecation/reporting.rb:150) — the directory the
 * framework itself lives in, so its own frames never get blamed for a
 * deprecation. Here that is the directory this module was loaded from.
 */
const TRAILS_GEM_ROOT = new URL(".", import.meta.url).pathname;

export class Deprecation {
  /**
   * Mirrors: deprecation.rb:60-62. Ruby double-checks under a Mutex because
   * two threads can race the memo; JS runs one turn at a time, so the memo is
   * the whole method.
   */
  static _instance(): Deprecation {
    return (Deprecation.__instance ??= new Deprecation());
  }

  private static __instance?: Deprecation;

  /** Rails: `include MethodWrapper` (deprecation.rb:55). */
  deprecateMethods = deprecateMethods;

  private _behavior?: DeprecationBehaviorCallable[];
  private _disallowedBehavior?: DeprecationBehaviorCallable[];
  private _silenced = false;
  // Rails: `attr_accessor :gem_name` (deprecation/reporting.rb:11).
  gemName: string;
  // Rails: `attr_accessor :deprecation_horizon` (deprecation.rb:65).
  deprecationHorizon: string;
  // Rails: `self.debug = false` (deprecation.rb:76).
  debug = false;
  /**
   * Rails: `disallowed_warnings` (deprecation/disallowed.rb:22), which is an
   * array of substrings/Regexps, or the scalar `:all`.
   */
  disallowedWarnings: AllowMatcher[] | "all" = [];

  // Rails: `@silence_counter = Concurrent::ThreadLocalVar.new(0)` (deprecation.rb:78).
  private _silenceCounter = 0;
  // Rails: `@explicitly_allowed_warnings = Concurrent::ThreadLocalVar.new(nil)`
  // (deprecation.rb:77); JS is single-threaded, so the bound value is a plain
  // field saved and restored around the block, as `ThreadLocalVar#bind` does.
  private _explicitlyAllowedWarnings: AllowMatcher[] | "all" | null = null;

  /**
   * Returns the current behavior or if one isn't set, defaults to `:stderr`.
   *
   * Rails: `behaviors.rb:73-75`.
   */
  get behavior(): DeprecationBehaviorCallable[] {
    return (this._behavior ??= [DEFAULT_BEHAVIORS.get("stderr")!]);
  }

  /** Rails: `behavior=` (behaviors.rb:111-113). */
  set behavior(behavior: DeprecationBehaviorInput) {
    this._behavior = wrap<DeprecationBehaviorItem>(behavior).map(
      (b) => (typeof b === "string" ? DEFAULT_BEHAVIORS.get(b) : undefined) ?? arityCoerce(b),
    );
  }

  /**
   * Returns the current behavior for disallowed deprecations or if one isn't
   * set, defaults to `:raise`.
   *
   * Rails: `behaviors.rb:78-80`.
   */
  get disallowedBehavior(): DeprecationBehaviorCallable[] {
    return (this._disallowedBehavior ??= [DEFAULT_BEHAVIORS.get("raise")!]);
  }

  /** Rails: `disallowed_behavior=` (behaviors.rb:119-121). */
  set disallowedBehavior(behavior: DeprecationBehaviorInput) {
    this._disallowedBehavior = wrap<DeprecationBehaviorItem>(behavior).map(
      (b) => (typeof b === "string" ? DEFAULT_BEHAVIORS.get(b) : undefined) ?? arityCoerce(b),
    );
  }

  // Rails: `@silenced || @silence_counter.value.nonzero?`
  // (deprecation/reporting.rb:56-58).
  get silenced(): boolean {
    return this._silenced || this._silenceCounter !== 0;
  }

  set silenced(silenced: boolean) {
    this._silenced = silenced;
  }

  /**
   * It accepts two parameters on initialization. The first is a version of
   * library and the second is a library name.
   *
   *   new Deprecation("2.0", "MyLibrary")
   *
   * Mirrors: ActiveSupport::Deprecation#initialize (deprecation.rb:71-79).
   */
  constructor(deprecationHorizon = "8.1", gemName = "Rails") {
    this.gemName = gemName;
    this.deprecationHorizon = deprecationHorizon;
    this.silenced = false;
    this.debug = false;
  }

  /**
   * Outputs a deprecation warning to the output configured by
   * `Deprecation#behavior`.
   *
   * Mirrors: deprecation/reporting.rb:18-28.
   */
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

  /** Mirrors: deprecation/reporting.rb:96-101. */
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

  /**
   * Outputs a deprecation warning message.
   *
   *   deprecatedMethodWarning("methodName")
   *   // => "methodName is deprecated and will be removed from Rails 8.1"
   *   deprecatedMethodWarning("methodName", ":anotherMethod")
   *   // => "... (use anotherMethod instead)"
   *   deprecatedMethodWarning("methodName", "Optional message")
   *   // => "... (Optional message)"
   *
   * Mirrors: deprecation/reporting.rb:112-119. Ruby's Symbol arm is a name to
   * point at, its String arm free text; a Symbol value keeps its leading colon
   * in trails, which is also what `inspect` prints, so the colon is the
   * discriminator and is stripped from the interpolation.
   */
  private deprecatedMethodWarning(methodName: string, message?: string): string {
    const warning = `${methodName} is deprecated and will be removed from ${this.gemName} ${this.deprecationHorizon}`;
    if (message == null) return warning;
    if (message.startsWith(":")) return `${warning} (use ${message.slice(1)} instead)`;
    return `${warning} (${message})`;
  }

  /** Mirrors: deprecation/reporting.rb:121-124. */
  private deprecationMessage(callstack: CallerLocation[], message?: string): string {
    message ??=
      "You are using deprecated behavior which will be removed from the next major or minor release.";
    // Ruby interpolates a nil caller message as the empty string.
    return `DEPRECATION WARNING: ${message} ${this.deprecationCallerMessage(callstack) ?? ""}`;
  }

  /** Mirrors: deprecation/reporting.rb:126-135. */
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

  /** Mirrors: deprecation/reporting.rb:137-148. */
  private extractCallstack(callstack: CallerLocation[]): [string, number, string] | [] {
    if (callstack.length === 0) return [];

    const offendingLine =
      callstack.find((frame) => {
        // Code generated with `eval` doesn't have an `absolute_path`, e.g. templates.
        const path = frame.absolutePath ?? frame.path;
        return path != null && !this.isIgnoredCallstack(path);
      }) ?? callstack[0];

    return [offendingLine.path, offendingLine.lineno, offendingLine.label];
  }

  /**
   * Mirrors: deprecation/reporting.rb:153-155. Rails tests the gem root and
   * `RbConfig::CONFIG["libdir"]`; the trails analogues are this package's own
   * directory and the runtime's built-in modules, which V8 spells `node:`.
   */
  private isIgnoredCallstack(path: string): boolean {
    return (
      path.startsWith(TRAILS_GEM_ROOT) || path.startsWith("node:") || path.includes("<internal:")
    );
  }

  /** Mirrors: deprecation/disallowed.rb:25-36. */
  private isDeprecationDisallowed(message?: string): boolean {
    if (this.isExplicitlyAllowed(message)) return false;
    if (this.disallowedWarnings === "all") return true;
    return (
      message != null &&
      this.disallowedWarnings.some((rule) =>
        rule instanceof RegExp ? rule.test(message) : message.includes(rule),
      )
    );
  }

  /** Mirrors: deprecation/disallowed.rb:38-49. */
  private isExplicitlyAllowed(message?: string): boolean {
    const allowances = this._explicitlyAllowedWarnings;
    if (allowances == null) return false;
    if (allowances === "all") return true;
    return (
      message != null &&
      wrap(allowances).some((rule) =>
        rule instanceof RegExp ? rule.test(message) : message.includes(rule),
      )
    );
  }

  // Rails: deprecation/reporting.rb:41-46.
  silence<T>(fn: () => T): T {
    this.beginSilence();
    try {
      return fn();
    } finally {
      this.endSilence();
    }
  }

  /** @internal Rails: deprecation/reporting.rb:48-50. */
  beginSilence(): void {
    this._silenceCounter += 1;
  }

  /** @internal Rails: deprecation/reporting.rb:52-54. */
  endSilence(): void {
    this._silenceCounter -= 1;
  }

  /**
   * Allow previously disallowed deprecation warnings within the block.
   *
   * Mirrors: deprecation/reporting.rb:87-94. The optional `if:` accepts a
   * truthy/falsy value or something callable; falsy yields without allowing.
   */
  allow<T>(
    allowedWarnings: AllowMatcher[] | "all" = "all",
    options: { if?: unknown } = {},
    block: () => T,
  ): T {
    let conditional = "if" in options ? options.if : true;
    if (typeof conditional === "function") conditional = (conditional as () => unknown)();
    if (conditional != null && conditional !== false) {
      const previous = this._explicitlyAllowedWarnings;
      this._explicitlyAllowedWarnings = allowedWarnings;
      try {
        return block();
      } finally {
        this._explicitlyAllowedWarnings = previous;
      }
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

export const deprecator = new Deprecation();

import { wrap } from "./array-utils.js";
import { ArgumentError } from "./hash-utils.js";
import { underscore } from "./inflector.js";
import { Notifications } from "./notifications.js";
import { stderr } from "./process-adapter.js";

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
 * Two entries stop short of the Ruby. `:log` picks `Rails.logger` when it is
 * defined and falls back to `ActiveSupport::Logger.new($stderr)`; trailties
 * exposes no process-wide logger to activesupport, so only the fallback branch
 * ports. `:report` hands the error to `ActiveSupport.error_reporter`, which
 * trails has not ported, so there is nothing to report to yet.
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
        stderr.write(message + "\n");
        if (deprecator.debug) stderr.write(callstack.join("\n  ") + "\n");
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

    ["report", () => {}],
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

  const fn = behavior as (...args: unknown[]) => void;
  switch (arityOfCallable(fn)) {
    case 2:
      return (message, callstack) => {
        fn(message, callstack);
      };
    case 0:
    case 1:
    case 3:
      return fn as DeprecationBehaviorCallable;
    default:
      return (message, callstack, deprecator) => {
        fn(message, callstack, deprecator.deprecationHorizon, deprecator.gemName);
      };
  }
}

/** Mirrors: `arity_of_callable` (behaviors.rb:142-144). */
function arityOfCallable(callable: (...args: unknown[]) => void): number {
  return callable.length;
}

type AllowMatcher = string | RegExp;

interface AllowContext {
  matchers: AllowMatcher[];
  ifFn?: (...args: unknown[]) => boolean;
}

export class Deprecation {
  private _behavior?: DeprecationBehaviorCallable[];
  private _disallowedBehavior?: DeprecationBehaviorCallable[];
  private _silenced = false;
  // Rails: `attr_accessor :gem_name` (deprecation/reporting.rb:11).
  gemName: string;
  // Rails: `attr_accessor :deprecation_horizon` (deprecation.rb:65).
  deprecationHorizon: string;
  // Rails: `self.debug = false` (deprecation.rb:76).
  debug = false;
  disallowedWarnings: (string | RegExp | "all")[] = [];

  // Rails: `@silence_counter = Concurrent::ThreadLocalVar.new(0)` (deprecation.rb:78).
  private _silenceCounter = 0;
  private _allowContexts: AllowContext[] = [];

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

  private _matchesDisallowed(msg: string): boolean {
    if (this.disallowedWarnings.length === 0) return false;
    for (const w of this.disallowedWarnings) {
      if (w === "all") return true;
      if (w instanceof RegExp && w.test(msg)) return true;
      if (typeof w === "string" && msg.includes(w)) return true;
    }
    return false;
  }

  private _matchesAllow(msg: string): boolean {
    for (const ctx of this._allowContexts) {
      if (ctx.ifFn && !ctx.ifFn()) continue;
      for (const m of ctx.matchers) {
        if (m instanceof RegExp && m.test(msg)) return true;
        if (typeof m === "string" && msg.includes(m)) return true;
      }
    }
    return false;
  }

  warn(message?: string, callstack?: unknown[]): void {
    // Rails: `return if silenced` (deprecation/reporting.rb:19).
    if (this.silenced) return;

    const msg = message ?? "DEPRECATION WARNING";
    const fullMessage = `DEPRECATION WARNING: ${msg}`;
    const stack = callstack ?? [];

    if (this._matchesAllow(msg)) return;

    if (this._matchesDisallowed(msg)) {
      for (const b of this.disallowedBehavior) b(fullMessage, stack, this);
      return;
    }

    for (const b of this.behavior) b(fullMessage, stack, this);
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

  allow<T>(
    matchers: AllowMatcher[],
    options: { if?: (...args: unknown[]) => boolean } = {},
    fn: () => T,
  ): T {
    const ctx: AllowContext = { matchers, ifFn: options.if };
    this._allowContexts.push(ctx);
    try {
      return fn();
    } finally {
      this._allowContexts.splice(this._allowContexts.indexOf(ctx), 1);
    }
  }

  deprecateMethod(target: object, methodName: string, message: string): void {
    const self = this;
    const original = (target as Record<string, unknown>)[methodName];
    if (typeof original !== "function") return;
    (target as Record<string, unknown>)[methodName] = function (...args: unknown[]) {
      self.warn(message);
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    };
  }
}

export const deprecator = new Deprecation();

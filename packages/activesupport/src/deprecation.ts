export type DeprecationBehavior =
  | "raise"
  | "warn"
  | "stderr"
  | "log"
  | "silence"
  | "notify"
  | "report";

export class DeprecationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeprecationError";
  }
}

type AllowMatcher = string | RegExp;

interface AllowContext {
  matchers: AllowMatcher[];
  ifFn?: (...args: unknown[]) => boolean;
}

export class Deprecation {
  behavior: DeprecationBehavior | DeprecationBehavior[] | ((...args: unknown[]) => void) | null =
    "stderr";
  private _silenced = false;
  // Rails: `attr_accessor :gem_name` (deprecation/reporting.rb:11).
  gemName: string;
  // Rails: `attr_accessor :deprecation_horizon` (deprecation.rb:65).
  deprecationHorizon: string;
  // Rails: `self.debug = false` (deprecation.rb:76).
  debug = false;
  disallowedWarnings: (string | RegExp | "all")[] = [];
  disallowedBehavior: DeprecationBehavior | ((...args: unknown[]) => void) | null = "raise";

  // Rails: `@silence_counter = Concurrent::ThreadLocalVar.new(0)` (deprecation.rb:78).
  private _silenceCounter = 0;
  private _allowContexts: AllowContext[] = [];

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

  private _runBehaviors(
    behaviors: (DeprecationBehavior | ((...args: unknown[]) => void) | null)[],
    msg: string,
    fullMessage: string,
    callstack: unknown[],
  ): void {
    for (const b of behaviors) {
      if (b == null) continue;
      if (typeof b === "function") {
        b(fullMessage, callstack, this);
        continue;
      }
      switch (b) {
        case "raise":
          throw new DeprecationError(msg);
        case "warn":
        case "stderr":
          process.stderr.write(fullMessage + "\n");
          break;
        case "log":
          process.stderr.write(fullMessage + "\n");
          break;
        case "silence":
          break;
        case "notify":
          break;
        case "report":
          break;
      }
    }
  }

  warn(message?: string, callstack?: unknown[]): void {
    // Rails: `return if silenced` (deprecation/reporting.rb:19).
    if (this.silenced) return;

    const msg = message ?? "DEPRECATION WARNING";
    const fullMessage = `DEPRECATION WARNING: ${msg}`;
    const stack = callstack ?? [];

    if (this._matchesAllow(msg)) return;

    if (this._matchesDisallowed(msg)) {
      const disallowedBehaviors = Array.isArray(this.disallowedBehavior)
        ? this.disallowedBehavior
        : [this.disallowedBehavior];
      this._runBehaviors(disallowedBehaviors as any[], msg, fullMessage, stack);
      return;
    }

    const behaviors = Array.isArray(this.behavior) ? this.behavior : [this.behavior];
    this._runBehaviors(behaviors as any[], msg, fullMessage, stack);
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

export type DeprecationBehavior = "raise" | "warn" | "stderr" | "log" | "silence" | "notify" | "report";

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
  behavior: DeprecationBehavior | DeprecationBehavior[] | ((...args: unknown[]) => void) | null = "stderr";
  silenced = false;
  gem?: string;
  horizon?: string;
  disallowedWarnings: (string | RegExp | "all")[] = [];
  disallowedBehavior: DeprecationBehavior | ((...args: unknown[]) => void) | null = "raise";

  private _silencedForThread = false;
  private _allowContexts: AllowContext[] = [];

  constructor(options?: { horizon?: string; gem?: string; silenced?: boolean }) {
    this.horizon = options?.horizon;
    this.gem = options?.gem;
    if (options?.silenced != null) this.silenced = options.silenced;
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
    callstack: unknown[]
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
    if (this.silenced || this._silencedForThread) return;

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

  silence<T>(fn: () => T): T {
    const prev = this._silencedForThread;
    this._silencedForThread = true;
    try {
      return fn();
    } finally {
      this._silencedForThread = prev;
    }
  }

  allow<T>(
    matchers: AllowMatcher[],
    options: { if?: (...args: unknown[]) => boolean } = {},
    fn: () => T
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

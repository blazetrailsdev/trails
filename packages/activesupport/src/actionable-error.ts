import { KeyError, fetch } from "@blazetrails/ruby-compat";

export class NonActionable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonActionable";
  }
}

export class ActionableError extends Error {
  static _actions: Record<string, () => void> = {};

  /**
   * Registry of error classes keyed by their `.name`. The trails equivalent
   * of Ruby's `String#safe_constantize`: middleware (e.g. ActionableExceptions)
   * looks up classes here instead of walking the global namespace.
   */
  static _registry: Map<string, typeof ActionableError> = new Map();

  constructor(message?: string) {
    super(message);
    this.name = "ActionableError";
  }

  /**
   * Register an actionable error class so it can be resolved by name. Mirrors
   * Rails' implicit registration via `safe_constantize`; emits a console
   * warning if a different class is already registered under the same name so
   * silent shadowing doesn't mask a typo or duplicate definition.
   */
  static register(cls: typeof ActionableError): void {
    const existing = ActionableError._registry.get(cls.name);
    if (existing && existing !== cls) {
      console.warn(
        `ActionableError._registry collision: a different class is already registered as "${cls.name}"; the previous entry will be replaced.`,
      );
    }
    ActionableError._registry.set(cls.name, cls);
  }

  /** Resolve a registered actionable error class by name. */
  static lookup(name: string): typeof ActionableError | undefined {
    return ActionableError._registry.get(name);
  }

  static actions(error: any): Record<string, () => void> {
    // Accept a class directly
    if (typeof error === "function" && typeof error._actions === "object") {
      return error._actions;
    }

    if (!error || typeof error !== "object") {
      return {};
    }

    // Check the constructor (class-level actions)
    const ctor = error.constructor as { _actions?: Record<string, () => void> } | undefined;
    if (ctor && typeof ctor._actions === "object") {
      return ctor._actions;
    }

    return {};
  }

  /**
   * @missingRailsCall call — PERMANENT: Ruby's `Proc#call` on the fetched action
   *   is JS function invocation, which has no named call form.
   * @missingRailsArgs fetch — PERMANENT: `@blazetrails/ruby-compat`'s `fetch` takes
   *   the Hash Ruby calls it ON as its first argument, so this site passes
   *   `(actions, name)` where `actions(error).fetch(name)` passes `name` alone.
   */
  static dispatch(error: any, name: string): void {
    try {
      fetch<() => void>(this.actions(error), name)();
    } catch (e) {
      if (e instanceof KeyError) throw new NonActionable(`Cannot find action "${name}"`);
      throw e;
    }
  }

  static action(name: string, block: () => void): void {
    // Copy-on-write: ensure each subclass gets its own actions hash
    if (!Object.prototype.hasOwnProperty.call(this, "_actions")) {
      const parentActions = this._actions || {};
      Object.defineProperty(this, "_actions", {
        value: { ...parentActions },
        writable: true,
        configurable: true,
        enumerable: false,
      });
    }
    this._actions[name] = block;
    ActionableError.register(this as unknown as typeof ActionableError);
  }
}

import { KeyError, fetch } from "@blazetrails/ruby-compat";

export class NonActionable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonActionable";
  }
}

export class ActionableError extends Error {
  static _actions: Record<string, () => void> = {};

  static _registry: Map<string, typeof ActionableError> = new Map();

  constructor(message?: string) {
    super(message);
    this.name = "ActionableError";
  }

  static register(cls: typeof ActionableError): void {
    const existing = ActionableError._registry.get(cls.name);
    if (existing && existing !== cls) {
      console.warn(
        `ActionableError._registry collision: a different class is already registered as "${cls.name}"; the previous entry will be replaced.`,
      );
    }
    ActionableError._registry.set(cls.name, cls);
  }

  static lookup(name: string): typeof ActionableError | undefined {
    return ActionableError._registry.get(name);
  }

  static actions(error: any): Record<string, () => void> {
    if (typeof error === "function" && typeof error._actions === "object") {
      return error._actions;
    }

    if (!error || typeof error !== "object") {
      return {};
    }

    const ctor = error.constructor as { _actions?: Record<string, () => void> } | undefined;
    if (ctor && typeof ctor._actions === "object") {
      return ctor._actions;
    }

    return {};
  }

  /**
   * @missingRailsCall call — PERMANENT
   * @missingRailsArgs fetch — PERMANENT
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

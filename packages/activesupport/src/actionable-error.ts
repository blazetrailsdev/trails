export class NonActionable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonActionable";
  }
}

export class ActionableError extends Error {
  static _actions: Record<string, () => void> = {};

  constructor(message?: string) {
    super(message);
    this.name = "ActionableError";
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

  static dispatch(error: any, name: string): void {
    const actions = this.actions(error);
    const action = actions[name];
    if (!action) {
      throw new NonActionable(`Cannot find action "${name}"`);
    }
    action();
  }

  static action(name: string, block: () => void): void {
    // Copy-on-write: ensure each subclass gets its own actions hash
    if (!Object.prototype.hasOwnProperty.call(this, "_actions")) {
      const parentActions = (this as typeof ActionableError)._actions || {};
      Object.defineProperty(this, "_actions", {
        value: { ...parentActions },
        writable: true,
        configurable: true,
        enumerable: false,
      });
    }
    this._actions[name] = block;
  }
}

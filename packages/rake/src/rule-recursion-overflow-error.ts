import { StandardError } from "@blazetrails/ruby-compat";

export class RuleRecursionOverflowError extends StandardError {
  private _targets: string[];

  constructor(...args: [message?: string]) {
    super(...args);
    this._targets = [];
    const message = (this as Error).message;
    Object.defineProperty(this, "message", {
      get: () => message + ": [" + [...this._targets].reverse().join(" => ") + "]",
      configurable: true,
    });
  }

  addTarget(target: string): void {
    this._targets.push(target);
  }
}

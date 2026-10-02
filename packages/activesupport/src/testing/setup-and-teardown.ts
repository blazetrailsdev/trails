import { defineCallbacks, setCallback, runCallbacks } from "../callbacks.js";
import type { FilterListEntry } from "../callbacks.js";
import { Assertion, UnexpectedError } from "./assertions.js";
import type { Test } from "./assertions.js";

export function prepended(klass: { prototype: object }): void {
  defineCallbacks(klass.prototype, "setup");
  defineCallbacks(klass.prototype, "teardown");
}

export function setup(this: { prototype: object }, ...args: FilterListEntry<object>[]): void {
  setCallback(this.prototype, "setup", "before", ...args);
}

export function teardown(this: { prototype: object }, ...args: FilterListEntry<object>[]): void {
  setCallback(this.prototype, "teardown", "after", ...args);
}

export function beforeSetup(this: object, super_: () => unknown): unknown {
  const result = super_();
  return result instanceof Promise
    ? result.then(() => runCallbacks(this, "setup"))
    : runCallbacks(this, "setup");
}

export function afterTeardown(this: Test, super_: () => unknown): unknown {
  const rescue = (e: unknown): void => {
    if (e instanceof Assertion) {
      this.failures.push(e);
    } else {
      this.failures.push(new UnexpectedError(e as Error));
    }
  };
  try {
    const result = runCallbacks(this, "teardown");
    if (result instanceof Promise) return result.then(() => {}, rescue).then(() => super_());
  } catch (e) {
    rescue(e);
  }

  return super_();
}

import { defineCallbacks, setCallback, runCallbacks } from "../callbacks.js";
import type { FilterListEntry } from "../callbacks.js";
import { Assertion, UnexpectedError } from "./assertions.js";
import type { RunningTest } from "./tests-without-assertions.js";

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

export function beforeSetup(this: object): unknown {
  return runCallbacks(this, "setup");
}

export function afterTeardown(this: object, test: Pick<RunningTest, "failures">): unknown {
  const rescue = (e: unknown): void => {
    if (e instanceof Assertion) {
      test.failures.push(e);
    } else {
      test.failures.push(new UnexpectedError(e as Error));
    }
  };
  try {
    const result = runCallbacks(this, "teardown");
    if (result instanceof Promise) return result.then(() => {}, rescue);
  } catch (e) {
    rescue(e);
  }
}

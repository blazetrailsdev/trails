import { defineCallbacks, setCallback, runCallbacks } from "../callbacks.js";
import type { FilterListEntry } from "../callbacks.js";
import { Assertion, UnexpectedError } from "./assertions.js";
import type { RunningTest } from "./tests-without-assertions.js";

export function prepended(klass: object): void {
  defineCallbacks(klass, "setup");
  defineCallbacks(klass, "teardown");
}

export function setup(this: object, ...args: FilterListEntry<object>[]): void {
  setCallback(this, "setup", "before", ...args);
}

export function teardown(this: object, ...args: FilterListEntry<object>[]): void {
  setCallback(this, "teardown", "after", ...args);
}

export function beforeSetup(this: object): void {
  runCallbacks(this, "setup");
}

export function afterTeardown(this: object, test: Pick<RunningTest, "failures">): void {
  try {
    runCallbacks(this, "teardown");
  } catch (e) {
    if (e instanceof Assertion) {
      test.failures.push(e);
    } else {
      test.failures.push(new UnexpectedError(e as Error));
    }
  }
}

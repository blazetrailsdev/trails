import { Callbacks } from "../callbacks.js";
import type { FilterListEntry } from "../callbacks.js";
import { extend, include, type Extended, type Included } from "@blazetrails/ruby-compat/include";
import { Assertion, UnexpectedError } from "./assertions.js";
import type { Test } from "./assertions.js";

interface CallbacksInstance {
  runCallbacks: Included<typeof Callbacks>["runCallbacks"];
}

export function prepended(klass: abstract new (...args: never[]) => object): void {
  include(klass, Callbacks);
  (klass as typeof klass & Extended<typeof Callbacks.ClassMethods>).defineCallbacks(
    "setup",
    "teardown",
  );
  extend(klass, ClassMethods);
}

export const ClassMethods = {
  setup(this: Extended<typeof Callbacks.ClassMethods>, ...args: FilterListEntry<object>[]): void {
    this.setCallback("setup", "before", ...args);
  },

  teardown(
    this: Extended<typeof Callbacks.ClassMethods>,
    ...args: FilterListEntry<object>[]
  ): void {
    this.setCallback("teardown", "after", ...args);
  },
};

export function beforeSetup(this: CallbacksInstance, super_: () => unknown): unknown {
  const result = super_();
  return result instanceof Promise
    ? result.then(() => this.runCallbacks("setup"))
    : this.runCallbacks("setup");
}

export function afterTeardown(this: Test & CallbacksInstance, super_: () => unknown): unknown {
  const rescue = (e: unknown): void => {
    if (e instanceof Assertion) {
      this.failures.push(e);
    } else {
      this.failures.push(new UnexpectedError(e as Error));
    }
  };
  try {
    const result = this.runCallbacks("teardown");
    if (result instanceof Promise) return result.then(() => {}, rescue).then(() => super_());
  } catch (e) {
    rescue(e);
  }

  return super_();
}

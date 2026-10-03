import { Callbacks } from "../callbacks.js";
import type { FilterListEntry } from "../callbacks.js";
import { include, type Extended, type Included } from "@blazetrails/ruby-compat/include";
import { Assertion, UnexpectedError } from "./assertions.js";
import type { Test } from "./assertions.js";

interface CallbacksHost {
  defineCallbacks: Extended<typeof Callbacks.ClassMethods>["defineCallbacks"];
  setCallback: Extended<typeof Callbacks.ClassMethods>["setCallback"];
}

interface CallbacksInstance {
  runCallbacks: Included<typeof Callbacks>["runCallbacks"];
}

export function prepended(klass: abstract new (...args: never[]) => object): void {
  include(klass, Callbacks);
  (klass as typeof klass & CallbacksHost).defineCallbacks("setup", "teardown");
}

export function setup(this: object, ...args: FilterListEntry<object>[]): void {
  (this as CallbacksHost).setCallback("setup", "before", ...args);
}

export function teardown(this: object, ...args: FilterListEntry<object>[]): void {
  (this as CallbacksHost).setCallback("teardown", "after", ...args);
}

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

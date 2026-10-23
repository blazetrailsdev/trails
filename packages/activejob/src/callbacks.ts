import { Callbacks as ActiveSupportCallbacks, Concern } from "@blazetrails/activesupport";
import {
  include,
  rbObjSingletonClass,
  Module,
  extend,
  block as rbBlock,
} from "@blazetrails/ruby-compat";
import type { Base } from "./base.js";

export const Callbacks = new Module();
extend(Callbacks, Concern);
Callbacks.included(null, function (): void {
  const base = this;
  base.defineCallbacks("perform", { skipAfterCallbacksIfTerminated: true });
  base.defineCallbacks("enqueue", { skipAfterCallbacksIfTerminated: true });
});
const CallbacksSingleton = rbObjSingletonClass(Callbacks);
include(CallbacksSingleton, ActiveSupportCallbacks);
CallbacksSingleton.defineCallbacks("execute");
{
  include(Callbacks, ActiveSupportCallbacks);
}
export class ClassMethods {
  static toString(): string {
    return "ActiveJob::Callbacks::ClassMethods";
  }

  static beforePerform(this: typeof Base, ...filters: unknown[]) {
    const blk =
      typeof filters[filters.length - 1] === "function" &&
      !Function.prototype.toString.call(filters[filters.length - 1]).startsWith("class")
        ? (filters.pop() as (...args: unknown[]) => unknown)
        : undefined;
    return this.setCallback(
      "perform",
      "before",
      ...filters,
      ...(blk != null ? [rbBlock(blk)] : []),
    );
  }

  static afterPerform(this: typeof Base, ...filters: unknown[]) {
    const blk =
      typeof filters[filters.length - 1] === "function" &&
      !Function.prototype.toString.call(filters[filters.length - 1]).startsWith("class")
        ? (filters.pop() as (...args: unknown[]) => unknown)
        : undefined;
    return this.setCallback("perform", "after", ...filters, ...(blk != null ? [rbBlock(blk)] : []));
  }

  static aroundPerform(this: typeof Base, ...filters: unknown[]) {
    const blk =
      typeof filters[filters.length - 1] === "function" &&
      !Function.prototype.toString.call(filters[filters.length - 1]).startsWith("class")
        ? (filters.pop() as (...args: unknown[]) => unknown)
        : undefined;
    return this.setCallback(
      "perform",
      "around",
      ...filters,
      ...(blk != null ? [rbBlock(blk)] : []),
    );
  }

  static beforeEnqueue(this: typeof Base, ...filters: unknown[]) {
    const blk =
      typeof filters[filters.length - 1] === "function" &&
      !Function.prototype.toString.call(filters[filters.length - 1]).startsWith("class")
        ? (filters.pop() as (...args: unknown[]) => unknown)
        : undefined;
    return this.setCallback(
      "enqueue",
      "before",
      ...filters,
      ...(blk != null ? [rbBlock(blk)] : []),
    );
  }

  static afterEnqueue(this: typeof Base, ...filters: unknown[]) {
    const blk =
      typeof filters[filters.length - 1] === "function" &&
      !Function.prototype.toString.call(filters[filters.length - 1]).startsWith("class")
        ? (filters.pop() as (...args: unknown[]) => unknown)
        : undefined;
    return this.setCallback("enqueue", "after", ...filters, ...(blk != null ? [rbBlock(blk)] : []));
  }

  static aroundEnqueue(this: typeof Base, ...filters: unknown[]) {
    const blk =
      typeof filters[filters.length - 1] === "function" &&
      !Function.prototype.toString.call(filters[filters.length - 1]).startsWith("class")
        ? (filters.pop() as (...args: unknown[]) => unknown)
        : undefined;
    return this.setCallback(
      "enqueue",
      "around",
      ...filters,
      ...(blk != null ? [rbBlock(blk)] : []),
    );
  }
}
Object.assign(Callbacks, { ClassMethods: ClassMethods });

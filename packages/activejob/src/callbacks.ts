import {
  Callbacks as ASCallbacks,
  Concern,
  extend,
  type FilterListEntry,
} from "@blazetrails/activesupport";
import {
  defineModule,
  include,
  rbModConstSet,
  rbObjSingletonClass,
} from "@blazetrails/ruby-compat";
import { ActiveJob } from "./namespaces.js";

interface CallbacksClass {
  defineCallbacks(...names: Array<string | Record<string, unknown>>): void;
}

interface CallbacksClassMethodsHost {
  setCallback(name: string, ...filterList: FilterListEntry[]): void;
}

export class ClassMethods {
  static beforePerform(this: CallbacksClassMethodsHost, ...filters: FilterListEntry[]): void {
    this.setCallback("perform", "before", ...filters);
  }

  static afterPerform(this: CallbacksClassMethodsHost, ...filters: FilterListEntry[]): void {
    this.setCallback("perform", "after", ...filters);
  }

  static aroundPerform(this: CallbacksClassMethodsHost, ...filters: FilterListEntry[]): void {
    this.setCallback("perform", "around", ...filters);
  }

  static beforeEnqueue(this: CallbacksClassMethodsHost, ...filters: FilterListEntry[]): void {
    this.setCallback("enqueue", "before", ...filters);
  }

  static afterEnqueue(this: CallbacksClassMethodsHost, ...filters: FilterListEntry[]): void {
    this.setCallback("enqueue", "after", ...filters);
  }

  static aroundEnqueue(this: CallbacksClassMethodsHost, ...filters: FilterListEntry[]): void {
    this.setCallback("enqueue", "around", ...filters);
  }
}

export const Callbacks = defineModule({}) as {
  runCallbacks(kind: string, block?: () => unknown): unknown;
};
extend(Callbacks, Concern);
include(Callbacks, ASCallbacks);
Object.defineProperty(Callbacks, "ClassMethods", { value: ClassMethods });

include(rbObjSingletonClass(Callbacks), ASCallbacks);
(rbObjSingletonClass(Callbacks) as unknown as CallbacksClass).defineCallbacks("execute");

Concern.included.call(Callbacks as never, null, function (this: CallbacksClass) {
  this.defineCallbacks("perform", { skipAfterCallbacksIfTerminated: true });
  this.defineCallbacks("enqueue", { skipAfterCallbacksIfTerminated: true });
});

rbModConstSet(ActiveJob, "Callbacks", Callbacks);

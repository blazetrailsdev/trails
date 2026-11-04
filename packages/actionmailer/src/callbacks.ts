import {
  Callbacks as ASCallbacks,
  Concern,
  extend,
  type FilterListEntry,
} from "@blazetrails/activesupport";
import { defineModule, include } from "@blazetrails/ruby-compat";
import { ActionMailer } from "./namespaces.js";

interface CallbacksClass {
  defineCallbacks(...names: Array<string | Record<string, unknown>>): void;
}

interface CallbacksClassMethodsHost {
  setCallback(name: string, ...filterList: FilterListEntry[]): void;
}

export class ClassMethods {
  static beforeDeliver(this: CallbacksClassMethodsHost, ...filters: FilterListEntry[]): void {
    this.setCallback("deliver", "before", ...filters);
  }

  static afterDeliver(this: CallbacksClassMethodsHost, ...filters: FilterListEntry[]): void {
    this.setCallback("deliver", "after", ...filters);
  }

  static aroundDeliver(this: CallbacksClassMethodsHost, ...filters: FilterListEntry[]): void {
    this.setCallback("deliver", "around", ...filters);
  }
}

export const Callbacks = defineModule({});
extend(Callbacks, Concern);
Object.defineProperty(Callbacks, "ClassMethods", { value: ClassMethods });

Concern.included.call(Callbacks as never, null, function (this: CallbacksClass) {
  include(this, ASCallbacks);
  this.defineCallbacks("deliver", { skipAfterCallbacksIfTerminated: true });
});

ActionMailer.Callbacks = Callbacks;

import {
  Callbacks as ASCallbacks,
  Concern,
  extend,
  type FilterListEntry,
} from "@blazetrails/activesupport";
import { include } from "@blazetrails/ruby-compat";
import { ActionMailer } from "./namespaces.js";

interface CallbacksClass {
  defineCallbacks(...names: Array<string | Record<string, unknown>>): void;
}

interface CallbacksClassMethodsHost {
  setCallback(name: string, ...filterList: FilterListEntry[]): void;
}

export function beforeDeliver(
  this: CallbacksClassMethodsHost,
  ...filters: FilterListEntry[]
): void {
  this.setCallback("deliver", "before", ...filters);
}

export function afterDeliver(this: CallbacksClassMethodsHost, ...filters: FilterListEntry[]): void {
  this.setCallback("deliver", "after", ...filters);
}

export function aroundDeliver(
  this: CallbacksClassMethodsHost,
  ...filters: FilterListEntry[]
): void {
  this.setCallback("deliver", "around", ...filters);
}

export const ClassMethods = { beforeDeliver, afterDeliver, aroundDeliver };

export const Callbacks = { ClassMethods };
extend(Callbacks, Concern);
Concern.included.call(Callbacks as never, null, function (this: CallbacksClass) {
  include(this, ASCallbacks);
  this.defineCallbacks("deliver", { skipAfterCallbacksIfTerminated: true });
});

ActionMailer.Callbacks = Callbacks;

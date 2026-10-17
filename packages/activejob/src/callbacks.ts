import { Callbacks as ActiveSupportCallbacks, Concern } from "@blazetrails/activesupport";
import {
  include,
  rbObjSingletonClass,
  extend,
  Module,
  rbBlockGivenP,
  block as rbBlock,
  rbModConstSet,
} from "@blazetrails/ruby-compat";
import { ActiveJob as ActiveJobSeat } from "./namespaces.js";

export const Callbacks: any = new Module();
extend(Callbacks, Concern);
Callbacks.included(null, function (this: any): void {
  const base = this;
  base.defineCallbacks("perform", { skipAfterCallbacksIfTerminated: true });
  base.defineCallbacks("enqueue", { skipAfterCallbacksIfTerminated: true });
});
const CallbacksSingleton: any = rbObjSingletonClass(Callbacks);
include(CallbacksSingleton, ActiveSupportCallbacks);
CallbacksSingleton.defineCallbacks("execute");
{
  include(Callbacks, ActiveSupportCallbacks);
}
export function beforePerform(this: any, ...filters: any[]): any {
  const blk = rbBlockGivenP(filters[filters.length - 1]) ? filters.pop() : undefined;
  return this.setCallback("perform", "before", ...filters, ...(blk != null ? [rbBlock(blk)] : []));
}

export function afterPerform(this: any, ...filters: any[]): any {
  const blk = rbBlockGivenP(filters[filters.length - 1]) ? filters.pop() : undefined;
  return this.setCallback("perform", "after", ...filters, ...(blk != null ? [rbBlock(blk)] : []));
}

export function aroundPerform(this: any, ...filters: any[]): any {
  const blk = rbBlockGivenP(filters[filters.length - 1]) ? filters.pop() : undefined;
  return this.setCallback("perform", "around", ...filters, ...(blk != null ? [rbBlock(blk)] : []));
}

export function beforeEnqueue(this: any, ...filters: any[]): any {
  const blk = rbBlockGivenP(filters[filters.length - 1]) ? filters.pop() : undefined;
  return this.setCallback("enqueue", "before", ...filters, ...(blk != null ? [rbBlock(blk)] : []));
}

export function afterEnqueue(this: any, ...filters: any[]): any {
  const blk = rbBlockGivenP(filters[filters.length - 1]) ? filters.pop() : undefined;
  return this.setCallback("enqueue", "after", ...filters, ...(blk != null ? [rbBlock(blk)] : []));
}

export function aroundEnqueue(this: any, ...filters: any[]): any {
  const blk = rbBlockGivenP(filters[filters.length - 1]) ? filters.pop() : undefined;
  return this.setCallback("enqueue", "around", ...filters, ...(blk != null ? [rbBlock(blk)] : []));
}

export const ClassMethods: any = new Module((mod: any) => {
  mod.defineMethod("beforePerform", beforePerform);
  mod.defineMethod("afterPerform", afterPerform);
  mod.defineMethod("aroundPerform", aroundPerform);
  mod.defineMethod("beforeEnqueue", beforeEnqueue);
  mod.defineMethod("afterEnqueue", afterEnqueue);
  mod.defineMethod("aroundEnqueue", aroundEnqueue);
});
rbModConstSet(ActiveJobSeat, "Callbacks", Callbacks);
Callbacks.ClassMethods = ClassMethods;

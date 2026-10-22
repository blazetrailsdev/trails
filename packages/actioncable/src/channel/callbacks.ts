import {
  Callbacks as ASCallbacks,
  Concern,
  extend,
  type FilterListEntry,
} from "@blazetrails/activesupport";
import { defineModule, include, rbModConstSet } from "@blazetrails/ruby-compat";
import { Channel } from "../namespaces.js";

interface CallbacksClass {
  defineCallbacks(...names: Array<string | Record<string, unknown>>): void;
}

interface CallbacksClassMethodsHost {
  setCallback(name: string, ...filterList: FilterListEntry[]): void;
}

export class ClassMethods {
  static beforeSubscribe(this: CallbacksClassMethodsHost, ...methods: FilterListEntry[]): void {
    this.setCallback("subscribe", "before", ...methods);
  }

  static afterSubscribe(this: CallbacksClassMethodsHost, ...methods: FilterListEntry[]): void {
    this.setCallback("subscribe", "after", ...methods);
  }
  static onSubscribe = ClassMethods.afterSubscribe;

  static beforeUnsubscribe(this: CallbacksClassMethodsHost, ...methods: FilterListEntry[]): void {
    this.setCallback("unsubscribe", "before", ...methods);
  }

  static afterUnsubscribe(this: CallbacksClassMethodsHost, ...methods: FilterListEntry[]): void {
    this.setCallback("unsubscribe", "after", ...methods);
  }
  static onUnsubscribe = ClassMethods.afterUnsubscribe;
}

export const Callbacks = defineModule({}) as {
  runCallbacks(kind: string, block?: () => unknown): unknown;
};
extend(Callbacks, Concern);
include(Callbacks, ASCallbacks);
(
  Callbacks as unknown as { included(base: null, block: (this: CallbacksClass) => void): void }
).included(null, function (this: CallbacksClass) {
  this.defineCallbacks("subscribe");
  this.defineCallbacks("unsubscribe");
});
Object.defineProperty(Callbacks, "ClassMethods", { value: ClassMethods });

rbModConstSet(Channel, "Callbacks", Callbacks);

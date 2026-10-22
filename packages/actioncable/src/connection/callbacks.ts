import {
  Callbacks as ASCallbacks,
  Concern,
  extend,
  type FilterListEntry,
} from "@blazetrails/activesupport";
import { defineModule, include, rbModConstSet } from "@blazetrails/ruby-compat";
import { Connection } from "../namespaces.js";

interface CallbacksClass {
  defineCallbacks(...names: Array<string | Record<string, unknown>>): void;
}

interface CallbacksClassMethodsHost {
  setCallback(name: string, ...filterList: FilterListEntry[]): void;
}

export class ClassMethods {
  static beforeCommand(this: CallbacksClassMethodsHost, ...methods: FilterListEntry[]): void {
    this.setCallback("command", "before", ...methods);
  }

  static afterCommand(this: CallbacksClassMethodsHost, ...methods: FilterListEntry[]): void {
    this.setCallback("command", "after", ...methods);
  }

  static aroundCommand(this: CallbacksClassMethodsHost, ...methods: FilterListEntry[]): void {
    this.setCallback("command", "around", ...methods);
  }
}

export const Callbacks = defineModule({}) as {
  runCallbacks(kind: string, block?: () => unknown): unknown;
};
extend(Callbacks, Concern);
include(Callbacks, ASCallbacks);
(
  Callbacks as unknown as { included(base: null, block: (this: CallbacksClass) => void): void }
).included(null, function (this: CallbacksClass) {
  this.defineCallbacks("command");
});
Object.defineProperty(Callbacks, "ClassMethods", { value: ClassMethods });

rbModConstSet(Connection, "Callbacks", Callbacks);

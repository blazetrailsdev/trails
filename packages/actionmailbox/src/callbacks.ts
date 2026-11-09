import {
  Callbacks as ASCallbacks,
  Concern,
  extend,
  type FilterListEntry,
} from "@blazetrails/activesupport";
import { include } from "@blazetrails/ruby-compat";
import { ActionMailbox } from "./action-mailbox.js";

interface CallbacksClass {
  defineCallbacks(...names: Array<string | Record<string, unknown>>): void;
}

interface CallbacksClassMethodsHost {
  setCallback(name: string, ...filterList: FilterListEntry[]): void;
}

export const TERMINATOR = async (
  mailbox: { isFinishedProcessing(): boolean },
  chain: () => unknown,
): Promise<boolean> => {
  await chain();
  return mailbox.isFinishedProcessing();
};

export function beforeProcessing(
  this: CallbacksClassMethodsHost,
  ...methods: FilterListEntry[]
): void {
  this.setCallback("process", "before", ...methods);
}

export function afterProcessing(
  this: CallbacksClassMethodsHost,
  ...methods: FilterListEntry[]
): void {
  this.setCallback("process", "after", ...methods);
}

export function aroundProcessing(
  this: CallbacksClassMethodsHost,
  ...methods: FilterListEntry[]
): void {
  this.setCallback("process", "around", ...methods);
}

export const ClassMethods = { beforeProcessing, afterProcessing, aroundProcessing };

export const Callbacks = { TERMINATOR, ClassMethods };
extend(Callbacks, Concern);
Concern.included.call(Callbacks as never, null, function (this: CallbacksClass) {
  include(this, ASCallbacks);
  this.defineCallbacks("process", {
    terminator: TERMINATOR,
    skipAfterCallbacksIfTerminated: true,
  });
});

ActionMailbox.Callbacks = Callbacks;

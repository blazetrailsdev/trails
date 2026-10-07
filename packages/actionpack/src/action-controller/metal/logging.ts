import {
  aroundAction,
  type ActionCallbackHost,
  type CallbackOptions,
} from "../../abstract-controller/callbacks.js";
import { Concern, Module, extend, type LogLevel } from "@blazetrails/activesupport";

interface LoggedController {
  logger: { logAt(level: number | LogLevel, fn: () => void): void };
}

export function logAt(
  this: ActionCallbackHost,
  level: number | LogLevel,
  options: CallbackOptions = {},
): void {
  aroundAction.call(
    this,
    (controller, action) => (controller as unknown as LoggedController).logger.logAt(level, action),
    options,
  );
}

export const ClassMethods = { logAt };

export const Logging = new Module((mod) => {
  extend(mod, Concern);
}) as Module & { ClassMethods: typeof ClassMethods };
Logging.ClassMethods = ClassMethods;

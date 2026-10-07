import type { aroundAction, CallbackOptions } from "../../abstract-controller/callbacks.js";
import { Concern, Module, extend, type LogLevel } from "@blazetrails/activesupport";

interface LoggedController {
  logger: { logAt(level: number | LogLevel, fn: () => void): void };
}

export function logAt(
  this: { aroundAction: OmitThisParameter<typeof aroundAction> },
  level: number | LogLevel,
  options: CallbackOptions = {},
): void {
  this.aroundAction(
    (controller, action) => (controller as unknown as LoggedController).logger.logAt(level, action),
    options,
  );
}

export const ClassMethods = { logAt };

export const Logging = new Module((mod) => {
  extend(mod, Concern);
}) as Module & { ClassMethods: typeof ClassMethods };
Logging.ClassMethods = ClassMethods;

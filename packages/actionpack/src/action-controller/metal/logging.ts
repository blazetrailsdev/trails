import { ActionController } from "../../namespaces.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import type { aroundAction, CallbackOptions } from "../../abstract-controller/callbacks.js";
import { Concern, extend, type LogLevel } from "@blazetrails/activesupport";

interface LoggedController {
  logger: { logAt<T>(level: number | LogLevel, fn: () => T): T };
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

export const Logging = { ClassMethods };
extend(Logging, Concern);

rbModConstSet(ActionController, "Logging", Logging);

import { Concern, Rescuable as ASRescuable, extend, include } from "@blazetrails/activesupport";
import { rtest } from "@blazetrails/ruby-compat";
import { ActionMailer } from "./namespaces.js";

interface RescuableClassHost {
  rescueWithHandler(exception: unknown): unknown;
}

interface RescuableHost {
  rescueWithHandler(exception: unknown): unknown;
}

/** @internal */
export async function handleException(
  this: RescuableClassHost,
  exception: unknown,
): Promise<unknown> {
  const handled = await this.rescueWithHandler(exception);
  if (rtest(handled)) return handled;
  throw exception;
}

export const ClassMethods = { handleException };

/** @internal */
export async function handleExceptions<T>(
  this: RescuableHost,
  block: () => T | Promise<T>,
): Promise<T | unknown> {
  try {
    return await block();
  } catch (exception) {
    const handled = await this.rescueWithHandler(exception);
    if (rtest(handled)) return handled;
    throw exception;
  }
}

export const Rescuable = { ClassMethods, handleExceptions };
extend(Rescuable, Concern);
include(Rescuable, ASRescuable);

ActionMailer.Rescuable = Rescuable;

import { Concern, Rescuable as ASRescuable, extend, include } from "@blazetrails/activesupport";
import { Exception, StandardError, rtest } from "@blazetrails/ruby-compat";
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

/** @internal */
export async function handleExceptions<T>(
  this: RescuableHost,
  block: () => T | Promise<T>,
): Promise<T | unknown> {
  try {
    return await block();
  } catch (exception) {
    if (exception instanceof Exception && !(exception instanceof StandardError)) throw exception;
    const handled = await this.rescueWithHandler(exception);
    if (rtest(handled)) return handled;
    throw exception;
  }
}

export const Rescuable = { handleExceptions };
extend(Rescuable, Concern);
include(Rescuable, ASRescuable);
Concern.classMethods.call(Rescuable as never, (mod) => {
  mod.handleException = handleException;
});

ActionMailer.Rescuable = Rescuable;

import { ActionController } from "../../namespaces.js";
import { rbCallSuper } from "@blazetrails/ruby-compat/include";
import { rtest } from "@blazetrails/ruby-compat/object";
import { Concern, Rescuable, extend, include } from "@blazetrails/activesupport";

export const Rescue = { isShowDetailedExceptions, processAction };
extend(Rescue, Concern);
include(Rescue, Rescuable);

interface RescueHost {
  request: { env: Record<string, unknown> };
  isShowDetailedExceptions(): boolean;
  rescueWithHandler(exception: unknown): unknown;
}

export function isShowDetailedExceptions(): boolean {
  return false;
}

/** @internal */
export async function processAction(this: RescueHost, ...args: unknown[]): Promise<unknown> {
  try {
    return await rbCallSuper(this, processAction, ...args);
  } catch (exception) {
    this.request.env["action_dispatch.show_detailed_exceptions"] ||=
      this.isShowDetailedExceptions();
    const handled = await this.rescueWithHandler(exception);
    if (!rtest(handled)) throw exception;
    return handled;
  }
}

ActionController.Rescue = Rescue;

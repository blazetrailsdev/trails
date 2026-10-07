import { Concern, Module, Rescuable, extend, include } from "@blazetrails/activesupport";
import { rtest } from "@blazetrails/ruby-compat";

interface RescueHost {
  request: { env: Record<string, unknown> };
  isShowDetailedExceptions(): boolean;
  rescueWithHandler(exception: unknown): unknown;
}

export const Rescue: Module = new Module((mod) => {
  extend(mod, Concern);
  include(mod, Rescuable);

  mod.defineMethod("isShowDetailedExceptions", isShowDetailedExceptions);
  mod.defineMethod("processAction", processAction);
});

export function isShowDetailedExceptions(): boolean {
  return false;
}

/** @internal */
export async function processAction(this: RescueHost, ...args: unknown[]): Promise<unknown> {
  try {
    return await Rescue.superMethod(this, "processAction")!(...args);
  } catch (exception) {
    this.request.env["action_dispatch.show_detailed_exceptions"] ||=
      this.isShowDetailedExceptions();
    const handled = await this.rescueWithHandler(exception);
    if (!rtest(handled)) throw exception;
    return handled;
  }
}

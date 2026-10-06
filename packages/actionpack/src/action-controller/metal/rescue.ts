import { Concern, Module, Rescuable, extend, include } from "@blazetrails/activesupport";
import { rtest } from "@blazetrails/ruby-compat";

interface RescueHost {
  request: { env: Record<string, unknown> };
  isShowDetailedExceptions(): boolean;
  rescueWithHandler(exception: unknown): unknown;
}

export const Rescue = new Module((mod) => {
  extend(mod, Concern);
  include(mod, Rescuable);

  mod.defineMethod("isShowDetailedExceptions", isShowDetailedExceptions);
});

export function isShowDetailedExceptions(): boolean {
  return false;
}

/** @internal */
export async function processAction(this: RescueHost, block: () => Promise<void>): Promise<void> {
  try {
    await block();
  } catch (exception) {
    this.request.env["action_dispatch.show_detailed_exceptions"] ||=
      this.isShowDetailedExceptions();
    if (!rtest(await this.rescueWithHandler(exception))) throw exception;
  }
}

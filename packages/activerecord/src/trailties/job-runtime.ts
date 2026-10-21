import { rbCallSuper } from "@blazetrails/ruby-compat";
import * as RuntimeRegistry from "../runtime-registry.js";

/** @internal */
function instrument(
  this: object,
  operation: string,
  payload: Record<string, unknown> = {},
  block?: () => unknown,
): unknown {
  if (operation === "perform" && block) {
    return rbCallSuper(this, instrument, operation, payload, () => {
      const dbRuntimeBeforePerform = RuntimeRegistry.sqlRuntime();
      const result = block();
      payload["dbRuntime"] = RuntimeRegistry.sqlRuntime() - dbRuntimeBeforePerform;
      return result;
    });
  } else {
    return rbCallSuper(this, instrument, operation, payload, block);
  }
}

export const JobRuntime = { instrument };

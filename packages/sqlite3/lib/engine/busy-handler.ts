import { ArgumentError, Thread } from "@blazetrails/ruby-compat";
import { SQLite3 } from "../namespaces.js";
import "../constants.js";
import type { BusyHandler, EngineErrors } from "../database.js";

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 * @inventedArm if — PERMANENT
 */
export function withBusyHandler<T>(
  errors: EngineErrors,
  handler: () => BusyHandler | null,
  attempt: () => T,
): T {
  let count = 0;
  for (;;) {
    try {
      return attempt();
    } catch (e) {
      const busy = handler();
      if (busy == null || errors.errcode(e) !== SQLite3.Constants.ErrorCode.BUSY) throw e;
      const result = busy(count++);
      if (result instanceof Promise) {
        new Thread(() => result);
        throw new ArgumentError("busy_handler runs synchronously on this engine");
      }
      if (result === false) throw e;
    }
  }
}

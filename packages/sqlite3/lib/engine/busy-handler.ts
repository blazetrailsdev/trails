import { SQLite3 } from "../namespaces.js";
import "../constants.js";
import type { BusyHandler, EngineErrors } from "../database.js";

/**
 * @internal
 * @noRailsEquivalent PERMANENT
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
      if (busy(count++) === false) throw e;
    }
  }
}

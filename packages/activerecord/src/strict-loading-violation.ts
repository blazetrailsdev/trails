import { Notifications } from "@blazetrails/activesupport";
import { actionOnStrictLoadingViolation } from "./ar-config.js";
import { StrictLoadingViolationError } from "./errors.js";

/**
 * Central dispatch for a detected strict-loading violation. When
 * `ActiveRecord.action_on_strict_loading_violation` is `"raise"` (the
 * default) this throws `StrictLoadingViolationError`; when it is `"log"` it
 * instruments `strict_loading_violation.active_record` and returns, letting
 * the caller continue with the (now warned-about) lazy load.
 *
 * Mirrors `ActiveRecord::Core.strict_loading_violation!` (core.rb:253).
 *
 * @internal
 */
export function strictLoadingViolationBang(record: any, associationName: string): void {
  if (actionOnStrictLoadingViolation === "log") {
    Notifications.instrument("strict_loading_violation.active_record", {
      owner: record?.constructor,
      reflection: associationName,
    });
    return;
  }
  throw StrictLoadingViolationError.forAssociation(record, associationName);
}

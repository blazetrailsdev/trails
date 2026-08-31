/**
 * ActionController::Logging
 *
 * @see https://api.rubyonrails.org/classes/ActionController/Logging.html
 */

import { aroundAction, type CallbackOptions } from "../../abstract-controller/callbacks.js";
import type { ActionCallbackHost } from "../../abstract-controller/callbacks.js";
import type { LogLevel } from "@blazetrails/activesupport";

/** The controller's `logger`, whose own `log_at` swaps the level for the block
 *  (`activesupport/lib/active_support/logger_thread_safe_level.rb:35`). */
interface LoggedController {
  logger: { logAt(level: number | LogLevel, fn: () => void): void };
}

/**
 * Set a different log level per request.
 *
 *     // Use the debug log level if a particular cookie is set.
 *     class ApplicationController extends ActionController.Base {
 *       static _ = ApplicationController.logAt("debug", { if: () => cookies.debug });
 *     }
 */
export function logAt(
  this: ActionCallbackHost,
  level: number | LogLevel,
  options: CallbackOptions = {},
): void {
  aroundAction.call(
    this,
    (controller, action) => (controller as unknown as LoggedController).logger.logAt(level, action),
    options,
  );
}

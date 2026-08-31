/**
 * ActionController::Logging
 *
 * @see https://api.rubyonrails.org/classes/ActionController/Logging.html
 */

import {
  aroundAction,
  type ActionCallbackHost,
  type CallbackOptions,
} from "../../abstract-controller/callbacks.js";
import type { LogLevel } from "@blazetrails/activesupport";

/** `LoggerThreadSafeLevel#log_at` (`logger_thread_safe_level.rb:35`). */
interface LoggedController {
  logger: { logAt(level: number | LogLevel, fn: () => void): void };
}

/** Set a different log level per request. */
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

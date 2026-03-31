/**
 * Deprecator — handles deprecation warnings for ActionController.
 *
 * Mirrors: ActionController.deprecator (ActiveSupport::Deprecation instance)
 *
 * In Rails, each framework has its own deprecator instance. We reuse
 * the ActiveSupport Deprecation class, just like Rails does.
 */
import { Deprecation } from "@blazetrails/activesupport";

export { Deprecation as Deprecator };

export const deprecator = new Deprecation({ gem: "actionpack" });

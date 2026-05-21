/**
 * Deprecator — handles deprecation warnings for ActionView.
 *
 * Mirrors: ActionView.deprecator (ActiveSupport::Deprecation instance).
 */
import { Deprecation } from "@blazetrails/activesupport";

export { Deprecation as Deprecator };

const _deprecator = new Deprecation({ gem: "actionview" });

export function deprecator(): Deprecation {
  return _deprecator;
}

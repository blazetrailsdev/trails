/**
 * Deprecator — handles deprecation warnings for ActionView.
 *
 * Mirrors: ActionView.deprecator (ActiveSupport::Deprecation instance).
 */
import { Deprecation } from "@blazetrails/activesupport";

export { Deprecation as Deprecator };

let _deprecator: Deprecation | undefined;

/** Mirrors: `ActionView.deprecator` (deprecator.rb:4-6) — `@deprecator ||= ActiveSupport::Deprecation.new`. */
export function deprecator(): Deprecation {
  return (_deprecator ??= new Deprecation());
}

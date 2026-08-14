import { Deprecation } from "./deprecation.js";

/**
 * Mirrors: `ActiveSupport.deprecator` (deprecator.rb:3-6) —
 * `ActiveSupport::Deprecation._instance`.
 */
export function deprecator(): Deprecation {
  return Deprecation._instance();
}

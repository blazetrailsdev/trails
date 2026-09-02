// Port of `railties/lib/rails/deprecator.rb`.
import { Deprecation } from "@blazetrails/activesupport";

const _deprecator = new Deprecation();

/** Mirrors `Rails.deprecator` (`deprecator.rb:4-6`). */
export function deprecator(): Deprecation {
  return _deprecator;
}

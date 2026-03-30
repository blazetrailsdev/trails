/**
 * Deprecator — handles deprecation warnings for ActiveModel.
 *
 * Mirrors: ActiveModel.deprecator (ActiveSupport::Deprecation instance)
 *
 * In Rails, each framework has its own deprecator instance. We reuse
 * the ActiveSupport Deprecation class, just like Rails does.
 */
import { Deprecation } from "@blazetrails/activesupport";

export { Deprecation as Deprecator };

export const deprecator = new Deprecation({ gem: "activemodel" });

/**
 * Mirrors: ActiveModel (the root module that exposes .deprecator)
 *
 * In Rails, ActiveModel.deprecator is defined in deprecator.rb,
 * so the Ruby API extractor assigns the ActiveModel module to this file.
 */
export interface ActiveModel {
  readonly deprecator: Deprecation;
}

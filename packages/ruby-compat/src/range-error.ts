import { StandardError } from "./standard-error.js";

/**
 * Ruby's core `RangeError` (`vendor/ruby/error.c:3329`), and the superclass of
 * {@link FloatDomainError} (`vendor/ruby/numeric.c:6155`). This is Ruby core's
 * `::RangeError`; Rails' `ActiveModel::RangeError`
 * (`activemodel/lib/active_model/errors.rb:523`) and `ActiveRecord::RangeError`
 * (`activerecord/lib/active_record/errors.rb:301`) are namespaced classes of
 * their own.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `RangeError`, which Rails inherits
 * rather than defines.
 */
export class RangeError extends StandardError {}

RangeError.prototype.name = "RangeError";

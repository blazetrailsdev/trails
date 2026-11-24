import { StandardError } from "./standard-error.js";

/**
 * Ruby's core `Math::DomainError` (`vendor/ruby/v3.3.11/math.c:1094`
 * `rb_define_class_under(rb_mMath, "DomainError", rb_eStandardError)`).
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Math::DomainError`, which Rails
 * inherits rather than defines.
 */
export class MathDomainError extends StandardError {}

/**
 * Ruby's `Object#inspect` / `Object#to_s` moved to `@blazetrails/ruby-compat`,
 * which is where Ruby core primitives Rails does not define now live: the
 * bodies are `rbInspect` (`rb_inspect`, `vendor/ruby/object.c:704`) and
 * `rbObjAsString` (`rb_obj_as_string`, `vendor/ruby/string.c:1653`).
 *
 * This file is a re-export shim so `@blazetrails/activesupport`'s public
 * surface is unchanged across the move; it is deleted once its callers import
 * from ruby-compat directly.
 */
export { rbInspect as inspect, rbObjAsString as toS } from "@blazetrails/ruby-compat";

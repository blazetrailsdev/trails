/**
 * Ruby methods whose RECEIVER is the port's first ARGUMENT, because TypeScript
 * cannot define the method on the receiver at all (RFC 0099).
 *
 * Ruby writes `name.to_s.camelize`, `columns_hash.values`,
 * `class_name.safe_constantize`. TS cannot monkey-patch `String.prototype` /
 * `Object.prototype`, so `@blazetrails/activesupport` exports these as free
 * functions and the port writes `camelize(name)` — the Ruby receiver becomes TS
 * argument 1. The call-argument comparator diffs argument LISTS, so without this
 * table it reads Ruby `()` against TS `(ref:name)` and flags a shape divergence
 * at every one of those sites.
 *
 * NOT the general "host passed explicitly" case, and the boundary is the whole
 * point of the table. Where the port hands a model/association host to a ported
 * module function (`polymorphicName(klass)`, `throughReflection(assoc)`), the
 * settled trails idiom is a `this`-typed function assigned to the class, the
 * call SHOULD be `Klass.polymorphicName()`, and the divergence is real — those
 * rows are the `call-args-ar-host-param-*` stories, and adding one of those
 * Rails-defined names here would bury them.
 *
 * So the rule for an entry is narrow and closed: the name must be a Ruby
 * LANGUAGE built-in on Object/String/Symbol/Array/Hash, or an ActiveSupport
 * core-ext on one of those, that trails necessarily exports as a free function.
 * A method Rails itself defines on a Rails class NEVER qualifies, however
 * receiver-ish its first argument looks.
 */
export const RECEIVER_AS_FIRST_ARG = new Set([
  // Ruby built-ins on Object / Hash / Array — no prototype to hang them on.
  "keys",
  "values",
  "freeze",
  "dup",
  "to_a",
  "to_h",
  "to_i",
  "to_f",
  "to_s",
  "to_sym",

  // ActiveSupport inflections — String core-exts, exported by
  // @blazetrails/activesupport as free functions of the string.
  "camelize",
  "classify",
  "constantize",
  "dasherize",
  "deconstantize",
  "demodulize",
  "humanize",
  "ordinalize",
  "parameterize",
  "pluralize",
  "safe_constantize",
  "singularize",
  "tableize",
  "titleize",
  "underscore",
  "upcase_first",
  "downcase_first",
  "squish",

  // The remaining Object / String / Array / Hash core-exts with the same shape.
  "blank?",
  "present?",
  "presence",
  "deep_dup",
  "html_safe",
  "to_query",
  "to_sentence",
]);

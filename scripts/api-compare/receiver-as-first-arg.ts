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
 * LANGUAGE built-in on Object/String/Symbol/Array/Hash/Time/Date/Class, or an
 * ActiveSupport core-ext on one of those, that trails necessarily exports as a
 * free function.
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
  "foreign_key",
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
  // active_support/core_ext/hash/keys.rb — `hash.assert_valid_keys(*valid)`,
  // exported by @blazetrails/activesupport as `assertValidKeys(obj, validKeys)`.
  "assert_valid_keys",
  "to_param",
  "as_json",
  // Ruby core `Hash#transform_keys(!)` — `hash.transform_keys { … }`, exported
  // by @blazetrails/activesupport as `transformKeys(hash, block)` because JS
  // objects have no such primitive to hang it on.
  "transform_keys",
  "transform_keys!",
  // active_support/core_ext/hash/indifferent_access.rb — `hash.with_indifferent_access`,
  // exported by @blazetrails/activesupport as `withIndifferentAccess(obj)`.
  "with_indifferent_access",
  // Ruby core `Enumerable#group_by` — `records.group_by { … }`. JS has no
  // `Array.prototype` analogue (`Object.groupBy` keys by string coercion, which
  // Ruby's Hash does not), so @blazetrails/activesupport exports it as
  // `groupBy(collection, block)` and the receiver is TS argument 1.
  "group_by",
  // active_support/core_ext/enumerable.rb:52-60 — `people.index_by { … }`,
  // exported by @blazetrails/activesupport as `indexBy(collection, block)` for
  // the same reason `group_by` is: the Hash is keyed by VALUE, not by string
  // coercion, so no `Array.prototype` analogue exists.
  "index_by",
  // active_support/core_ext/enumerable.rb:184-186 — `values.compact_blank`,
  // exported by @blazetrails/activesupport as `compactBlank(collection)`.
  "compact_blank",
  // Ruby core `Array#empty?` / `Hash#empty?` / `String#empty?` — a language
  // built-in on the same receivers as `blank?` above, and the same shape: no
  // prototype to hang it on, so activerecord's `ruby-empty.ts` exports it as
  // `isEmpty(collection)` and the Ruby receiver is TS argument 1.
  "empty?",
  // Ruby core `Class#subclasses` (3.1+) — `subclasses.each { … }` on a class.
  // A JS class has no such built-in and TS cannot add one, so ActiveSupport's
  // DescendantsTracker exports it as `subclasses(cls)` and the Ruby receiver is
  // TS argument 1.
  "subclasses",
  // active_support/core_ext/time/conversions.rb:55 and
  // core_ext/date/conversions.rb:49 — `timestamp.to_fs(format)`, defined on the
  // Ruby core classes Time/Date, which TS cannot monkey-patch any more than it
  // can String. @blazetrails/activesupport exports it as `toFs(date, format)`,
  // so the Ruby receiver is TS argument 1 at every call site.
  "to_fs",
  // Ruby core `Array#first` — a language built-in on the same receivers as
  // `empty?` above, and the same shape: `values[0]` is an index read, not a
  // call, so activerecord's `ruby-first.ts` exports it as `first(collection)`
  // and the Ruby receiver is TS argument 1.
  "first",
  // Ruby core `Enumerable#min` in its no-argument receiver form —
  // `[limit_value, count].compact.min`. JS's `Math.min(...values)` takes the
  // values as ARGUMENTS and is numbers-only, so @blazetrails/activesupport
  // exports `min(collection)` and the Ruby receiver is TS argument 1.
  "min",
]);

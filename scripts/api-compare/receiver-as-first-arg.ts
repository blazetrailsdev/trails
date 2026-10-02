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
  // Ruby core `Hash#except` — `hash.except(*keys)`, exported by ruby-compat
  // as `except(hash, ...keys)`.
  "except",
  "merge!",
  // Ruby core `Hash#update` (`vendor/ruby/v3.3.11/hash.c:4028`), the
  // `rb_hash_update` body `merge!` above is an alias of, exported by
  // ruby-compat as `update(hash, ...others)`.
  "update",
  "intersect?",
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
  // active_support/core_ext/enumerable.rb:75-87 — `methods.flatten.index_with { … }`
  // (activemodel/lib/active_model/access.rb:9), exported by
  // @blazetrails/activesupport as `indexWith(collection, block)`, as `index_by`
  // above is.
  "index_with",
  // active_support/core_ext/enumerable.rb:184-186 — `values.compact_blank`,
  // exported by @blazetrails/activesupport as `compactBlank(collection)`.
  "compact_blank",
  // Ruby core `Enumerable#filter_map` — `schemes.filter_map { … }`
  // (activerecord/lib/active_record/encryption/encryptable_record.rb:79). No
  // JS method both filters and maps, so @blazetrails/activesupport exports it
  // as `filterMap(collection, block)` and the receiver is TS argument 1.
  "filter_map",
  // Ruby core `Array#empty?` / `Hash#empty?` / `String#empty?` — a language
  // built-in on the same receivers as `blank?` above, and the same shape: no
  // prototype to hang it on, so activerecord's `ruby-empty.ts` exports it as
  // `isEmpty(collection)` and the Ruby receiver is TS argument 1.
  "empty?",
  // Ruby core `Integer#anybits?` (`vendor/ruby/v3.3.11/numeric.c:3647`) — a bit test on
  // a Number, which TS cannot hang on `Number.prototype` any more than it can
  // on `String.prototype`, so @blazetrails/ruby-compat exports it as
  // `anybits(x, mask)` and the Ruby receiver is TS argument 1.
  "anybits?",
  // Ruby core `Class#subclasses` (3.1+) — `subclasses.each { … }` on a class.
  // A JS class has no such built-in and TS cannot add one, so ActiveSupport's
  // DescendantsTracker exports it as `subclasses(cls)` and the Ruby receiver is
  // TS argument 1.
  "subclasses",
  // active_support/core_ext/module/anonymous.rb:27-29 — `klass.anonymous?`,
  // a core-ext on Module, which TS cannot hang on a class any more than
  // `subclasses` above. @blazetrails/activesupport exports it as
  // `isAnonymous(mod)` and the Ruby receiver is TS argument 1.
  "anonymous?",
  // active_support/core_ext/time/conversions.rb:55 and
  // core_ext/date/conversions.rb:49 — `timestamp.to_fs(format)`, defined on the
  // Ruby core classes Time/Date, which TS cannot monkey-patch any more than it
  // can String. @blazetrails/activesupport exports it as `toFs(date, format)`,
  // so the Ruby receiver is TS argument 1 at every call site.
  "to_fs",
  // Ruby core `Array#first` — a language built-in on the same receivers as
  // `empty?` above, and the same shape: `values[0]` is an index read, not a
  // call, so @blazetrails/ruby-compat exports it as `first(collection)`
  // and the Ruby receiver is TS argument 1.
  "first",
  "last",
  // Ruby core `Array#drop` — the same shape as `first` above: `chain.slice(1)`
  // names a JS method Ruby never calls, so @blazetrails/ruby-compat
  // exports it as `drop(collection, n)` and the Ruby receiver is TS argument 1.
  "drop",
  // Ruby core `Array#pack` (`vendor/ruby/v3.3.11/pack.c:197`) — `codepoints.pack("U*")`
  // (multibyte/chars.rb:136,144). The same shape as `drop` above:
  // @blazetrails/ruby-compat exports it as `pack(ary, fmt)` and the Ruby
  // receiver is TS argument 1.
  "pack",
  // Ruby core `Enumerable#min` in its no-argument receiver form —
  // `[limit_value, count].compact.min`. JS's `Math.min(...values)` takes the
  // values as ARGUMENTS and is numbers-only, so @blazetrails/activesupport
  // exports `min(collection)` and the Ruby receiver is TS argument 1.
  "min",
  // Ruby core `Enumerable#partition` (`vendor/ruby/v3.3.11/enum.c:1102`) —
  // `Array(send(method, table, *arguments)).partition { … }`
  // (connection_adapters/abstract/schema_statements.rb:1564). JS has no
  // `Array.prototype` analogue, so @blazetrails/ruby-compat exports it as
  // `partition(ary, block)` and the Ruby receiver is TS argument 1.
  "partition",
  // Ruby core `Array#uniq` (`vendor/ruby/v3.3.11/array.c:6177`) —
  // `loaders.flat_map(&:future_classes).uniq` (associations/preloader/branch.rb:33).
  // It keys on `hash`/`eql?`, which no JS `Set` round-trip does, so
  // @blazetrails/ruby-compat exports it as `uniq(ary)` and the Ruby receiver is
  // TS argument 1.
  "uniq",
  // Ruby core `Array#values_at` (`vendor/ruby/v3.3.11/array.c:3769`) —
  // `name.to_s.split(".").values_at(-2, -1)`
  // (connection_adapters/postgresql_adapter.rb:474,487). JS's `at` takes one
  // index, so @blazetrails/ruby-compat exports it as `valuesAt(ary, ...indexes)`
  // and the Ruby receiver is TS argument 1.
  "values_at",
  // Ruby core `Array#flatten` (`vendor/ruby/v3.3.11/array.c:6476`) —
  // `methods.flatten` (activemodel/lib/active_model/access.rb:9,13). JS's
  // `flat` never sends `to_ary`, so @blazetrails/ruby-compat exports it as
  // `flatten(ary)` and the Ruby receiver is TS argument 1.
  "flatten",
]);

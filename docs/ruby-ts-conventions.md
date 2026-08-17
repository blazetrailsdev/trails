# Ruby → TypeScript naming conventions

<!-- GENERATED FILE — do not edit by hand.
     Regenerate with `pnpm parity:api:conventions`. The source of truth is
     `explainConventions()` in scripts/parity/conventions.ts; CI runs
     `tsx scripts/parity/conventions-doc.ts --check` and fails if this
     file drifts from it. -->

These are the exact rules `parity:api` uses to match a Ruby method or file to
its trails TypeScript counterpart. Follow them when porting Rails code so the
comparison credits your implementation.

## Method names

The Example column shows the TS **symbol name(s)** parity:api looks for (it
matches the first candidate present in the target file), not a call expression.

| Ruby                                                                                                                     | TypeScript                           | Example                                               |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | ----------------------------------------------------- |
| `predicate?` (bare)                                                                                                      | `is*` prefix, camel fallback         | `valid?` → `isValid` or `valid`                       |
| `is_*?`                                                                                                                  | camel form only (no doubled `isIs*`) | `is_number?` → `isNumber`                             |
| `has_*?` / `supports_*?` / `can_*?` / `should_*?` / `needs_*?` / `includes_*?` / `responds_*?` / `allows_*?` / `uses_*?` | camel form + `is*` fallback          | `has_attribute?` → `hasAttribute` or `isHasAttribute` |
| `include?` / `member?` / `exclude?`                                                                                      | `is*` / camel / native JS spelling   | `include?` → `isInclude` or `include` or `includes`   |
| `name!` (bang)                                                                                                           | `*Bang` suffix                       | `save!` → `saveBang`                                  |
| `name=` (setter)                                                                                                         | bare camel name, `set*` fallback     | `table_name=` → `tableName` or `setTableName`         |
| `initialize` / `new`                                                                                                     | `constructor`                        | `initialize` → `constructor`                          |
| `to_s` / `to_str`                                                                                                        | `toString`                           | `to_s` → `toString`                                   |
| `to_json`                                                                                                                | `toJSON`                             | `to_json` → `toJSON`                                  |
| `to_sql`                                                                                                                 | `toSql`                              | `to_sql` → `toSql`                                    |
| `-@` (unary minus)                                                                                                       | `negate`                             | `-@` → `negate`                                       |
| everything else                                                                                                          | `snake_case` → `camelCase`           | `has_many` → `hasMany`                                |

Predicate-form details: a predicate whose Ruby file ALSO defines the bare name
(`Logger#debug` next to `Logger#debug?`) offers the QUOTED LITERAL spelling
first — `get "debug?"` — because its camel candidate names the sibling, not the
predicate. `is_*?` collapses to a single candidate so trails can't
land the redundant doubled `isIsNumber`. Already-predicate prefixes keep the
`is*` fallback because the disambiguating alias is sometimes needed when the bare
name collides with a macro (e.g. `isHasOne()` alongside the `Model.hasOne`
declaration). Leading underscores and runs of underscores collapse like a single
underscore (`visit__regexp` → `visitRegexp`), and underscore-before-capital
collapses too (`visit_Arel_Nodes_X` → `visitArelNodesX`).

Setter-form details: a Ruby `name=` writer matches the bare camel accessor
first, and `set#{Name}` second. The `set*` fallback covers writers whose Rails
body blocks on I/O — `has_one`'s `#{name}=` removes and persists the displaced
target inline — which a synchronous JS property setter cannot express. There the
promise-returning `setAccount` **is** the port of `account=`. Both spellings are
supported and both score as the port — the candidate list is a fallback chain, not
a migration: a sync accessor alone still matches, as it always did.
Underscore-prefixed
writers (`_reflections=`) are `class_attribute` storage slots, never blocking
writers, so they get no `set*` candidate. The ordering flips when the Ruby
surface defines the matching _reader_ too (`beginning_of_week` alongside
`beginning_of_week=`): the reader has claimed the bare camel name, so the writer
is offered `set#{Name}` first — unless Ruby also defines `set_#{base}`, whose
own port already owns that spelling.

## Operators

These Ruby operator methods have no parity:api counterpart (map them to named
methods like `get()`/`set()` as the surrounding code does):

`[]`, `[]=`, `==`, `===`, `!=`, `<=>`, `+`, `-`, `*`, `/`, `%`, `&`, `|`, `^`, `~`, `!`, `!~`, `=~`, `>>`, `<<`, `~@`

## Token renames

Applied to every identifier before camelization (and the equivalent applies to
file paths). A token is renamed when it starts the identifier or follows an
underscore, and ends at an underscore, the end, or the next capital — so
`ERBUtilTest` is `TSEUtilTest` and `erb_util` is `tseUtil`, while
`verb_name` and `Herbert` are left alone. There is no `erb` anywhere in
trails:

| Ruby token | trails token |
| ---------- | ------------ |
| `erb`      | `tse`        |
| `rb`       | `js`         |
| `ERB`      | `TSE`        |
| `Erb`      | `Tse`        |

Test names are not an exception. Rails'
`test "ERB::Util.html_escape should escape unsafe characters"`
(`activesupport/test/core_ext/string_ext_test.rb:1086`) is
`it("TSE::Util.html_escape should escape unsafe characters")` in
`core-ext/string-ext.test.ts`. It still credits: `normalizeErb` in
`scripts/test-compare/compare.ts` applies this table to both sides of the
comparison, so the Ruby name and the TSE-spelled trails name normalize to the
same key. `ERB` survives in trails only where the text quotes the Ruby side —
a JSDoc `Mirrors:` line naming `ERB::Util`, a Rails path like
`core_ext/erb/util.rb`, or fixtures-compare's statuses for Rails YAML that
genuinely is ERB.

## File paths

Ruby `foo_bar.rb` → `foo-bar.ts` (kebab-case), with these path-segment aliases
applied first (trails railties are not `Rails::Railtie` subclasses):

| Ruby segment | trails segment |
| ------------ | -------------- |
| `railtie`    | `trailtie`     |
| `railties`   | `trailties`    |

## Skipped methods

parity:api never expects a TS counterpart for these Ruby methods:

- Ruby core object / value-protocol methods with no meaningful public TypeScript surface (identity, reflection, coercion).
  - `dup`, `clone`, `freeze`, `hash`, `inspect`, `pretty_print`, `object_id`, `class`, `send`, `public_send`, `tap`, `then`, `yield_self`, `respond_to?`, `respond_to_missing?`, `method_missing`, `is_a?`, `kind_of?`, `instance_of?`, `nil?`, `equal?`, `eql?`, `instance_variable_get`, `instance_variable_set`, `instance_variables`, `initialize_copy`, `initialize_dup`, `initialize_clone`, `encode_with`, `init_with`, `to_ary`, `to_a`, `to_i`, `to_f`, `to_h`, `to_hash`, `to_r`, `to_c`
- Ruby module lifecycle hooks — no TypeScript equivalent.
  - `extended`, `included`, `inherited`, `append_features`, `prepend_features`
- Ruby object hooks — no TypeScript equivalent.
  - `singleton_method_added`
- Ruby constant-resolution hook — the VM calls it when a constant name misses. JS resolves nothing at runtime by name, so there is no slot for it.
  - `const_missing`
- NoTouching: TS uses a Map-based depth counter (\_noTouchingDepth) instead of a thread-local array; klasses() is the Rails internal accessor for that array.
  - `klasses`
- CheckPending helpers — depend on Rails.root, system("bin/rails ..."), and the ActiveRecord::Tasks infrastructure that has no JS equivalent.
  - `any_schema_needs_update?`, `db_configs_in_current_env`, `load_schema!`
- Migrator internal index helpers — Rails stores @target_version / @direction as instance variables; our TS Migrator passes them as method parameters instead, so these zero-arg helpers can't be faithfully ported.
  - `target`, `start`, `finish`
- Underscore-prefixed `class_attribute` storage slots whose camelCased name IS the dynamically-assigned class field trails reads/writes directly (`Model._reflections`, `Model._counterCacheColumns`). Exposing a same-named reader method would clobber the storage slot, so the field IS the accessor; there is no separate method to match. `_attr_readonly` is likewise trails' private `_readonlyAttributes` set — its public reader is `readonlyAttributes` (Rails: `readonly_attributes` reads `_attr_readonly`), which is ported. `_destroy_association_async_job` is likewise the underscore storage slot (trails' `_destroyAssociationAsyncJob` field) behind the ported public accessor `destroyAssociationAsyncJob` (Rails aliases `destroy_association_async_job=` to `_destroy_association_async_job=`).
  - `_reflections`, `_reflections=`, `_reflections?`, `_counter_cache_columns`, `_counter_cache_columns=`, `_counter_cache_columns?`, `_attr_readonly`, `_attr_readonly=`, `_attr_readonly?`, `_destroy_association_async_job`, `_destroy_association_async_job=`, `_destroy_association_async_job?`

## Scoped skipped methods

parity:api skips these Ruby methods, but only within the listed files — they
have a real TS surface elsewhere, so the skip is file-scoped to avoid silencing
a genuine gap:

- The GC and allocation counters on Notifications::Event (notifications/instrumenter.rb:174-186, :213-227): `gc_time` and `allocations` are differences of `now_gc` / `now_allocations`, which read `GC.total_time` and `GC.stat(:total_allocated_objects)`. A JS engine exposes neither — there is no counter to read without a `node:*` import the trails packages are forbidden — and a port returning a constant would report `0` allocations and `0` GC time for every event, i.e. read as measured when nothing was measured. Scoped to notifications/instrumenter.rb so the names stay expected anywhere a real counter is ported.
  - `gc_time`, `allocations`, `now_gc`, `now_allocations` (only in: `notifications/instrumenter.rb`)
- ActiveSupport::Autoload plumbing that `NumberHelper` gets from `extend ActiveSupport::Autoload` (number_helper.rb:8-19): `autoload`, `autoload_under`, `autoload_at`, `eager_autoload` and `eager_load!` register a constant name against a file for Zeitwerk to resolve on first reference, and `eager_load!` forces the whole set in production. ESM has no autoload — every converter module is a static `import` at the top of number-helper.ts, resolved before the module body runs — so there is nothing to register and nothing to force. Same reason as the dependencies.rb group below; scoped to number_helper.rb so the names stay expected wherever a real autoload surface is ported.
  - `autoload`, `autoload_under`, `autoload_at`, `eager_autoload`, `eager_load!` (only in: `number_helper.rb`)
- Ruby's Marshal hooks on TimeWithZone (time_with_zone.rb:529-535): `marshal_dump` answers the `[utc, time_zone.name, time]` triple `Marshal.dump` writes and `marshal_load` rebuilds the receiver from it. JS has no Marshal — no core serializer that consults a per-class hook — so neither has a caller to answer, and a hand-rolled pair would be a trails invention rather than a port. Scoped to time_with_zone.rb.
  - `marshal_dump`, `marshal_load` (only in: `time_with_zone.rb`)
- Rails' alias*method chains around Ruby's Time operators — `+`/`-`/`<=>`/`eql?` (time/calculations.rb:304-355) and `Time.at` (:59-60). Each pair exists only so the redefined operator can fall back to the original core-Ruby one under its `\*\_without*\*`name. JS has no operator overloading and no way to reopen`Date`'s operators, so trails' ported arithmetic is the plain `since`/`ago`/`compare` functions and the chain halves have no receiver to attach to. Scoped to time/calculations.rb.
  - `plus_with_duration`, `plus_without_duration`, `minus_with_duration`, `minus_without_duration`, `minus_with_coercion`, `minus_without_coercion`, `compare_with_coercion`, `compare_without_coercion`, `eql_with_coercion`, `eql_without_coercion`, `at_with_coercion`, `at_without_coercion`, `at` (only in: `core_ext/time/calculations.rb`)
- DateTime's offset-shifting conversions (date_time/calculations.rb:169-193): `localtime`/`getlocal` and `utc`/`getgm`/`getutc`/`gmtime`. Each answers a `Time` for the same instant at a different offset, and trails represents a time as a `Date`/`Temporal.Instant` — an absolute instant carrying no offset — so there is nothing for them to convert; the offset-carrying surface is TimeWithZone (`utc`, `utcOffset`, `isUtc` in time-with-zone.ts). Scoped to date_time/calculations.rb so it cannot silence the genuine Time/TimeWithZone members of the same names. `utc?` and `utc_offset` came off this list once the DateTime receiver existed to read an offset off: both are ported in core-ext/date-time/calculations.ts.
  - `localtime`, `getlocal`, `utc`, `getgm`, `getutc`, `gmtime` (only in: `core_ext/date_time/calculations.rb`)
- Ruby method-(re)definition machinery: `silence_redefinition_of_method` exists to suppress MRI's method-redefined warning, `redefine_singleton_method` wraps `define_singleton_method` in that suppression, and `method_visibility` reports the public/protected/private state MRI stores per method (core_ext/module/redefine_method.rb:5-22). JS has no redefinition warning to silence — reassigning a prototype property is silent — and no runtime visibility state to query, so all three collapse to a plain assignment the port already does inline at every call site.
  - `silence_redefinition_of_method`, `redefine_singleton_method`, `method_visibility` (only in: `core_ext/module/redefine_method.rb`)
- Ruby module-body metaprogramming DSLs. `alias_attribute` (core_ext/module/aliasing.rb) defines reader/writer/predicate methods by `module_eval`ing generated source; `concerning`/`concern` (core_ext/module/concerning.rb:104-114) create an anonymous nested `Module` from a block, name it as a constant on the host and `include` it. Both need runtime source evaluation and constant assignment into a module namespace, neither of which exists in TypeScript; trails' equivalent is `Concern` + the `include()`/`Included<>` mixin idiom, which the callers already use directly. (ActiveRecord's own `alias_attribute` is a separate method on ActiveRecord::Base and is ported there.)
  - `alias_attribute`, `concerning`, `concern` (only in: `core_ext/module/aliasing.rb`, `core_ext/module/concerning.rb`)
- `attr_internal_define` (core*ext/module/attr_internal.rb:26-31) is the shared `define_method` back end for `attr_internal_reader`/`_writer`, and `attr_internal_naming_format` is the `attr_accessor`-generated pair for the `@*%s`template it interpolates. trails'`attrInternal\*`helpers assign the underlying property directly rather than generating methods from a name template, so there is no format string to expose and no define_method back end to name; the naming format is reachable as`getAttrInternalNamingFormat`/`setAttrInternalNamingFormat`.
  - `attr_internal_define`, `attr_internal_naming_format` (only in: `core_ext/module/attr_internal.rb`)
- `String#squish!` and `String#remove!` (core_ext/string/filters.rb:21-25,40-46) mutate the receiver via `gsub!`/`strip!`. A JS string is an immutable primitive — there is no receiver to mutate and no way to hand the caller back a changed one — so the bang forms cannot exist; `squish` and `remove` are the whole surface.
  - `squish!`, `remove!` (only in: `core_ext/string/filters.rb`)
- PostgreSQL::Quoting#lookup_cast_type resolves a sql_type string with a live `SELECT '<type>'::regtype::oid` query, so trails' port is async and diverges from the sync abstract signature it overrides; it is tracked by the `pg-lookup-cast-type-async-divergence` story rather than counted as a gap. Scoped to postgresql/quoting.rb: the abstract `Quoting#lookup_cast_type` (abstract/quoting.rb:234-236) IS ported, so a flat skip would now hide a real surface.
  - `lookup_cast_type` (only in: `connection_adapters/postgresql/quoting.rb`)
- ActiveSupport::Duration#+@ (`def +@; self; end`, duration.rb:326) is Ruby's unary-plus operator returning self. TS has no syntax that dispatches to a named method for `+duration` — the unary `+` coerces through `valueOf()` to a number — so a ported `identity()` method would be inert dead code no caller can reach (unlike `-@` → `negate`, which is called from `minus()` via `other.negate()`). Scoped to duration.rb so it can't silence a genuine `+@` gap elsewhere.
  - `+@` (only in: `duration.rb`)
- Ruby `-@` deduplication operator (`alias :-@ :deduplicate` in ConnectionAdapters::Deduplicable). TS has no unary-minus method; trails realizes dedup via the `deduplicate` free function plus the DeduplicableBase constructor, so the alias has no separate TS surface on these value objects. Scoped to the AR adapter value-object files so it can't silence ActiveSupport::Duration#-@ (ported as `Duration#negate`).
  - `-@` (only in: `connection_adapters/deduplicable.rb`, `connection_adapters/column.rb`, `connection_adapters/sql_type_metadata.rb`, `connection_adapters/mysql/type_metadata.rb`, `connection_adapters/postgresql/type_metadata.rb`)
- ActiveModel::Dirty#as_json (dirty.rb:264-268) exists only to add `mutations_from_database` / `mutations_before_last_save` to the serializer's `except:` list. Those names leak into Ruby's output because `Serialization#serializable_hash` reads `attributes`, which for a plain ActiveModel is commonly `instance_values` — and the mutation trackers are ivars on the model itself. In trails the trackers are not attributes: they live on a separate `DirtyTracker` object reachable only via `_dirty`, and `asJson` serializes through `serializableHash` over the declared attribute set, so the exclusion is inherent and a ported override would be a no-op. Scoped to dirty.rb so it cannot silence a genuine `as_json` gap elsewhere.
  - `as_json` (only in: `dirty.rb`)
- Calculations#build_count_subquery is realized inline inside trails' performCount (calculations.ts) — the limit/offset count path builds the subquery there rather than as a separate named method.
  - `build_count_subquery` (only in: `relation.rb`, `relation/calculations.rb`)
- Calculations#perform_calculation is ported as the module-level free function performCalculation (calculations.ts), which matches against calculations.rb but is not an instance method on the Relation class surface that relation.rb compares against.
  - `perform_calculation` (only in: `relation.rb`)
- AdapterHelper's four hand-written capability predicates are rendered by packages/activerecord/src/support/supports.ts as entries in one feature-keyed table (`default_expression`, `non_unique_constraint_name`, `text_column_with_default`, `sql_standard_drop_constraint`) rather than as four exports on adapter-helper.ts, exactly as the ~15 predicates `adapter_helper.rb` itself generates with `define_method` are. The table keys are the `supports_<key>?` names, so the pairing is checkable; duplicating them as free functions here would give two sources of truth for the same capability. Scoped to adapter_helper.rb, the only Ruby file in the tree that defines these names.
  - `supports_default_expression?`, `supports_non_unique_constraint_name?`, `supports_text_column_with_default?`, `supports_sql_standard_drop_constraint?` (only in: `adapter_helper.rb`)
- `module ARTest` opens in config.rb and is reopened in connection.rb, so the Ruby extractor records one ARTest entity filed under config.rb and every ARTest method buckets there. Two populations end up in that bucket, neither of which is a gap. (1) `connection_name` / `test_configuration_hashes` / `connect` (connection.rb) and `expand_config` (config.rb) ARE ported — all four in packages/activerecord/src/support/connection.ts, next to the CONNECTIONS entries they name and expand. They miss only because the bucket's expected TS file is config.ts; export status is not why — in the default full-surface run the TS extractor records file-local functions too, so the non-exported `expandConfig` (connection.ts:269) is as visible to parity:api as the three exported ones, and exporting it would not match it. (Under --public-only the two sides drop it symmetrically: Ruby's `expand_config` is itself private, under config.rb's `private` at :13, so neither side offers it.) Moving it into config.ts is the only thing that would match it, and that is what cannot happen: it is typed on `NamedConnection` and `ARUNIT_ENTRY_NAMES`, both declared in connection.ts, which already imports from config.ts — so the move would CREATE an import cycle, and dragging those declarations along would relocate the `connections:` vocabulary out of the file mirroring connection.rb. (2) `config` / `config_file` / `read_config` are the memoized read of test/config.yml; trails ships no config.yml — the `connections:` hash is expressed directly as the CONNECTIONS table in connection.ts and the sub-setting readers in config.ts — so there is no file to locate, copy from config.example.yml, or parse. Scoped to config.rb, the only Ruby file in the tree that defines these names.
  - `config`, `config_file`, `read_config`, `expand_config`, `connection_name`, `test_configuration_hashes`, `connect` (only in: `config.rb`)
- `ActiveSupport::Messages::Rotator#initialize` (messages/rotator.rb:6-12) is an `initialize` on a module Rails installs with `prepend`, so it runs as part of the _host's_ constructor chain via `super`. TypeScript has no expression for that: `prepend()` (packages/activesupport/src/prepend.ts) wraps methods on the prototype and cannot wrap a constructor, so the port keeps the Rails name as an exported `initialize` function that each rotatable class calls from its own constructor (message-verifier.ts, message-encryptor.ts). There is no TS `constructor` at the mapped site for the comparison to find — the same shape as the `included`/`extended`/`inherited` hooks. Scoped to messages/rotator.rb so a real class's `initialize` is still expected to map to a `constructor`.
  - `initialize` (only in: `messages/rotator.rb`; ported in TS as `initialize`)
- ActiveSupport::Dependencies (dependencies.rb), ActiveSupport::Autoload (dependencies/autoload.rb) and the ShareLock wrapper Dependencies.interlock returns (dependencies/interlock.rb) are Zeitwerk autoload/reload machinery: an interlock guarding concurrent constant loads, the autoload/eager-load path registries it walks, and the `autoload :Const` / `eager_autoload` DSL that defers a constant to a file. ESM has neither half — every `import` is eager and resolved before the importing module's body, and there is no reloading — so trails has no constant table to guard and nothing to reload. Where Ruby leans on call-time constant resolution to break a load-order cycle, the port uses the zero-import slot module instead (CLAUDE.md, "Call-time constant resolution"); the two require_dependency suites in trails (dependencies.test.ts, autoload.test.ts) are permanent skips for the same reason. Scoped to these three files so `clear`, `autoload`, `autoloader`, `initialize`, `running` and the `*_paths` readers stay expected everywhere else.
  - `interlock`, `interlock=`, `run_interlock`, `load_interlock`, `unload_interlock`, `autoload_paths`, `autoload_paths=`, `autoload_once_paths`, `autoload_once_paths=`, `_eager_load_paths`, `_eager_load_paths=`, `_autoloaded_tracked_classes`, `_autoloaded_tracked_classes=`, `autoloader`, `autoloader=`, `clear`, `search_for_file`, `eager_load?`, `autoload`, `autoload_under`, `autoload_at`, `eager_autoload`, `eager_load!`, `initialize`, `loading`, `unloading`, `start_unloading`, `done_unloading`, `start_running`, `done_running`, `running`, `permit_concurrent_loads`, `raw_state` (only in: `dependencies.rb`, `dependencies/autoload.rb`, `dependencies/interlock.rb`)
- `Date#acts_like_date?` (core_ext/date/acts_like.rb:7) and DateTime's `acts_like_date?` / `acts_like_time?` (core_ext/date_time/acts_like.rb:8-14) are marker methods: Ruby reopens the class to hang an empty predicate on it so `Object#acts_like?` can find it with `respond_to?`. trails' receivers for those two arms are `Temporal.PlainDate` and a JS `Date` / `Temporal.Instant` — built-ins the port does not monkey-patch — so there is no reopening to define a marker in, and the `:date` / `:time` arms answer from the receiver's own type instead (core-ext/date-and-time/calculations.ts:200-210). Scoped to the two acts_like.rb files: `TimeWithZone#acts_like_time?` is a real method on a trails-owned class and IS ported (time-with-zone.ts:935).
  - `acts_like_date?`, `acts_like_time?` (only in: `core_ext/date/acts_like.rb`, `core_ext/date_time/acts_like.rb`)
- `ActiveSupport::Multibyte.proxy_class` / `proxy_class=` (multibyte.rb:14-22) configure which class `String#mb_chars` wraps a String in, defaulting to ActiveSupport::Multibyte::Chars. That proxy has no port and is skipped for the reason in the multibyte/chars.rb group below, and `mb_chars` itself (core_ext/string/multibyte.rb) is an excluded file — so this is an accessor whose only value, only default and only reader would all be absent. Scoped to multibyte.rb.
  - `proxy_class`, `proxy_class=` (only in: `multibyte.rb`)
- ActiveSupport::Concurrency::ShareLock (concurrency/share_lock.rb) is a reader-writer lock built on `Monitor` + `ConditionVariable`: it tracks per-Thread share counts, blocks a thread until the waiters it conflicts with drain, and exists because MRI preempts threads between any two bytecodes. JS has no preemption — a turn of the event loop runs to completion — so there is no window for the sharing/exclusive counts to be observed torn, and nothing for a thread to block on: trails' Interlock/Executor callers take the null lock (concurrency/null-lock.ts), which is what Rails itself substitutes when it does not need the real one. Scoped to share_lock.rb so `exclusive`, `sharing`, `initialize` and `raw_state` stay expected everywhere else.
  - `initialize`, `raw_state`, `start_exclusive`, `stop_exclusive`, `start_sharing`, `stop_sharing`, `exclusive`, `sharing`, `yield_shares`, `busy_for_exclusive?`, `busy_for_sharing?`, `eligible_waiters?`, `wait_for` (only in: `concurrency/share_lock.rb`)
- ActiveSupport::Testing::Parallelization::Server and ::Worker (testing/parallelization/server.rb, worker.rb) are the two halves of the fork-based parallel runner skipped against parallelization.rb above: the Server is a DRb-published queue of test jobs, the Worker is the forked child that pops from it, re-runs the setup hooks and reports back over DRb. vitest owns process/worker parallelism and work distribution in trails, so neither half has an object to hang off. Scoped to the two files.
  - `initialize`, `record`, `pop`, `start_worker`, `stop_worker`, `active_workers?`, `interrupt`, `shutdown`, `work_from_queue`, `perform_job`, `safe_record`, `after_fork`, `run_cleanup`, `add_setup_exception`, `set_process_title` (only in: `testing/parallelization/server.rb`, `testing/parallelization/worker.rb`)
- ActiveSupport::Multibyte::Chars (multibyte/chars.rb) is a proxy that wraps a String, force-encodes it to UTF-8 and re-implements `split`/`slice!`/`reverse`/`limit`/`grapheme_length`/`tidy_bytes` so they count characters rather than bytes — the problem Ruby has because a String is a byte sequence with an encoding. A JS string is a UTF-16 code unit sequence and `[...str]` already iterates by code point, so every member of the proxy is either the identity or a plain string operation; there is no wrapper to hold. Nothing in the port reaches for it: `mb_chars` has no caller in Rails' own activesupport lib outside core_ext/string/multibyte.rb (Inflector never uses it), and trails' multibyte suites assert the code-point semantics directly against JS strings. Scoped to multibyte/chars.rb so `split`, `reverse`, `compose`, `as_json` and the rest stay expected in every other file.
  - `wrapped_string`, `to_s`, `to_str`, `match?`, `acts_like_string?`, `initialize`, `split`, `slice!`, `reverse`, `limit`, `titleize`, `titlecase`, `decompose`, `compose`, `grapheme_length`, `tidy_bytes`, `as_json`, `reverse!`, `tidy_bytes!`, `chars` (only in: `multibyte/chars.rb`)
- ActiveSupport::Testing::Parallelization (testing/parallelization.rb) forks OS processes, hands each one a DRb queue and re-runs the setup hooks in the child. vitest owns process/worker parallelism in trails — the pool, the work distribution and the per-worker setup are all its config, not something the port reimplements — so there is no trails object for `size` / `shutdown` / the fork hooks to hang off. Scoped to parallelization.rb so `size`, `shutdown` and `initialize` stay expected everywhere else.
  - `after_fork_hooks`, `run_cleanup_hooks`, `initialize`, `size`, `shutdown`, `after_fork_hook`, `run_cleanup_hook` (only in: `testing/parallelization.rb`)
- The minitest runner plumbing on ActiveSupport::TestCase (test_case.rb): `test_order` selects minitest's shuffle seed policy, `parallelize` / `parallelize_setup` / `parallelize_teardown` configure the fork-based parallel runner (see the parallelization.rb group), and `method_name` is the `alias_method :method_name, :name` onto Minitest::Test#name. vitest is the runner in trails: it owns ordering and worker parallelism, so none of these has a port to point at. (The `test "..." do` macro test_case.rb:153 extends in is skipped against its own file, testing/declarative.rb.) Scoped to test_case.rb — the assertion helpers this file picks up by `include` (assert_not\*, assert_raises, assert_difference, assert_changes, assert_deprecated, stub_const, the TimeHelpers travel/freeze family) are NOT skipped: they are portable and still counted against testing/assertions.rb and its siblings.
  - `method_name`, `test_order`, `test_order=`, `parallelize`, `parallelize_setup`, `parallelize_teardown` (only in: `test_case.rb`)
- ActiveSupport::Testing::Declarative#test (testing/declarative.rb:13) is the `test "..." do` declaration macro: it defines a `test_<name>` method on the class for minitest to discover by reflection. vitest discovers nothing by reflection — a test is the `it("...")` call itself, which is also the spelling parity:test matches Rails test names through — so the macro has no port to point at. Scoped to declarative.rb, its only definition site (test_case.rb:153 merely `extend`s the module), so `test` stays expected anywhere it is a real method.
  - `test` (only in: `testing/declarative.rb`)
- ActiveSupport::Concurrency::LoadInterlockAwareMonitor (concurrency/load_interlock_aware_monitor.rb) is a Ruby `Monitor` subclass whose only purpose is to release the Dependencies interlock while a thread blocks on the lock, so a competing thread can keep autoloading. Both halves are absent from the port: JS has no threads to serialize with a reentrant mutex and no `Thread.handle_interrupt`, and there is no interlock to permit loads through (see the dependencies.rb group). RFC 0073's permanent-connection-checkout work does not change that — it converges where a connection is held, not what guards constant loading — and trails' load-interlock suite is a permanent skip. Scoped to this file so `synchronize` and `initialize` stay expected elsewhere.
  - `mon_enter`, `synchronize`, `initialize`, `mon_try_enter`, `mon_exit` (only in: `concurrency/load_interlock_aware_monitor.rb`)
- MemoryStore#synchronize (memory_store.rb:191-193) is `@monitor.synchronize(&block)` — the Monitor that makes MemoryStore thread-safe across Ruby threads. JavaScript has no threads and no preemption inside a synchronous body, so every read_entry/write_entry the Ruby method wraps is already atomic and a ported wrapper could only be an inert `block()` call. Scoped to memory_store.rb so it cannot silence a genuine `synchronize` elsewhere.
  - `synchronize` (only in: `cache/memory_store.rb`)
- FileStore#lock_file (file_store.rb:147-159) takes an advisory `File::LOCK_EX` flock around a read-modify-write so concurrent PROCESSES serialize on the entry file. There is no flock in the async fs surface trails is allowed to use (no node:\* imports), and no portable equivalent, so the increment/decrement path runs unguarded. Scoped to cache/file_store.rb.
  - `lock_file` (only in: `cache/file_store.rb`)

## Ruby-only classes

parity:api expects no TS counterpart for these Ruby classes at all — neither
their methods nor their place in the inheritance chain. Each one only papers
over a gap in the Ruby standard library that JavaScript does not have:

- `I18n::JSON`
  - `i18n/lib/i18n/backend/key_value.rb:7-22` defines `I18n::JSON` at load time as whichever JSON library is installed — `:11`/`:14` wrap `Oj` in `encode`/`decode` when the gem is present, and `:19`-`:21` falls back to `JSON = ActiveSupport::JSON`. It is a library-selection shim, not behavior: JavaScript has `JSON` in the language, and its `stringify`/`parse` are that `encode`/`decode`, which is what `KeyValue` calls directly (`packages/i18n/src/backend/key-value.ts`). Mirroring it would mean adding a trails class whose whole body forwards to a global the language already provides.

## Arity overrides

The advisory arity check (arity.ts) suppresses these Ruby methods — their
positional-arg ranges diverge from the TS port for a documented reason (a Ruby
alias/delegate the extractor reads as zero-arg, a porting-pattern artifact),
not a real signature gap:

- `validates_size_of` is `alias_method :validates_size_of, :validates_length_of`, so the Ruby extractor records the alias with zero positional params (the alias definition carries no signature) while the TS port spells the real `(attribute, options)` signature it forwards to.
  - `validates_size_of`
- `match?` is `delegate :match?, to: :@name` (forwards to String#match?), so the Ruby extractor records the delegation with zero positional params while the TS port spells the real `(pattern)` signature.
  - `match?`
- `build_having_clause` is `alias :build_having_clause :build_where_clause` (query_methods.rb:1654), so the Ruby extractor records the alias with zero positional params while the TS port spells the real `(opts, rest)` signature it forwards to build_where_clause.
  - `build_having_clause`
- Static-host porting pattern (CLAUDE.md): these Rails instance/class methods are ported as free functions taking the host class explicitly as a leading `cls` param, so the TS arity is one higher than Rails. The receiver is the definitional self, not a real extra argument.
  - `apply_pending_attribute_modifications`, `reset_default_attributes`
- The real `parse_float` port is `parseFloatRails(num, precision, scale?)`, bound to the validator via prototype assignment plus a `declare parseFloat` type member; the by-name candidate pool only sees the zero-arg `declare` form, not the implementation's arity.
  - `parse_float`
- `prepare_delete_statement` is `alias :prepare_delete_statement :prepare_update_statement` in both to_sql.rb and mysql.rb, so the Ruby extractor records the alias with zero positional params (the alias definition carries no signature) while the TS port spells the real `(o)` signature it forwards to.
  - `prepare_delete_statement`
- Arel::Visitors::ToSql aliases a family of Ruby value classes to a shared visitor body (`alias :visit_X :unsupported`, `:visit_Set :visit_Array`, `:visit_Arel_Nodes_Quoted :visit_Arel_Nodes_Casted`), so the Ruby extractor records each alias with zero positional params (the alias definition carries no signature) while the TS port spells the real `(o)` / `(o, collector)` signature it forwards to. (ToSql-only names; aliases also defined in dot.rb live in the shared group below.)
  - `visit_Arel_Nodes_Quoted`, `visit_ActiveSupport_Multibyte_Chars`, `visit_ActiveSupport_StringInquirer`, `visit_Class`, `visit_Hash`, `visit_String`
- Arel::Visitors::Dot aliases its node visitors to shared bodies (`visit__regexp`, `visit__no_edges`, `visit__children`, `visit_String`, `visit_Array`), so the Ruby extractor records each alias with zero positional params (the alias definition carries no signature) while the TS port spells the real `(o)` signature it forwards to. (Dot-only names; aliases also defined in to_sql.rb live in the shared group below.)
  - `visit_Arel_Nodes_Regexp`, `visit_Arel_Nodes_NotRegexp`, `visit_Arel_Nodes_CurrentRow`, `visit_Arel_Nodes_Distinct`, `visit_Arel_Nodes_And`, `visit_Arel_Nodes_Or`, `visit_Arel_Nodes_With`, `visit_Integer`, `visit_Arel_Nodes_SqlLiteral`
- Ruby value-class visit aliases defined in BOTH to_sql.rb (alias to `unsupported`) and dot.rb (alias to `visit_String`/`visit_Array`); the extractor reads each alias as zero-arg in either file while the TS ports spell the real `(o)` signature. Scoped to both files (one entry per name keeps the override-name set globally unique).
  - `visit_BigDecimal`, `visit_Date`, `visit_DateTime`, `visit_FalseClass`, `visit_Float`, `visit_NilClass`, `visit_Symbol`, `visit_Time`, `visit_TrueClass`, `visit_Set`

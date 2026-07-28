# Ruby → TypeScript naming conventions

<!-- GENERATED FILE — do not edit by hand.
     Regenerate with `pnpm api:conventions`. The source of truth is
     `explainConventions()` in scripts/api-compare/conventions.ts; CI runs
     `tsx scripts/api-compare/conventions-doc.ts --check` and fails if this
     file drifts from it. -->

These are the exact rules `api:compare` uses to match a Ruby method or file to
its trails TypeScript counterpart. Follow them when porting Rails code so the
comparison credits your implementation.

## Method names

The Example column shows the TS **symbol name(s)** api:compare looks for (it
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

Predicate-form details: `is_*?` collapses to a single candidate so trails can't
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
writers, so they get no `set*` candidate.

## Operators

These Ruby operator methods have no api:compare counterpart (map them to named
methods like `get()`/`set()` as the surrounding code does):

`[]`, `[]=`, `==`, `===`, `!=`, `<=>`, `+`, `-`, `*`, `/`, `%`, `&`, `|`, `^`, `~`, `!`, `!~`, `=~`, `>>`, `<<`, `~@`

## Token renames

Applied to every identifier before camelization (and the equivalent applies to
file paths):

| Ruby token | trails token |
| ---------- | ------------ |
| `erb`      | `tse`        |
| `ERB`      | `TSE`        |
| `Erb`      | `Tse`        |

## File paths

Ruby `foo_bar.rb` → `foo-bar.ts` (kebab-case), with these path-segment aliases
applied first (trails railties are not `Rails::Railtie` subclasses):

| Ruby segment | trails segment |
| ------------ | -------------- |
| `railtie`    | `trailtie`     |
| `railties`   | `trailties`    |

## Skipped methods

api:compare never expects a TS counterpart for these Ruby methods:

- Ruby core object / value-protocol methods with no meaningful public TypeScript surface (identity, reflection, coercion).
  - `dup`, `clone`, `freeze`, `hash`, `inspect`, `pretty_print`, `object_id`, `class`, `send`, `public_send`, `tap`, `then`, `yield_self`, `respond_to?`, `respond_to_missing?`, `method_missing`, `is_a?`, `kind_of?`, `instance_of?`, `nil?`, `equal?`, `eql?`, `instance_variable_get`, `instance_variable_set`, `instance_variables`, `initialize_copy`, `initialize_dup`, `initialize_clone`, `encode_with`, `init_with`, `to_ary`, `to_a`, `to_i`, `to_f`, `to_h`, `to_hash`, `to_r`, `to_c`
- Ruby module lifecycle hooks — no TypeScript equivalent.
  - `extended`, `included`, `inherited`
- Ruby object hooks — no TypeScript equivalent.
  - `singleton_method_added`
- NoTouching: TS uses a Map-based depth counter (\_noTouchingDepth) instead of a thread-local array; klasses() is the Rails internal accessor for that array.
  - `klasses`
- PostgreSQL::Quoting#lookup_cast_type issues an async DB query (SELECT oid) to resolve a sql_type string; our standalone-function quoting module has no adapter instance, so this can't be ported without a larger refactor.
  - `lookup_cast_type`
- CheckPending helpers — depend on Rails.root, system("bin/rails ..."), and the ActiveRecord::Tasks infrastructure that has no JS equivalent.
  - `any_schema_needs_update?`, `db_configs_in_current_env`, `load_schema!`
- Migrator internal index helpers — Rails stores @target_version / @direction as instance variables; our TS Migrator passes them as method parameters instead, so these zero-arg helpers can't be faithfully ported.
  - `target`, `start`, `finish`
- Underscore-prefixed `class_attribute` storage slots whose camelCased name IS the dynamically-assigned class field trails reads/writes directly (`Model._reflections`, `Model._counterCacheColumns`). Exposing a same-named reader method would clobber the storage slot, so the field IS the accessor; there is no separate method to match. `_attr_readonly` is likewise trails' private `_readonlyAttributes` set — its public reader is `readonlyAttributes` (Rails: `readonly_attributes` reads `_attr_readonly`), which is ported. `_destroy_association_async_job` is likewise the underscore storage slot (trails' `_destroyAssociationAsyncJob` field) behind the ported public accessor `destroyAssociationAsyncJob` (Rails aliases `destroy_association_async_job=` to `_destroy_association_async_job=`).
  - `_reflections`, `_reflections=`, `_reflections?`, `_counter_cache_columns`, `_counter_cache_columns=`, `_counter_cache_columns?`, `_attr_readonly`, `_attr_readonly=`, `_attr_readonly?`, `_destroy_association_async_job`, `_destroy_association_async_job=`, `_destroy_association_async_job?`

## Scoped skipped methods

api:compare skips these Ruby methods, but only within the listed files — they
have a real TS surface elsewhere, so the skip is file-scoped to avoid silencing
a genuine gap:

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
- `module ARTest` opens in config.rb and is reopened in connection.rb, so the Ruby extractor records one ARTest entity filed under config.rb and every ARTest method buckets there. Two populations end up in that bucket, neither of which is a gap. (1) `connection_name` / `test_configuration_hashes` / `connect` (connection.rb) and `expand_config` (config.rb) ARE ported — all four in packages/activerecord/src/support/connection.ts, next to the CONNECTIONS entries they name and expand. They miss only because the bucket's expected TS file is config.ts; export status is not why — in the default full-surface run the TS extractor records file-local functions too, so the non-exported `expandConfig` (connection.ts:269) is as visible to api:compare as the three exported ones, and exporting it would not match it. (Under --public-only the two sides drop it symmetrically: Ruby's `expand_config` is itself private, under config.rb's `private` at :12, so neither side offers it.) Moving it into config.ts is the only thing that would match it, and that is what cannot happen: it is typed on `NamedConnection` and `ARUNIT_ENTRY_NAMES`, both declared in connection.ts, which already imports from config.ts — so the move would CREATE an import cycle, and dragging those declarations along would relocate the `connections:` vocabulary out of the file mirroring connection.rb. (2) `config` / `config_file` / `read_config` are the memoized read of test/config.yml; trails ships no config.yml — the `connections:` hash is expressed directly as the CONNECTIONS table in connection.ts and the sub-setting readers in config.ts — so there is no file to locate, copy from config.example.yml, or parse. Scoped to config.rb, the only Ruby file in the tree that defines these names.
  - `config`, `config_file`, `read_config`, `expand_config`, `connection_name`, `test_configuration_hashes`, `connect` (only in: `config.rb`)

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
- Rails AttributeMethods compiles attribute accessors via a CodeGenerator that evals method-body strings; trails has no eval/code generation, so the port drops the `code_generator`/`parameters`/`call_args` and keyword args these helpers thread into the generated source and defines the method directly.
  - `define_proxy_call`, `define_call`
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

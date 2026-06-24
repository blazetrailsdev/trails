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
| `name!` (bang)                                                                                                           | `*Bang` suffix                       | `save!` → `saveBang`                                  |
| `name=` (setter)                                                                                                         | bare camel name                      | `table_name=` → `tableName`                           |
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

## Scoped skipped methods

api:compare skips these Ruby methods, but only within the listed files — they
have a real TS surface elsewhere, so the skip is file-scoped to avoid silencing
a genuine gap:

- Ruby `-@` deduplication operator (`alias :-@ :deduplicate` in ConnectionAdapters::Deduplicable). TS has no unary-minus method; trails realizes dedup via the `deduplicate` free function plus the DeduplicableBase constructor, so the alias has no separate TS surface on these value objects. Scoped to the AR adapter value-object files so it can't silence ActiveSupport::Duration#-@ (ported as `Duration#negate`).
  - `-@` (only in: `connection_adapters/deduplicable.rb`, `connection_adapters/column.rb`, `connection_adapters/sql_type_metadata.rb`, `connection_adapters/mysql/type_metadata.rb`, `connection_adapters/postgresql/type_metadata.rb`)

## Arity overrides

The advisory arity check (arity.ts) suppresses these Ruby methods — their
positional-arg ranges diverge from the TS port for a documented reason (a Ruby
alias/delegate the extractor reads as zero-arg, a porting-pattern artifact),
not a real signature gap:

- `validates_size_of` is `alias_method :validates_size_of, :validates_length_of`, so the Ruby extractor records the alias with zero positional params (the alias definition carries no signature) while the TS port spells the real `(attribute, options)` signature it forwards to.
  - `validates_size_of`
- `match?` is `delegate :match?, to: :@name` (forwards to String#match?), so the Ruby extractor records the delegation with zero positional params while the TS port spells the real `(pattern)` signature.
  - `match?`
- Rails AttributeMethods compiles attribute accessors via a CodeGenerator that evals method-body strings; trails has no eval/code generation, so the port drops the `code_generator`/`parameters`/`call_args` and keyword args these helpers thread into the generated source and defines the method directly.
  - `define_proxy_call`, `define_call`
- Static-host porting pattern (CLAUDE.md): these Rails instance/class methods are ported as free functions taking the host class explicitly as a leading `cls` param, so the TS arity is one higher than Rails. The receiver is the definitional self, not a real extra argument.
  - `apply_pending_attribute_modifications`, `reset_default_attributes`
- The real `parse_float` port is `parseFloatRails(num, precision, scale?)`, bound to the validator via prototype assignment plus a `declare parseFloat` type member; the by-name candidate pool only sees the zero-arg `declare` form, not the implementation's arity.
  - `parse_float`

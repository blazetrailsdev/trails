/**
 * Shared naming conventions for Ruby → TypeScript mapping.
 * Used by compare.ts and lint-deps.ts.
 */

import * as path from "path";

/**
 * Token-level Ruby→TS renames applied before camelization.
 *
 * `erb` → `tse`: trails uses a `.tse` (Trails Server Embedded) template
 * extension in place of Rails' `.erb` — see docs/actionview-100-percent.md.
 *
 * Applied to every identifier that flows through `snakeToCamel` —
 * currently Ruby method names (via `rubyMethodToTs`) and constant
 * fragments embedded in dot-notation method names like
 * `visit_Arel_Nodes_X`. File paths get the equivalent substitution
 * separately in `rubyFileToTs` below.
 */
const TOKEN_RENAMES: Record<string, string> = {
  erb: "tse",
  ERB: "TSE",
  Erb: "Tse",
};

function applyTokenRenames(snake: string): string {
  return snake.replace(
    /(^|_)(erb|ERB|Erb)(?=_|$)/g,
    (_m, pre, tok: string) => pre + TOKEN_RENAMES[tok],
  );
}

export function snakeToCamel(name: string): string {
  // Preserve leading underscores (e.g., _load_from → _loadFrom)
  const match = name.match(/^(_+)/);
  const prefix = match ? match[1] : "";
  const rest = applyTokenRenames(name.slice(prefix.length));
  // Match runs of `_` followed by any letter or digit so Ruby names with
  // capitalized segments (e.g. `visit_Arel_Nodes_SelectStatement`) OR
  // doubled underscores (Ruby's private-alias-target convention, e.g.
  // `visit__regexp`, `visit__no_edges`) collapse to the same camelCase
  // shape — `visit_Arel_Nodes_X → visitArelNodesX`,
  // `visit__regexp → visitRegexp`, `visit__no_edges → visitNoEdges`.
  return prefix + rest.replace(/_+([a-zA-Z0-9])/g, (_, ch: string) => ch.toUpperCase());
}

/**
 * Path-segment alias table applied across all framework source roots,
 * before kebab-casing each directory segment and the basename.
 *
 * Trails railties are not `Rails::Railtie` subclasses — the alias signals
 * that distinction (and avoids needing per-package overrides for every
 * framework that ships a `railtie.rb` or a `railties/` directory).
 */
const PATH_SEGMENT_ALIASES: Record<string, string> = {
  railtie: "trailtie",
  railties: "trailties",
};

/**
 * Ruby file path → expected TS file path (kebab-case, .ts extension).
 *
 * Uses `path.posix.*` so the mapping stays cross-platform stable —
 * Ruby source paths are POSIX, the rest of api-compare keys files by
 * POSIX paths, and the default `path.join` would return backslashes
 * on Windows.
 */
export function rubyFileToTs(rubyFile: string, _pkg?: string): string {
  const dir = path.posix.dirname(rubyFile);
  const base = path.posix.basename(rubyFile, ".rb");
  const aliasedBase = PATH_SEGMENT_ALIASES[base] ?? base;
  const kebab = aliasedBase.replace(/_/g, "-");
  const tsFile = kebab.replace(/\berb\b/g, "tse") + ".ts";
  if (dir === ".") return tsFile;
  const tsDir = dir
    .split("/")
    .map((d) => PATH_SEGMENT_ALIASES[d] ?? d)
    .map((d) => d.replace(/_/g, "-").replace(/\berb\b/g, "tse"))
    .join("/");
  return path.posix.join(tsDir, tsFile);
}

export const OPERATORS = new Set([
  "[]",
  "[]=",
  "==",
  "===",
  "!=",
  "<=>",
  "+",
  "-",
  "*",
  "/",
  "%",
  "&",
  "|",
  "^",
  "~",
  "!",
  "!~",
  "=~",
  ">>",
  "<<",
  "~@",
]);

/**
 * Ruby methods api:compare never expects a TS counterpart for, grouped by the
 * reason they're skipped. The grouping is the single source of truth for both
 * the `SKIP` lookup set (below) and the generated conventions doc — keeping the
 * rationale machine-readable means a future skip can't land without a reason,
 * and the doc can't drift from the list.
 */
export interface SkipGroup {
  /** Why every name in this group is skipped. */
  reason: string;
  names: string[];
}

export const SKIP_GROUPS: SkipGroup[] = [
  {
    reason:
      "Ruby core object / value-protocol methods with no meaningful public " +
      "TypeScript surface (identity, reflection, coercion).",
    names: [
      "dup",
      "clone",
      "freeze",
      "hash",
      "inspect",
      "pretty_print",
      "object_id",
      "class",
      "send",
      "public_send",
      "tap",
      "then",
      "yield_self",
      "respond_to?",
      "respond_to_missing?",
      "method_missing",
      "is_a?",
      "kind_of?",
      "instance_of?",
      "nil?",
      "equal?",
      "eql?",
      "instance_variable_get",
      "instance_variable_set",
      "instance_variables",
      "initialize_copy",
      "initialize_dup",
      "initialize_clone",
      "encode_with",
      "init_with",
      "to_ary",
      "to_a",
      "to_i",
      "to_f",
      "to_h",
      "to_hash",
      "to_r",
      "to_c",
    ],
  },
  {
    reason: "Ruby module lifecycle hooks — no TypeScript equivalent.",
    names: ["extended", "included", "inherited"],
  },
  {
    reason: "Ruby object hooks — no TypeScript equivalent.",
    names: ["singleton_method_added"],
  },
  {
    reason:
      "NoTouching: TS uses a Map-based depth counter (_noTouchingDepth) instead " +
      "of a thread-local array; klasses() is the Rails internal accessor for " +
      "that array.",
    names: ["klasses"],
  },
  {
    reason:
      "PostgreSQL::Quoting#lookup_cast_type issues an async DB query (SELECT oid) " +
      "to resolve a sql_type string; our standalone-function quoting module has " +
      "no adapter instance, so this can't be ported without a larger refactor.",
    names: ["lookup_cast_type"],
  },
  {
    reason:
      'CheckPending helpers — depend on Rails.root, system("bin/rails ..."), and ' +
      "the ActiveRecord::Tasks infrastructure that has no JS equivalent.",
    names: ["any_schema_needs_update?", "db_configs_in_current_env", "load_schema!"],
  },
  {
    reason:
      "Migrator internal index helpers — Rails stores @target_version / " +
      "@direction as instance variables; our TS Migrator passes them as method " +
      "parameters instead, so these zero-arg helpers can't be faithfully ported.",
    names: ["target", "start", "finish"],
  },
  {
    reason:
      "Underscore-prefixed `class_attribute` storage slots whose camelCased name " +
      "IS the dynamically-assigned class field trails reads/writes directly " +
      "(`Model._reflections`, `Model._counterCacheColumns`). Exposing a same-named " +
      "reader method would clobber the storage slot, so the field IS the accessor; " +
      "there is no separate method to match. `_attr_readonly` is likewise trails' " +
      "private `_readonlyAttributes` set — its public reader is `readonlyAttributes` " +
      "(Rails: `readonly_attributes` reads `_attr_readonly`), which is ported. " +
      "`_destroy_association_async_job` is likewise the underscore storage slot " +
      "(trails' `_destroyAssociationAsyncJob` field) behind the ported public " +
      "accessor `destroyAssociationAsyncJob` (Rails aliases " +
      "`destroy_association_async_job=` to `_destroy_association_async_job=`).",
    names: [
      "_reflections",
      "_reflections=",
      "_reflections?",
      "_counter_cache_columns",
      "_counter_cache_columns=",
      "_counter_cache_columns?",
      "_attr_readonly",
      "_attr_readonly=",
      "_attr_readonly?",
      "_destroy_association_async_job",
      "_destroy_association_async_job=",
      "_destroy_association_async_job?",
    ],
  },
  {
    reason:
      "DEVIATION pending convergence (not an accepted design): Rails' `serialize` " +
      "falls back to `coder ||= default_column_serializer` (default YAMLColumn, " +
      "serialization.rb:183-184), but trails defaults a coderless `serialize` to " +
      "JSON (serialize.ts) and exposes no configurable class-level default, so " +
      "callers cannot set the Rails serializer default. Converging requires " +
      "flipping that default (≈40 serialized-attribute tests assume JSON) and is " +
      "tracked in story default-column-serializer-config-accessor (RFC 0023). " +
      "Skipped only to keep this api:compare pass green until that lands — the " +
      "`?` predicate additionally has no trails caller.",
    names: [
      "default_column_serializer",
      "default_column_serializer=",
      "default_column_serializer?",
    ],
  },
];

export const SKIP = new Set<string>(SKIP_GROUPS.flatMap((g) => g.names));

/**
 * Like {@link SkipGroup}, but the skip applies *only* within the listed Ruby
 * source files (path relative to the package lib root, as emitted by the
 * comparison) — never globally. Use this when a Ruby method name has a real TS
 * surface in some files but legitimately no counterpart in others, so a global
 * {@link SKIP} entry would silence a genuine gap elsewhere.
 */
export interface ScopedSkipGroup {
  reason: string;
  names: string[];
  rubyFiles: string[];
}

export const SCOPED_SKIP_GROUPS: ScopedSkipGroup[] = [
  {
    reason:
      "Ruby `-@` deduplication operator (`alias :-@ :deduplicate` in " +
      "ConnectionAdapters::Deduplicable). TS has no unary-minus method; trails " +
      "realizes dedup via the `deduplicate` free function plus the " +
      "DeduplicableBase constructor, so the alias has no separate TS surface on " +
      "these value objects. Scoped to the AR adapter value-object files so it " +
      "can't silence ActiveSupport::Duration#-@ (ported as `Duration#negate`).",
    names: ["-@"],
    rubyFiles: [
      "connection_adapters/deduplicable.rb",
      "connection_adapters/column.rb",
      "connection_adapters/sql_type_metadata.rb",
      "connection_adapters/mysql/type_metadata.rb",
      "connection_adapters/postgresql/type_metadata.rb",
    ],
  },
  {
    reason:
      "ActiveRecord::Delegation delegates a curated Array/Enumerable set " +
      "(`delegate ... to: :records`, delegation.rb:101) and a model set " +
      "(`to: :model`, delegation.rb:106). trails realizes both through the " +
      "runtime delegation Proxy in relation/delegation.ts (delegateArrayMethod / " +
      "delegateEnumerableMethod for records, classMethodDelegator for the model), " +
      "not as named methods on Relation — Ruby-only entries (sample, rotate, " +
      "in_groups, to_sentence, to_fs, as_json, …) have no JS analogue and are " +
      "intentionally dropped, while the rest route through native JS names " +
      "(each → forEach, index → indexOf) via the Proxy. Tracked for convergence " +
      "(expose under Rails names) by story relation-delegation-rails-named-methods.",
    names: [
      "to_xml",
      "each",
      "join",
      "sample",
      "reverse",
      "rotate",
      "compact",
      "in_groups",
      "in_groups_of",
      "to_sentence",
      "to_fs",
      "to_formatted_s",
      "as_json",
      "shuffle",
      "split",
      "index",
      "rindex",
      "primary_key",
      "with_connection",
      "connection",
      "table_name",
      "sanitize_sql_like",
    ],
    rubyFiles: ["relation.rb", "relation/delegation.rb"],
  },
  {
    reason:
      "Same ActiveRecord::Delegation surface as above, but these names are only " +
      "an unmatched gap on the aggregate Relation class (relation.rb): the " +
      "delegation.rb module compare already credits trails counterparts (e.g. " +
      "delegation.ts' own name()), so the skip is scoped to relation.rb to avoid " +
      "un-crediting those. Tracked for convergence by story " +
      "relation-delegation-rails-named-methods.",
    names: ["slice", "transaction", "name"],
    rubyFiles: ["relation.rb"],
  },
  {
    reason:
      "Relation#reverse_order_value is a deferred boolean flag in Rails; trails " +
      "has no such field — reverseOrderBang eagerly flips the stored order " +
      "clauses (query_methods.rb reverse_sql_order semantics) at call time, so " +
      "there is no value to expose. Tracked for convergence (store a deferred " +
      "flag, expose the accessor) by story " +
      "reverse-order-value-deferred-flag-convergence.",
    names: ["reverse_order_value", "reverse_order_value="],
    rubyFiles: ["relation.rb", "relation/query_methods.rb"],
  },
  {
    reason:
      "Calculations#build_count_subquery is realized inline inside trails' " +
      "performCount (calculations.ts) — the limit/offset count path builds the " +
      "subquery there rather than as a separate named method.",
    names: ["build_count_subquery"],
    rubyFiles: ["relation.rb", "relation/calculations.rb"],
  },
  {
    reason:
      "Calculations#perform_calculation is ported as the module-level free " +
      "function performCalculation (calculations.ts), which matches against " +
      "calculations.rb but is not an instance method on the Relation class " +
      "surface that relation.rb compares against.",
    names: ["perform_calculation"],
    rubyFiles: ["relation.rb"],
  },
];

/** Map of scoped-skip Ruby method name → the set of Ruby files it's skipped in. */
const SCOPED_SKIP_FILES = new Map<string, Set<string>>();
for (const g of SCOPED_SKIP_GROUPS) {
  for (const name of g.names) {
    const files = SCOPED_SKIP_FILES.get(name) ?? new Set<string>();
    for (const f of g.rubyFiles) files.add(f);
    SCOPED_SKIP_FILES.set(name, files);
  }
}

/** True when `rubyName` should be skipped specifically within `rubyFile`. */
export function isScopedSkip(rubyName: string, rubyFile: string): boolean {
  return SCOPED_SKIP_FILES.get(rubyName)?.has(rubyFile) ?? false;
}

/**
 * A group of Ruby method names whose arity is *intentionally* allowed to diverge
 * from the TS port. Like {@link SkipGroup} but scoped: `rubyFiles` restricts the
 * override to the Ruby source files (path relative to the package lib root, as
 * emitted in arity-mismatches.json) where the divergence is documented. Scoping
 * is mandatory so a generic name (`match?`, `parse_float`) suppressed for one
 * package can't silence a real gap in another that happens to share the name.
 */
export interface ArityOverrideGroup {
  reason: string;
  names: string[];
  rubyFiles: string[];
}

/**
 * Ruby method+file pairs whose arity is *intentionally* allowed to diverge from
 * the TS port; the advisory arity check (compare.ts) suppresses these. For
 * documented deliberate differences only, NOT to silence real gaps.
 */
export const ARITY_OVERRIDE_GROUPS: ArityOverrideGroup[] = [
  {
    reason:
      "`validates_size_of` is `alias_method :validates_size_of, :validates_length_of`, " +
      "so the Ruby extractor records the alias with zero positional params (the " +
      "alias definition carries no signature) while the TS port spells the real " +
      "`(attribute, options)` signature it forwards to.",
    names: ["validates_size_of"],
    rubyFiles: ["api.rb", "model.rb", "validations.rb", "validations/absence.rb"],
  },
  {
    reason:
      "`match?` is `delegate :match?, to: :@name` (forwards to String#match?), so the " +
      "Ruby extractor records the delegation with zero positional params while the TS " +
      "port spells the real `(pattern)` signature.",
    names: ["match?"],
    rubyFiles: ["naming.rb"],
  },
  {
    reason:
      "`build_having_clause` is `alias :build_having_clause :build_where_clause` " +
      "(query_methods.rb:1654), so the Ruby extractor records the alias with zero " +
      "positional params while the TS port spells the real `(opts, rest)` signature " +
      "it forwards to build_where_clause.",
    names: ["build_having_clause"],
    rubyFiles: ["relation/query_methods.rb", "relation.rb"],
  },
  {
    reason:
      "Rails AttributeMethods compiles attribute accessors via a CodeGenerator that " +
      "evals method-body strings; trails has no eval/code generation, so the port " +
      "drops the `code_generator`/`parameters`/`call_args` and keyword args these " +
      "helpers thread into the generated source and defines the method directly.",
    names: ["define_proxy_call", "define_call"],
    rubyFiles: ["attribute_methods.rb"],
  },
  {
    reason:
      "Static-host porting pattern (CLAUDE.md): these Rails instance/class methods " +
      "are ported as free functions taking the host class explicitly as a leading " +
      "`cls` param, so the TS arity is one higher than Rails. The receiver is the " +
      "definitional self, not a real extra argument.",
    names: ["apply_pending_attribute_modifications", "reset_default_attributes"],
    rubyFiles: ["attribute_registration.rb"],
  },
  {
    reason:
      "The real `parse_float` port is `parseFloatRails(num, precision, scale?)`, " +
      "bound to the validator via prototype assignment plus a `declare parseFloat` " +
      "type member; the by-name candidate pool only sees the zero-arg `declare` " +
      "form, not the implementation's arity.",
    names: ["parse_float"],
    rubyFiles: ["validations/numericality.rb"],
  },
  {
    reason:
      "`prepare_delete_statement` is `alias :prepare_delete_statement :prepare_update_statement` " +
      "in both to_sql.rb and mysql.rb, so the Ruby extractor records the alias with zero " +
      "positional params (the alias definition carries no signature) while the TS port spells " +
      "the real `(o)` signature it forwards to.",
    names: ["prepare_delete_statement"],
    rubyFiles: ["visitors/to_sql.rb", "visitors/mysql.rb"],
  },
  {
    reason:
      "Arel::Visitors::ToSql aliases a family of Ruby value classes to a shared " +
      "visitor body (`alias :visit_X :unsupported`, `:visit_Set :visit_Array`, " +
      "`:visit_Arel_Nodes_Quoted :visit_Arel_Nodes_Casted`), so the Ruby extractor " +
      "records each alias with zero positional params (the alias definition carries " +
      "no signature) while the TS port spells the real `(o)` / `(o, collector)` " +
      "signature it forwards to. (ToSql-only names; aliases also defined in dot.rb " +
      "live in the shared group below.)",
    names: [
      "visit_Arel_Nodes_Quoted",
      "visit_ActiveSupport_Multibyte_Chars",
      "visit_ActiveSupport_StringInquirer",
      "visit_Class",
      "visit_Hash",
      "visit_String",
    ],
    rubyFiles: ["visitors/to_sql.rb"],
  },
  {
    reason:
      "Arel::Visitors::Dot aliases its node visitors to shared bodies " +
      "(`visit__regexp`, `visit__no_edges`, `visit__children`, `visit_String`, " +
      "`visit_Array`), so the Ruby extractor records each alias with zero positional " +
      "params (the alias definition carries no signature) while the TS port spells " +
      "the real `(o)` signature it forwards to. (Dot-only names; aliases also defined " +
      "in to_sql.rb live in the shared group below.)",
    names: [
      "visit_Arel_Nodes_Regexp",
      "visit_Arel_Nodes_NotRegexp",
      "visit_Arel_Nodes_CurrentRow",
      "visit_Arel_Nodes_Distinct",
      "visit_Arel_Nodes_And",
      "visit_Arel_Nodes_Or",
      "visit_Arel_Nodes_With",
      "visit_Integer",
      "visit_Arel_Nodes_SqlLiteral",
    ],
    rubyFiles: ["visitors/dot.rb"],
  },
  {
    reason:
      "Ruby value-class visit aliases defined in BOTH to_sql.rb (alias to " +
      "`unsupported`) and dot.rb (alias to `visit_String`/`visit_Array`); the " +
      "extractor reads each alias as zero-arg in either file while the TS ports spell " +
      "the real `(o)` signature. Scoped to both files (one entry per name keeps the " +
      "override-name set globally unique).",
    names: [
      "visit_BigDecimal",
      "visit_Date",
      "visit_DateTime",
      "visit_FalseClass",
      "visit_Float",
      "visit_NilClass",
      "visit_Symbol",
      "visit_Time",
      "visit_TrueClass",
      "visit_Set",
    ],
    rubyFiles: ["visitors/to_sql.rb", "visitors/dot.rb"],
  },
];

/** Map of overridden Ruby method name → the set of Ruby files it's overridden in. */
const ARITY_OVERRIDE_FILES = new Map<string, Set<string>>();
for (const g of ARITY_OVERRIDE_GROUPS) {
  for (const name of g.names) {
    const files = ARITY_OVERRIDE_FILES.get(name) ?? new Set<string>();
    for (const f of g.rubyFiles) files.add(f);
    ARITY_OVERRIDE_FILES.set(name, files);
  }
}

/** True when the advisory arity check should skip this Ruby method in this file. */
export function isArityOverridden(rubyName: string, rubyFile: string): boolean {
  return ARITY_OVERRIDE_FILES.get(rubyName)?.has(rubyFile) ?? false;
}

/**
 * Camel-prefixes that are *already* predicates, so the bare camel form is the
 * canonical candidate and the `is*` form is only a disambiguating fallback
 * (e.g. `hasOne` + `isHasOne`). `rubyMethodToTs` matches on these and the
 * generated conventions doc enumerates them — keeping the single list here
 * means the doc can't name a different set than the matcher actually uses.
 */
export const ALREADY_PREDICATE_PREFIXES = [
  "has",
  "supports",
  "can",
  "should",
  "needs",
  "includes",
  "responds",
  "allows",
  "uses",
];

const ALREADY_PREDICATE_RE = new RegExp(`^(${ALREADY_PREDICATE_PREFIXES.join("|")})`);

/**
 * Convert Ruby method name → candidate TS names to try matching.
 *
 * Returns null if the method should be skipped entirely. Otherwise
 * returns one or more candidate TS names; compare.ts matches the first
 * candidate found in the target file's symbol set.
 *
 * Predicate naming policy:
 *   - `is_*?` returns ONLY the camel form (`is_number?` → ["isNumber"]).
 *     The doubled `isIsNumber` form is always redundant — Ruby already
 *     conveys the predicate via the `is_` prefix.
 *   - Other already-predicate prefixes (`has_*?`, `supports_*?`,
 *     `can_*?`, …) keep BOTH the camel form and the isPrefixed form
 *     (`has_attribute?` → ["hasAttribute", "isHasAttribute"]). The
 *     isPrefixed fallback exists because trails sometimes needs the
 *     disambiguating alias when the bare name collides with a Rails
 *     macro — e.g. Reflection exposes `isHasOne()` alongside the
 *     `Model.hasOne` association declaration.
 *   - Bare predicates (`valid?`, `blank?`) return both forms with the
 *     isPrefixed form first (`valid?` → ["isValid", "valid"]).
 */
export function rubyMethodToTs(name: string): string[] | null {
  if (OPERATORS.has(name)) return null;
  if (SKIP.has(name)) return null;
  if (name === "initialize" || name === "new") return ["constructor"];
  if (name === "to_s" || name === "to_str") return ["toString"];
  if (name === "to_json") return ["toJSON"];
  if (name === "to_sql") return ["toSql"];
  // Ruby unary minus (`-@`) ports to a named `negate` method (e.g.
  // ActiveSupport::Duration#-@ → Duration#negate). Files where `-@` has no TS
  // surface (the AR Deduplicable value objects, where `-@` is just Ruby's
  // `alias :-@ :deduplicate`) suppress it via SCOPED_SKIP_GROUPS instead.
  if (name === "-@") return ["negate"];
  // Ruby unary plus (`+@`) ports to a named `identity` method (e.g.
  // ActiveSupport::Duration#+@ → Duration#identity, which returns `self`).
  if (name === "+@") return ["identity"];

  if (name.endsWith("?")) {
    const base = name.slice(0, -1);
    const camel = snakeToCamel(base);
    const isPrefixed = "is" + camel.replace(/^./, (c) => c.toUpperCase());
    // Names already starting with `is_` collapse to one candidate so
    // `is_number?` → ["isNumber"] (not ["isIsNumber", "isNumber"]).
    // The `isPrefixed` form is intentionally NOT offered as a fallback
    // here — Ruby already conveys the predicate via the `is_` prefix,
    // and offering `isIsNumber` would let a trails author land that
    // doubled form and still get api:compare credit. Test on the Ruby
    // base name (with the underscore) so e.g. `isolation_level?` —
    // which camelizes to `isolationLevel` — is NOT swept into this
    // branch.
    if (base.startsWith("is_")) {
      return [camel];
    }
    // Other already-predicate Ruby prefixes (has_one?, supports_x?,
    // can_y?, …) keep both candidates: the canonical camel form
    // (`hasOne`) and the isPrefixed fallback (`isHasOne`). The
    // fallback exists because trails sometimes needs the disambiguating
    // alias when the bare name collides with a macro (e.g. Reflection
    // exposes `isHasOne()` as a predicate alongside the `Model.hasOne`
    // association declaration).
    if (ALREADY_PREDICATE_RE.test(camel)) {
      return [camel, isPrefixed];
    }
    return [isPrefixed, camel];
  }

  if (name.endsWith("!")) {
    const base = name.slice(0, -1);
    return [snakeToCamel(base) + "Bang"];
  }

  if (name.endsWith("=")) {
    const base = name.slice(0, -1);
    return [snakeToCamel(base)];
  }

  return [snakeToCamel(name)];
}

/**
 * Render the Ruby→TypeScript naming conventions as Markdown.
 *
 * This is the single source of truth for the agent-facing conventions doc:
 * `scripts/api-compare/conventions-doc.ts` writes the return value to a file
 * and CI re-runs it with `--check` to fail on drift. Everything that can be
 * derived from the live tables (operators, token renames, path aliases, the
 * skip list, worked examples) is computed here rather than hand-written, so
 * the doc is structurally incapable of going stale; only the prose policy
 * lines below are authored, and they live next to the code they describe.
 */
export function explainConventions(): string {
  // Render the candidate TS *symbol names* (not call expressions) — a Ruby
  // setter like `name=` maps to a symbol named `name`, which may be a method
  // or an accessor, so trailing `()` would be misleading.
  const example = (ruby: string): string => {
    const ts = rubyMethodToTs(ruby);
    if (ts === null) return "_(skipped)_";
    return ts.map((c) => `\`${c}\``).join(" or ");
  };

  const renameRows = Object.entries(TOKEN_RENAMES)
    .map(([from, to]) => `| \`${from}\` | \`${to}\` |`)
    .join("\n");

  const pathAliasRows = Object.entries(PATH_SEGMENT_ALIASES)
    .map(([from, to]) => `| \`${from}\` | \`${to}\` |`)
    .join("\n");

  const operatorList = [...OPERATORS].map((o) => `\`${o}\``).join(", ");

  // Enumerate the real already-predicate prefix list (not a hand-picked
  // subset) so the row can't name a different set than the matcher uses.
  const predicatePrefixes = ALREADY_PREDICATE_PREFIXES.map((p) => `\`${p}_*?\``).join(" / ");

  const skipSections = SKIP_GROUPS.map((g) => {
    const names = g.names.map((n) => `\`${n}\``).join(", ");
    return `- ${g.reason}\n  - ${names}`;
  }).join("\n");

  const arityOverrideSections = ARITY_OVERRIDE_GROUPS.map((g) => {
    const names = g.names.map((n) => `\`${n}\``).join(", ");
    return `- ${g.reason}\n  - ${names}`;
  }).join("\n");

  const scopedSkipSections = SCOPED_SKIP_GROUPS.map((g) => {
    const names = g.names.map((n) => `\`${n}\``).join(", ");
    const files = g.rubyFiles.map((f) => `\`${f}\``).join(", ");
    return `- ${g.reason}\n  - ${names} (only in: ${files})`;
  }).join("\n");

  return `# Ruby → TypeScript naming conventions

<!-- GENERATED FILE — do not edit by hand.
     Regenerate with \`pnpm api:conventions\`. The source of truth is
     \`explainConventions()\` in scripts/api-compare/conventions.ts; CI runs
     \`tsx scripts/api-compare/conventions-doc.ts --check\` and fails if this
     file drifts from it. -->

These are the exact rules \`api:compare\` uses to match a Ruby method or file to
its trails TypeScript counterpart. Follow them when porting Rails code so the
comparison credits your implementation.

## Method names

The Example column shows the TS **symbol name(s)** api:compare looks for (it
matches the first candidate present in the target file), not a call expression.

| Ruby | TypeScript | Example |
| ---- | ---------- | ------- |
| \`predicate?\` (bare) | \`is*\` prefix, camel fallback | \`valid?\` → ${example("valid?")} |
| \`is_*?\` | camel form only (no doubled \`isIs*\`) | \`is_number?\` → ${example("is_number?")} |
| ${predicatePrefixes} | camel form + \`is*\` fallback | \`has_attribute?\` → ${example("has_attribute?")} |
| \`name!\` (bang) | \`*Bang\` suffix | \`save!\` → ${example("save!")} |
| \`name=\` (setter) | bare camel name | \`table_name=\` → ${example("table_name=")} |
| \`initialize\` / \`new\` | \`constructor\` | \`initialize\` → ${example("initialize")} |
| \`to_s\` / \`to_str\` | \`toString\` | \`to_s\` → ${example("to_s")} |
| \`to_json\` | \`toJSON\` | \`to_json\` → ${example("to_json")} |
| \`to_sql\` | \`toSql\` | \`to_sql\` → ${example("to_sql")} |
| \`-@\` (unary minus) | \`negate\` | \`-@\` → ${example("-@")} |
| \`+@\` (unary plus) | \`identity\` | \`+@\` → ${example("+@")} |
| everything else | \`snake_case\` → \`camelCase\` | \`has_many\` → ${example("has_many")} |

Predicate-form details: \`is_*?\` collapses to a single candidate so trails can't
land the redundant doubled \`isIsNumber\`. Already-predicate prefixes keep the
\`is*\` fallback because the disambiguating alias is sometimes needed when the bare
name collides with a macro (e.g. \`isHasOne()\` alongside the \`Model.hasOne\`
declaration). Leading underscores and runs of underscores collapse like a single
underscore (\`visit__regexp\` → \`visitRegexp\`), and underscore-before-capital
collapses too (\`visit_Arel_Nodes_X\` → \`visitArelNodesX\`).

## Operators

These Ruby operator methods have no api:compare counterpart (map them to named
methods like \`get()\`/\`set()\` as the surrounding code does):

${operatorList}

## Token renames

Applied to every identifier before camelization (and the equivalent applies to
file paths):

| Ruby token | trails token |
| ---------- | ------------ |
${renameRows}

## File paths

Ruby \`foo_bar.rb\` → \`foo-bar.ts\` (kebab-case), with these path-segment aliases
applied first (trails railties are not \`Rails::Railtie\` subclasses):

| Ruby segment | trails segment |
| ------------ | -------------- |
${pathAliasRows}

## Skipped methods

api:compare never expects a TS counterpart for these Ruby methods:

${skipSections}

## Scoped skipped methods

api:compare skips these Ruby methods, but only within the listed files — they
have a real TS surface elsewhere, so the skip is file-scoped to avoid silencing
a genuine gap:

${scopedSkipSections}

## Arity overrides

The advisory arity check (arity.ts) suppresses these Ruby methods — their
positional-arg ranges diverge from the TS port for a documented reason (a Ruby
alias/delegate the extractor reads as zero-arg, a porting-pattern artifact),
not a real signature gap:

${arityOverrideSections}
`;
}

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
 * There is no `erb` anywhere in trails: the rename fires on an underscore
 * boundary AND on a CamelCase one, so a constant fragment carries it too
 * (`ERBUtilTest` → `TSEUtilTest`) rather than only `erb_util` → `tseUtil`.
 * `verb` / `superb` / `Herb` are untouched — the token still has to start at
 * the identifier or just after an underscore.
 *
 * There is no exception for test names. `test "ERB::Util.html_escape should
 * escape unsafe characters"` (activesupport/test/core_ext/string_ext_test.rb:1086)
 * is `it("TSE::Util.html_escape should escape unsafe characters")` in
 * string-ext.test.ts. It still credits: `normalizeErb` in
 * scripts/test-compare/compare.ts applies this table to both sides of the
 * comparison, so the Ruby name and the TSE-spelled trails name normalize to
 * the same key. `ERB` survives in trails only where the text quotes the Ruby
 * side — a JSDoc `Mirrors:` line naming `ERB::Util`, a Rails path like
 * `core_ext/erb/util.rb`, or fixtures-compare's statuses for Rails YAML that
 * genuinely is ERB.
 *
 * Applied to every identifier that flows through `snakeToCamel` —
 * currently Ruby method names (via `rubyMethodToTs`) and constant
 * fragments embedded in dot-notation method names like
 * `visit_Arel_Nodes_X`. File paths get the equivalent substitution in
 * `rubyFileToTs` below, derived from this same table.
 */
export const TOKEN_RENAMES: Record<string, string> = {
  erb: "tse",
  // A Ruby source file is a TypeScript one: I18n::Backend::Base#load_rb
  // (i18n/lib/i18n/backend/base.rb:254) loads a translation file written in
  // Ruby, and its port loads one written in JS, dispatched off the `.js`
  // extension by `load_file`.
  rb: "js",
  ERB: "TSE",
  Erb: "Tse",
};

/**
 * Alternation built from `TOKEN_RENAMES` itself, so an entry added to the table
 * can never be dead code — the regex used to restate the token list and the two
 * drifted (the `rb` entry sat unreachable on main until #6043 widened the
 * literal). Longest key first so a longer token beats a shorter one that
 * suffixes it (`erb` must win over `rb`), and keys are escaped so a future entry
 * containing a metacharacter cannot corrupt the pattern.
 */
/** Longest key first (`erb` must beat `rb`), each escaped. */
function tokenRenameAlternation(): string {
  return Object.keys(TOKEN_RENAMES)
    .sort((a, b) => b.length - a.length || (a < b ? -1 : 1))
    .map((tok) => tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
}

const TOKEN_RENAME_PATTERN = new RegExp(`(^|_)(${tokenRenameAlternation()})(?=_|$|[A-Z])`, "g");

/**
 * The same table over file paths, which by this point are kebab-cased — so the
 * boundary is `\b` rather than the identifier form's `_`-anchor plus
 * CamelCase lookahead. Two patterns, one table: an entry added to
 * `TOKEN_RENAMES` used to reach method names and silently not file paths,
 * which is exactly how the `rb` entry sat dead between #6017 and #6043.
 */
const FILE_TOKEN_RENAME_PATTERN = new RegExp(`\\b(${tokenRenameAlternation()})\\b`, "g");

function applyTokenRenames(snake: string): string {
  return snake.replace(TOKEN_RENAME_PATTERN, (_m, pre, tok: string) => pre + TOKEN_RENAMES[tok]);
}

function applyFileTokenRenames(segment: string): string {
  return segment.replace(FILE_TOKEN_RENAME_PATTERN, (_m, tok: string) => TOKEN_RENAMES[tok]);
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
export const PATH_SEGMENT_ALIASES: Record<string, string> = {
  railtie: "trailtie",
  railties: "trailties",
};

/**
 * Ruby files whose TS counterpart does NOT follow the kebab-case path rule,
 * keyed by `<package>:<ruby path>`.
 *
 * An entry here does two things: it names the TS file the Ruby file's methods
 * are measured against, and it makes the Ruby file own a comparison bucket even
 * when Ruby reopens the class/module elsewhere. The second half matters —
 * api:compare buckets an entity's whole method set under the ONE file that
 * first defined a method on it, so a reopening file's methods are otherwise
 * measured against the DEFINING file's TS counterpart and report missing
 * forever no matter what is ported. `inflector/methods.rb` (folded into
 * `inflector/inflections.rb`) and `core_ext/string/inflections.rb` (folded into
 * `core_ext/object/blank.rb`, where `String` is first reopened) are both that
 * shape; trails ports both onto the single `inflector.ts`.
 */
export const RUBY_FILE_TS_OVERRIDES: Record<string, string> = {
  "activesupport:inflector/methods.rb": "inflector.ts",
  "activesupport:core_ext/string/inflections.rb": "inflector.ts",
  // Same reopening shape: this file reopens `class Integer` first, so its
  // bucket owns all of Integer's core_ext surface — `ordinalize`/`ordinal` here
  // plus `multiple_of?` (multiple.rb) and `months`/`years` (time.rb). trails
  // splits those across `inflector.ts` and `duration.ts`, so the barrel is the
  // only file that holds the whole bucket.
  "activesupport:core_ext/integer/inflections.rb": "index.ts",
  // The i18n gem's umbrella file (`lib/i18n.rb`, scanned one level above
  // libPath) is where `I18n::Base` itself is defined, so unlike Rails'
  // umbrella files it owns real surface. trails ports it to `src/i18n.ts`;
  // without this the default rule would expect `../i18n.ts`, outside src.
  "i18n:../i18n.rb": "i18n.ts",
  // `interpolate/ruby.rb` reopens `module I18n`, which `backend/cache.rb`
  // defines first — so without an entry here its `interpolate` /
  // `interpolate_hash` are measured against `backend/cache.ts` and, since
  // cache.rb is unported, drop out of accounting entirely.
  "i18n:interpolate/ruby.rb": "interpolate/ruby.ts",
  // `encryption.rb` defines `module Cipher` (encryption.rb:22, `autoload`
  // aside) before `encryption/cipher.rb` reopens it with the whole class-method
  // surface, so all six land in the `encryption.rb` bucket and read as missing.
  "activerecord:encryption/cipher.rb": "encryption/cipher.ts",
  // `GlobalID` is first defined by `fixture_set.rb`'s reopening, so the class's
  // entire surface — every method in `global_id.rb` itself — buckets there.
  "globalid:global_id.rb": "global-id.ts",
  // `validations.rb` opens `Validations::ClassMethods` first, so `validates`,
  // `validates!` and their two private helpers bucket under it. trails carries
  // all four on `Model` (model.ts), the class `Validations` is mixed into.
  "activemodel:validations/validates.rb": "model.ts",
  // Likewise `HelperMethods`, whose first definition Rails puts in
  // `validations/absence.rb`; trails' `_mergeAttributes` lives in validations.ts.
  "activemodel:validations/helper_methods.rb": "validations.ts",
  // `ARTest` is defined by `config.rb` first; `connection.rb` reopens it for the
  // three connection helpers, which trails ports to `support/connection.ts`.
  "activerecord-test-support:connection.rb": "connection.ts",
  // `Time`, `Date` and `DateTime` are each first reopened by a different
  // core_ext file — `object/blank.rb:186`, `date/acts_like.rb:5` and
  // `date_time/acts_like.rb:6` — so the three `calculations.rb` reopenings
  // (`time/calculations.rb:11`, `date/calculations.rb:10`,
  // `date_time/calculations.rb:5`) contribute 129 methods to buckets named
  // after files that define none of them. trails ports the `Time` and `DateTime`
  // reopenings onto the one `time-ext.ts`, the same one-TS-file-for-several-
  // reopenings shape as `inflector.ts` above; the `Date` reopening has its own
  // receiver and its own file (see below).
  // `ActiveSupport::JSON` is defined by `json/decoding.rb:12` first, so the
  // module's whole singleton surface — `encode`/`dump` from
  // `json/encoding.rb:16-43` included — buckets there. trails splits the two
  // Ruby modules the way Rails documents them: `ActiveSupport::JSON` on
  // `json.ts`, `ActiveSupport::JSON::Encoding` on `json/encoding.ts`.
  "activesupport:json/decoding.rb": "json.ts",
  "activesupport:core_ext/time/calculations.rb": "time-ext.ts",
  // The `Date` arm widens through `in_time_zone` before delegating to the
  // `Time` arm (`date/calculations.rb:55-87`), so it has its own receiver —
  // `Temporal.PlainDate` — and its own file.
  "activesupport:core_ext/date/calculations.rb": "date-ext.ts",
  "activesupport:core_ext/date_time/calculations.rb": "time-ext.ts",
  // The activesupport `core_ext/*` reopenings. Ruby splits one class's extensions
  // across a file per concern and reopens the class in each; the extractor stamps
  // the entity with whichever reopening came first (`object/blank.rb` for String,
  // `object/duplicable.rb` for Hash, …), so every other file's methods are
  // measured against a TS counterpart that defines none of them. trails collapses
  // each class's core_ext surface into one module — `hash-utils.ts`,
  // `string-utils.ts`, `module-ext.ts`, `array-utils.ts` — so the mapping is
  // many Ruby files to the one TS file, the same shape as `inflector.ts` above.
  "activesupport:core_ext/hash/keys.rb": "hash-utils.ts",
  "activesupport:core_ext/hash/reverse_merge.rb": "hash-utils.ts",
  "activesupport:core_ext/hash/deep_transform_values.rb": "hash-utils.ts",
  "activesupport:core_ext/object/deep_dup.rb": "hash-utils.ts",
  // `to_query` is defined on Object, Array and Hash by this one file; trails
  // carries all three arms on the hash helpers.
  "activesupport:core_ext/object/to_query.rb": "hash-utils.ts",
  // `json.rb` reopens ~25 classes to define `as_json` on each, but `Object`,
  // `Time`, `Hash` and friends are all first opened by another core_ext file,
  // so their `as_json` buckets there and is measured against a TS counterpart
  // that has none. `Object#as_json`'s landed on `index.ts` — the barrel the
  // misplaced-file cluster picks for `object/acts_like.rb` — where it paired
  // with `TimeWithZone#asJson`. The entry gives json.rb its own bucket, so
  // every arm is measured against the file trails actually ports them to.
  "activesupport:core_ext/object/json.rb": "core-ext/object/json.ts",
  "activesupport:core_ext/string/filters.rb": "string-utils.ts",
  "activesupport:core_ext/string/access.rb": "string-utils.ts",
  "activesupport:core_ext/string/indent.rb": "string-utils.ts",
  "activesupport:core_ext/string/strip.rb": "string-utils.ts",
  "activesupport:core_ext/module/attr_internal.rb": "module-ext.ts",
  "activesupport:core_ext/module/attribute_accessors.rb": "module-ext.ts",
  "activesupport:core_ext/module/introspection.rb": "module-ext.ts",
  "activesupport:core_ext/module/delegation.rb": "module-ext.ts",
  "activesupport:core_ext/module/anonymous.rb": "module-ext.ts",
  "activesupport:core_ext/array/grouping.rb": "array-utils.ts",
  "activesupport:core_ext/array/extract.rb": "array-utils.ts",
  "activesupport:core_ext/array/wrap.rb": "array-utils.ts",
  // Range keeps Rails' per-concern file layout in trails, so these map by the
  // default rule — but Range's home bucket is `core_ext/range/each.rb`, so the
  // reopening still needs the entry.
  "activesupport:core_ext/range/overlap.rb": "core-ext/range/overlap.ts",
  // The conversions cluster. `toFs` / `toTime` / `toDate` / `xmlschema` take an
  // instant receiver, so Time, Date and DateTime all read them off `time-ext.ts`;
  // only `date/calculations.rb`'s Date arm has its own receiver and file.
  "activesupport:core_ext/time/conversions.rb": "time-ext.ts",
  "activesupport:core_ext/date/conversions.rb": "time-ext.ts",
  "activesupport:core_ext/date_time/conversions.rb": "time-ext.ts",
  "activesupport:core_ext/time/compatibility.rb": "time-ext.ts",
  "activesupport:core_ext/date_time/compatibility.rb": "time-ext.ts",
  "activesupport:core_ext/time/acts_like.rb": "time-ext.ts",
  "activesupport:core_ext/string/conversions.rb": "time-ext.ts",
  "activesupport:core_ext/string/zones.rb": "time-ext.ts",
  "activesupport:core_ext/time/zones.rb": "time-zone-config.ts",
  "activesupport:core_ext/numeric/time.rb": "duration.ts",
  "activesupport:core_ext/integer/time.rb": "duration.ts",
  "activesupport:core_ext/date/blank.rb": "core-ext/object/blank.ts",
  "activesupport:core_ext/date_time/blank.rb": "core-ext/object/blank.ts",
  "activesupport:core_ext/pathname/blank.rb": "core-ext/object/blank.ts",
  "activesupport:core_ext/hash/slice.rb": "hash-utils.ts",
  "activesupport:core_ext/hash/except.rb": "hash-utils.ts",
  "activesupport:core_ext/hash/deep_merge.rb": "hash-utils.ts",
  "activesupport:core_ext/hash/indifferent_access.rb": "hash-with-indifferent-access.ts",
  "activesupport:core_ext/array/conversions.rb": "array-utils.ts",
  "activesupport:core_ext/string/exclude.rb": "string-utils.ts",
  "activesupport:core_ext/object/inclusion.rb": "enumerable-utils.ts",
  "activesupport:core_ext/object/with.rb": "core-ext/object/with.ts",
  "activesupport:core_ext/class/subclasses.rb": "module-ext.ts",
  "activesupport:core_ext/kernel/reporting.rb": "module-ext.ts",
  "activesupport:core_ext/module/redefine_method.rb": "class-attribute.ts",
  "activesupport:core_ext/array/inquiry.rb": "array-inquirer.ts",
  "activesupport:core_ext/string/inquiry.rb": "string-inquirer.ts",
  "activesupport:inflector/transliterate.rb": "transliterate.ts",
};

/** The explicit TS mapping for `rubyFile` in `pkg`, or undefined when unmapped. */
export function rubyFileTsOverride(rubyFile: string, pkg?: string): string | undefined {
  if (pkg === undefined) return undefined;
  const key = `${pkg}:${rubyFile}`;
  return Object.hasOwn(RUBY_FILE_TS_OVERRIDES, key) ? RUBY_FILE_TS_OVERRIDES[key] : undefined;
}

/** Every Ruby file `pkg` maps explicitly, in table order. */
export function overriddenRubyFiles(pkg: string): string[] {
  const prefix = `${pkg}:`;
  return Object.keys(RUBY_FILE_TS_OVERRIDES)
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));
}

/** True when `rubyFile` has an explicit TS mapping in this package. */
export function hasRubyFileTsOverride(rubyFile: string, pkg?: string): boolean {
  return rubyFileTsOverride(rubyFile, pkg) !== undefined;
}

/**
 * Ruby file path → expected TS file path (kebab-case, .ts extension).
 *
 * Uses `path.posix.*` so the mapping stays cross-platform stable —
 * Ruby source paths are POSIX, the rest of api-compare keys files by
 * POSIX paths, and the default `path.join` would return backslashes
 * on Windows.
 */
export function rubyFileToTs(rubyFile: string, pkg?: string): string {
  const override = rubyFileTsOverride(rubyFile, pkg);
  if (override !== undefined) return override;
  const dir = path.posix.dirname(rubyFile);
  const base = path.posix.basename(rubyFile, ".rb");
  const aliasedBase = PATH_SEGMENT_ALIASES[base] ?? base;
  const kebab = aliasedBase.replace(/_/g, "-");
  const tsFile = applyFileTokenRenames(kebab) + ".ts";
  if (dir === ".") return tsFile;
  const tsDir = dir
    .split("/")
    .map((d) => PATH_SEGMENT_ALIASES[d] ?? d)
    .map((d) => applyFileTokenRenames(d.replace(/_/g, "-")))
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
  /**
   * A TS declaration of these names is *drift*, not a faithful mirror, even
   * when the matched Ruby file defines the method — so extra-surface must keep
   * flagging it (`rubyMethodToTsIgnoringSkip` is not consulted for them).
   *
   * Set on the Ruby-hook groups: `included`/`extended`/`inherited` /
   * `singleton_method_added` have no TS equivalent at all, so a same-named TS
   * method isn't carrying the Rails pattern through — it's a trails invention
   * that the group's `reason` exists to keep OUT of the port. Everything else
   * on SKIP is a method that genuinely exists in Rails and whose skip is about
   * *scoring* (one unportable variant, an ivar-reader shape), so a TS override
   * in the file where Ruby defines it IS the port.
   */
  tsMirrorIsDrift?: true;
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
    tsMirrorIsDrift: true,
  },
  {
    reason: "Ruby object hooks — no TypeScript equivalent.",
    names: ["singleton_method_added"],
    tsMirrorIsDrift: true,
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
];

export const SKIP = new Set<string>(SKIP_GROUPS.flatMap((g) => g.names));

/** {@link SkipGroup.tsMirrorIsDrift} names, flattened. */
export const SKIP_TS_MIRROR_IS_DRIFT = new Set<string>(
  SKIP_GROUPS.filter((g) => g.tsMirrorIsDrift).flatMap((g) => g.names),
);

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
  /**
   * The TS spelling that IS the faithful port of these names inside
   * `rubyFiles`, when there is one but it isn't the spelling
   * {@link rubyMethodToTs} produces. Set it when the skip is about the *mapped
   * site* being unavailable rather than the method being unported: extra-surface
   * then treats a declaration of this name in those files as allowed rather than
   * novel, exactly as {@link SKIP} names are mirrored file-scoped.
   *
   * Leave unset for a genuinely-absent surface — then a TS declaration of the
   * name stays flagged.
   */
  tsMirrorName?: string;
}

export const SCOPED_SKIP_GROUPS: ScopedSkipGroup[] = [
  {
    reason:
      "PostgreSQL::Quoting#lookup_cast_type resolves a sql_type string with a " +
      "live `SELECT '<type>'::regtype::oid` query, so trails' port is async and " +
      "diverges from the sync abstract signature it overrides; it is tracked by " +
      "the `pg-lookup-cast-type-async-divergence` story rather than counted as " +
      "a gap. Scoped to postgresql/quoting.rb: the abstract " +
      "`Quoting#lookup_cast_type` (abstract/quoting.rb:234-236) IS ported, so a " +
      "flat skip would now hide a real surface.",
    names: ["lookup_cast_type"],
    rubyFiles: ["connection_adapters/postgresql/quoting.rb"],
  },
  {
    reason:
      "ActiveSupport::Duration#+@ (`def +@; self; end`, duration.rb:326) is " +
      "Ruby's unary-plus operator returning self. TS has no syntax that " +
      "dispatches to a named method for `+duration` — the unary `+` coerces " +
      "through `valueOf()` to a number — so a ported `identity()` method would " +
      "be inert dead code no caller can reach (unlike `-@` → `negate`, which is " +
      "called from `minus()` via `other.negate()`). Scoped to duration.rb so it " +
      "can't silence a genuine `+@` gap elsewhere.",
    names: ["+@"],
    rubyFiles: ["duration.rb"],
  },
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
      "ActiveModel::Dirty#as_json (dirty.rb:264-268) exists only to add " +
      "`mutations_from_database` / `mutations_before_last_save` to the " +
      "serializer's `except:` list. Those names leak into Ruby's output because " +
      "`Serialization#serializable_hash` reads `attributes`, which for a plain " +
      "ActiveModel is commonly `instance_values` — and the mutation trackers are " +
      "ivars on the model itself. In trails the trackers are not attributes: " +
      "they live on a separate `DirtyTracker` object reachable only via " +
      "`_dirty`, and `asJson` serializes through `serializableHash` over the " +
      "declared attribute set, so the exclusion is inherent and a ported " +
      "override would be a no-op. Scoped to dirty.rb so it cannot silence a " +
      "genuine `as_json` gap elsewhere.",
    names: ["as_json"],
    rubyFiles: ["dirty.rb"],
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
  {
    reason:
      "AdapterHelper's four hand-written capability predicates are rendered by " +
      "packages/activerecord/src/support/supports.ts as entries in one " +
      "feature-keyed table (`default_expression`, `non_unique_constraint_name`, " +
      "`text_column_with_default`, `sql_standard_drop_constraint`) rather than " +
      "as four exports on adapter-helper.ts, exactly as the ~15 predicates " +
      "`adapter_helper.rb` itself generates with `define_method` are. The table " +
      "keys are the `supports_<key>?` names, so the pairing is checkable; " +
      "duplicating them as free functions here would give two sources of truth " +
      "for the same capability. Scoped to adapter_helper.rb, the only Ruby file " +
      "in the tree that defines these names.",
    names: [
      "supports_default_expression?",
      "supports_non_unique_constraint_name?",
      "supports_text_column_with_default?",
      "supports_sql_standard_drop_constraint?",
    ],
    rubyFiles: ["adapter_helper.rb"],
  },
  {
    reason:
      "`module ARTest` opens in config.rb and is reopened in connection.rb, so " +
      "the Ruby extractor records one ARTest entity filed under config.rb and " +
      "every ARTest method buckets there. Two populations end up in that " +
      "bucket, neither of which is a gap. (1) `connection_name` / " +
      "`test_configuration_hashes` / `connect` (connection.rb) and " +
      "`expand_config` (config.rb) ARE ported — all four in " +
      "packages/activerecord/src/support/connection.ts, next to the CONNECTIONS " +
      "entries they name and expand. They miss only because the bucket's " +
      "expected TS file is config.ts; export status is not why — in the default " +
      "full-surface run the TS extractor records file-local functions too, so " +
      "the non-exported `expandConfig` (connection.ts:269) is as visible to " +
      "api:compare as the three exported ones, and exporting it would not match " +
      "it. (Under --public-only the two sides drop it symmetrically: Ruby's " +
      "`expand_config` is itself private, under config.rb's `private` at :13, " +
      "so neither side offers it.) Moving it into config.ts is the only thing " +
      "that would match it, and that is what cannot happen: it is typed on " +
      "`NamedConnection` and `ARUNIT_ENTRY_NAMES`, both declared in " +
      "connection.ts, which already imports from config.ts — so the move would " +
      "CREATE an import cycle, and dragging those declarations along would " +
      "relocate the `connections:` vocabulary out of the file mirroring " +
      "connection.rb. (2) `config` / " +
      "`config_file` / `read_config` are the memoized read of test/config.yml; " +
      "trails ships no config.yml — the `connections:` hash is expressed " +
      "directly as the CONNECTIONS table in connection.ts and the sub-setting " +
      "readers in config.ts — so there is no file to locate, copy from " +
      "config.example.yml, or parse. Scoped to config.rb, the only Ruby file in " +
      "the tree that defines these names.",
    names: [
      "config",
      "config_file",
      "read_config",
      "expand_config",
      "connection_name",
      "test_configuration_hashes",
      "connect",
    ],
    rubyFiles: ["config.rb"],
  },
  {
    reason:
      "`ActiveSupport::Messages::Rotator#initialize` (messages/rotator.rb:6-12) " +
      "is an `initialize` on a module Rails installs with `prepend`, so it runs " +
      "as part of the *host's* constructor chain via `super`. TypeScript has no " +
      "expression for that: `prepend()` " +
      "(packages/activesupport/src/prepend.ts) wraps methods on the prototype " +
      "and cannot wrap a constructor, so the port keeps the Rails name as an " +
      "exported `initialize` function that each rotatable class calls from its " +
      "own constructor (message-verifier.ts, message-encryptor.ts). There is no " +
      "TS `constructor` at the mapped site for the comparison to find — the same " +
      "shape as the `included`/`extended`/`inherited` hooks. Scoped to " +
      "messages/rotator.rb so a real class's `initialize` is still expected to " +
      "map to a `constructor`.",
    names: ["initialize"],
    rubyFiles: ["messages/rotator.rb"],
    tsMirrorName: "initialize",
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
 * {@link ScopedSkipGroup.tsMirrorName} for `rubyName` in `rubyFile`, or null
 * when the scoped skip declares no faithful TS spelling (or doesn't apply).
 */
export function scopedSkipMirrorName(rubyName: string, rubyFile: string): string | null {
  for (const g of SCOPED_SKIP_GROUPS) {
    if (g.tsMirrorName === undefined) continue;
    if (g.names.includes(rubyName) && g.rubyFiles.includes(rubyFile)) return g.tsMirrorName;
  }
  return null;
}

/**
 * A Ruby class that exists only to paper over a gap in the Ruby standard
 * library that JavaScript has no gap in — so there is no TS class to mirror
 * and no TS method to name. Unlike {@link SKIP_GROUPS}, this is class-level:
 * both the method comparison and the inheritance check consult it, so the
 * class is neither expected as a superclass host nor scored for its members.
 *
 * This is deliberately narrow. A class trails simply has not ported yet is a
 * gap and belongs in `unported-files.ts` (whole file) or stays reported.
 */
export interface RubyOnlyClass {
  fqn: string;
  reason: string;
}

export const RUBY_ONLY_CLASSES: RubyOnlyClass[] = [
  {
    fqn: "I18n::JSON",
    reason:
      "`i18n/lib/i18n/backend/key_value.rb:7-22` defines `I18n::JSON` at load " +
      "time as whichever JSON library is installed — `:11`/`:14` wrap `Oj` in " +
      "`encode`/`decode` when the gem is present, and `:19`-`:21` falls back " +
      "to `JSON = ActiveSupport::JSON`. It is a library-selection shim, not " +
      "behavior: JavaScript has `JSON` in the language, and its " +
      "`stringify`/`parse` are that `encode`/`decode`, which is what " +
      "`KeyValue` calls directly (`packages/i18n/src/backend/key-value.ts`). " +
      "Mirroring it would mean adding a trails class whose whole body " +
      "forwards to a global the language already provides.",
  },
];

const RUBY_ONLY_CLASS_FQNS = new Set(RUBY_ONLY_CLASSES.map((c) => c.fqn));

/** True when `fqn` names a {@link RUBY_ONLY_CLASSES} entry. */
export function isRubyOnlyClass(fqn: string): boolean {
  return RUBY_ONLY_CLASS_FQNS.has(fqn);
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
 * Bare Ruby predicates whose faithful TS port is a native JS *containment*
 * spelling rather than either camel form. `include?` ports to `.includes()`,
 * so without this the only candidates are `isInclude` / `include` — neither of
 * which exists on a JS string or array, and every such port had to be
 * hand-excluded from the call ratchet.
 *
 * The extra name is appended as a LAST candidate, so ports that already spell
 * `isInclude()` (CollectionAssociation, Clusivity) keep matching exactly as
 * before; this only widens what counts, it can never take a match away.
 */
const CONTAINMENT_PREDICATE_ALIASES = new Map<string, string>([
  // `member?` is a Ruby alias of `include?` in Rails (finder_methods.rb,
  // strong_parameters.rb), so it gets the same containment spelling.
  ["include?", "includes"],
  ["member?", "includes"],
  // ActiveSupport's `exclude?` (Enumerable/String core-ext) is the negation;
  // a port spells it `excludes`.
  ["exclude?", "excludes"],
]);

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
 *   - Containment predicates (`include?`, `member?`, `exclude?`) append
 *     the native JS spelling as a final candidate
 *     (`include?` → ["isInclude", "include", "includes"]).
 */
export function rubyMethodToTs(name: string): string[] | null {
  if (SKIP.has(name)) return null;
  return rubyMethodToTsIgnoringSkip(name);
}

/**
 * {@link rubyMethodToTs} without the {@link SKIP} gate.
 *
 * A SKIP entry means "don't expect a TS counterpart" for *scoring coverage* —
 * it does NOT mean the Ruby method is absent. extra-surface needs the opposite
 * question answered: given that this Ruby file really does define `freeze` /
 * `inspect` / `to_h`, what would a faithful TS override be called? Only this
 * entry point answers it; the SKIP gate stays in place for compare.ts, so a
 * skipped method still never counts as a missing port.
 */
export function rubyMethodToTsIgnoringSkip(name: string): string[] | null {
  if (OPERATORS.has(name)) return null;
  if (name === "initialize" || name === "new") return ["constructor"];
  if (name === "to_s" || name === "to_str") return ["toString"];
  if (name === "to_json") return ["toJSON"];
  if (name === "to_sql") return ["toSql"];
  // Ruby unary minus (`-@`) ports to a named `negate` method (e.g.
  // ActiveSupport::Duration#-@ → Duration#negate). Files where `-@` has no TS
  // surface (the AR Deduplicable value objects, where `-@` is just Ruby's
  // `alias :-@ :deduplicate`) suppress it via SCOPED_SKIP_GROUPS instead.
  if (name === "-@") return ["negate"];

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
    const containment = CONTAINMENT_PREDICATE_ALIASES.get(name);
    if (containment !== undefined) {
      return [isPrefixed, camel, containment];
    }
    return [isPrefixed, camel];
  }

  if (name.endsWith("!")) {
    const base = name.slice(0, -1);
    return [snakeToCamel(base) + "Bang"];
  }

  if (name.endsWith("=")) {
    const base = name.slice(0, -1);
    const camel = snakeToCamel(base);
    // Underscore-prefixed writers are `class_attribute` storage slots
    // (`_reflections=`), never blocking writers — `set_reflections` would only
    // be a nonsense candidate, so they keep the bare form alone.
    if (camel.startsWith("_")) return [camel];
    // `setX` is offered *after* the bare camel name so plain-value writers
    // (`table_name=`) keep matching the accessor they always matched. It exists
    // for writers whose Rails body blocks on I/O — has_one's `#{name}=`
    // persists the displacement inline (has_one_association.rb:59-84) — which a
    // synchronous JS property setter cannot express; the awaitable `set#{Name}`
    // is the faithful rendering there (RFC 0068).
    return [camel, "set" + camel.charAt(0).toUpperCase() + camel.slice(1)];
  }

  return [snakeToCamel(name)];
}

/**
 * Render the Ruby→TypeScript naming conventions as Markdown.
 *
 * This is the single source of truth for the agent-facing conventions doc:
 * `scripts/parity/conventions-doc.ts` writes the return value to a file
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

  const containmentPredicates = [...CONTAINMENT_PREDICATE_ALIASES.keys()]
    .map((n) => `\`${n}\``)
    .join(" / ");

  const skipSections = SKIP_GROUPS.map((g) => {
    const names = g.names.map((n) => `\`${n}\``).join(", ");
    return `- ${g.reason}\n  - ${names}`;
  }).join("\n");

  const rubyOnlyClassSections = RUBY_ONLY_CLASSES.map(
    (c) => `- \`${c.fqn}\`\n  - ${c.reason}`,
  ).join("\n");

  const arityOverrideSections = ARITY_OVERRIDE_GROUPS.map((g) => {
    const names = g.names.map((n) => `\`${n}\``).join(", ");
    return `- ${g.reason}\n  - ${names}`;
  }).join("\n");

  const scopedSkipSections = SCOPED_SKIP_GROUPS.map((g) => {
    const names = g.names.map((n) => `\`${n}\``).join(", ");
    const files = g.rubyFiles.map((f) => `\`${f}\``).join(", ");
    const mirror = g.tsMirrorName === undefined ? "" : `; ported in TS as \`${g.tsMirrorName}\``;
    return `- ${g.reason}\n  - ${names} (only in: ${files}${mirror})`;
  }).join("\n");

  return `# Ruby → TypeScript naming conventions

<!-- GENERATED FILE — do not edit by hand.
     Regenerate with \`pnpm api:conventions\`. The source of truth is
     \`explainConventions()\` in scripts/parity/conventions.ts; CI runs
     \`tsx scripts/parity/conventions-doc.ts --check\` and fails if this
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
| ${containmentPredicates} | \`is*\` / camel / native JS spelling | \`include?\` → ${example("include?")} |
| \`name!\` (bang) | \`*Bang\` suffix | \`save!\` → ${example("save!")} |
| \`name=\` (setter) | bare camel name, \`set*\` fallback | \`table_name=\` → ${example("table_name=")} |
| \`initialize\` / \`new\` | \`constructor\` | \`initialize\` → ${example("initialize")} |
| \`to_s\` / \`to_str\` | \`toString\` | \`to_s\` → ${example("to_s")} |
| \`to_json\` | \`toJSON\` | \`to_json\` → ${example("to_json")} |
| \`to_sql\` | \`toSql\` | \`to_sql\` → ${example("to_sql")} |
| \`-@\` (unary minus) | \`negate\` | \`-@\` → ${example("-@")} |
| everything else | \`snake_case\` → \`camelCase\` | \`has_many\` → ${example("has_many")} |

Predicate-form details: \`is_*?\` collapses to a single candidate so trails can't
land the redundant doubled \`isIsNumber\`. Already-predicate prefixes keep the
\`is*\` fallback because the disambiguating alias is sometimes needed when the bare
name collides with a macro (e.g. \`isHasOne()\` alongside the \`Model.hasOne\`
declaration). Leading underscores and runs of underscores collapse like a single
underscore (\`visit__regexp\` → \`visitRegexp\`), and underscore-before-capital
collapses too (\`visit_Arel_Nodes_X\` → \`visitArelNodesX\`).

Setter-form details: a Ruby \`name=\` writer matches the bare camel accessor
first, and \`set#{Name}\` second. The \`set*\` fallback covers writers whose Rails
body blocks on I/O — \`has_one\`'s \`#{name}=\` removes and persists the displaced
target inline — which a synchronous JS property setter cannot express. There the
promise-returning \`setAccount\` **is** the port of \`account=\`. Both spellings are
supported and both score as the port — the candidate list is a fallback chain, not
a migration: a sync accessor alone still matches, as it always did.
Underscore-prefixed
writers (\`_reflections=\`) are \`class_attribute\` storage slots, never blocking
writers, so they get no \`set*\` candidate.

## Operators

These Ruby operator methods have no api:compare counterpart (map them to named
methods like \`get()\`/\`set()\` as the surrounding code does):

${operatorList}

## Token renames

Applied to every identifier before camelization (and the equivalent applies to
file paths). A token is renamed when it starts the identifier or follows an
underscore, and ends at an underscore, the end, or the next capital — so
\`ERBUtilTest\` is \`TSEUtilTest\` and \`erb_util\` is \`tseUtil\`, while
\`verb_name\` and \`Herbert\` are left alone. There is no \`erb\` anywhere in
trails:

| Ruby token | trails token |
| ---------- | ------------ |
${renameRows}

Test names are not an exception. Rails'
\`test "ERB::Util.html_escape should escape unsafe characters"\`
(\`activesupport/test/core_ext/string_ext_test.rb:1086\`) is
\`it("TSE::Util.html_escape should escape unsafe characters")\` in
\`core-ext/string-ext.test.ts\`. It still credits: \`normalizeErb\` in
\`scripts/test-compare/compare.ts\` applies this table to both sides of the
comparison, so the Ruby name and the TSE-spelled trails name normalize to the
same key. \`ERB\` survives in trails only where the text quotes the Ruby side —
a JSDoc \`Mirrors:\` line naming \`ERB::Util\`, a Rails path like
\`core_ext/erb/util.rb\`, or fixtures-compare's statuses for Rails YAML that
genuinely is ERB.

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

## Ruby-only classes

api:compare expects no TS counterpart for these Ruby classes at all — neither
their methods nor their place in the inheritance chain. Each one only papers
over a gap in the Ruby standard library that JavaScript does not have:

${rubyOnlyClassSections}

## Arity overrides

The advisory arity check (arity.ts) suppresses these Ruby methods — their
positional-arg ranges diverge from the TS port for a documented reason (a Ruby
alias/delegate the extractor reads as zero-arg, a porting-pattern artifact),
not a real signature gap:

${arityOverrideSections}
`;
}

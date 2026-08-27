#!/usr/bin/env -S npx tsx
/**
 * Surface TypeScript files whose public API has drifted *beyond* their Rails
 * counterpart — the inverse of `parity:api`.
 *
 * `parity:api` reports Rails methods missing in TS. This script reports TS
 * public methods/functions/getters/setters that don't correspond to any
 * Ruby method in the matched Rails file. It's a fact-finding audit so we
 * can prune toward Rails-faithful shape; it never modifies source.
 *
 * Algorithm, per Rails-mirroring package:
 *   1. For each Ruby file, resolve its expected TS file via `rubyFileToTs`;
 *      TS files nothing resolves to are scored separately (step 4b).
 *   2. Collect Ruby methods declared in (or `include`d into) the entities in
 *      that Ruby file — any visibility, since a TS method mirroring a
 *      Rails-private method exists in Rails (a visibility divergence, not
 *      extra surface). Map each to its TS-candidate name set via
 *      `rubyMethodCandidates`, which also resolves `conventions.SKIP`
 *      mirrors (`freeze`, `to_a`, `inspect`) so a TS override is
 *      allowed in the file where Ruby defines the method. Union = the
 *      "allowed" TS name set.
 *   3. Collect public TS names declared in the matching TS file — each
 *      class/module's *own* methods (skipping inherited surface so the
 *      diff measures this file's drift, not its ancestor's), each
 *      class / interface / namespace DECLARATION name, plus top-level
 *      `fileFunctions`. Declaration names are scored on the same footing as
 *      members: step 2 allows every entity name the matched `.rb` declares, so
 *      a faithfully ported class is not extra and a trails-only one is.
 *      Filter out `internal: true` (Ruby private/protected, TS
 *      private/protected, TS `#`-prefixed fields, and `@internal` JSDoc on a
 *      top-level exported function) and
 *      separately filter `_`-prefixed names — the extractor keeps those as
 *      public exports; the Rails-private convention in this repo means they
 *      should not count toward extra surface.
 *   4. Extra = TS names \ allowed names. Emit per-file, per-package, and
 *      top-N reports.
 *   4b. TS files that NO Ruby file maps onto are scored too, with an empty
 *      allowed set — see `uncoveredTsFiles`. Rails-test-mirroring trees
 *      (`test-helpers/`, `support/`, `cases/`, fixture corpora) are held out
 *      because the Ruby extractor reads `lib/` only, so they could never have
 *      a counterpart.
 *   5. Subtract the reasoned exceptions: a declaration carrying a
 *      `@noRailsEquivalent <reason>` JSDoc tag counts as `Allowed` rather
 *      than extra. Since RFC 0080 the tag is the ONLY such source — the
 *      former extra-surface-allow.json sidecar is gone — and a tag on a name
 *      that no longer flags is STALE and fails the run. The tag is read on
 *      members AND on class / interface / namespace declarations, so an extra
 *      that is a declaration rather than a member has the same inline form
 *      its members do — the declaration name is scored surface (step 3), so
 *      such a tag matches and goes stale like any other. On an `interface` the
 *      declaration tag additionally covers every member — see
 *      `collectTaggedEntries`. A FILE-level tag (a leading JSDoc block above
 *      the imports) covers every extra in its file, but only where the blanket
 *      is sound — see `fileTagVerdict`.
 *   6. Classify each written tag's permanence claim — see `classifyReason`.
 *      Advisory only: the count of tags that never state one is reported so a
 *      batch of new tags is visible, but it does not affect the exit code.
 *
 * Manifests are produced by `pnpm parity:api`; if they're missing the
 * script bails with a hint (same convention as `parity:api:moves`).
 *
 * Usage:
 *   pnpm tsx scripts/api-compare/extra-surface.ts \
 *     [--package <name>] [--top <N>] [--json] [--exclude-glob <glob>]...
 *
 * Each extra is classified as **novel** (the candidate name appears nowhere
 * in Rails-land) or **moved** (Rails defines it, just in a different `.rb`).
 * Files are ranked by novel count primarily — barrel-style aggregators
 * (`connection-adapters.ts`) drop below smaller novel-heavy files like
 * `relation/finder-methods.ts`. `--novel-only` drops moved extras entirely.
 *
 * Flags:
 *   --package <name>      Restrict to one package (e.g. activerecord).
 *   --top <N>             Top-N most-divergent files (default 50).
 *   --json                Emit machine-readable JSON to stdout instead of
 *                         the human report.
 *   --exclude-glob <g>    Skip TS files matching <g> (substring match
 *                         against the TS file path). Repeatable. Useful
 *                         for known-intentional extensions like
 *                         `dx-tests/` or `defineSchema`-only modules.
 *   --novel-only          Drop moved-not-novel extras (filters barrel noise).
 *   --max-detail <N>      Cap names per file in detail listing (default 40).
 *   --verbose             Print the crediting Rails owner of each moved name.
 *   --help                Print this message.
 */

import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";
import type { ApiManifest, ClassInfo, MethodInfo, PackageInfo } from "@blazetrails/parity/types";
import { OUTPUT_DIR, apiComparePackageRoots } from "./config.js";
import {
  SKIP,
  SKIP_TS_MIRROR_IS_DRIFT,
  rubyFileToTs,
  overriddenRubyFiles,
  rubyMethodToTs,
  rubyMethodToTsIgnoringSkip,
  scopedSkipMirrorName,
  snakeToCamel,
} from "@blazetrails/parity/conventions";
import { resolveModuleName } from "./compare.js";
import { operatorSpelling } from "./operator-order-spelling.js";
import { isSourceUnported } from "@blazetrails/parity/unported-files";
import { manifestIsStale } from "./build-freshness.js";
import { libPathsManifest } from "../../vendor/sources.js";

/**
 * Track the FQN alongside the entity so namespace-scoped include resolution
 * (`resolveModuleName(short, fqn, …)`) picks the *enclosing* module —
 * e.g. `AbstractAdapter` including `"Quoting"` resolves to
 * `ConnectionAdapters::Quoting`, not the adapter-specific siblings.
 */
interface RubyEntity {
  fqn: string;
  info: ClassInfo;
  /**
   * Contribute only the methods this entity declares in the named `.rb`. Set
   * for a REOPENING-only file — one that adds methods to a class some other
   * file defined first, so the whole entity buckets there and the reopening
   * file owns no bucket of its own. `RUBY_FILE_TS_OVERRIDES` is the register
   * of which of those files trails ports and where to, so it is what seeds the
   * bucket; without it `time-zone-config.ts` — the port of
   * `core_ext/time/zones.rb`, which adds `Time.zone` and friends to a `Time`
   * that `core_ext/object/blank.rb` reopened first — is scored against an empty
   * allow-set as a file with no Rails counterpart at all.
   *
   * Seeded only for a TS file nothing else covers. A `.ts` several Ruby files
   * already map onto is scored once per mapping, each against its own
   * allow-set, so another bucket for it would score it one more time over —
   * counting the same names as extra again rather than resolving any of them.
   */
  methodFile?: string;
  /**
   * Contribute only the entity's own constant name to the allow-set, not its
   * methods or mixins. Used for a `Foo::ClassMethods` submodule whose methods
   * `foldClassMethodsModules` already merged into `Foo.classMethods`: the
   * declaration is still a constant the file declares (so a TS `ClassMethods`
   * namespace is a faithful port, not drift), but walking it again would
   * double-count its methods.
   */
  nameOnly?: boolean;
}

/**
 * Mixins a host class gains at *runtime* via a gem's railtie
 * `ActiveSupport.on_load(:active_record)` block rather than a lexical
 * `include` in the host's own source. The static Ruby extractor only sees
 * `include`s written inside the class/module body, so a railtie-injected mixin
 * never lands in the host's `includes` array and its faithful TS ports look
 * novel.
 *
 * `includes` are resolved against the *cross-package* module map (every
 * package's extracted modules), so a mixin defined in a different gem —
 * e.g. `GlobalID::Identification` (globalid package) included into
 * `ActiveRecord::Base` (activerecord package) by globalid's railtie — still
 * contributes its instance methods to the host's allowed set.
 */
const AMBIENT_RAILTIE_MIXINS: Record<string, { includes: string[] }> = {
  "ActiveRecord::Base": {
    includes: ["GlobalID::Identification"],
  },
};

/**
 * Mixins a module injects into its host from a `self.extended` / `self.included`
 * hook body rather than a lexical `include` in the host's own source — the same
 * blind spot as `AMBIENT_RAILTIE_MIXINS`, one level closer in.
 *
 *   - `ActiveModel::Callbacks.extended(base)` runs
 *     `base.class_eval { include ActiveSupport::Callbacks }`
 *     (activemodel/lib/active_model/callbacks.rb:66-70), so every host that
 *     `extend`s it answers `run_callbacks` / `set_callback` / `skip_callback` /
 *     `reset_callbacks`. `ActiveModel::Validations`' `included` block extends it
 *     (validations.rb:42), which is how `ActiveModel::Model` gets them.
 */
const HOOK_INJECTED_MIXINS: Record<string, { includes: string[] }> = {
  "ActiveModel::Callbacks": {
    includes: ["ActiveSupport::Callbacks"],
  },
};

/**
 * Methods a Rails file's host class/module gains by including a mixin whose
 * SOURCE file is on `UNPORTED_FILES` — so `collectAllowedNames`'s `walkMixin`
 * skips the mixin (mirroring `compare.flattenIncludedMethodInfos` at
 * compare.ts:507) and the faithful TS ports look like unexplained "moved"
 * extras. We DID port these methods, just as standalone mirrors that don't go
 * through the unported module, so list them here keyed by the Ruby host FQN to
 * fold the ported names back into the host's allowed set (raw Ruby names →
 * `addRubyName`). The justification is a source-unported *lexical* include
 * rather than a railtie `on_load` injection.
 *
 *   - `ActiveRecord::Railtie` re-exports `Railties::ControllerRuntime`
 *     (railtie.rb:267 — `on_load(:action_controller) { include … }`); the port
 *     lives in `trailties/controller-runtime.ts`. Its source (vendored at
 *     `activerecord/lib/active_record/railties/controller_runtime.rb`, matched
 *     by the `railties/controller_runtime.rb` UNPORTED_FILES pattern) is
 *     unported (Railties / ActionController integration not ported yet).
 *   - The association error classes `include DidYouMean::Correctable`
 *     (associations/errors.rb:18,47,88); `Correctable#detailed_message` is
 *     ported inline as `detailedMessage` in `associations/errors.ts`.
 *     Correctable's source is did-you-mean's `core_ext/name_error.rb`, which is
 *     unported (Ruby NameError machinery with no JS analog) — not the
 *     same-named Active Support file, which is ported as `core-ext/name-error.ts`.
 *     Keyed on one host class since `allowed` is
 *     unioned per-file across every entity in errors.rb.
 */
/**
 * Ruby CORE modules a Rails class `include`s, with the method names the core
 * module supplies. These have no `def` in any vendored gem — they are the
 * interpreter's — so the include contributes nothing to the allow-set and every
 * faithful port of one reads as novel TS surface (`ActiveRecord::Relation`
 * `include Enumerable`, relation.rb:67, is the whole population today: `detect`,
 * `sort_by`, `group_by` and the rest of the Enumerable surface a Relation
 * answers over `each` → `records`).
 *
 * That is a false read: the port IS the include, and the alternative was one
 * near-identical `@noRailsEquivalent PERMANENT` tag per method, all citing the
 * same `include` line. So a core module's methods enter `allowed` exactly like
 * a vendored mixin's, keeping the allowance scoped to the files whose Ruby
 * counterpart actually writes the `include` — a `detect` on a class that does
 * not include Enumerable stays flagged.
 *
 * Values are `Enumerable.instance_methods(false)` (Ruby 3.4). An
 * ActiveSupport core_ext reopening of the same module (`index_by`,
 * `compact_blank` in `core_ext/enumerable.rb`) is a real `def` in a vendored
 * gem and already resolves through the normal module walk — this table adds
 * only what the interpreter supplies.
 */
const CORE_MIXIN_METHODS: Record<string, string[]> = {
  Enumerable: [
    "all?",
    "any?",
    "chain",
    "chunk",
    "chunk_while",
    "collect",
    "collect_concat",
    "compact",
    "count",
    "cycle",
    "detect",
    "drop",
    "drop_while",
    "each_cons",
    "each_entry",
    "each_slice",
    "each_with_index",
    "each_with_object",
    "entries",
    "filter",
    "filter_map",
    "find",
    "find_all",
    "find_index",
    "first",
    "flat_map",
    "grep",
    "grep_v",
    "group_by",
    "include?",
    "inject",
    "lazy",
    "map",
    "max",
    "max_by",
    "member?",
    "min",
    "min_by",
    "minmax",
    "minmax_by",
    "none?",
    "one?",
    "partition",
    "reduce",
    "reject",
    "reverse_each",
    "select",
    "slice_after",
    "slice_before",
    "slice_when",
    "sort",
    "sort_by",
    "sum",
    "take",
    "take_while",
    "tally",
    "to_a",
    "to_h",
    "to_set",
    "uniq",
    "zip",
  ],
};

const PORTED_METHODS_FROM_UNPORTED_MIXINS: Record<string, string[]> = {
  "ActiveRecord::Railtie": ["process_action", "cleanup_view_runtime", "append_info_to_payload"],
  "ActiveRecord::AssociationNotFoundError": ["detailed_message"],
};

/**
 * Extra TS candidates for Ruby names the normal case-transform can't spell.
 *
 * `to_a`/`to_ary` camelize to `toA`/`toAry`; the JS spelling of that protocol
 * is `toArray`. `==` is an operator — TS has no operator overloading, so the
 * port is a named `equals`, and `<=>` a named `compare` (the spelling
 * OPERATOR_SPELLING_BY_FQN already pins for every class that ports it). Ruby copy semantics come from `Object#clone`/`#dup`
 * (never `def`ed in Rails) plus the `initialize_copy` hook the class DOES
 * define; JS has no `Object#clone`, so the faithful port of that pair is a
 * `clone`/`dup` method on the class.
 */
const MIRROR_CANDIDATE_OVERRIDES: Record<string, string[]> = {
  to_a: ["toArray"],
  to_ary: ["toArray"],
  "==": ["equals"],
  "<=>": ["compare"],
  // `CompareWithRange#===` (core_ext/range/compare_range.rb:16) — named
  // `caseEquals`, the spelling OPERATOR_SPELLING_BY_FQN pins for that module
  // and the only class in the port that defines `===`.
  "===": ["caseEquals"],
  // `WhereClause#+` / `#-` / `#|` (relation/where_clause.rb:14, :18, :22) —
  // named `plus` / `minus` / `union`, the spellings OPERATOR_SPELLING_BY_FQN
  // pins for that class.
  "+": ["plus"],
  "-": ["minus"],
  "|": ["union"],
  initialize_copy: ["clone", "dup"],
  initialize_dup: ["dup"],
  initialize_clone: ["clone"],
};

/**
 * TS candidates for a Ruby method `rubyMethodToTs` refuses to map.
 *
 * `conventions.SKIP` means parity:api never expects a TS counterpart, but the
 * Ruby method still EXISTS in the file — so a TS override of it (`freeze`,
 * `inspect`, `to_a`) is Rails-faithful, not drift. Mapping those
 * names here keeps the allowance *file-scoped*: `freeze` is allowed in core.ts
 * because core.rb defines `freeze`, and stays flagged anywhere Ruby doesn't.
 * That's strictly tighter than the blanket in-file allow-set this replaced.
 *
 * Two exclusions: `SKIP_TS_MIRROR_IS_DRIFT` names (Ruby hooks — a same-named
 * TS method is a trails invention, not a port), and anything neither on SKIP
 * nor in the override map, so ordinary unmapped names (operators other than
 * `==`) stay unmapped.
 */
function skipMirrorCandidates(rubyName: string): string[] | null {
  if (SKIP_TS_MIRROR_IS_DRIFT.has(rubyName)) return null;
  const overrides = MIRROR_CANDIDATE_OVERRIDES[rubyName];
  if (!SKIP.has(rubyName) && !overrides) return null;
  const candidates = [...(rubyMethodToTsIgnoringSkip(rubyName) ?? []), ...(overrides ?? [])];
  return candidates.length > 0 ? candidates : null;
}

/**
 * `rubyMethodToTs` for any method, falling back to `skipMirrorCandidates` for
 * the names it refuses, plus the trails `Q`-suffix predicate form.
 * trails encodes a Ruby `?` predicate with a trailing `Q` in TS
 * (`connected_to?` → `connectedToQ`), sometimes stacked on the is-prefix form
 * (`connected?` → `isConnectedQ`). The base mapper only emits the is-prefix
 * and plain forms, so without the `Q` variants every ported predicate is
 * mis-flagged as novel. Append `Q` to each candidate of a `?` method, plus the
 * quoted-literal spelling (`get "debug?"`) — the most faithful port, which the
 * base mapper offers only when it can see the Ruby siblings.
 */
function rubyMethodCandidates(rubyName: string): string[] | null {
  const base = rubyMethodToTs(rubyName) ?? skipMirrorCandidates(rubyName);
  if (!base) return null;
  if (!rubyName.endsWith("?")) return base;
  const literal = snakeToCamel(rubyName.slice(0, -1)) + "?";
  return [...base, ...base.map((c) => c + "Q"), literal];
}

/**
 * TS-candidate names for a Ruby file-level constant. Constants aren't
 * case-transformed on the way over — `ER_DUP_ENTRY` ports verbatim — so the
 * name itself is always a candidate. The camelized form is the second
 * candidate, keeping scoring in lockstep with `constantNameMatches`
 * (literals.ts), which the literal-value comparison already uses to pair a
 * Ruby constant with its TS counterpart; scoring the two passes off different
 * name rules would let a constant compare as a value yet still read as drift.
 *
 * The camelized form is emitted only for multi-token SCREAMING_SNAKE names —
 * the ones where camelizing produces a case transition (`ER_DUP_ENTRY` →
 * `erDupEntry`) that could only have come from a constant. A single-token name
 * camelizes to a bare lowercase word indistinguishable from an ordinary method
 * name, whether it started CamelCase (`Version = Gem::Version`) or SCREAMING
 * (`VERSION = "10.0.0"`, arel.rb:29) — `snakeToCamel` is a no-op without a `_`
 * to drive capitalization, so both collapse to `version`. Admitting that would
 * silently absolve a genuinely novel TS `version` everywhere the allow-set is
 * unioned in, a far worse trade than the one drift-read it saves.
 *
 * This is deliberately narrower than `constantNameMatches`, which may pair
 * `VERSION` with a TS `version` for value comparison. Pairing a *known* TS
 * constant to diff its value is safe; minting a lowercase allow-set entry that
 * any method name can collide with is not.
 */
function rubyConstantCandidates(name: string): string[] {
  if (!/^[A-Z0-9]+(_[A-Z0-9]+)+$/.test(name)) return [name];
  const camel = snakeToCamel(name.toLowerCase());
  return camel === name ? [name] : [name, camel];
}

/** Get-or-init helper: replaces the `(get() ?? set([]).get()!).push(v)` idiom. */
function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * An extra TS name is **moved** if a Ruby method somewhere in Rails-land
 * camelizes to it (just not in the matched file). It's **novel** when no
 * Ruby method anywhere produces it — that's the high-signal class:
 * helpers, accidental public surface, TS-only ergonomics. Barrel files
 * like `connection-adapters.ts` are mostly `moved`; small focused files'
 * extras are mostly `novel`.
 */
export type ExtraKind = "novel" | "moved";

/** One `@noRailsEquivalent`-tagged declaration, keyed by package + TS file + name. */
export interface TaggedEntry {
  package: string;
  tsFile: string;
  name: string;
  reason: string;
  /**
   * True when the entry derives from a tagged `interface` DECLARATION rather
   * than from a tag written on this name — i.e. one of its MEMBERS. The
   * interface's own name is a written tag: declaration names are extra surface
   * (`collectTsFileNames`), so that entry can match and can go stale like any
   * other. Inherited entries allow extra surface like any other, but they are
   * excluded from the tag total and from the stale check: the interface tag is
   * written once for the whole shape, so a member of it that happens not to
   * flag as extra is not a stale tag anyone can delete.
   */
  inherited?: boolean;
  /**
   * True when the entry is a FILE-level tag (`name` is `FILE_TAG_NAME`): one
   * reason at the top of a file that no Rails file maps onto, covering every
   * otherwise-extra name in it. See `fileTagVerdict` for the claims it may not
   * make.
   */
  fileLevel?: boolean;
}

/**
 * The `name` slot of a file-level tag's key. Not a legal TS identifier, so a
 * file-level tag neither shadows nor is shadowed by a per-declaration one in
 * the shared key space, and it counts as a written tag like any other — the
 * permanence gate and the staleness gate both apply to it unchanged.
 */
export const FILE_TAG_NAME = "*";

/** Why a file-level tag was refused — see `fileTagVerdict`. */
export type FileTagRejectionCause = "counterpart-file" | "moved-names" | "stale-moved-declaration";

export interface FileTagRejection {
  package: string;
  tsFile: string;
  cause: FileTagRejectionCause;
  /** The Rails file that maps onto this TS file (`counterpart-file` only). */
  rubyFile?: string;
  /** The names scoring `moved` and NOT declared (`moved-names` only). */
  movedNames?: string[];
  /**
   * The Rails owners each of those names credits against (`moved-names`
   * only), so the rejection states the evidence instead of naming a question.
   */
  movedOwners?: Record<string, RubyOwner[]>;
  /**
   * Names the reason declares under `MOVED-BY-SHORT-NAME:` that no longer
   * score `moved` (`stale-moved-declaration` only).
   */
  staleMovedNames?: string[];
}

const MOVED_BY_SHORT_NAME_RE = /MOVED-BY-SHORT-NAME:([^.]*)/;

/**
 * The clause a file-level reason uses to declare, name by name, which of its
 * `moved` scores are bare-short-name coincidences rather than misplaced ports.
 *
 * `moved` is decided by a single global map of every camelized Ruby method
 * name in Rails-land (`buildGlobalRubyCandidates`): a TS `close` on a libsql
 * driver handle scores `moved` off `Rack::BodyProxy#close`, and `prepare` off
 * `Store::HashAccessor#prepare` — the owners the map carries (`RubyOwner`) are
 * what let a reader see that at a glance rather than re-deriving it.
 * For a file that binds a third-party JS client — a population Ruby does not
 * have at all — every generic verb in the client's own protocol collides that
 * way, and there is no Rails name for any of them to move onto.
 *
 * The declaration is what keeps that from re-opening the hole the moved gate
 * exists to close (`postgresql/schema-statements-class.ts`, ~80 moved names of
 * a genuinely renamed port). It is per-name and reviewed, not a mode switch:
 * a moved name the reason does not list still refuses the blanket, and a
 * listed name that stops scoring `moved` is stale and must be deleted, so the
 * list can only shrink.
 *
 * The clause runs from the marker to the end of its sentence, and only
 * identifier tokens in it count: a stray prose word is ignored rather than
 * minted as a declaration no extra can ever match, which would read as
 * permanent staleness. It cannot be spelled as a JSDoc `@tag` — a bare `@word`
 * inside a `@noRailsEquivalent` reason truncates the reason (`proseTagAfter`,
 * extract-ts-api.ts).
 */
export function declaredCoincidentalMovedNames(reason: string): Set<string> {
  const m = MOVED_BY_SHORT_NAME_RE.exec(reason);
  if (!m) return new Set();
  return new Set(m[1].split(/[,\s]+/).filter((s) => /^[A-Za-z_$][\w$]*$/.test(s)));
}

/**
 * Whether a file-level tag may absorb this file's extras, and why not when it
 * may not.
 *
 * A file-level tag is a blanket by construction, so it is confined to the one
 * population where a blanket is sound: files no `.rb` maps onto AND whose extra
 * names appear nowhere in Rails-land. Member inheritance from a tagged CLASS is
 * refused for the same reason (see `collectTaggedEntries`).
 *
 * `postgresql/schema-statements-class.ts` is the counterexample that fixes the
 * shape of this check: it has no counterpart `.rb`, yet its
 * `PostgreSQLSchemaStatements` is a renamed port of
 * `PostgreSQL::SchemaStatements` and ~80 of its names score `moved`. "No
 * counterpart FILE" is not the claim "no counterpart NAME", and `moved` — the
 * name exists in Rails, just in another `.rb` — is exactly the marker that a
 * rename may be owed. Refusing is a hard failure naming the file, never a
 * silent no-op: a blanket that quietly stopped applying would leave the surface
 * it was absorbing uncounted.
 *
 * `extras` is the FULL scored set, `--novel-only` notwithstanding: a moved name
 * refutes the claim whether or not this run is reporting moved names.
 *
 * A moved name the reason names in its `MOVED-BY-SHORT-NAME:` clause
 * (`declaredCoincidentalMovedNames`) stops refuting it — see that clause for
 * why the escape is per-name and reviewed. The declaration is only-shrink: a
 * declared name that no longer scores `moved` is `stale-moved-declaration`,
 * refused exactly as loudly as an undeclared moved name.
 */
export function fileTagVerdict(
  rubyFile: string | null,
  extras: readonly ExtraName[],
  reason = "",
): FileTagRejectionCause | null {
  if (rubyFile !== null) return "counterpart-file";
  const declared = declaredCoincidentalMovedNames(reason);
  const moved = new Set(extras.filter((e) => e.kind === "moved").map((e) => e.name));
  if ([...moved].some((n) => !declared.has(n))) return "moved-names";
  if ([...declared].some((n) => !moved.has(n))) return "stale-moved-declaration";
  return null;
}

/** The moved names in `extras` the reason does not declare — `moved-names`. */
function undeclaredMovedNames(extras: readonly ExtraName[], reason: string): string[] {
  const declared = declaredCoincidentalMovedNames(reason);
  return extras.filter((e) => e.kind === "moved" && !declared.has(e.name)).map((e) => e.name);
}

/** The Rails owners of each undeclared moved name, keyed by TS name. */
function undeclaredMovedOwners(
  extras: readonly ExtraName[],
  reason: string,
): Record<string, RubyOwner[]> {
  const declared = declaredCoincidentalMovedNames(reason);
  const out: Record<string, RubyOwner[]> = {};
  for (const e of extras) {
    if (e.kind !== "moved" || declared.has(e.name)) continue;
    if (e.owners && e.owners.length > 0) out[e.name] = e.owners;
  }
  return out;
}

/** Declared names that no longer score `moved` — `stale-moved-declaration`. */
function staleMovedDeclarations(extras: readonly ExtraName[], reason: string): string[] {
  const moved = new Set(extras.filter((e) => e.kind === "moved").map((e) => e.name));
  return [...declaredCoincidentalMovedNames(reason)].filter((n) => !moved.has(n));
}

import { classifyReason, type Permanence } from "./missing-rails-call-tags.js";

export { classifyReason, type Permanence };

export function allowKeyOf(e: { package: string; tsFile: string; name: string }): string {
  return `${e.package} ${e.tsFile} ${e.name}`;
}

/**
 * Every `@noRailsEquivalent`-tagged declaration in the TS manifest — the sole
 * source of allowed extra surface since RFC 0080 retired
 * extra-surface-allow.json. Keyed by the CONTAINER's file, matching how
 * `collectTsFileNames` gathers the names it compares.
 * Keys are deduped: one declaration reaches many hosts (the mixin object, the
 * install site, the auto-synthesized file module), so the same key arrives
 * repeatedly and would otherwise inflate the tag total.
 *
 * The key space is shared across declaration kinds by necessity, not accident:
 * it must equal the key the extra set uses, and `collectTsFileNames` collapses
 * a file's public surface to a Set of bare NAMES. A static and an instance
 * method called `helper`, or a class and a member both called `Foo`, are one
 * extra with one allowed/novel verdict, so at most one reason can ever be
 * reported for them — namespacing a kind's key would simply stop it matching.
 * The tie-break is first-push-wins, and members are pushed before the
 * container so the more specific reason is the one kept.
 */
export function collectTaggedEntries(ts: ApiManifest): TaggedEntry[] {
  const out: TaggedEntry[] = [];
  const seen = new Set<string>();
  const push = (
    pkg: string,
    tsFile: string,
    name: string,
    reason: string | undefined,
    inherited = false,
  ): void => {
    if (reason === undefined) return;
    const entry: TaggedEntry = {
      package: pkg,
      tsFile,
      name,
      reason,
      ...(inherited ? { inherited } : {}),
    };
    const key = allowKeyOf(entry);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(entry);
  };
  const pushMethod = (pkg: string, tsFile: string, m: MethodInfo): void =>
    push(pkg, tsFile, m.name, m.noRailsEquivalent);
  for (const [pkg, tsPkg] of Object.entries(ts.packages)) {
    for (const container of [tsPkg.classes, tsPkg.modules]) {
      for (const c of Object.values(container)) {
        if (!c.file || c.reExportedFrom) continue;
        // `declaredIn` members are skipped for the same reason
        // `walkTsFileSurface` skips them: they are not this file's surface, so a
        // key pushed here could never match and would read as STALE on top of
        // its correct match on the declaring file.
        for (const m of c.instanceMethods)
          if (m.declaredIn === undefined) pushMethod(pkg, c.file, m);
        for (const m of c.classMethods) if (m.declaredIn === undefined) pushMethod(pkg, c.file, m);
        // The container's OWN name, tagged on the class/interface/namespace
        // declaration itself — the only inline form available to an extra that
        // is a declaration rather than a member (e.g. a class TS must export as
        // a sibling because it cannot nest, re-attached as a static property).
        // LAST on purpose: a member sharing the container's name occupies the
        // same key (see the dedup note above — one key is all the extra set
        // has), so the more specific member reason wins the tie.
        push(pkg, c.file, c.name, c.noRailsEquivalent);
        // A tagged `interface` covers its MEMBERS as well as its own name. An
        // interface is type-only: the ones that need the tag exist solely to
        // declare the shape of a duck-typed collaborator (e.g. globalid's
        // `LocatorModel`, which types the Active Record surface Rails calls as
        // `model_class.find gid.model_id`), and Ruby writes no such
        // declaration at all. So no member of one can have a Ruby counterpart
        // either, and tagging them one by one would repeat the same reason on
        // every member of every such interface. Classes are deliberately
        // excluded: a tagged class name is usually an extractor-shape artifact
        // (a nested Ruby class TS must export as a sibling) whose members DO
        // have Ruby counterparts, so inheriting there would mask real drift.
        // A member's own tag still wins — members are pushed first.
        if (c.isInterface === true && c.noRailsEquivalent !== undefined) {
          const covered = c.interfaceMembers;
          for (const m of c.instanceMethods) {
            if (m.declaredIn !== undefined) continue;
            if (covered && !covered.includes(m.name)) continue;
            push(pkg, c.file, m.name, c.noRailsEquivalent, true);
          }
        }
      }
    }
    for (const [file, fns] of Object.entries(tsPkg.fileFunctions ?? {})) {
      for (const fn of fns) pushMethod(pkg, file, fn);
    }
    for (const [file, reason] of Object.entries(tsPkg.fileNoRailsEquivalent ?? {})) {
      const entry: TaggedEntry = { package: pkg, tsFile: file, name: FILE_TAG_NAME, reason };
      if (seen.has(allowKeyOf(entry))) continue;
      seen.add(allowKeyOf(entry));
      out.push({ ...entry, fileLevel: true });
    }
  }
  return out;
}

/**
 * A Rails member a `moved` extra credits against: the package and `.rb` it is
 * declared in, its enclosing constant, and the Ruby spelling
 * (`Rack::BodyProxy#close`). This is the evidence that separates the two
 * populations a bare `moved` verdict conflates — a misplaced port (many names
 * crediting ONE Rails class in one `.rb`: a rename is owed) from a
 * bare-short-name coincidence (a handful of names crediting unrelated classes
 * across unrelated gems: nothing is owed).
 */
export interface RubyOwner {
  package: string;
  file: string;
  /** The enclosing Ruby constant — the declaration itself when it IS one. */
  fqn: string;
  /** `Class#method`, `Class.method`, or the bare constant name. */
  rubyName: string;
}

/**
 * Owners kept per candidate name. A generic verb like `call` or `each` is
 * declared hundreds of times across Rails-land, and the whole list is never
 * read — the reader needs the top owner plus enough siblings to see whether
 * they cluster in one class. Keeping all of them would multiply the oracle's
 * memory by the method count for no added signal.
 */
const MAX_OWNERS_PER_NAME = 5;

export interface ExtraName {
  name: string;
  kind: ExtraKind;
  /**
   * The Rails members this name credits against, `kind === "moved"` only —
   * see `RubyOwner`. Absent for `novel` (nothing in Rails to credit).
   */
  owners?: RubyOwner[];
}

interface ExtraFile {
  package: string;
  tsFile: string;
  /**
   * `null` for a TS file no Rails file maps onto — every public name in it is
   * extra by construction (see `uncoveredTsFiles`).
   */
  rubyFile: string | null;
  extraCount: number;
  novelCount: number;
  movedCount: number;
  allowlistedCount: number;
  extras: ExtraName[];
}

interface PackageTotals {
  package: string;
  filesWithDrift: number;
  totalExtras: number;
  totalNovel: number;
  totalMoved: number;
  totalAllowlisted: number;
  /**
   * Names dropped by the interface kind exemption — declaration names
   * (`collectInterfaceOnlyNames`) and the members they cover
   * (`collectInterfaceMemberOnlyNames`). Reported so the exemption stays
   * measurable: it is the one allowance with no per-declaration tag to count.
   */
  totalInterfaceExempt: number;
  /**
   * The `rubyFile === null` slice of the totals above — files no Rails file
   * maps onto. Broken out so a consumer can tell how much of a package's
   * extra surface comes from that population (it was unmeasured before this
   * existed, so folding it in silently would read as a regression).
   */
  noCounterpartFiles: number;
  noCounterpartExtras: number;
  noCounterpartNovel: number;
  extraFiles: ExtraFile[];
}

export interface TaggedSummary {
  /** Tags actually WRITTEN in the source — inherited entries excluded. */
  total: number;
  /** Written tags that matched an extra. */
  matched: number;
  /**
   * Extras allowed by an entry inherited from a tagged `interface` declaration
   * rather than by a tag of their own. Counted apart from `matched` so the two
   * numbers stay comparable with `total`, which counts written tags only.
   */
  inheritedMatched: number;
  stale: TaggedEntry[];
  /**
   * Permanence claims across the WRITTEN tags (`total`). An inherited entry
   * repeats its interface declaration's reason, so counting it would multiply
   * one claim by the interface's member count. A non-zero `unclassified` fails
   * the run — the whole population is classified, so the gate is a hard 0, not
   * a ratchet that would re-admit the debt it exists to stop.
   */
  classification: {
    permanent: number;
    convergeable: number;
    /** Tags stating no claim. Listed too, since acting on them needs the names. */
    unclassified: number;
    unclassifiedByPackage: Record<string, number>;
    unclassifiedEntries: TaggedEntry[];
  };
}

interface Report {
  generatedAt: string;
  packages: PackageTotals[];
  topN: ExtraFile[];
  /** `@noRailsEquivalent` tags found in the TS manifest. */
  tagged: TaggedSummary;
  /** File-level tags whose claim the report refuted — see `fileTagVerdict`. */
  fileTagRejections: FileTagRejection[];
}

const HELP = `extra-surface — TS files with public API exceeding their Rails counterpart

Usage:
  pnpm tsx scripts/api-compare/extra-surface.ts [options]

Options:
  --package <name>     Restrict to one package (e.g. activerecord)
  --top <N>            Top-N most-divergent files (default 50)
  --json               Emit JSON to stdout instead of the human report
  --exclude-glob <g>   Skip TS files containing substring <g> (repeatable)
  --novel-only         Only count/show extras that don't appear ANYWHERE
                       in the Rails source (filters out moved-not-novel
                       drift; rank order also flips to novel-first)
  --max-detail <N>     Per-file detail listing cap (default 40 names;
                       0 = unlimited)
  --verbose            Under each file's detail, print the Rails file and
                       Class#method every moved name credits against
  --help               This message

TS files that no Rails file maps onto are scored too, with an empty allowed
set — every public name in them is extra. Trees mirroring Rails' test/ code
(test-helpers/, support/, cases/, fixture corpora) are held out, since the Ruby
extractor reads lib/ only. The NoCntrp column reports that slice separately.

A novel \`interface\` DECLARATION name is exempt by kind and needs no tag: it is a
type-only shape Ruby leaves to duck typing, so no Ruby counterpart is possible,
and its MEMBERS are exempt with it. An interface name that does appear in Rails
stays scored (as moved), members included — that is the drift case a blanket
exemption would hide.

Reasoned exceptions: an extra is allowed by tagging its TS declaration
\`@noRailsEquivalent <reason>\` in JSDoc. Allowed extras are subtracted from the
novel/moved counts and reported as an "Allowed" total; a tag on a name that no
longer flags is STALE and fails the run. A reason opening with PERMANENT or
CONVERGEABLE states its permanence claim; a tag stating neither fails the run.

A whole file with no Rails counterpart can carry ONE reason instead: write
\`@noRailsEquivalent <reason>\` in a JSDoc block at the top of the file, above the
imports. It covers every otherwise-extra name in that file. The claim is checked,
not trusted — if a Rails file maps onto it, or any name in it scores as moved
(the name exists in Rails, just elsewhere), the tag is refused and the run fails.

Requires: pnpm parity:api must have run first to produce
  scripts/api-compare/output/{rails-api.json,ts-api.json}.
`;

export interface CliArgs {
  filterPkg: string | null;
  topN: number;
  json: boolean;
  excludeGlobs: string[];
  novelOnly: boolean;
  maxDetail: number;
  verbose: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
  let filterPkg: string | null = null;
  let topN = 50;
  let json = false;
  let novelOnly = false;
  let maxDetail = 40;
  let verbose = false;
  const excludeGlobs: string[] = [];

  const requireValue = (flag: string, v: string | undefined): string => {
    if (!v || v.startsWith("--")) {
      console.error(`${flag} requires a value`);
      process.exit(1);
    }
    return v;
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      console.log(HELP);
      process.exit(0);
    } else if (a === "--package") {
      filterPkg = requireValue("--package", argv[++i]);
    } else if (a === "--top") {
      const n = Number(requireValue("--top", argv[++i]));
      if (!Number.isInteger(n) || n <= 0) {
        console.error("--top requires a positive integer");
        process.exit(1);
      }
      topN = n;
    } else if (a === "--max-detail") {
      const n = Number(requireValue("--max-detail", argv[++i]));
      if (!Number.isInteger(n) || n < 0) {
        console.error("--max-detail requires a non-negative integer");
        process.exit(1);
      }
      maxDetail = n;
    } else if (a === "--json") {
      json = true;
    } else if (a === "--novel-only") {
      novelOnly = true;
    } else if (a === "--verbose") {
      verbose = true;
    } else if (a === "--exclude-glob") {
      excludeGlobs.push(requireValue("--exclude-glob", argv[++i]));
    } else {
      console.error(`Unknown flag: ${a}`);
      console.error(HELP);
      process.exit(1);
    }
  }
  return { filterPkg, topN, json, excludeGlobs, novelOnly, maxDetail, verbose };
}

/**
 * Collect public TS names declared *in this file's own entities* — no
 * inherited surface. Inherited names that the parent already defines are
 * not "drift" relative to Rails; they're the parent's problem (and Rails
 * inherits them too).
 *
 * The extractor keeps `_`-prefixed exports as public (only Ruby
 * `private`/`protected`, TS `private`/`protected`, `#`-prefixed fields,
 * and `@internal` JSDoc on a top-level exported function set
 * `internal: true`; class/module members take the flag from their TS
 * visibility modifier only). The Rails-private
 * convention in this repo means we filter `_`-prefix here too.
 *
 * A class / interface / namespace DECLARATION name counts as surface too, on
 * the same footing as a member: `class QueryLogger` in a file whose Rails
 * counterpart declares no such constant is exactly the drift this report
 * exists to find, and before RFC 0080 it was invisible — which also left the
 * declaration-level `@noRailsEquivalent` form with nothing to match unless the
 * name happened to be re-attached as a static (see `collectTaggedEntries`).
 * The Ruby side answers symmetrically: `collectAllowedNames` allows every
 * entity name the matched `.rb` declares, so a faithfully ported class is not
 * extra. Synthesized pseudo-modules are excluded — their `<fn>__mixin` name is
 * an extractor artifact, not source text.
 *
 * Interface declaration names are collected here like any other; the
 * kind-level exemption that removes most of them is applied by the scorer,
 * which needs the novel/moved verdict this function cannot see (see
 * `collectInterfaceOnlyNames`).
 */
export function collectTsFileNames(
  file: string,
  classes: ClassInfo[],
  modules: ClassInfo[],
  fileFunctions: MethodInfo[] | undefined,
): Set<string> {
  const out = new Set<string>();
  for (const { name } of walkTsFileSurface(file, classes, modules, fileFunctions)) out.add(name);
  return out;
}

/** One public name a file contributes, and whether an `interface` declared it. */
interface SurfaceName {
  name: string;
  interfaceDeclaration: boolean;
  /**
   * The `interface` whose body declares this MEMBER, or `null` for surface
   * that is not an interface member (a class/namespace member, a top-level
   * function, or a declaration name — including an interface's own).
   */
  interfaceMemberOf: string | null;
}

/**
 * The single walk both collectors read, so what counts as surface and what
 * counts as an interface-only name can never disagree about a file.
 */
function walkTsFileSurface(
  file: string,
  classes: ClassInfo[],
  modules: ClassInfo[],
  fileFunctions: MethodInfo[] | undefined,
): SurfaceName[] {
  const out: SurfaceName[] = [];
  const pushMember = (m: MethodInfo, interfaceMemberOf: string | null): void => {
    if (m.internal === true) return;
    if (m.name.startsWith("_")) return;
    out.push({ name: m.name, interfaceDeclaration: false, interfaceMemberOf });
  };
  for (const c of [...classes, ...modules]) {
    if (c.file !== file) continue;
    const skipForeign = c.synthesizedMixin === true;
    const declaredByInterface = c.isInterface === true && c.declaredAsNamespace !== true;
    if (!skipForeign && !c.name.startsWith("_")) {
      // `declaredAsNamespace` matters because declaration merging collapses an
      // `interface` and a same-named `namespace` into one entry: the merged
      // entry carries `isInterface`, but the namespace half is a real
      // non-interface declaration of the name and must stay scored.
      out.push({
        name: c.name,
        interfaceDeclaration: declaredByInterface,
        interfaceMemberOf: null,
      });
    }
    const interfaceMembers = c.interfaceMembers;
    for (const m of [...c.instanceMethods, ...c.classMethods]) {
      // `declaredIn` marks a member the extractor pulled in from another file —
      // a synthesized mixin's base surface, or an `interface X extends Y`'s
      // inherited properties. Either way it is that file's surface, scored
      // there, and the only place a `@noRailsEquivalent` on it can match; the
      // `skipForeign` guard used to limit this to the mixin case, which left an
      // extending interface re-scoring its base's whole surface with no tag
      // able to reach it.
      if (m.declaredIn !== undefined) continue;
      const fromInterface =
        c.isInterface === true && (interfaceMembers ? interfaceMembers.includes(m.name) : true);
      pushMember(m, fromInterface ? c.name : null);
    }
  }
  for (const fn of fileFunctions ?? []) pushMember(fn, null);
  return out;
}

/**
 * The names a file contributes ONLY as an `interface` declaration — nothing
 * else in the file declares or defines that name.
 *
 * RFC 0080 policy, decided here: an interface declaration name is exempt from
 * extra surface BY KIND, but only when it is also **novel** (the name appears
 * nowhere in the Rails source — the scorer applies that half). The reasoning
 * is the one `collectTaggedEntries` already applies to a tagged interface's
 * members: an `interface` is type-only, and the overwhelming majority of ours
 * exist because TS must write down a shape Ruby leaves to duck typing
 * (`…Options` bags, `…Host` collaborator seams, `…Like` structural stand-ins).
 * A Ruby counterpart is impossible by construction, and the alternative was
 * ~600 near-identical `@noRailsEquivalent` tags, whose sheer volume would
 * drown the tag report the same RFC exists to make readable.
 *
 * The novelty half answers the counter-argument — a TS `interface` is
 * sometimes a real port of a Ruby module's shape, and a blanket exemption
 * would hide that drift. If the name exists anywhere in Rails, the exemption
 * does NOT apply: a `Quoting` or `TypeMap` interface declared in a file whose
 * Rails counterpart doesn't declare it is precisely the misplacement this
 * report is for, and it stays scored (as `moved`) and stays tag-able. Only
 * names Rails never uses at all — which therefore cannot be a drifting port of
 * anything — drop out.
 *
 * The members of an exempt interface go with it — see
 * `collectInterfaceMemberOnlyNames`.
 *
 * Names shared with a member or with a class/namespace declaration are NOT
 * exempt — including the `namespace` half of a declaration-merged
 * `interface`+`namespace` pair, which the extractor collapses into one entry
 * (`declaredAsNamespace`): the extra set is a flat Set of bare names (see `allowKeyOf`), so one
 * name carries one verdict, and exempting on the interface's behalf would
 * silently absolve the non-interface declaration sharing it.
 */
export function collectInterfaceOnlyNames(
  file: string,
  classes: ClassInfo[],
  modules: ClassInfo[],
  fileFunctions: MethodInfo[] | undefined,
): Set<string> {
  const interfaces = new Set<string>();
  const others = new Set<string>();
  for (const { name, interfaceDeclaration } of walkTsFileSurface(
    file,
    classes,
    modules,
    fileFunctions,
  )) {
    (interfaceDeclaration ? interfaces : others).add(name);
  }
  for (const name of others) interfaces.delete(name);
  return interfaces;
}

/**
 * Member names a file contributes ONLY through the body of an `interface` —
 * mapped to the interfaces that declare them.
 *
 * RFC 0117, decided here: an `interface` whose declaration name is exempt by
 * kind (`collectInterfaceOnlyNames` — a structural shape Ruby leaves to duck
 * typing) covers its MEMBERS too, exactly as a `@noRailsEquivalent` tag on an
 * interface declaration already does (see `collectTaggedEntries`). The
 * declaration and its body are one statement about one type: if the type
 * itself has no Ruby counterpart by construction, neither does any member of
 * it, and scoring those members against the `.rb` the file happens to mirror
 * is a category error. `Arel::Attributes::Attribute#relation` is typed
 * `RelationLike` in `attributes/attribute.ts`, so its `tableAlias` /
 * `typeForAttribute` — members of `Arel::Table` (`arel/table.rb:26,90`), never
 * of `Arel::Attributes::Attribute` (`arel/attributes/attribute.rb:5-40`) —
 * were reported as `attribute.rb`'s moved surface purely because the stand-in
 * shares its file.
 *
 * The exemption is deliberately NOT unconditional on interface members. It
 * rides on the declaration's verdict, which the scorer applies: an interface
 * named after something Rails uses may be a real port of a Ruby module's
 * shape, so its members stay scored and stay tag-able — the drift case a
 * blanket member exemption would hide.
 *
 * The exemption is deliberately NOT restricted to novel names, as the
 * declaration one is: a structural stand-in's member routinely names a method
 * some OTHER Rails class defines (`Arel::Table#table_alias`), which is exactly
 * the moved row the wrong `.rb` was being charged for.
 *
 * A name anything else in the file also contributes — a class member, a
 * top-level function, any declaration name — is excluded, on the same
 * reasoning as `collectInterfaceOnlyNames`: the extra set is a flat Set of
 * bare names, so one name carries one verdict and exempting on the
 * interface's behalf would silently absolve the other contributor.
 * `interfaceMembers` is what tells the two halves of a declaration-merged
 * `interface`+`namespace` apart — only the names it lists came from the
 * interface body — the same split `collectTaggedEntries` applies to a tagged
 * interface's members.
 */
export function collectInterfaceMemberOnlyNames(
  file: string,
  classes: ClassInfo[],
  modules: ClassInfo[],
  fileFunctions: MethodInfo[] | undefined,
): Map<string, string[]> {
  const members = new Map<string, string[]>();
  const others = new Set<string>();
  for (const { name, interfaceMemberOf } of walkTsFileSurface(
    file,
    classes,
    modules,
    fileFunctions,
  )) {
    if (interfaceMemberOf === null) {
      others.add(name);
      continue;
    }
    const owners = members.get(name);
    if (owners === undefined) members.set(name, [interfaceMemberOf]);
    else if (!owners.includes(interfaceMemberOf)) owners.push(interfaceMemberOf);
  }
  for (const name of others) members.delete(name);
  return members;
}

/**
 * Pre-fold `Foo::ClassMethods` submodules (the `ActiveSupport::Concern`
 * idiom) into `Foo.classMethods`, mirroring compare.ts's pre-pass. This
 * pre-fold lives in compare.ts at the consumer level (not in the Ruby
 * extractor), so we replicate it here for the same semantics: when a host
 * `include Foo`, the host gains `Foo::ClassMethods`'s instanceMethods as
 * class methods even though only `Foo` is named in the include list.
 *
 * Returns the set of FQNs that were merged-and-skip-listed so the caller
 * doesn't double-count them when iterating modules.
 */
function foldClassMethodsModules(modules: Record<string, ClassInfo>): Set<string> {
  const folded = new Set<string>();
  for (const [fqn, info] of Object.entries(modules)) {
    if (!fqn.endsWith("::ClassMethods")) continue;
    const parentFqn = fqn.replace(/::ClassMethods$/, "");
    const parent = modules[parentFqn];
    if (!parent) continue;
    for (const m of info.instanceMethods) {
      if (!parent.classMethods.some((pm) => pm.name === m.name)) {
        parent.classMethods.push(m);
      }
    }
    folded.add(fqn);
  }
  return folded;
}

/**
 * For one Ruby file's entities, compute the union of all TS candidate names
 * produced by `rubyMethodToTs`. Mirrors `compare.flattenIncludedMethodInfos`
 * mixin routing exactly:
 *
 *   - `include M`: M's instance methods land on the host as instance methods.
 *     A nested `include N` inside M chains through (instance methods only).
 *     M's own `extend` chain does NOT propagate to the host — Ruby `extend`
 *     affects only the receiver's singleton class.
 *   - `extend M` (at host level): M's instance methods land as class methods.
 *   - Module `classMethods` are NOT propagated through include/extend (Ruby
 *     semantics; `flattenIncludedMethodInfos` only pushes `instanceMethods`).
 *     The `ActiveSupport::Concern` "class methods via include" pattern is
 *     handled by `foldClassMethodsModules` above, which moves the nested
 *     `ClassMethods` submodule's instanceMethods into the parent's own
 *     `classMethods` — flattening still only reads `instanceMethods`, so
 *     ASC class methods become entity-level surface, not propagated mixins.
 *   - A mixin whose source file is unported (`UNPORTED_FILES`) is skipped, so
 *     its methods never enter `allowed` — matching the `isSourceUnported`
 *     guard at compare.ts:507. The check uses the module's *owning* package.
 *
 * The matched file's `fileConstants` names join `allowed` too (see
 * `rubyConstantCandidates`): a faithfully-ported `ER_DUP_ENTRY` is not extra
 * surface. Constants have no mixin routing — they belong to the file, not to
 * an entity — so they're added once up front rather than per entity.
 *
 * Since `allowed` is a flat name set (instance vs class collapsed on the TS
 * side anyway), we simply union both `instanceMethods` and `classMethods`
 * for the *host* entity, but ONLY `instanceMethods` for walked-into mixins.
 *
 * `include` names are resolved via compare.ts's `resolveModuleName`, which
 * walks namespace prefixes — `AbstractAdapter` including `"Quoting"` maps
 * only to `ConnectionAdapters::Quoting`, never to PG/MySQL siblings of the
 * same short name. Cross-package / stdlib mixins are silently skipped.
 */
/**
 * The two symbol-keyed members trails uses to port a Ruby Concern's hooks —
 * `included do ... end` and `def self.extended(base)` — as
 * `static [included](base)` / `static [extended](base)`, keyed by the symbols
 * `packages/activesupport/src/include.ts` exports
 * (`Symbol.for("@blazetrails/activesupport:included")` and its `extended`
 * twin). CLAUDE.md § "Module mixins" ratifies the shape repo-wide.
 *
 * The extractor records a computed member by its source text
 * (`getMemberName`), so the manifest name IS the bracketed spelling below —
 * which is also how the symbol import resolves at every site in the repo,
 * since the binding is imported under the activesupport name.
 *
 * The string-named `included` / `extended` / `inherited` methods are a
 * different thing and stay drift: `SKIP_GROUPS` in `scripts/parity/conventions.ts`
 * marks them `tsMirrorIsDrift`, and a bracketed name never collides with a
 * bare one.
 */
export const CONCERN_HOOK_MEMBERS = {
  included: "[included]",
  extended: "[extended]",
} as const;

/** `included do ... end` — activemodel/lib/active_model/api.rb:65. */
const INCLUDED_BLOCK_RE = /^[ \t]*included do\b/m;
/** `def self.included(base)` — the pre-Concern spelling of the same hook. */
const SELF_INCLUDED_RE = /^[ \t]*def self\.included\b/m;
/** `def self.extended(base)` — activemodel/lib/active_model/callbacks.rb:66. */
const SELF_EXTENDED_RE = /^[ \t]*def self\.extended\b/m;

/**
 * Which hook members the given Ruby source earns, read off the `.rb` text
 * rather than the manifest: the extractor flattens an `included do extend X end`
 * into the module's `extends` and drops a block that only calls
 * `class_attribute` (conversion.rb:27-33), so the manifest cannot tell a
 * Concern with a hook from one without.
 *
 * The credit is conditional on the Ruby side actually declaring the block, so
 * a hook written into a TS file whose counterpart has none stays novel and the
 * rule cannot launder an invented hook.
 */
export function concernHookNames(rubySource: string): Set<string> {
  const names = new Set<string>();
  if (INCLUDED_BLOCK_RE.test(rubySource) || SELF_INCLUDED_RE.test(rubySource)) {
    names.add(CONCERN_HOOK_MEMBERS.included);
  }
  if (SELF_EXTENDED_RE.test(rubySource)) names.add(CONCERN_HOOK_MEMBERS.extended);
  return names;
}

/** Key into the `concernHooks` map: one entry per (package, Ruby file). */
export function concernHookKey(pkg: string, rubyFile: string): string {
  return `${pkg}\u0000${rubyFile}`;
}

/** Every `.rb` the manifest attributes surface to, in the package's entry. */
function rubyFilesOf(pkg: PackageInfo): Set<string> {
  const files = new Set<string>();
  for (const info of [...Object.values(pkg.classes), ...Object.values(pkg.modules)]) {
    if (info.file) files.add(info.file);
  }
  for (const file of Object.keys(pkg.fileConstants ?? {})) files.add(file);
  return files;
}

/**
 * Read every mapped `.rb` and record the Concern hooks it declares, so
 * `buildReport` can credit the TS port of each. Done once per run, off the
 * vendored lib dirs `vendor/sources.ts` already resolves for the extractor; a
 * file the manifest names but vendor no longer has is simply skipped.
 */
export async function loadConcernHooks(
  ruby: ApiManifest,
  filterPkg: string | null,
): Promise<Map<string, Set<string>>> {
  const libPaths = libPathsManifest();
  const hooks = new Map<string, Set<string>>();
  for (const [pkg, rubyPkg] of Object.entries(ruby.packages)) {
    if (filterPkg !== null && pkg !== filterPkg) continue;
    const libDir = libPaths[pkg];
    if (libDir === undefined) continue;
    for (const rubyFile of rubyFilesOf(rubyPkg)) {
      let source: string;
      try {
        source = await fsp.readFile(path.join(libDir, rubyFile), "utf-8");
      } catch {
        continue;
      }
      const names = concernHookNames(source);
      if (names.size > 0) hooks.set(concernHookKey(pkg, rubyFile), names);
    }
  }
  return hooks;
}

function collectAllowedNames(
  entities: RubyEntity[],
  pkg: string,
  rubyModules: Record<string, ClassInfo>,
  moduleFqnByShort: Map<string, string[]>,
  crossPackageModules: Record<string, ClassInfo>,
  crossPackagePkgByFqn: Record<string, string>,
  fileConstantNames: string[],
  rubyFile: string,
): Set<string> {
  const allowed = new Set<string>();
  // File-level constants are declared per Ruby *file*, not per entity, so they
  // enter the allow-set once for the whole file rather than through the
  // entity/mixin walk below.
  for (const name of fileConstantNames) {
    for (const c of rubyConstantCandidates(name)) allowed.add(c);
  }
  const visited = new Set<string>();

  // `scopedSkipMirrorName`: a scoped skip that names its TS spelling means the
  // port exists but not at the mapped site (a `prepend`ed module's `initialize`,
  // which has no TS constructor to wrap), so the declaration is the port.
  const addMethods = (methods: MethodInfo[], ownerFqn: string, methodFile?: string): void => {
    for (const m of methods) {
      if (methodFile !== undefined && m.file !== methodFile) continue;
      // A Ruby OPERATOR (`*`, `<<`, `~@`) carries no canonical camelCase
      // spelling, so `rubyMethodCandidates` refuses it and the TS port of
      // `Arel::Math#*` reads as novel surface. The port is real and its
      // spelling is already pinned per-class in `OPERATOR_SPELLING_BY_FQN`
      // (the method-ORDER manifest resolves operators through the same table),
      // so consult it here rather than mint a second table: keyed by the
      // DECLARING class, `<<` is `bitwiseShiftLeft` on `Arel::Math` and stays
      // unmapped on `SelectManager`, where it means append.
      for (const c of operatorSpelling(ownerFqn, m.name) ?? []) allowed.add(c);
      // Private/protected Ruby methods (internal) still count: a TS method
      // mirroring a Rails-private method isn't *extra* surface, it's a
      // visibility divergence — the method exists in Rails. Excluding them
      // here would mislabel every public-port-of-a-private-method as drift.
      const mirror = scopedSkipMirrorName(m.name, rubyFile);
      if (mirror !== null) allowed.add(mirror);
      const candidates = rubyMethodCandidates(m.name);
      if (!candidates) continue;
      for (const c of candidates) allowed.add(c);
    }
  };

  const addRubyName = (rubyName: string): void => {
    const candidates = rubyMethodCandidates(rubyName);
    if (!candidates) return;
    for (const c of candidates) allowed.add(c);
  };

  const CONCERN = "ActiveSupport::Concern";

  // Ruby-side walk: a duplicated short name is disambiguated by the enclosing
  // namespace inside `resolveModuleName`, so this needs no declaring-file hint
  // the way the TS sites do (compare.ts `resolveEntityByDeclaringFile`).
  const walkMixin = (incName: string, contextFqn: string): void => {
    const fqn = resolveModuleName(incName, contextFqn, moduleFqnByShort);
    if (visited.has(fqn)) return;
    visited.add(fqn);
    // A Ruby core module (`include Enumerable`) supplies methods no vendored
    // gem `def`s — see CORE_MIXIN_METHODS. Added before the module lookup
    // because the same name can ALSO be a vendored core_ext reopening, which
    // contributes its own `def`s through the walk below.
    for (const name of CORE_MIXIN_METHODS[fqn] ?? []) addRubyName(name);
    for (const inc of HOOK_INJECTED_MIXINS[fqn]?.includes ?? []) walkMixin(inc, fqn);
    // Fall back to the cross-package map: a railtie-injected mixin (see
    // AMBIENT_RAILTIE_MIXINS) or a fully-qualified cross-gem include lives
    // in another package's modules, not this package's.
    const localMod = rubyModules[fqn];
    const mod = localMod ?? crossPackageModules[fqn];
    if (!mod) return;
    // A module whose source file we've explicitly declined to port should
    // not contribute its methods to the host's allowed set — otherwise an
    // unported mixin still flips its TS ports from extra surface to allowed.
    // Mirrors compare.flattenIncludedMethodInfos (compare.ts:507). Resolve
    // `isSourceUnported` against the module's *owning* package: a local
    // module's owner is the host `pkg`, a cross-package module's owner is
    // the package it was extracted from (package-scoped unported patterns
    // key off the owner, not the host).
    const ownerPkg = localMod ? pkg : (crossPackagePkgByFqn[fqn] ?? pkg);
    if (mod.file && isSourceUnported(mod.file, ownerPkg)) return;
    // Only the module's instance methods cross into the host. Class
    // methods on the module itself stay on the module (Ruby `include`
    // semantics; matches compare.flattenIncludedMethodInfos).
    addMethods(mod.instanceMethods, fqn);
    // `include M` where `M extend ActiveSupport::Concern` also runs
    // `base.extend M::ClassMethods` and the `included` block
    // (activesupport/lib/active_support/concern.rb:137-138), so the includer
    // answers both as class methods. Neither reaches the host through its own
    // `includes` — the static extractor files `M::ClassMethods` as a separate
    // entity, and it flattens `included do extend X end` into `M`'s `extends`.
    // Both are gated on the Concern: a plain module's body `extend` really is
    // singleton-only and must not propagate.
    // Spelled `ActiveSupport::Concern` from another gem and bare `Concern` from
    // inside `module ActiveSupport` (callbacks.rb:65); `moduleFqnByShort` is the
    // HOST package's map, so it cannot requalify the bare one. Ruby's own
    // lexical lookup is the guard on the bare spelling: it only resolves to
    // `ActiveSupport::Concern` inside `ActiveSupport`.
    const isConcern = (ext: string): boolean =>
      ext === CONCERN || (ext === "Concern" && fqn.startsWith("ActiveSupport::"));
    if ((mod.extends ?? []).some(isConcern)) {
      walkMixin(`${fqn}::ClassMethods`, fqn);
      for (const ext of mod.extends ?? []) if (!isConcern(ext)) walkMixin(ext, fqn);
    }
    for (const inc of mod.includes ?? []) walkMixin(inc, fqn);
  };

  for (const { fqn, info, nameOnly, methodFile } of entities) {
    // The entity's own short name: since declaration names are TS surface
    // (`collectTsFileNames`), the Ruby constant they port has to be allowed
    // surface, or every faithfully ported class would read as drift. This
    // covers the nested case too — a nested class is a constant ON its
    // enclosing class, so a member of that name is the faithful port, spelled
    // either as a real TS nested class or as `static readonly Inner = Inner`
    // re-attaching a sibling export.
    const short = fqn.split("::").pop();
    if (short) for (const c of rubyConstantCandidates(short)) allowed.add(c);
    if (nameOnly) continue;
    addMethods(info.instanceMethods, fqn, methodFile);
    addMethods(info.classMethods, fqn, methodFile);
    for (const inc of info.includes ?? []) walkMixin(inc, fqn);
    for (const ext of info.extends ?? []) walkMixin(ext, fqn);

    for (const inc of AMBIENT_RAILTIE_MIXINS[fqn]?.includes ?? []) walkMixin(inc, fqn);

    for (const name of PORTED_METHODS_FROM_UNPORTED_MIXINS[fqn] ?? []) addRubyName(name);
  }
  return allowed;
}

/**
 * Build the global "all Ruby method candidate names anywhere in Rails-land"
 * map, used to classify each extra as novel (nowhere in Rails) vs moved
 * (somewhere in Rails, just not in the matched file).
 *
 * The value is the `RubyOwner` list the name credits against, in extraction
 * order. `moved` is still `has(name)` — the owners are attribution, not
 * scoring — but "where" is the whole question a `moved` verdict asks the
 * reader, so the oracle carries it instead of throwing it away and leaving the
 * next reader to re-derive the camelization by hand off `rails-api.json`.
 *
 * Includes private/protected (internal) Ruby methods: a TS name mirroring a
 * Rails-private method that lives in a *different* `.rb` is "moved" (it exists
 * in Rails, just elsewhere), not "novel". Treating private mirrors as novel
 * would inflate the high-signal tier with methods Rails actually defines.
 *
 * File-level constants join the oracle on the same rule as methods: a Ruby
 * constant declared in a *different* `.rb` than the matched one scores as
 * `moved`, not `novel`. Rails does relocate constants (a shared error-code or
 * message constant reachable from several adapters), so the alternative —
 * leaving constants out of the oracle — would re-mint every constant that
 * doesn't sit in its own file as novel-by-omission, which is exactly the
 * miscount this pass exists to remove.
 */
export function buildGlobalRubyCandidates(ruby: ApiManifest): Map<string, RubyOwner[]> {
  const all = new Map<string, RubyOwner[]>();
  const add = (candidate: string, owner: RubyOwner): void => {
    const owners = all.get(candidate);
    if (!owners) {
      all.set(candidate, [owner]);
      return;
    }
    if (owners.length < MAX_OWNERS_PER_NAME) owners.push(owner);
  };
  for (const [pkgName, pkg] of Object.entries(ruby.packages)) {
    for (const [file, consts] of Object.entries(pkg.fileConstants ?? {})) {
      for (const name of Object.keys(consts)) {
        for (const c of rubyConstantCandidates(name)) {
          add(c, { package: pkgName, file, fqn: name, rubyName: name });
        }
      }
    }
    const entities = [...Object.entries(pkg.classes), ...Object.entries(pkg.modules)] as [
      string,
      ClassInfo,
    ][];
    for (const [fqn, e] of entities) {
      const file = e.file ?? "";
      // Declaration names join the oracle on the same rule as methods and
      // constants: a TS class named after a Ruby class declared in a DIFFERENT
      // `.rb` is `moved`, not `novel`.
      for (const c of rubyConstantCandidates(e.name)) {
        add(c, { package: pkgName, file, fqn, rubyName: e.name });
      }
      for (const m of e.instanceMethods) {
        const candidates = rubyMethodCandidates(m.name);
        if (!candidates) continue;
        const owner: RubyOwner = {
          package: pkgName,
          file: m.file ?? file,
          fqn,
          rubyName: `${fqn}#${m.name}`,
        };
        for (const c of candidates) add(c, owner);
      }
      for (const m of e.classMethods) {
        const candidates = rubyMethodCandidates(m.name);
        if (!candidates) continue;
        const owner: RubyOwner = {
          package: pkgName,
          file: m.file ?? file,
          fqn,
          rubyName: `${fqn}.${m.name}`,
        };
        for (const c of candidates) add(c, owner);
      }
    }
  }
  return all;
}

/**
 * Flatten every package's extracted modules into one `FQN → ClassInfo` map so
 * `collectAllowedNames` can resolve a cross-package / railtie-injected mixin
 * (e.g. `GlobalID::Identification` from the globalid package included into
 * `ActiveRecord::Base`) that the per-package module map can't reach. Module
 * FQNs are globally unique across Rails-land, so a flat merge is safe; on the
 * rare collision last-writer-wins, which only affects the foreign-mixin
 * fallback path (the local package map still takes precedence).
 *
 * `pkgByFqn` records the owning package of each module so the unported-source
 * guard in `collectAllowedNames` can resolve `isSourceUnported` against the
 * package the module was extracted from (package-scoped unported patterns key
 * off the owner, not the host).
 */
export function buildCrossPackageModules(ruby: ApiManifest): {
  modules: Record<string, ClassInfo>;
  pkgByFqn: Record<string, string>;
} {
  const modules: Record<string, ClassInfo> = {};
  const pkgByFqn: Record<string, string> = {};
  for (const [pkgName, pkg] of Object.entries(ruby.packages)) {
    for (const [fqn, info] of Object.entries(pkg.modules)) {
      modules[fqn] = info;
      pkgByFqn[fqn] = pkgName;
    }
  }
  return { modules, pkgByFqn };
}

/**
 * Path segments marking a TS tree that mirrors Rails' `test/` (or a codegen
 * fixture corpus) rather than its `lib/`. The Ruby extractor only reads `lib/`,
 * so nothing under these can ever have a counterpart in the file map — scoring
 * them as uncovered would flag every faithfully ported test model
 * (`test-helpers/models/post.ts` alone mirrors 168 members of
 * `activerecord/test/models/post.rb`) as drift. `support/` and `cases/` mirror
 * `activerecord/test/support` and `test/cases`; `fixtures/` covers both the
 * ported Rails fixture data and `type-virtualization/fixtures` codegen
 * input/expected pairs.
 *
 * Matching is per path SEGMENT, not substring: `test-fixtures/` is the split of
 * `lib/active_record/test_fixtures.rb` and stays scored.
 *
 * This is the same lib-only boundary the Ruby side already draws, not an
 * allowance for unconverged surface — a `lib/`-mirroring file with no
 * counterpart IS scored.
 */
const TEST_SUPPORT_SEGMENTS = new Set([
  "test-helpers",
  // Rails' shared test-behavior mixins live in `test/**/behaviors/`
  // (e.g. activesupport/test/cache/behaviors/), which is test tree, not lib.
  "behaviors",
  "dx-tests",
  "support",
  "cases",
  "fixtures",
  "__fixtures__",
]);

/** Basenames of per-adapter test helper modules that sit outside those trees. */
const TEST_SUPPORT_BASENAMES = new Set(["test-helper.ts", "test-helpers.ts"]);

export function isTestSupportFile(tsFile: string): boolean {
  const segments = tsFile.split("/");
  const base = segments.pop() ?? "";
  return segments.some((s) => TEST_SUPPORT_SEGMENTS.has(s)) || TEST_SUPPORT_BASENAMES.has(base);
}

/**
 * TS files in the package that no Ruby file maps onto via `rubyFileToTs`.
 * "Ruby file" includes a file the extractor knows only through its file-level
 * constants — `coveredTsFiles` unions those in, so a constant-only Rails file
 * is a counterpart here exactly as it is in the literal pass.
 *
 * Before this, such a file was invisible: the report iterates Ruby files, so a
 * TS file nothing points at was never visited and its whole public surface went
 * unmeasured — neither novel nor moved nor allowed. That is exactly backwards,
 * since a file Rails has no counterpart for is where extra surface is MOST
 * likely (`ar-config.ts`'s 20+ `setX` re-spellings of Ruby `foo=` writers
 * reported zero extras because `active_record.rb` redirects onto `base.ts`).
 *
 * These files are scored with an EMPTY allowed set — there is no Rails file to
 * take allowed names from — so every public name lands as an extra, classed
 * novel vs moved against the package-wide Rails candidates like any other —
 * including the `setX` spelling of a Ruby `foo=` writer, which `rubyMethodToTs`
 * now offers as a candidate after the bare `foo` accessor, so
 * `setProtocolAdapters` lands as a *move* against `ActiveRecord.protocol_adapters=`
 * rather than as novel. The name is still reported; only its classification
 * changed, and it changed because a promise-returning `setX` is the faithful
 * rendering of a Rails writer that blocks on I/O (RFC 0068).
 */
export function uncoveredTsFiles(
  coveredTsFiles: Set<string>,
  tsClassesByFile: Map<string, ClassInfo[]>,
  tsModulesByFile: Map<string, ClassInfo[]>,
  tsFileFunctions: Record<string, MethodInfo[]>,
): string[] {
  const files = new Set<string>([
    ...tsClassesByFile.keys(),
    ...tsModulesByFile.keys(),
    ...Object.keys(tsFileFunctions),
  ]);
  return [...files]
    .filter((f) => !coveredTsFiles.has(f) && !isTestSupportFile(f))
    .sort((a, b) => a.localeCompare(b));
}

function buildPackageReport(
  pkg: string,
  ruby: ApiManifest,
  ts: ApiManifest,
  excludeGlobs: string[],
  globalRubyCandidates: Map<string, RubyOwner[]>,
  crossPackageModules: Record<string, ClassInfo>,
  crossPackagePkgByFqn: Record<string, string>,
  novelOnly: boolean,
  tagKeys: Set<string>,
  matchedTagKeys: Set<string>,
  fileTagRejections: FileTagRejection[],
  concernHooks: Map<string, Set<string>>,
): PackageTotals {
  const rubyPkg = ruby.packages[pkg];
  const tsPkg = ts.packages[pkg];
  const result: PackageTotals = {
    package: pkg,
    filesWithDrift: 0,
    totalExtras: 0,
    totalNovel: 0,
    totalMoved: 0,
    totalAllowlisted: 0,
    totalInterfaceExempt: 0,
    noCounterpartFiles: 0,
    noCounterpartExtras: 0,
    noCounterpartNovel: 0,
    extraFiles: [],
  };
  if (!rubyPkg || !tsPkg) return result;

  // Pre-fold ASC's `::ClassMethods` submodules into their parent's
  // classMethods (mirrors compare.ts:759-773). Mutates rubyPkg.modules.
  const foldedFqns = foldClassMethodsModules(rubyPkg.modules);

  const moduleFqnByShort = new Map<string, string[]>();
  for (const fqn of Object.keys(rubyPkg.modules)) {
    if (foldedFqns.has(fqn)) continue;
    const short = fqn.split("::").pop();
    if (!short) continue;
    const list = moduleFqnByShort.get(short) ?? [];
    list.push(fqn);
    moduleFqnByShort.set(short, list);
  }

  // compare.ts drops a class nested in a same-file parent from `allRuby`
  // outright (compare.ts:1321-1339), so its methods never count toward the
  // coverage denominator. Extra surface is the inverse question and needs the
  // opposite answer: the nested class IS surface the enclosing file declares,
  // so counting the TS port of it as drift is wrong. It therefore enters the
  // file's allow-set like any other entity — deliberately NOT mirroring
  // compare.ts's use of the same filter.
  const rubyFiles = new Map<string, RubyEntity[]>();
  for (const [fqn, info] of Object.entries(rubyPkg.classes)) {
    if (!info.file) continue;
    pushTo(rubyFiles, info.file, { fqn, info });
  }
  for (const [fqn, info] of Object.entries(rubyPkg.modules)) {
    if (!info.file) continue;
    pushTo(rubyFiles, info.file, { fqn, info, ...(foldedFqns.has(fqn) ? { nameOnly: true } : {}) });
  }

  const tsClassesByFile = new Map<string, ClassInfo[]>();
  const tsModulesByFile = new Map<string, ClassInfo[]>();
  for (const c of Object.values(tsPkg.classes)) {
    if (!c.file || c.reExportedFrom) continue;
    pushTo(tsClassesByFile, c.file, c);
  }
  for (const m of Object.values(tsPkg.modules)) {
    if (!m.file || m.reExportedFrom) continue;
    pushTo(tsModulesByFile, m.file, m);
  }
  const tsFileFunctions = tsPkg.fileFunctions ?? {};
  const fileTags = tsPkg.fileNoRailsEquivalent ?? {};

  // A Ruby file can declare file-level constants and no class/module at all
  // (rails/engine/commands.rb:3-9 is `Rails::Command::…` constants only), so it
  // never lands in `rubyFiles` — but it IS a Rails counterpart, and the literal
  // pass already treats it as one by mapping every `fileConstants` key through
  // `rubyFileToTs` (compare.ts:1838-1841). Score it here the same way: with an
  // empty entity list, so `collectAllowedNames` allows exactly its constants.
  const rubyFileNames = new Set<string>([
    ...rubyFiles.keys(),
    ...Object.keys(rubyPkg.fileConstants ?? {}),
  ]);
  const coveredTsFiles = new Set<string>();
  for (const rubyFile of rubyFileNames) coveredTsFiles.add(rubyFileToTs(rubyFile, pkg));

  // A reopened class is stamped with whichever reopening the extractor read
  // first (`Date` with `core_ext/date/acts_like.rb`), so every other file that
  // reopens it is absent from `rubyFiles` and its TS target falls into the
  // `uncoveredTsFiles(...)` arm below — scored against an EMPTY allowed set.
  // The methods ARE stamped per-file, so recover the file list from them; the
  // `RUBY_FILE_TS_OVERRIDES` rows are the subset of it found by hand.
  //
  // A file already IN `rubyFiles` needs the same pass: a module reopened in it
  // (`ActiveModel::Validations`, primary site `validations.rb`, declaring
  // `validates_with` in `validations/with.rb`) is registered under its primary
  // file only, so its methods score as drift in the very file Rails puts them
  // in. Those entities enter method-file-filtered, which is what keeps the
  // allow-set to the methods that Ruby file actually declares.
  const methodDeclarationFiles = new Set<string>();
  for (const info of [...Object.values(rubyPkg.classes), ...Object.values(rubyPkg.modules)]) {
    for (const m of [...info.instanceMethods, ...info.classMethods]) {
      if (m.file) methodDeclarationFiles.add(m.file);
    }
  }
  for (const rubyFile of [...overriddenRubyFiles(pkg), ...[...methodDeclarationFiles].sort()]) {
    const tsFile = rubyFileToTs(rubyFile, pkg);
    const alreadyDeclared = rubyFiles.has(rubyFile);
    if (!alreadyDeclared && coveredTsFiles.has(tsFile)) continue;
    const declared = new Set((rubyFiles.get(rubyFile) ?? []).map((e) => e.fqn));
    for (const [fqn, info] of [
      ...Object.entries(rubyPkg.classes),
      ...Object.entries(rubyPkg.modules),
    ]) {
      if (declared.has(fqn)) continue;
      const declaresHere = (m: MethodInfo): boolean => m.file === rubyFile;
      if (!info.instanceMethods.some(declaresHere) && !info.classMethods.some(declaresHere)) {
        continue;
      }
      pushTo(rubyFiles, rubyFile, { fqn, info, methodFile: rubyFile });
    }
    if (rubyFiles.has(rubyFile)) {
      rubyFileNames.add(rubyFile);
      coveredTsFiles.add(tsFile);
    }
  }

  const rubyFileByTsFile = new Map<string, string>();
  for (const rf of rubyFileNames) rubyFileByTsFile.set(rubyFileToTs(rf, pkg), rf);

  const scoreTargets: { tsFile: string; rubyFile: string | null }[] = [
    ...[...rubyFileNames].map((rubyFile) => ({
      tsFile: rubyFileToTs(rubyFile, pkg),
      rubyFile,
    })),
    ...uncoveredTsFiles(coveredTsFiles, tsClassesByFile, tsModulesByFile, tsFileFunctions).map(
      (tsFile) => ({ tsFile, rubyFile: null }),
    ),
  ];

  for (const { tsFile: expectedTs, rubyFile } of scoreTargets) {
    if (excludeGlobs.some((g) => expectedTs.includes(g))) continue;

    const classes = tsClassesByFile.get(expectedTs) ?? [];
    const modules = tsModulesByFile.get(expectedTs) ?? [];
    const fileFns = tsFileFunctions[expectedTs];
    if (classes.length === 0 && modules.length === 0 && !fileFns) continue;

    const tsNames = collectTsFileNames(expectedTs, classes, modules, fileFns);
    if (tsNames.size === 0) continue;
    const interfaceOnly = collectInterfaceOnlyNames(expectedTs, classes, modules, fileFns);
    const interfaceMemberOnly = collectInterfaceMemberOnlyNames(
      expectedTs,
      classes,
      modules,
      fileFns,
    );

    const allowed =
      rubyFile === null
        ? new Set<string>()
        : collectAllowedNames(
            rubyFiles.get(rubyFile) ?? [],
            pkg,
            rubyPkg.modules,
            moduleFqnByShort,
            crossPackageModules,
            crossPackagePkgByFqn,
            Object.keys(rubyPkg.fileConstants?.[rubyFile] ?? {}),
            rubyFile,
          );

    // A NAMED re-export (`export { buildQuoted } from "./casted.js"`) is a
    // re-export site, not a port location (compare.ts:2346). When the barrel
    // itself has no Rails counterpart — `nodes/index.ts` mirrors `arel/nodes.rb`,
    // which declares nothing — the name is still Rails': `Arel::Nodes.build_quoted`
    // lives in `arel/nodes/casted.rb` (casted.rb:47-58), which `nodes/casted.ts`
    // already matches. Score it there, so passing it through a barrel does not
    // re-charge it as extra surface.
    if (rubyFile === null) {
      for (const fn of fileFns ?? []) {
        if (fn.reExportedFrom === undefined) continue;
        const sourceTs = fn.reExportedFrom.slice(0, fn.reExportedFrom.lastIndexOf(":"));
        const sourceRuby = rubyFileByTsFile.get(sourceTs);
        if (sourceRuby === undefined) continue;
        const sourceAllowed = collectAllowedNames(
          rubyFiles.get(sourceRuby) ?? [],
          pkg,
          rubyPkg.modules,
          moduleFqnByShort,
          crossPackageModules,
          crossPackagePkgByFqn,
          Object.keys(rubyPkg.fileConstants?.[sourceRuby] ?? {}),
          sourceRuby,
        );
        if (sourceAllowed.has(fn.name)) allowed.add(fn.name);
      }
    }

    if (rubyFile !== null) {
      for (const hook of concernHooks.get(concernHookKey(pkg, rubyFile)) ?? []) allowed.add(hook);
    }

    // `compare_range.rb` declares `CompareWithRange`: the container synthesized
    // from the FILENAME is a name nobody wrote (see `synthesizedFileModule`).
    if (rubyFile !== null && (rubyFiles.get(rubyFile)?.length ?? 0) > 0) {
      for (const c of [...classes, ...modules]) {
        if (c.file === expectedTs && c.synthesizedFileModule === true) allowed.add(c.name);
      }
    }

    const scored: ExtraName[] = [];
    let allowlistedCount = 0;
    let interfaceExemptCount = 0;
    for (const name of tsNames) {
      if (allowed.has(name)) continue;
      const allowKey = allowKeyOf({ package: pkg, tsFile: expectedTs, name });
      if (tagKeys.has(allowKey)) {
        matchedTagKeys.add(allowKey);
        allowlistedCount++;
        continue;
      }
      const owners = globalRubyCandidates.get(name);
      const kind: ExtraKind = owners ? "moved" : "novel";
      // Exempt by kind — see `collectInterfaceOnlyNames`. Deliberately AFTER
      // the tag check: an interface tagged to cover its MEMBERS keeps matching
      // its own name, so the tag doesn't go stale and the inheritance in
      // `collectTaggedEntries` keeps working.
      if (kind === "novel" && interfaceOnly.has(name)) {
        interfaceExemptCount++;
        continue;
      }
      const memberOwners = interfaceMemberOnly.get(name);
      if (
        memberOwners !== undefined &&
        memberOwners.every((o) => interfaceOnly.has(o) && !globalRubyCandidates.has(o))
      ) {
        interfaceExemptCount++;
        continue;
      }
      scored.push({ name, kind, ...(owners ? { owners } : {}) });
    }

    const fileTagReason = fileTags[expectedTs];
    if (fileTagReason !== undefined) {
      const cause = fileTagVerdict(rubyFile, scored, fileTagReason);
      if (cause === null) {
        if (scored.length > 0) {
          matchedTagKeys.add(allowKeyOf({ package: pkg, tsFile: expectedTs, name: FILE_TAG_NAME }));
          allowlistedCount += scored.length;
          scored.length = 0;
        }
      } else if (!fileTagRejections.some((r) => r.package === pkg && r.tsFile === expectedTs)) {
        fileTagRejections.push({
          package: pkg,
          tsFile: expectedTs,
          cause,
          ...(rubyFile !== null ? { rubyFile } : {}),
          ...(cause === "moved-names"
            ? {
                movedNames: undeclaredMovedNames(scored, fileTagReason),
                movedOwners: undeclaredMovedOwners(scored, fileTagReason),
              }
            : {}),
          ...(cause === "stale-moved-declaration"
            ? { staleMovedNames: staleMovedDeclarations(scored, fileTagReason) }
            : {}),
        });
      }
    }

    const extras = novelOnly ? scored.filter((e) => e.kind === "novel") : scored;
    let novelCount = 0;
    let movedCount = 0;
    for (const e of extras) {
      if (e.kind === "novel") novelCount++;
      else movedCount++;
    }
    result.totalAllowlisted += allowlistedCount;
    result.totalInterfaceExempt += interfaceExemptCount;
    if (extras.length === 0) continue;

    // Sort novel before moved, then alphabetical — novel is the higher-signal
    // tier and surfaces first in per-file detail dumps.
    extras.sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "novel" ? -1 : 1,
    );
    result.extraFiles.push({
      package: pkg,
      tsFile: expectedTs,
      rubyFile,
      extraCount: extras.length,
      novelCount,
      movedCount,
      allowlistedCount,
      extras,
    });
    result.filesWithDrift++;
    result.totalExtras += extras.length;
    result.totalNovel += novelCount;
    result.totalMoved += movedCount;
    if (rubyFile === null) {
      result.noCounterpartFiles++;
      result.noCounterpartExtras += extras.length;
      result.noCounterpartNovel += novelCount;
    }
  }

  // Rank order: novel-first when --novel-only is on (only novel exists),
  // and otherwise rank by novel count (high-signal) then total. Pure-moved
  // barrel files (588 extras, 0 novel) drop below smaller novel-heavy files.
  result.extraFiles.sort(
    (a, b) =>
      b.novelCount - a.novelCount ||
      b.extraCount - a.extraCount ||
      a.tsFile.localeCompare(b.tsFile),
  );
  return result;
}

export interface Palette {
  red: string;
  yellow: string;
  dim: string;
  bold: string;
  reset: string;
}
const COLOR_ON: Palette = {
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  reset: "\x1b[0m",
};
const COLOR_OFF: Palette = { red: "", yellow: "", dim: "", bold: "", reset: "" };

function colorCount(n: number, p: Palette): string {
  if (n >= 20) return `${p.red}${p.bold}${n}${p.reset}`;
  if (n >= 10) return `${p.red}${n}${p.reset}`;
  if (n >= 5) return `${p.yellow}${n}${p.reset}`;
  return String(n);
}

/**
 * `useColor` defaults to TTY but is forceable via env so CI logs and pipes
 * don't get raw escape codes. Padding widens by the per-cell escape-sequence
 * length when color is on so the columns still align.
 */
function pickPalette(): { palette: Palette; colored: boolean } {
  const env = process.env["FORCE_COLOR"];
  if (env === "0" || env === "false") return { palette: COLOR_OFF, colored: false };
  if (env && env !== "") return { palette: COLOR_ON, colored: true };
  return process.stdout.isTTY === true
    ? { palette: COLOR_ON, colored: true }
    : { palette: COLOR_OFF, colored: false };
}

/**
 * Left-pad a colored numeric cell to a target visible width. `colorCount`
 * either returns plain `String(n)` (no color) or wraps it in ANSI escapes
 * that vary in length — small novel counts (<5) get no color and large
 * ones get red+bold+reset (13 invisible chars). Padding off the colored
 * string with a fixed boost misaligns the table for low-count rows.
 * Compute the gap from `String(n).length` so every row right-aligns.
 */
function padNumCell(n: number, colored: string, width: number): string {
  const visible = String(n).length;
  const gap = Math.max(0, width - visible);
  return " ".repeat(gap) + colored;
}

/**
 * Prints the permanence split and names the unclassified tags. Non-zero
 * unclassified fails the run (see `gateUnclassified`); this block is the
 * detail listing that says which tags to open. See `classifyReason`.
 */
export function printClassificationBlock(
  tagged: TaggedSummary,
  p: Palette,
  maxDetail: number,
): void {
  const c = tagged.classification;
  console.log(
    `${p.dim}  permanence claims: ${c.permanent} PERMANENT, ${c.convergeable} CONVERGEABLE, ` +
      `${c.unclassified} unclassified.${p.reset}`,
  );
  if (c.unclassified === 0) return;
  const byPkg = Object.entries(c.unclassifiedByPackage)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([pkg, n]) => `${pkg} ${n}`)
    .join(", ");
  console.log(
    `${p.dim}  Unclassified by package: ${byPkg}. Open each reason with PERMANENT ` +
      `(a language- or runtime-level fact no port can remove) or CONVERGEABLE ` +
      `(unfinished porting, a fixable collision, a comparator gap — name the story).${p.reset}`,
  );
  const shown = maxDetail > 0 ? c.unclassifiedEntries.slice(0, maxDetail) : c.unclassifiedEntries;
  for (const e of shown) console.log(`${p.dim}    ${e.package}  ${e.tsFile}  ${e.name}${p.reset}`);
  const elided = c.unclassifiedEntries.length - shown.length;
  if (elided > 0) console.log(`${p.dim}    … +${elided} more${p.reset}`);
}

function printHumanReport(report: Report, topN: number, maxDetail: number, verbose: boolean): void {
  const { palette: p } = pickPalette();

  console.log(`\n${p.bold}Extra TS surface vs Rails${p.reset}  (the inverse of parity:api)`);
  console.log(
    `${p.dim}Generated ${report.generatedAt}  |  novel = name not found anywhere in Rails;  moved = found, just in a different .rb${p.reset}\n`,
  );

  console.log(`${p.bold}Per-package totals${p.reset}`);
  console.log(
    `  ${"Package".padEnd(20)} ${"Files".padStart(7)} ${"Novel".padStart(7)} ${"Moved".padStart(7)} ${"Total".padStart(7)} ${"Allowed".padStart(7)} ${"NoCntrp".padStart(7)}`,
  );
  console.log(
    `  ${"-".repeat(20)} ${"-".repeat(7)} ${"-".repeat(7)} ${"-".repeat(7)} ${"-".repeat(7)} ${"-".repeat(7)} ${"-".repeat(7)}`,
  );
  for (const pkg of report.packages) {
    const novel = padNumCell(pkg.totalNovel, colorCount(pkg.totalNovel, p), 7);
    console.log(
      `  ${pkg.package.padEnd(20)} ${String(pkg.filesWithDrift).padStart(7)} ${novel} ${String(pkg.totalMoved).padStart(7)} ${String(pkg.totalExtras).padStart(7)} ${String(pkg.totalAllowlisted).padStart(7)} ${String(pkg.noCounterpartExtras).padStart(7)}`,
    );
  }
  console.log(
    `${p.dim}  NoCntrp = the slice of Total from TS files no Rails file maps onto (scored with an empty allowed set).${p.reset}`,
  );
  const interfaceExempt = report.packages.reduce((n, pkg) => n + pkg.totalInterfaceExempt, 0);
  console.log(
    `${p.dim}  Excluded by kind: ${interfaceExempt} novel \`interface\` declaration name(s) and member(s) — type-only shapes Ruby ` +
      `leaves to duck typing. An interface name Rails DOES use stays scored as moved.${p.reset}`,
  );
  console.log(
    `\n${p.dim}@noRailsEquivalent tags: ${report.tagged.total} tag(s), ` +
      `${report.tagged.matched} matched` +
      (report.tagged.inheritedMatched > 0
        ? ` (+${report.tagged.inheritedMatched} allowed by a tagged interface declaration)`
        : "") +
      ` — allowed extras are subtracted from the counts above.${p.reset}`,
  );
  printClassificationBlock(report.tagged, p, maxDetail);

  console.log(
    `\n${p.bold}Top ${Math.min(topN, report.topN.length)} most-divergent files${p.reset}  ${p.dim}(ranked by novel count, then total)${p.reset}`,
  );
  console.log(
    `  ${"#".padStart(3)}  ${"Novel".padStart(5)}  ${"Moved".padStart(5)}  ${"Package".padEnd(16)} ${"TS file".padEnd(60)}`,
  );
  console.log(
    `  ${"-".repeat(3)}  ${"-".repeat(5)}  ${"-".repeat(5)}  ${"-".repeat(16)} ${"-".repeat(60)}`,
  );
  for (let i = 0; i < Math.min(topN, report.topN.length); i++) {
    const f = report.topN[i];
    const c = padNumCell(f.novelCount, colorCount(f.novelCount, p), 5);
    console.log(
      `  ${String(i + 1).padStart(3)}  ${c}  ${String(f.movedCount).padStart(5)}  ${f.package.padEnd(16)} ${f.tsFile.padEnd(60)}`,
    );
  }

  console.log(
    `\n${p.bold}Per-file detail${p.reset}  ${p.dim}(novel-first; moved names dimmed; +N more elided when over --max-detail)${p.reset}\n`,
  );
  for (const pkg of report.packages) {
    if (pkg.extraFiles.length === 0) continue;
    console.log(`${p.bold}${pkg.package}${p.reset}`);
    for (const f of pkg.extraFiles) {
      const noCounterpart = f.rubyFile === null ? ` ${p.dim}[no Rails counterpart]${p.reset}` : "";
      console.log(
        `  ${f.tsFile} — ${colorCount(f.novelCount, p)} novel, ${f.movedCount} moved${noCounterpart}`,
      );
      const shown = maxDetail > 0 ? f.extras.slice(0, maxDetail) : f.extras;
      const cols = 4;
      for (let i = 0; i < shown.length; i += cols) {
        const row = shown.slice(i, i + cols).map((e) => {
          const label = e.name.padEnd(24);
          return e.kind === "moved" ? `${p.dim}${label}${p.reset}` : label;
        });
        console.log(`    ${row.join(" ")}`);
      }
      const elided = f.extras.length - shown.length;
      if (elided > 0) console.log(`    ${p.dim}… +${elided} more${p.reset}`);
      if (verbose) {
        for (const e of shown) {
          const top = e.kind === "moved" ? e.owners?.[0] : undefined;
          if (!top) continue;
          console.log(
            `      ${p.dim}${e.name.padEnd(24)} → ${top.package} ${top.file} ${top.rubyName}${p.reset}`,
          );
        }
      }
    }
    console.log();
  }
}

export function buildReport(
  ruby: ApiManifest,
  ts: ApiManifest,
  opts: {
    filterPkg: string | null;
    excludeGlobs: string[];
    novelOnly: boolean;
    topN: number;
    /**
     * Per-(package, Ruby file) Concern hooks from `loadConcernHooks`. Optional
     * so a caller measuring a synthetic manifest need not stage `.rb` files on
     * disk; absent, no hook is credited.
     */
    concernHooks?: Map<string, Set<string>>;
  },
): Report {
  const concernHooks = opts.concernHooks ?? new Map<string, Set<string>>();
  const tagged = collectTaggedEntries(ts);
  const tagKeys = new Set(tagged.map(allowKeyOf));
  const matchedTagKeys = new Set<string>();
  const globalRubyCandidates = buildGlobalRubyCandidates(ruby);
  const { modules: crossPackageModules, pkgByFqn: crossPackagePkgByFqn } =
    buildCrossPackageModules(ruby);

  const packages: PackageTotals[] = [];
  const fileTagRejections: FileTagRejection[] = [];
  const scannedPkgs = new Set<string>();
  for (const pkg of Object.keys(ruby.packages)) {
    if (opts.filterPkg && pkg !== opts.filterPkg) continue;
    if (!ts.packages[pkg]) continue;
    scannedPkgs.add(pkg);
    packages.push(
      buildPackageReport(
        pkg,
        ruby,
        ts,
        opts.excludeGlobs,
        globalRubyCandidates,
        crossPackageModules,
        crossPackagePkgByFqn,
        opts.novelOnly,
        tagKeys,
        matchedTagKeys,
        fileTagRejections,
        concernHooks,
      ),
    );
  }
  packages.sort((a, b) => b.totalNovel - a.totalNovel || b.totalExtras - a.totalExtras);

  const allExtras: ExtraFile[] = packages.flatMap((p) => p.extraFiles);
  allExtras.sort(
    (a, b) =>
      b.novelCount - a.novelCount ||
      b.extraCount - a.extraCount ||
      a.tsFile.localeCompare(b.tsFile),
  );

  const staleTagged = tagged.filter(
    (e) => !e.inherited && scannedPkgs.has(e.package) && !matchedTagKeys.has(allowKeyOf(e)),
  );

  const inheritedKeys = new Set(tagged.filter((e) => e.inherited).map(allowKeyOf));
  const inheritedMatched = [...matchedTagKeys].filter((k) => inheritedKeys.has(k)).length;

  const written = tagged.filter((e) => !e.inherited);
  const claims: Record<Permanence, number> = { permanent: 0, convergeable: 0, unclassified: 0 };
  const unclassifiedEntries: TaggedEntry[] = [];
  const unclassifiedByPackage: Record<string, number> = {};
  for (const e of written) {
    const claim = classifyReason(e.reason);
    claims[claim]++;
    if (claim !== "unclassified") continue;
    unclassifiedEntries.push(e);
    unclassifiedByPackage[e.package] = (unclassifiedByPackage[e.package] ?? 0) + 1;
  }

  const taggedSummary: TaggedSummary = {
    total: written.length,
    matched: matchedTagKeys.size - inheritedMatched,
    inheritedMatched,
    stale: staleTagged,
    classification: {
      permanent: claims.permanent,
      convergeable: claims.convergeable,
      unclassified: claims.unclassified,
      unclassifiedByPackage,
      unclassifiedEntries,
    },
  };
  return {
    generatedAt: new Date().toISOString(),
    packages,
    topN: allExtras.slice(0, opts.topN),
    tagged: taggedSummary,
    fileTagRejections,
  };
}

/**
 * The file-level claim gate: a `@noRailsEquivalent` written at the top of a
 * file the report can see a Rails counterpart for. Separate from `gateStale`
 * (which the same tag also trips, having absorbed nothing) because the fix is
 * different: a stale tag is deleted, a refuted one is the signal that the file
 * needs per-name reasons — or renames — instead of a blanket.
 * Returns the failure message, or `null` when the run passes.
 *
 * A `moved-names` rejection lists each name with the Rails member it credits
 * against: that owner is the verdict's evidence — five names crediting five
 * unrelated classes across unrelated gems is a bare-short-name collision, ~80
 * all crediting one `.rb` is a rename owed.
 */
export function gateFileTagRejections(rejections: readonly FileTagRejection[]): string | null {
  if (rejections.length === 0) return null;
  const list = (names: readonly string[] | undefined): string =>
    (names ?? []).slice(0, 8).join(", ") + ((names?.length ?? 0) > 8 ? ", …" : "");
  const lines = rejections.map((r) => {
    if (r.cause === "counterpart-file") {
      return `  - ${r.package}  ${r.tsFile} — Rails counterpart file ${r.rubyFile}`;
    }
    if (r.cause === "stale-moved-declaration") {
      return (
        `  - ${r.package}  ${r.tsFile} — ${r.staleMovedNames?.length ?? 0} ` +
        `MOVED-BY-SHORT-NAME name(s) that no longer score moved: ${list(r.staleMovedNames)}`
      );
    }
    const owned = (r.movedNames ?? []).slice(0, 8).map((n) => {
      const top = r.movedOwners?.[n]?.[0];
      return top === undefined
        ? `      ${n}`
        : `      ${n} → ${top.package} ${top.file} ${top.rubyName}`;
    });
    const more = (r.movedNames?.length ?? 0) > 8 ? "\n      …" : "";
    return (
      `  - ${r.package}  ${r.tsFile} — ${r.movedNames?.length ?? 0} moved name(s):\n` +
      owned.join("\n") +
      more
    );
  });
  return (
    `\nextra-surface: ${rejections.length} file-level @noRailsEquivalent tag(s) claim a ` +
    "file has no Rails counterpart, but the report finds one. A `moved` name means the " +
    "name DOES exist in Rails, just in another file — a rename may be owed, and the " +
    "blanket would hide it. Tag the names individually, or converge them. If the moved " +
    "score really is a bare-short-name coincidence against an unrelated Rails class, " +
    "name each such name in a `MOVED-BY-SHORT-NAME: a, b, c` clause in the reason — and " +
    "delete a listed name once it stops scoring moved:\n" +
    lines.join("\n") +
    "\n"
  );
}

/**
 * The staleness gate: a tag on a name that no longer flags as extra surface.
 * Returns the failure message, or `null` when the run passes.
 */
export function gateStale(tagged: TaggedSummary): string | null {
  if (tagged.stale.length === 0) return null;
  return (
    `\nextra-surface: ${tagged.stale.length} STALE @noRailsEquivalent tag(s) on ` +
    "methods that no longer flag as extra surface — Rails gained the method, " +
    "the file mapping changed, the declaration is internal or `_`-prefixed " +
    "(never counted), a bare `@tag` word inside the reason prose truncated " +
    "the reason and was parsed as a real JSDoc tag, or the tag covers a moved " +
    "(misplaced) port that belongs in its Rails-layout file. Delete the tag " +
    "next to the code:\n" +
    tagged.stale
      .map((e) => `  - ${e.package}  ${e.tsFile}  ${e.fileLevel ? "(file-level tag)" : e.name}`)
      .join("\n") +
    "\n"
  );
}

/**
 * The permanence gate: every written `@noRailsEquivalent` reason must open with
 * PERMANENT or CONVERGEABLE. Hard 0 rather than a ratchet on the count — the
 * population was brought to 0 by RFC 0080, and a ratchet re-admits exactly the
 * unclassified debt the gate exists to stop. Returns the failure message, or
 * `null` when the run passes.
 */
export function gateUnclassified(tagged: TaggedSummary): string | null {
  const { unclassified, unclassifiedEntries } = tagged.classification;
  if (unclassified === 0) return null;
  return (
    `\nextra-surface: ${unclassified} @noRailsEquivalent tag(s) state no permanence ` +
    "claim. Open each reason with PERMANENT (a language- or runtime-level fact no " +
    "port can remove) or CONVERGEABLE (unfinished porting, a fixable collision, a " +
    "comparator gap — name the story):\n" +
    unclassifiedEntries.map((e) => `  - ${e.package}  ${e.tsFile}  ${e.name}`).join("\n") +
    "\n"
  );
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);

  const rubyPath = path.join(OUTPUT_DIR, "rails-api.json");
  const tsPath = path.join(OUTPUT_DIR, "ts-api.json");
  if (!fs.existsSync(rubyPath) || !fs.existsSync(tsPath)) {
    console.error(
      `Missing ${path.basename(fs.existsSync(rubyPath) ? tsPath : rubyPath)}. Run \`pnpm parity:api\` first to generate the manifests.`,
    );
    process.exit(1);
  }
  // A manifest older than the sources describes a different commit — reporting
  // its totals as this checkout's is exactly the stale baseline this guard
  // exists to stop (see build-freshness.ts).
  if (
    process.env.API_COMPARE_ALLOW_STALE_BUILD !== "1" &&
    (await manifestIsStale(tsPath, apiComparePackageRoots()))
  ) {
    console.error(
      "output/ts-api.json predates the api-compared package sources — it describes a\n" +
        "different checkout.\n" +
        "Run `pnpm parity:api` to regenerate the manifests before measuring.",
    );
    process.exit(1);
  }
  const ruby: ApiManifest = JSON.parse(fs.readFileSync(rubyPath, "utf-8"));
  const ts: ApiManifest = JSON.parse(fs.readFileSync(tsPath, "utf-8"));

  const report = buildReport(ruby, ts, {
    filterPkg: args.filterPkg,
    excludeGlobs: args.excludeGlobs,
    novelOnly: args.novelOnly,
    topN: args.topN,
    concernHooks: await loadConcernHooks(ruby, args.filterPkg),
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report, args.topN, args.maxDetail, args.verbose);
  }

  // Both gates are collected before exiting: a tree that is both stale and
  // unclassified should report both in one run, not one CI round trip each.
  const failures: string[] = [];
  // Stale tags can't be judged when --exclude-glob hides whole TS files: a
  // hidden file drops out of the extras too, so a tag that still flags there
  // reads as stale. Classification is per-tag, and an exclusion can only hide
  // a tag, never invent one, so that gate stays armed either way.
  if (args.excludeGlobs.length === 0) {
    const staleMessage = gateStale(report.tagged);
    if (staleMessage) failures.push(staleMessage);
  }
  const unclassifiedMessage = gateUnclassified(report.tagged);
  if (unclassifiedMessage) failures.push(unclassifiedMessage);
  const rejectedMessage = gateFileTagRejections(report.fileTagRejections);
  if (rejectedMessage) failures.push(rejectedMessage);

  if (failures.length === 0) return;
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

const invokedAsScript =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  path.basename(process.argv[1]) === "extra-surface.ts";
if (invokedAsScript) void main();

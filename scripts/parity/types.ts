// Shared types for API comparison pipeline

// --- Extracted API manifest ---

/** A recorded literal value — a parameter default or constant RHS. `expr` marks
 *  a non-literal (call/ref/lambda), recorded so the comparer skips it rather
 *  than confusing it with "no default". See literals.ts. */
export interface LiteralValue {
  kind: "int" | "float" | "string" | "symbol" | "bool" | "nil" | "array" | "hash" | "expr";
  value?: string | boolean; // int/float token (underscores kept), string/symbol text, or boolean
}

/**
 * One syntactic call site in a method body (RFC 0025 §1). `args` holds one
 * descriptor per argument in order — `id:` / `num:` / `str:` / `bool:` / `nil`
 * / `sym:` / `const:` / `call:` / `kwargs{k=…}` — plus the OPAQUE spellings
 * (`?`, `array`, `hash`, `str-interp`, `binop:<op>`, `unary<desc>`, `ternary`,
 * `*splat`) that mean "no cross-language agreement is possible here, skip the
 * site". `flags` carries the per-site `splat` / `blockpass` / `block` /
 * `zsuper` markers, which do the same for the site as a whole, plus — Ruby side
 * only — `weak`: the receiver was inert (`xs.map`), so the site says nothing
 * about the port and compare.ts drops it, exactly as `weakCalls` does for the
 * call-set gate.
 */
export interface CallSite {
  name: string;
  args: string[];
  flags: string[];
  /**
   * Ruby side only: the receiver expression, in the same descriptor spelling as
   * `args`, when the site has one and it is describable. Absent for a
   * receiver-less call (`:fcall` / `:vcall`) and for an opaque receiver.
   * `alignBuiltinReceiver` (call-args.ts) compares it against TS argument 1 for
   * a `RECEIVER_AS_FIRST_ARG` name whose receiver is a simple `id:`/`const:`
   * ref.
   */
  recv?: string;
}

export interface ParamInfo {
  name: string;
  kind: "required" | "optional" | "rest" | "keyword" | "keyword_rest" | "block";
  default?: string;
  literal?: LiteralValue; // default value, when present; compared by literals.ts
  /** Ruby side only: the body tests this param against `Symbol` (`Symbol === x`,
   *  `x.is_a?(Symbol)`), so a Symbol default on it is a branch discriminator and
   *  the TS spelling must keep the leading colon. See literals.ts. */
  symbolDiscriminated?: boolean;
  /**
   * TS-side declared type text (e.g. `"Base"`), when available — lets a
   * consumer recognize a leading receiver/host param on standalone mixin
   * functions (the arity check, in a follow-up). Absent on the Ruby side.
   */
  type?: string;
}

// When you add a field here that the extractor POPULATES, also add its emitted
// key to EXTRACTOR_OUTPUT_FIELDS in extractor-schema.ts so the ts-api cache
// token changes and stale entries missing the field are evicted (see PR #4020).
export interface MethodInfo {
  name: string;
  visibility: "public" | "protected" | "private";
  params: ParamInfo[];
  line?: number;
  file?: string;
  isStatic?: boolean;
  deps?: string[];
  depRefs?: Record<string, string[]>;
  calls?: string[];
  /**
   * TS-side only (RFC 0084): the same call names in SOURCE ORDER, deduplicated
   * at first occurrence exactly as the Ruby extractor's `calls.uniq` is. `calls`
   * is sorted, so a set diff over it is blind to ordering; this field is what
   * lets the calls gate report an order-only divergence — Rails' branch/call
   * order not preserved by the port — as its own status. Populated for class
   * members, constructors and top-level functions.
   */
  callSeq?: string[];
  /**
   * Both extractors (RFC 0084): the body's ordered control + call skeleton —
   * `if` / `loop` / `try` / `throw`, `new:Ctor`, `ref:<name>` — in source order,
   * WITH duplicates. `calls` and `callSeq` are both deduplicated and record no
   * control flow, so neither carries a dropped guard or an inverted branch.
   * Names are raw on both sides. Signal only; nothing gates on it yet.
   */
  skeleton?: string[];
  /**
   * Ruby-side only (RFC 0083): the subset of `calls` whose every occurrence in
   * the body had a provably inert receiver — a local variable or a literal
   * (`xs.first`, `opts.fetch`, `{}.merge`). Those say nothing about the port,
   * so the calls gate drops them; the narrow RFC 0044 gate ignores this
   * field and keeps its population unchanged. See
   * extract-ruby-api.rb#walk_for_calls.
   */
  weakCalls?: string[];
  /**
   * Ruby-side only (RFC 0129): call name → the coarse receiver KINDS its sites
   * in the body had, sorted — `hash` (a hash literal, or a local the extractor
   * proved is one), `string` / `symbol` / `array` / `numeric` / `regexp`, and
   * the shapes whose class is unknown (`self`, `local`, `ivar`, `const`,
   * `expr`). `calls` records names alone, so `options.fetch` and `cache.fetch`
   * are one call to every consumer; this is what lets the ruby-compat table
   * (scripts/parity/ruby-compat.ts) credit `Hash#fetch` without crediting
   * `ActiveSupport::Cache::Store#fetch`. A name whose every occurrence was an
   * unqualified call is omitted. See extract-ruby-api.rb#receiver_kind.
   */
  callReceivers?: Record<string, string[]>;
  /**
   * Both extractors (RFC 0025 `## Call-argument fidelity`): every syntactic
   * call site in the body, in source order, with its argument descriptors.
   * `calls` / `callSeq` carry names only, so a port that calls `where` with a
   * completely different argument list reads as identical to them. Ruby-side
   * populated by extract-ruby-api.rb#collect_call_args; the TS side lands with
   * `ts-extractor-emit-call-arguments`. Signal only; nothing gates on it yet.
   */
  callArgs?: CallSite[];
  /**
   * TS-side only (RFC 0083): the Ruby call names this declaration's JSDoc tags
   * as deliberately not made, via `@missingRailsCall <call> — <reason>`.
   * compare.ts's `checkCalls` drops these from the call-mismatch
   * population, which is what makes the tag load-bearing instead of
   * documentation — see missing-rails-call-tags.ts.
   */
  missingRailsCalls?: string[];
  /**
   * TS-side only (RFC 0099): the Ruby call names this declaration's JSDoc tags
   * as deliberately called with a DIFFERENT argument list, via
   * `@missingRailsArgs <call> — <reason>`. compare.ts's `checkCallArgs` drops
   * these from the call-argument mismatch population, so the deviation is
   * reviewed at the call site instead of as a baseline row — see
   * missing-rails-args-tags.ts.
   */
  missingRailsArgs?: string[];
  /**
   * TS-side only (RFC 0099): the REASON behind each `@missingRailsCall`
   * suppression above, keyed by Ruby call. Carried so a receipt's permanence
   * claim — `PERMANENT` / `CONVERGEABLE`, read by `classifyReason` — survives
   * into the artifact and the suppressions can be reported as the two separate
   * populations they are, the way `parity:api:extra` already reports
   * `@noRailsEquivalent`.
   */
  missingRailsCallReasons?: Record<string, string>;
  /** TS-side only (RFC 0099): the `@missingRailsArgs` twin of
   *  {@link missingRailsCallReasons}. */
  missingRailsArgsReasons?: Record<string, string>;
  /**
   * Normalized digest of the Ruby method BODY (source-hash pinning, RFC 0025).
   * Whitespace/comment-insensitive, body-only; changes when the ported code
   * changes upstream. Ruby-side only (the TS extractor does not emit it); used
   * by body-pins.ts / lint-body-pins.ts to detect vendored-Rails body drift on
   * matched pairs. See extract-ruby-api.rb#body_digest.
   */
  bodyDigest?: string;
  /**
   * Compare-side only: set by `flattenIncludedMethodInfos` on a method a host
   * entity picked up through `include`/`extend`, naming the Ruby file the
   * mixin that defines it lives in. Ruby flattens the method onto every host,
   * but trails ports it once — in the file mirroring the mixin's own — so the
   * host copy is a duplicate expectation, not a parity gap. See
   * `mixinMethodCreditedToOwnFile`.
   */
  mixinFile?: string;
  /**
   * TS-side only (RFC 0126): the declaration carries no body — an interface
   * method/property signature, or an object-literal member that is a bare
   * reference to a function declared elsewhere (`export const ClassMethods =
   * { attributeMethodQ }`). Such a declaration records no `calls` / `callArgs`,
   * so pairing a Ruby body with it retires every call-parity finding for the
   * method silently: the gates then report the baselined rows as STALE and the
   * only sanctioned remedy (delete the row) buries a live divergence. The call
   * gates prefer an owner that HAS a body wherever the file declares one — see
   * `ownersWithBodies` in compare.ts.
   */
  bodyless?: boolean;
  /**
   * TS-side only: this bodyless object-literal member is a bare reference to
   * ANOTHER function the same file declares — `buildHavingClause:
   * buildWhereClause` (`relation/query-methods.ts:1890`), which is how TS
   * spells Ruby's `alias :build_having_clause :build_where_clause`
   * (`relation/query_methods.rb:1654`). Carries the referenced name. A Ruby
   * entry with `notes: "alias"` has no body of its own to pair against, so the
   * call-parity concern behind `bodyless` does not arise for it and compare.ts
   * scores such a pair as ported rather than declaration-only.
   */
  aliasOf?: string;
  /**
   * True when the method is not part of the public API surface:
   * Ruby `private`/`protected`, TS `private`/`protected`, or
   * TS `#`-prefixed private fields. Consumers should filter these
   * out of normal coverage and only include them behind an opt-in flag.
   */
  internal?: boolean;
  /**
   * TS-side only: reason prose from a `@noRailsEquivalent` JSDoc tag —
   * deliberate trails-only surface with no Rails counterpart (RFC 0080).
   * Unlike `internal`, the method stays part of the compared surface;
   * extra-surface.ts counts it as allowlisted instead of novel/moved.
   */
  noRailsEquivalent?: string;
  /**
   * Ruby-side only: how the extractor synthesized this entry when it was NOT a
   * literal `def` — `"delegate"`, `"alias"`, `"scope"`, `"class_attribute"`,
   * `"define_column_methods"`, `"class_eval"`. See extract-ruby-api.rb. The
   * forwarding kinds carry a placeholder empty param list rather than a real
   * signature (see arity.ts `isForwardingRubyEntry`).
   */
  notes?: string;
  /**
   * Ruby-side only, `notes: "alias"` entries: the alias target was found and its
   * params copied onto this entry. Distinguishes an alias to a genuinely
   * zero-arg method (resolved, `params: []`) from one whose target lives outside
   * the package (unresolved, also `params: []`). See extract-ruby-api.rb
   * `resolve_aliases!` and arity.ts `isForwardingRubyEntry`.
   */
  aliasResolved?: boolean;
  /** Ruby-side option symbols consumed from an `options`/`opts`/`**kwargs`
   *  param (raw snake_case); advisory under-approximation. See options-keys.ts. */
  option_keys?: string[];
  /**
   * TS-side only: this entry is a `set` accessor. Ruby spells the writer as its
   * OWN method (`where_clause=`), but conventions.ts maps that onto the bare
   * camel name, so a get/set pair lands here as two entries sharing one name.
   * The calls gate's ported-with-args test (compare.ts gate 2) pools the
   * signatures under a name to decide "real method, or zero-arg attribute
   * reader?" — and the reader is what a Ruby `x` CALL maps to. Without this
   * flag the writer's one parameter answers that question for the reader, so
   * adding a writer Rails already has turns every `this._x` read in the package
   * into a call mismatch. Flagged so the gate can treat a get/set pair exactly
   * as it treats a getter-only accessor. Arity still sees the signature: it is
   * the real match for Ruby's `x=`.
   */
  writer?: boolean;
  /**
   * Ruby-side only: this entry was generated by `attr_reader` / `attr_accessor`
   * rather than written as a `def`. trails ports such a reader as a plain
   * FIELD, so a receiver-less zero-arg read of it in a Ruby body (`if
   * foreign_key`) has no TS call site to pair against — see compare.ts
   * `checkCallArgs`. Ruby's grammar gives that read the same shape as a real
   * call, so without the flag the argument gate pairs it against the body's
   * genuine same-named call and reports a shape divergence that is not one
   * (schema_definitions.rb:241 vs :242).
   */
  reader?: boolean;
  /** TS-side property names of the trailing options-object param; `null` when
   *  uncheckable (`any`/`Record<string, unknown>`), absent when not an object. */
  optionKeys?: string[] | null;
  /**
   * True when this method was harvested from a top-level umbrella file's
   * module-level singleton config (e.g. `singleton_class.attr_accessor` in
   * `active_record.rb`) and redirected onto `<Module>::Base`. trails ports this
   * config inconsistently — some flags as Base statics, others in their feature
   * files (schema-cache.ts, database-tasks.ts, …) — so compare credits the port
   * wherever it lands in the package, treating it as a move rather than a
   * false-missing pinned to base.ts. See extract-ruby-api.rb#scan_umbrella_file.
   */
  umbrellaConfig?: boolean;
  /**
   * TS-side only, on `synthesizedMixin` pseudo-modules: the file that actually
   * declares this member, when it is NOT the file the pseudo-module is keyed
   * under. A mixin function returning `typeof Base` drags Base's entire
   * instance surface into the pseudo-module; those members are declared
   * elsewhere and are not the pseudo-module file's own surface.
   * See extract-ts-api.ts and extra-surface.ts `collectTsFileNames`.
   */
  declaredIn?: string;
  /**
   * TS-side only (RFC 0083): the class/module this method forwards to when its
   * whole body is `return this.<accessor>().<sameName>(...)`. trails does not
   * mix a Rails module into its host class the way Ruby `include` does — the
   * PostgreSQL schema-statements port lives in `PostgreSQL::SchemaStatements` and
   * `PostgreSQLAdapter` reaches it through `this.pgSchemaStatements()`. The
   * target name is resolved from the accessor's RETURN TYPE via the checker,
   * never from filename proximity (sibling adapters would cross-credit each
   * other). See extract-ts-api.ts `delegationTargetName`.
   */
  delegatesTo?: string;
  /**
   * TS-side only: for a top-level function that reaches this file through a
   * NAMED re-export (`export { buildQuoted } from "./casted.js"`), the
   * `<file>:<name>` key of the declaration site. A barrel is a re-export site,
   * never a port location (compare.ts:2346), so extra-surface scores such a
   * name where it is DECLARED when the barrel itself has no Rails counterpart.
   */
  reExportedFrom?: string;
}

/**
 * `superclassFile` / `extendsFiles[name]` when the symbol resolved OUTSIDE the
 * workspace — a TypeScript lib global (`class X extends Error`) or a
 * node_modules type. Distinct from the field being absent, which means the
 * extractor found no declaration at all: no package entity can be an external
 * name, so a consumer resolves it to nothing rather than falling back to
 * filename proximity (RFC 0126).
 */
export const EXTERNAL_DECL_FILE = "external:";

/**
 * Prefix for `superclassFile` / `extendsFiles[name]` when the symbol resolved
 * to ANOTHER workspace package: `pkg:<package>:<that package's src-relative
 * path>`. A cross-package edge (`AR::Base extends AM::Model`) whose counterpart
 * is that package's entity — activerecord and activemodel both carry a
 * `model.ts`, so only the package separates them (RFC 0126).
 */
export const PKG_DECL_PREFIX = "pkg:";

export interface ClassInfo {
  name: string;
  superclass?: string;
  /**
   * TS-side only: the src-relative file `superclass` was declared in. Same
   * problem `extendsFiles` solves for include/extend edges — the superclass is
   * recorded by its bare short name, and sibling adapter directories declare
   * same-named classes, which filename proximity cannot separate. A superclass
   * resolving outside the package's `src` carries {@link PKG_DECL_PREFIX} or
   * {@link EXTERNAL_DECL_FILE} instead; the field is absent only when the
   * extractor found no declaration at all, and consumers fall back to
   * proximity then.
   */
  superclassFile?: string;
  file?: string;
  reExportedFrom?: string;
  includes: string[];
  extends: string[];
  /**
   * TS-side only: for each `include()`/`extend()` edge recorded on `extends` by
   * its bare short name, the src-relative file the symbol was declared in. Two
   * different modules can share a short name (`SchemaStatements` exists under
   * `connection-adapters/abstract/`, `postgresql/` and `sqlite3/`), and
   * filename-proximity scoring cannot tell them apart from the host's path.
   * Consumers resolving an edge should prefer the candidate whose `file`
   * matches the entry here and fall back to proximity only when absent. Carries
   * {@link PKG_DECL_PREFIX} or {@link EXTERNAL_DECL_FILE} when the symbol
   * resolved outside this package's `src`.
   */
  extendsFiles?: Record<string, string>;
  /**
   * TS-side only (RFC 0083): sorted union of every `MethodInfo.delegatesTo` on
   * this class — the accessor-forwarding counterpart of `includes`/`extends`,
   * recorded so a consumer can walk the delegation graph the same way it walks
   * the include graph. No consumer reads it yet (compare.ts is untouched);
   * `resolve-wide-candidates-through-include-graph` is the consumer story.
   */
  delegatesTo?: string[];
  instanceMethods: MethodInfo[];
  classMethods: MethodInfo[];
  /**
   * TS-side only: this entry is not a real declared class/module but a
   * pseudo-module synthesized from an exported function whose return type has
   * construct signatures (`<file>:<fn>__mixin`). Its members come from the
   * returned constructor's instance type, which usually includes surface
   * declared in other files. Consumers that attribute surface to a file must
   * consult `MethodInfo.declaredIn`. See extract-ts-api.ts.
   */
  synthesizedMixin?: boolean;
  /**
   * TS-side only: this entry is the file-level container the extractor
   * synthesizes for a file that declares only top-level functions, and its
   * `name` is derived from the FILENAME — nobody wrote it. Rails' filename and
   * module name are not always the same word (`compare_range.rb` declares
   * `CompareWithRange`), so extra-surface must not score the derived name as
   * novel surface. See extract-ts-api.ts.
   */
  synthesizedFileModule?: boolean;
  /**
   * TS-side only: this entry came from an `interface` declaration rather than a
   * `class`, `namespace`, or synthesized module. Interfaces are type-only, so a
   * container-level `@noRailsEquivalent` on one covers its members too — see
   * `collectTaggedEntries` in extra-surface.ts.
   */
  isInterface?: boolean;
  /**
   * TS-side only: a `namespace` (or `export * as`) declaration of this name
   * contributed to this entry. Declaration merging collapses an `interface`
   * and a same-named `namespace` into ONE entry, so `isInterface` alone cannot
   * say whether a non-interface declaration of the name also exists — and the
   * interface-declaration kind exemption in extra-surface.ts must not absolve
   * the namespace half.
   */
  declaredAsNamespace?: boolean;
  interfaceMembers?: string[];
  /**
   * Reason prose of an `@noRailsEquivalent` tag written on the class /
   * interface / namespace DECLARATION itself, justifying the declared name as
   * deliberate trails-only surface. Members carry their own tag on
   * `MethodInfo.noRailsEquivalent`; this is the container-level form, needed
   * for extras that are declarations rather than members (RFC 0080).
   */
  noRailsEquivalent?: string;
}

export interface PackageInfo {
  classes: Record<string, ClassInfo>;
  modules: Record<string, ClassInfo>;
  fileFunctions?: Record<string, MethodInfo[]>;
  fileConstants?: Record<string, Record<string, LiteralValue>>; // file → NAME → literal value
  /**
   * TS-side only: file → the `fileConstants` names whose declaration carries
   * `@internal`. The constant stays in `fileConstants` so the literal pass
   * still compares its value, but extra-surface.ts holds it out of the scored
   * surface — the same thing `MethodInfo.internal` does for a member, and the
   * same thing the static-member half of `extractFileConstants` already gets
   * from its visibility check.
   */
  fileInternalConstants?: Record<string, string[]>;
  /**
   * Ruby-side only: file → the literal Hash KEY names declared in it — the keys
   * of a Hash-constant assignment and the Symbol keys an options hash is read
   * by in a method body. A key is a Ruby name that is not a declaration, so
   * declaration extraction cannot see it; extra-surface.ts unions this pool
   * into the file's allowed set so a faithfully ported object-literal key or
   * options-interface field does not read as invented surface (RFC 0126).
   */
  fileHashKeys?: Record<string, string[]>;
  /**
   * TS-side only: file → reason prose of a FILE-level `@noRailsEquivalent`
   * tag, written in a JSDoc block at the very top of the file (above the
   * imports) rather than on any one declaration. It claims the whole file has
   * no Rails counterpart, so extra-surface.ts lets one reason cover every
   * otherwise-novel name in it — see `fileTagVerdict` there, which refuses the
   * claim when the file DOES have a counterpart.
   */
  fileNoRailsEquivalent?: Record<string, string>;
}

export interface ApiManifest {
  source: "ruby" | "typescript";
  generatedAt: string;
  /**
   * Content hash of the extractor that produced this manifest (Ruby:
   * `extract-ruby-api.rb`). Lets a cross-version diff detect when the pinned
   * base and the freshly-extracted target were built by DIFFERENT extractor
   * versions — which would conflate extractor-version drift with real Rails
   * drift. Optional for back-compat with manifests written before this field.
   */
  extractorHash?: string;
  packages: Record<string, PackageInfo>;
}

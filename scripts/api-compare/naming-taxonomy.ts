/**
 * Classification of the call-argument gate's `naming` residue (RFC 0096).
 *
 * A `naming` row is a call site where TS passes what Rails passes, spelled
 * under a different identifier (`ref:inject` vs `ref:reduce`). RFC 0095's
 * disposition sized the permanent residue at ~6% "tooling shape" from a 32-row
 * sample and planned to baseline it wholesale; PR #6459 then read the AR rows
 * and reported ~73% unconvergeable. Neither describes what a gate flip would
 * actually have to baseline, so the residue gets a measured taxonomy instead.
 *
 * {@link NAMING_CLASSES} is the split that matters: `permanent: true` names a
 * class no rename can close, which earns ONE shared reviewed reason; `false`
 * names one that stays burndown work and must never be baselined (CLAUDE.md —
 * converge, never ratify).
 *
 * Hard rules: no node:* imports, no process.*, async fs.
 */
import { rubyMethodToTsIgnoringSkip, snakeToCamel } from "@blazetrails/parity/conventions";

export type NamingClass =
  | "js-reserved-word"
  | "no-js-equivalent"
  | "conventions-rename"
  | "module-mixin-receiver"
  | "ivar-underscore"
  | "module-mixin-call"
  | "block-idiom"
  | "ivar-reflection"
  | "implicit-to-s"
  | "burndown";

export interface NamingClassInfo {
  name: NamingClass;
  /** A rename cannot close it — the class earns ONE shared, reviewed reason. */
  permanent: boolean;
  /** That reason, or what the class is still burning down toward. */
  reason: string;
}

export const NAMING_CLASSES: NamingClassInfo[] = [
  {
    name: "js-reserved-word",
    permanent: true,
    reason: "Ruby identifier is not a legal JS one — e.g. postgresql_adapter.rb:781's `default`.",
  },
  {
    name: "no-js-equivalent",
    permanent: true,
    reason:
      "Ruby construct spelled as the JS builtin doing the same work (`inject`/`reduce`, " +
      "`last`/`at(-1)`). Same call; only the language's name for it differs.",
  },
  {
    name: "conventions-rename",
    permanent: true,
    reason:
      "Exactly what docs/ruby-ts-conventions.md produces from the Ruby name (`@callbacks` → " +
      "`_callbacks`); the recorder compares raw identifiers and cannot see the table.",
  },
  {
    name: "ivar-underscore",
    permanent: true,
    reason:
      "Ruby reads an ivar bare (`@direction` at migration.rb:1422) where trails spells the same " +
      "ivar `this._direction`; the leading underscore is the settled repo-wide spelling for a " +
      "Ruby ivar, so the two sides already match.",
  },
  {
    name: "module-mixin-call",
    permanent: true,
    reason:
      "The settled `this`-typed mixin idiom (CLAUDE.md, Module mixins) turns Ruby's " +
      "`columns_hash` into `columnsHash.call(this)` (model-schema.ts:775); the recorder takes " +
      "the outermost callee, so the argument records as `call`. Only counted when the Ruby " +
      "name really is a `this`-typed function in the package.",
  },
  {
    name: "block-idiom",
    permanent: true,
    reason:
      "Ruby `owner.instance_exec(&block)` (belongs_to_association.rb:47) is trails' " +
      "`block(this.owner)` — the block is a plain function and the receiver its argument, so " +
      "the recorder sees `instance_exec` against `block`. Same for a Ruby block passed as a " +
      "trailing `{ }` (`model_class.unscoped { yield }`, locator.rb:223) where trails passes " +
      "the callback as an argument. Scoped to the cited Ruby call sites " +
      "(BLOCK_IDIOM_RUBY_REFS), never to the TS spelling alone.",
  },
  {
    name: "ivar-reflection",
    permanent: true,
    reason:
      "Ruby reflection reaching another object's ivar — `becoming.instance_variable_get(:@attributes)` " +
      "(persistence.rb:491). TS has no counterpart and needs none: the field is read or written " +
      "directly (`becoming._attributes`), which is the only shape the language offers, so the " +
      "recorder sees the ivar's own name where Ruby names the reflection accessor.",
  },
  {
    name: "implicit-to-s",
    permanent: true,
    reason:
      "Ruby leans on implicit `to_s` — `quote_table_name(name)` (to_sql.rb:874) with a " +
      "composite-PK Array, `quote_table_name(index_to_remove)` with a PostgreSQL::Name " +
      "(postgresql_adapter.rb's remove_index). A TS signature takes a string, so the call " +
      "site spells the conversion (`toS(name)`, `indexToRemove.toString()`); the value and " +
      "the rendering are the same, only Ruby's is invisible. The mirror image counts too: " +
      "Ruby coercing an already-`string` TS value (`force_change(attr_name.to_s)`, " +
      "dirty.rb:410, against a `attrName: string` parameter) has nothing to spell.",
  },
  {
    name: "module-mixin-receiver",
    permanent: false,
    reason:
      "Receiver passed as a leading parameter where Ruby writes `self`. Converges by rewiring " +
      "to the `this`-typed mixin idiom, not by renaming. Never baseline it.",
  },
  {
    name: "burndown",
    permanent: false,
    reason:
      "A local or parameter simply not carrying its Rails name (`opts` for `options`), plus " +
      "the recorder-shape minority. Free fidelity: rename it. Never baseline it.",
  },
];

/**
 * Ruby's ivar reflection accessors. A TS call site reads or writes the field
 * itself, so the recorded TS identifier is the ivar's own name whatever it is —
 * the class keys on the RUBY side alone.
 */
export const IVAR_REFLECTION_ACCESSORS = new Set([
  "instance_variable_get",
  "instanceVariableGet",
  "instance_variable_set",
  "instanceVariableSet",
]);

/**
 * Ruby identifiers whose call site passes a block that trails spells as a
 * plain callback argument named `block`. Kept as an explicit, cited list
 * rather than keying on the TS spelling alone: a Ruby parameter that merely
 * happens to be named `block` is ordinary burndown, and the safe direction for
 * a permanent class is to under-match.
 *
 *   - `instance_exec` — `owner.instance_exec(&block)`, belongs_to_association.rb:47
 *   - `modelClass`    — `model_class.unscoped { yield }`, locator.rb:223, whose
 *                       receiver the recorder records as the argument
 */
export const BLOCK_IDIOM_RUBY_REFS = new Set(["instance_exec", "instanceExec", "modelClass"]);

/** Identifiers a TS parameter or local cannot be named (`arguments`/`eval` are unusable in strict mode). */
export const JS_RESERVED_WORDS = new Set(
  (
    "arguments await break case catch class const continue debugger default delete do else " +
    "enum eval export extends false finally for function if import in instanceof new null " +
    "return super switch this throw true try typeof var void while with yield"
  ).split(" "),
);

/**
 * Ruby constructs whose TS spelling is the JS builtin doing the same work,
 * keyed by the RUBY name and valued by every TS spelling that counts as it.
 */
export const NO_JS_EQUIVALENT: Record<string, string[]> = {
  class: ["constructor"],
  compact: ["filter"],
  first: ["at"],
  gsub: ["replaceAll", "replace"],
  httpdate: ["toUTCString"],
  inject: ["reduce"],
  inspect: ["toString", "inspectError"],
  last: ["at", "pop"],
  length: ["size"],
  object_id: ["this"],
  read: ["readFile"],
  size: ["length"],
  strip: ["trim"],
  to_f: ["parseFloat", "Number"],
  to_i: ["parseInt", "Number"],
  to_s: ["toString", "String"],
};

/**
 * {@link NO_JS_EQUIVALENT} keyed by the camelCased Ruby name as well. The
 * recorder camelCases a Ruby `ref:` argument that is a plain identifier
 * (`object_id` reaches the artifact as `objectId`, `to_i` as `toI`) while
 * leaving a `?`/`!` one alone, so a snake_case-only lookup silently never fires
 * for the multi-word keys — `object_id`, `to_f`, `to_i`, `to_s`.
 */
const NO_JS_EQUIVALENT_BY_CAMEL = new Map(
  Object.entries(NO_JS_EQUIVALENT).map(([rubyRef, tsRefs]) => [snakeToCamel(rubyRef), tsRefs]),
);

/** The bare identifier behind a recorded `ref:` argument, or undefined. */
export function refName(arg: string): string | undefined {
  return arg.startsWith("ref:") ? arg.slice("ref:".length) : undefined;
}

/**
 * Is the Ruby name a `this`-typed function — the trails mixin idiom — under
 * either its own spelling or the ivar-underscore one the recorder may have
 * given it (`_view_paths` for `view_paths` at view-paths.ts)? The set is
 * package-wide rather than file-local because a mixin function is called from
 * the file it is assigned into, not the one it is defined in (relation.ts calls
 * timestamp.ts' `touchAttributesWithTime`).
 */
function isThisTypedFunction(rubyRef: string, thisTypedFunctions?: ReadonlySet<string>): boolean {
  if (thisTypedFunctions === undefined) return false;
  const camel = snakeToCamel(rubyRef);
  return thisTypedFunctions.has(camel) || thisTypedFunctions.has(camel.replace(/^_/, ""));
}

/**
 * Classify ONE differing identifier pair. Arm order is load-bearing:
 *
 * - Ruby `self` reaches the artifact already normalized to `this`, so the
 *   receiver arm runs FIRST — `this` is a keyword in both languages, and
 *   reading these rows as unconvergeable would baseline the one class that
 *   converges by rewiring.
 * - Ruby's ivar reflection accessors are read off the RUBY side alone: the TS
 *   counterpart is the field access itself, so its identifier is the ivar's
 *   name and carries no fixed spelling to match on.
 * - A name that is both a reserved word and a conventions rename is
 *   unconvergeable for the stronger reason, so the reserved arm precedes it.
 * - {@link NO_JS_EQUIVALENT} is read with `Object.hasOwn`: a Ruby name like
 *   `constructor` would otherwise pick a value off `Object.prototype`.
 * - The ivar arm runs before the conventions arm and only on a bare Ruby name:
 *   the recorder strips the `@`, so `@direction` reaches here as `direction`,
 *   which the conventions table would camelCase without the underscore. A row
 *   that DID keep its `@` is the conventions table's own rename, so it falls
 *   through to that arm.
 * - `toS`/`toString` on the TS side alone is Ruby's implicit `to_s` made
 *   explicit, so that arm runs right after {@link NO_JS_EQUIVALENT} — which
 *   already answers `inspect` → `toString` for the stronger reason.
 * - `block` is a TS-side artifact of the block idiom, so that arm reads the TS
 *   spelling — but only against {@link BLOCK_IDIOM_RUBY_REFS}, the cited Ruby
 *   call sites that actually pass a block, so a Ruby parameter that merely
 *   happens to be named `block` stays burndown; `call` is one too, but a bare `ref:call` proves nothing on its
 *   own, so that arm additionally requires the Ruby name to BE a `this`-typed
 *   function — `thisTypedFunctions`, which the caller reads off the TS API
 *   manifest. Without that set the arm never fires and the row stays burndown,
 *   which is the safe direction for a permanent class.
 * - `rubyMethodToTsIgnoringSkip` answers every spelling the conventions table
 *   sanctions (`primary_class?` → `isPrimaryClass` / `primaryClass`); the `Q`
 *   suffix and the leading-underscore ivar form are what it adds on top.
 */
export function classifyPair(
  rubyRef: string,
  tsRef: string,
  thisTypedFunctions?: ReadonlySet<string>,
): NamingClass {
  if (rubyRef === "self" || rubyRef === "this") return "module-mixin-receiver";
  if (JS_RESERVED_WORDS.has(rubyRef)) return "js-reserved-word";
  if (IVAR_REFLECTION_ACCESSORS.has(rubyRef)) return "ivar-reflection";
  const noJsEquivalent = Object.hasOwn(NO_JS_EQUIVALENT, rubyRef)
    ? NO_JS_EQUIVALENT[rubyRef]
    : NO_JS_EQUIVALENT_BY_CAMEL.get(rubyRef);
  if (noJsEquivalent?.includes(tsRef)) return "no-js-equivalent";
  if (tsRef === "toS" || tsRef === "toString" || rubyRef === "toS" || rubyRef === "to_s") {
    return "implicit-to-s";
  }
  if (!rubyRef.startsWith("@") && tsRef === `_${snakeToCamel(rubyRef)}`) return "ivar-underscore";
  if (tsRef === "call" && isThisTypedFunction(rubyRef, thisTypedFunctions)) {
    return "module-mixin-call";
  }
  if (tsRef === "block" && BLOCK_IDIOM_RUBY_REFS.has(rubyRef)) return "block-idiom";
  const ivar = rubyRef.startsWith("@");
  const bare = ivar ? rubyRef.slice(1) : rubyRef;
  const converted = rubyMethodToTsIgnoringSkip(bare);
  const camel = snakeToCamel(bare.replace(/[?!]$/, ""));
  const allowed = new Set([
    ...(Array.isArray(converted) ? converted : [converted]),
    camel,
    ...(bare.endsWith("?") ? [`${camel}Q`] : []),
    ...(ivar ? [`_${camel}`] : []),
  ]);
  return allowed.has(tsRef) ? "conventions-rename" : "burndown";
}

/**
 * Classify a whole row by its differing pairs: a row is permanent only when
 * EVERY identifier it differs on is, so one convergeable pair keeps the row out
 * of any baseline. No differing `ref:` pair at all is recorder shape → burndown.
 */
export function classifyRow(
  rubyArgs: string[],
  tsArgs: string[],
  thisTypedFunctions?: ReadonlySet<string>,
): NamingClass {
  const seen: NamingClass[] = [];
  for (let i = 0; i < Math.max(rubyArgs.length, tsArgs.length); i++) {
    const r = refName(rubyArgs[i] ?? "");
    const t = refName(tsArgs[i] ?? "");
    if (r === undefined || t === undefined || r === t) continue;
    seen.push(classifyPair(r, t, thisTypedFunctions));
  }
  if (seen.length === 0) return "burndown";
  const permanent = new Set(NAMING_CLASSES.filter((c) => c.permanent).map((c) => c.name));
  return seen.every((c) => permanent.has(c))
    ? seen[0]
    : (seen.find((c) => !permanent.has(c)) as NamingClass);
}

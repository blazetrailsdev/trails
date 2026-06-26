// Render declaration strings from walker output.
//
// Produces one `declare ...;` line per runtime call, skipping members the
// user has already declared by hand. Output is plain text — the splicer
// in virtualize.ts inserts it verbatim after the class body's opening `{`.

import ts from "typescript";
import { camelize, pluralize, underscore } from "@blazetrails/activesupport";
import { resolveAssociationTarget, stripQuotes } from "./resolve-target.js";
import type {
  ClassInfo,
  RuntimeCall,
  AssociationCall,
  AttributeCall,
  ScopeCall,
  EnumCall,
  DefineEnumCall,
} from "./walker.js";
import { tsTypeFor } from "./type-registry.js";

const INDENT = "  ";

// Built-in generic types emitted by the virtualizer — qualified with
// inline `import("...")` so users don't need to add imports to their
// model files. Erased at runtime. User-defined target classes
// (Author, Comment, etc.) are still emitted bare and resolve against
// the user's existing imports or the CLI/plugin's auto-import pass
// (see the plan § "Auto-import resolution under Phase 1b").
const AR_IMPORT = `import("@blazetrails/activerecord")`;

/**
 * Column value in a schema map. Either:
 *   - a plain Rails type string (legacy shape, e.g. `"string"`), or
 *   - a rich shape with nullability and array element info parsed from
 *     `db/schema.ts`. trails-tsc renders `Type | null` for nullable
 *     columns and `ElementTsType[]` for array columns when an
 *     `arrayElementType` is supplied.
 */
export type SchemaColumnValue =
  | string
  | {
      type: string;
      null?: boolean;
      arrayElementType?: string;
    };

export interface SynthesizeOptions {
  schemaColumnsByTable?: Readonly<Record<string, Readonly<Record<string, SchemaColumnValue>>>>;
  /**
   * Maps a runtime association `className` to the in-file TypeScript class
   * name it was registered against (via `registerModel("Alias", LocalClass)`).
   * Test models frequently register under an alias that differs from the
   * class identifier (e.g. `class Octopus` registered as `"EsOctopus"`); an
   * association `className: "EsOctopus"` would otherwise emit
   * `declare octopus: EsOctopus | null` — a type that doesn't exist (TS2304).
   * With the alias map the declare resolves to the real `Octopus` class.
   */
  classNameAliases?: ReadonlyMap<string, string>;
  /**
   * Render `this.attribute(name, type)` declares as `T | null` rather than
   * `T`. An AR attribute carries no NOT NULL constraint, so it is nullable
   * by Rails' conservative default — assigning `null` to it must typecheck.
   * The live tsc-plugin keeps the bare `T` form (an attribute you declared
   * is expected to hold a value at read sites), but the materializing
   * generator opts in so baked declares allow null assignment (no TS2322).
   */
  attributesNullable?: boolean;
  /**
   * Pre-resolved targets keyed `"<ClassName>#<assocName>"` overriding
   * `resolveAssociationTarget` — generator-set for `through:` associations.
   */
  associationTargets?: ReadonlyMap<string, string>;
  /** In-file ancestors of `info`, nearest first (inherited loader overloads + override conflicts). */
  ancestors?: readonly ClassInfo[];
  /** In-file class name → direct superclass name (subtype-vs-conflict check). */
  superNameOf?: ReadonlyMap<string, string>;
}

export function synthesizeDeclares(info: ClassInfo, opts: SynthesizeOptions = {}): string[] {
  const out: string[] = [];
  const aliases = opts.classNameAliases;
  const targets = opts.associationTargets;
  // Subclass singular associations whose target isn't assignable to the
  // ancestor's (TS2416): suppress the property declare (loader overload kept).
  const conflictingSingulars = collectConflictingSingulars(info, opts);
  // Track ALL synthesized instance member names so schema-reflected
  // declares don't collide with attribute() / hasMany() / belongsTo() /
  // hasOne() / scope() etc. Rails allows an association named "comments"
  // and a column named "comments" to coexist (distinct concepts);
  // emitting two `declare comments: ...` members is a TS error.
  const synthesizedInstanceNames = new Set<string>();
  for (const call of info.calls) {
    if (
      (call.kind === "belongsTo" || call.kind === "hasOne") &&
      conflictingSingulars.has(call.name)
    ) {
      continue;
    }
    for (const line of renderCall(info, call, aliases, targets, opts.attributesNullable ?? false)) {
      if (!line.skipIfPresent || !memberPresent(info, line)) {
        out.push(line.text);
        if (!line.isStatic) synthesizedInstanceNames.add(line.declaredName);
      }
    }
  }
  for (const l of renderLoaderOverloads(info, aliases, targets, opts.ancestors)) {
    if (!info.existingMembers.has(l.declaredName)) {
      out.push(l.text);
      synthesizedInstanceNames.add(l.declaredName);
    }
  }
  // Schema-reflected declares for columns not covered by any user or
  // synthesized member.
  for (const line of renderSchemaColumnDeclares(info, synthesizedInstanceNames, opts)) {
    out.push(line);
  }
  return out;
}

function renderSchemaColumnDeclares(
  info: ClassInfo,
  synthesizedInstanceNames: Set<string>,
  opts: SynthesizeOptions,
): string[] {
  const map = opts.schemaColumnsByTable;
  if (!map) return [];
  const table = info.tableName ?? pluralize(underscore(info.name));
  const cols = map[table];
  if (!cols) return [];
  const out: string[] = [];
  // Sort by column name so emitted declares are stable regardless of
  // JSON key insertion order.
  const entries = Object.entries(cols).sort(([a], [b]) => a.localeCompare(b));
  for (const [col, value] of entries) {
    if (synthesizedInstanceNames.has(col)) continue;
    if (info.existingMembers.has(col)) continue;
    // Skip "id" — Base already defines a PrimaryKeyValue accessor that
    // handles composite keys; re-declaring here would shadow it.
    if (col === "id") continue;
    const tsType = renderSchemaValueType(value);
    // Emit a bracket-quoted declare for non-identifier / reserved-word
    // names (e.g. `declare "strange-col": string;`). TypeScript allows
    // string-literal class field names, so this is a valid declare.
    out.push(`${INDENT}declare ${renderDeclaredMemberName(col)}: ${tsType};`);
  }
  return out;
}

/**
 * Convert a `SchemaColumnValue` to the TypeScript type text emitted in
 * the generated `declare`. Handles the rich shape's nullability and
 * array element types.
 */
function renderSchemaValueType(value: SchemaColumnValue): string {
  if (typeof value === "string") return tsTypeFor(value);
  let tsT = tsTypeFor(value.type);
  // For array columns with a known element type, render
  // `ElementTsType[]` instead of the default `unknown[]`.
  // Wrap the element type in parens when it is a union so we emit
  // `(A | B)[]` rather than the invalid `A | B[]`.
  if (value.type === "array" && value.arrayElementType) {
    const elType = tsTypeFor(value.arrayElementType);
    tsT = elType.includes("|") ? `(${elType})[]` : `${elType}[]`;
  }
  if (value.null !== false) tsT = tsT.includes("|") ? `(${tsT}) | null` : `${tsT} | null`;
  return tsT;
}

function renderDeclaredMemberName(name: string): string {
  return isValidIdentifier(name) ? name : JSON.stringify(name);
}

// Identifier-safe check: use TypeScript's scanner so every reserved
// word AND TS-specific keyword (`static`, `private`, `public`,
// `interface`, `let`, `await`, etc.) is detected. If the scanner
// consumes the whole string and emits an Identifier token, the name
// is safe to emit unquoted. Otherwise (keyword, invalid start char,
// non-identifier continue char) it must be quoted.
const identifierScanner = ts.createScanner(ts.ScriptTarget.ES2022, /* skipTrivia */ true);
function isValidIdentifier(name: string): boolean {
  if (name.length === 0) return false;
  identifierScanner.setText(name);
  const token = identifierScanner.scan();
  return token === ts.SyntaxKind.Identifier && identifierScanner.getTextPos() === name.length;
}

/**
 * Aggregates singular associations into `declare loadBelongsTo` and
 * `declare loadHasOne` lines, each with intersection-typed overloads
 * for every belongsTo / hasOne on the class. Users get typed narrowing
 * on the association name (`post.loadBelongsTo("author")` →
 * `Promise<Author | null>`), and calling the wrong macro (e.g.
 * `post.loadHasOne("author")` on a belongsTo) is a TS error because
 * the `loadHasOne` overloads don't include that name.
 *
 * Collections (hasMany / HABTM) use `await record.<name>` for explicit
 * loads — no method emitted.
 */
function renderLoaderOverloads(
  info: ClassInfo,
  aliases: ReadonlyMap<string, string> | undefined,
  targets: ReadonlyMap<string, string> | undefined,
  ancestors: readonly ClassInfo[] | undefined,
): RenderedLine[] {
  const belongsToOverloads: string[] = [];
  const hasOneOverloads: string[] = [];
  // Inherited overloads first (base→derived) then own, so the subclass
  // intersection includes every ancestor overload (assignable, no TS2416).
  const sources: ClassInfo[] = [...(ancestors ?? [])].reverse();
  sources.push(info);
  for (const source of sources) {
    for (const call of source.calls) {
      if (call.kind !== "belongsTo" && call.kind !== "hasOne") continue;
      const target =
        call.options["polymorphic"] === "true"
          ? "Base"
          : resolveTarget(source, call, aliases, targets);
      const overload = `((name: "${call.name}") => Promise<${target} | null>)`;
      const bucket = call.kind === "belongsTo" ? belongsToOverloads : hasOneOverloads;
      if (!bucket.includes(overload)) bucket.push(overload);
    }
  }
  const out: RenderedLine[] = [];
  if (belongsToOverloads.length > 0) {
    out.push(
      line(`declare loadBelongsTo: ${joinOverloads(belongsToOverloads)};`, "loadBelongsTo", false),
    );
  }
  if (hasOneOverloads.length > 0) {
    out.push(line(`declare loadHasOne: ${joinOverloads(hasOneOverloads)};`, "loadHasOne", false));
  }
  return out;
}

/**
 * `belongsTo`/`hasOne` names on `info` that override an in-file ancestor's
 * with an incompatible target (a sibling, not a subtype) — not assignable to
 * the ancestor property (TS2416), so the caller omits the redeclare.
 */
function collectConflictingSingulars(info: ClassInfo, opts: SynthesizeOptions): Set<string> {
  const out = new Set<string>();
  const ancestors = opts.ancestors;
  if (!ancestors || ancestors.length === 0) return out;
  const aliases = opts.classNameAliases;
  const targets = opts.associationTargets;
  const superNameOf = opts.superNameOf;

  const target = (host: ClassInfo, call: AssociationCall): string =>
    call.options["polymorphic"] === "true" ? "Base" : resolveTarget(host, call, aliases, targets);
  // Effective inherited target per association, folded base→derived
  // (`ancestors` is nearest-first, so reverse). A suppressed ancestor override
  // (target not assignable to what it inherits) does NOT change the effective
  // target, so an intermediate suppressed override can't mask a grandparent's.
  const inherited = new Map<string, string>();
  for (const anc of [...ancestors].reverse()) {
    for (const call of anc.calls) {
      if (call.kind !== "belongsTo" && call.kind !== "hasOne") continue;
      const prev = inherited.get(call.name);
      const t = target(anc, call);
      if (prev === undefined || t === prev || classExtends(t, prev, superNameOf)) {
        inherited.set(call.name, t);
      }
    }
  }
  for (const call of info.calls) {
    if (call.kind !== "belongsTo" && call.kind !== "hasOne") continue;
    const base = inherited.get(call.name);
    if (base === undefined) continue;
    const ownTarget = target(info, call);
    if (ownTarget === base || classExtends(ownTarget, base, superNameOf)) continue;
    out.add(call.name);
  }
  return out;
}

/**
 * Whether `sub` transitively extends `sup` per `superNameOf`. IN-FILE ONLY: a
 * cross-file subtype returns false → its narrowing override is suppressed.
 */
function classExtends(
  sub: string,
  sup: string,
  superNameOf: ReadonlyMap<string, string> | undefined,
): boolean {
  if (!superNameOf) return false;
  const seen = new Set<string>();
  let current: string | undefined = superNameOf.get(sub);
  while (current && !seen.has(current)) {
    if (current === sup) return true;
    seen.add(current);
    current = superNameOf.get(current);
  }
  return false;
}

function joinOverloads(overloads: string[]): string {
  // Single-overload case: drop the outer parens for readability.
  // Multiple: TS treats A & B where A and B are callable as an
  // overloaded function type.
  return overloads.length === 1 ? overloads[0].slice(1, -1) : overloads.join(" & ");
}

interface RenderedLine {
  text: string;
  declaredName: string;
  isStatic: boolean;
  skipIfPresent: boolean;
}

function renderCall(
  info: ClassInfo,
  call: RuntimeCall,
  aliases: ReadonlyMap<string, string> | undefined,
  targets: ReadonlyMap<string, string> | undefined,
  attributesNullable: boolean,
): RenderedLine[] {
  switch (call.kind) {
    case "attribute":
      return renderAttribute(call, attributesNullable);
    case "hasMany":
    case "hasAndBelongsToMany":
      return renderCollectionAssoc(info, call, aliases, targets);
    case "belongsTo":
    case "hasOne":
      return renderSingularAssoc(info, call, aliases, targets);
    case "scope":
      return renderScope(info, call);
    case "enum":
      return renderEnum(info, call);
    case "defineEnum":
      return renderEnum(info, call);
  }
}

function renderAttribute(call: AttributeCall, nullable: boolean): RenderedLine[] {
  // Base already defines an `id` accessor (PrimaryKeyValue, composite-key
  // aware); re-declaring it here as an instance property is a TS2610 error.
  // Skip it, matching how renderSchemaColumnDeclares skips the `id` column.
  if (call.name === "id") return [];
  const tsType = tsTypeFor(call.railsType);
  const memberName = renderDeclaredMemberName(call.name);
  const rendered = nullable
    ? tsType.includes("|")
      ? `(${tsType}) | null`
      : `${tsType} | null`
    : tsType;
  return [line(`declare ${memberName}: ${rendered};`, call.name, false)];
}

function renderCollectionAssoc(
  info: ClassInfo,
  call: AssociationCall,
  aliases?: ReadonlyMap<string, string>,
  targets?: ReadonlyMap<string, string>,
): RenderedLine[] {
  // Post-Phase-R.2: collection readers return an AssociationProxy,
  // not a plain `Target[]`. The proxy is awaitable — `await blog.posts`
  // hydrates and returns `Post[]` — so we don't emit a loader for
  // collections. Singular associations (belongsTo / hasOne) are
  // covered by `loadBelongsTo` / `loadHasOne` overloads rendered by
  // `renderLoaderOverloads` at the end of `synthesizeDeclares`.
  const target = resolveTarget(info, call, aliases, targets);
  const memberName = renderDeclaredMemberName(call.name);
  return [
    line(`declare ${memberName}: ${AR_IMPORT}.AssociationProxy<${target}>;`, call.name, false),
  ];
}

function renderSingularAssoc(
  info: ClassInfo,
  call: AssociationCall,
  aliases?: ReadonlyMap<string, string>,
  targets?: ReadonlyMap<string, string>,
): RenderedLine[] {
  // `polymorphic: true` on belongsTo can't be narrowed statically — any
  // Base-rooted class could be on the other end. Fall back to `Base | null`.
  // Per-association loader declarations are aggregated into
  // `declare loadBelongsTo: ...` / `declare loadHasOne: ...` lines
  // by `renderLoaderOverloads` below.
  const target =
    call.options["polymorphic"] === "true" ? "Base" : resolveTarget(info, call, aliases, targets);
  const memberName = renderDeclaredMemberName(call.name);
  return [line(`declare ${memberName}: ${target} | null;`, call.name, false)];
}

function renderScope(info: ClassInfo, call: ScopeCall): RenderedLine[] {
  const argList = call.paramsAfterRel.length === 0 ? "" : call.paramsAfterRel.join(", ");
  return [
    line(
      `declare static ${call.name}: (${argList}) => ${AR_IMPORT}.Relation<${info.name}>;`,
      call.name,
      true,
    ),
  ];
}

// `enum` / `Base.enum` and the `defineEnum(...)` alias share one runtime path
// (`_enum`), so both emit the same surface: predicate, persisting bang
// (`updateBang` → `Promise<true>`), positive scope, and auto `not*` scope.
// Rails generates no plain in-memory setter, so none is declared.
function renderEnum(info: ClassInfo, call: EnumCall | DefineEnumCall): RenderedLine[] {
  const out: RenderedLine[] = [];
  const { prefix, suffix } = readPrefixSuffix(call.options, call.attr);
  for (const value of call.values) {
    const methodBase = `${prefix}${value}${suffix}`;
    const predicate = `is${pascal(methodBase)}`;
    const scopeName = camelize(methodBase, false);
    const bang = `${scopeName}Bang`;
    const notScope = `not${pascal(methodBase)}`;
    out.push(line(`declare ${predicate}: () => boolean;`, predicate, false));
    out.push(line(`declare ${bang}: () => Promise<true>;`, bang, false));
    out.push(
      line(
        `declare static ${scopeName}: () => ${AR_IMPORT}.Relation<${info.name}>;`,
        scopeName,
        true,
      ),
    );
    out.push(
      line(
        `declare static ${notScope}: () => ${AR_IMPORT}.Relation<${info.name}>;`,
        notScope,
        true,
      ),
    );
  }
  return out;
}

function readPrefixSuffix(
  options: Record<string, string>,
  attr: string,
): { prefix: string; suffix: string } {
  return {
    prefix: readAffix(options["prefix"], attr, "prefix"),
    suffix: readAffix(options["suffix"], attr, "suffix"),
  };
}

function readAffix(raw: string | undefined, attr: string, side: "prefix" | "suffix"): string {
  if (!raw || raw === "false") return "";
  const value = raw === "true" ? attr : stripQuotes(raw);
  return side === "prefix" ? `${value}_` : `_${value}`;
}

function resolveTarget(
  info: ClassInfo,
  call: AssociationCall,
  aliases?: ReadonlyMap<string, string>,
  targets?: ReadonlyMap<string, string>,
): string {
  const override = targets?.get(`${info.name}#${call.name}`);
  if (override) return override;
  const target = resolveAssociationTarget(call);
  return aliases?.get(target) ?? target;
}

function pascal(s: string): string {
  return camelize(s);
}

function line(body: string, declaredName: string, isStatic: boolean): RenderedLine {
  return {
    text: `${INDENT}${body}`,
    declaredName,
    isStatic,
    skipIfPresent: true,
  };
}

function memberPresent(info: ClassInfo, l: RenderedLine): boolean {
  const set = l.isStatic ? info.existingStaticMembers : info.existingMembers;
  return set.has(l.declaredName);
}

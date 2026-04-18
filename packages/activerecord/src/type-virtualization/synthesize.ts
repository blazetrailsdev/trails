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

export interface SynthesizeOptions {
  schemaColumnsByTable?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export function synthesizeDeclares(info: ClassInfo, opts: SynthesizeOptions = {}): string[] {
  const out: string[] = [];
  // Track ALL synthesized instance member names so schema-reflected
  // declares don't collide with attribute() / hasMany() / belongsTo() /
  // hasOne() / scope() etc. Rails allows an association named "comments"
  // and a column named "comments" to coexist (distinct concepts);
  // emitting two `declare comments: ...` members is a TS error.
  const synthesizedInstanceNames = new Set<string>();
  for (const call of info.calls) {
    for (const line of renderCall(info, call)) {
      if (!line.skipIfPresent || !memberPresent(info, line)) {
        out.push(line.text);
        if (!line.isStatic) synthesizedInstanceNames.add(line.declaredName);
      }
    }
  }
  for (const l of renderLoaderOverloads(info)) {
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
  for (const [col, railsType] of entries) {
    if (synthesizedInstanceNames.has(col)) continue;
    if (info.existingMembers.has(col)) continue;
    // Skip "id" — Base already defines a PrimaryKeyValue accessor that
    // handles composite keys; re-declaring here would shadow it.
    if (col === "id") continue;
    // Emit a bracket-quoted declare for non-identifier / reserved-word
    // names (e.g. `declare "strange-col": string;`). TypeScript allows
    // string-literal class field names, so this is a valid declare.
    out.push(`${INDENT}declare ${renderDeclaredMemberName(col)}: ${tsTypeFor(railsType)};`);
  }
  return out;
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
function renderLoaderOverloads(info: ClassInfo): RenderedLine[] {
  const belongsToOverloads: string[] = [];
  const hasOneOverloads: string[] = [];
  for (const call of info.calls) {
    if (call.kind !== "belongsTo" && call.kind !== "hasOne") continue;
    const target =
      (call as AssociationCall).options["polymorphic"] === "true"
        ? "Base"
        : resolveTarget(call as AssociationCall);
    const overload = `((name: "${call.name}") => Promise<${target} | null>)`;
    if (call.kind === "belongsTo") belongsToOverloads.push(overload);
    else hasOneOverloads.push(overload);
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

function joinOverloads(overloads: string[]): string {
  // Single-overload case: drop the outer parens for readability.
  // Multiple: TS treats A & B where A and B are callable as an
  // overloaded function type.
  return overloads.length === 1 ? overloads[0]!.slice(1, -1) : overloads.join(" & ");
}

interface RenderedLine {
  text: string;
  declaredName: string;
  isStatic: boolean;
  skipIfPresent: boolean;
}

function renderCall(info: ClassInfo, call: RuntimeCall): RenderedLine[] {
  switch (call.kind) {
    case "attribute":
      return renderAttribute(call);
    case "hasMany":
    case "hasAndBelongsToMany":
      return renderCollectionAssoc(call);
    case "belongsTo":
    case "hasOne":
      return renderSingularAssoc(call);
    case "scope":
      return renderScope(info, call);
    case "enum":
      return renderEnum(info, call);
    case "defineEnum":
      return renderDefineEnum(info, call);
  }
}

function renderAttribute(call: AttributeCall): RenderedLine[] {
  const tsType = tsTypeFor(call.railsType);
  const memberName = renderDeclaredMemberName(call.name);
  return [line(`declare ${memberName}: ${tsType};`, call.name, false)];
}

function renderCollectionAssoc(call: AssociationCall): RenderedLine[] {
  // Post-Phase-R.2: collection readers return an AssociationProxy,
  // not a plain `Target[]`. The proxy is awaitable — `await blog.posts`
  // hydrates and returns `Post[]` — so we don't emit a loader for
  // collections. Singular associations (belongsTo / hasOne) are
  // covered by `loadBelongsTo` / `loadHasOne` overloads rendered by
  // `renderLoaderOverloads` at the end of `synthesizeDeclares`.
  const target = resolveTarget(call);
  const memberName = renderDeclaredMemberName(call.name);
  return [
    line(`declare ${memberName}: ${AR_IMPORT}.AssociationProxy<${target}>;`, call.name, false),
  ];
}

function renderSingularAssoc(call: AssociationCall): RenderedLine[] {
  // `polymorphic: true` on belongsTo can't be narrowed statically — any
  // Base-rooted class could be on the other end. Fall back to `Base | null`.
  // Per-association loader declarations are aggregated into
  // `declare loadBelongsTo: ...` / `declare loadHasOne: ...` lines
  // by `renderLoaderOverloads` below.
  const target = call.options["polymorphic"] === "true" ? "Base" : resolveTarget(call);
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

function renderEnum(info: ClassInfo, call: EnumCall): RenderedLine[] {
  const out: RenderedLine[] = [];
  const { prefix, suffix } = readPrefixSuffix(call.options, call.attr);
  for (const value of call.values) {
    const methodBase = `${prefix}${value}${suffix}`;
    const predicate = `is${pascal(methodBase)}`;
    const bang = `${camelize(methodBase, false)}Bang`;
    const scopeName = camelize(methodBase, false);
    out.push(line(`declare ${predicate}: () => boolean;`, predicate, false));
    out.push(line(`declare ${bang}: () => this;`, bang, false));
    out.push(
      line(
        `declare static ${scopeName}: () => ${AR_IMPORT}.Relation<${info.name}>;`,
        scopeName,
        true,
      ),
    );
  }
  return out;
}

function renderDefineEnum(info: ClassInfo, call: DefineEnumCall): RenderedLine[] {
  const out: RenderedLine[] = [];
  const { prefix, suffix } = readPrefixSuffix(call.options, call.attr);
  for (const value of call.values) {
    const methodBase = `${prefix}${value}${suffix}`;
    const predicate = `is${pascal(methodBase)}`;
    const setter = camelize(methodBase, false);
    const bang = `${setter}Bang`;
    const notScope = `not${pascal(methodBase)}`;
    out.push(line(`declare ${predicate}: () => boolean;`, predicate, false));
    out.push(line(`declare ${setter}: () => void;`, setter, false));
    out.push(line(`declare ${bang}: () => Promise<void>;`, bang, false));
    out.push(
      line(`declare static ${setter}: () => ${AR_IMPORT}.Relation<${info.name}>;`, setter, true),
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

function resolveTarget(call: AssociationCall): string {
  return resolveAssociationTarget(call);
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

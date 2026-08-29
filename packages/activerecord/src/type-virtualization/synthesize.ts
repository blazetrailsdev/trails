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

const AR_IMPORT = `import("@blazetrails/activerecord")`;

export type SchemaColumnValue =
  | string
  | {
      type: string;
      null?: boolean;
      arrayElementType?: string;
    };

export interface SynthesizeOptions {
  schemaColumnsByTable?: Readonly<Record<string, Readonly<Record<string, SchemaColumnValue>>>>;
  classNameAliases?: ReadonlyMap<string, string>;
  attributesNullable?: boolean;
  associationTargets?: ReadonlyMap<string, string>;
  ancestors?: readonly ClassInfo[];
  superNameOf?: ReadonlyMap<string, string>;
  composedOfColumns?: ReadonlyMap<string, ReadonlySet<string>>;
  isKnownTarget?: (name: string, host: ClassInfo) => boolean;
}

export function synthesizeDeclares(info: ClassInfo, opts: SynthesizeOptions = {}): string[] {
  const out: string[] = [];
  const aliases = opts.classNameAliases;
  const targets = opts.associationTargets;
  const isKnownTarget = boundKnownTarget(info, opts);
  const conflictingSingulars = collectConflictingSingulars(info, opts);
  const conflictingCollections = collectConflictingCollections(info, opts);
  const synthesizedInstanceNames = new Set<string>();
  for (const call of info.calls) {
    if (
      (call.kind === "belongsTo" || call.kind === "hasOne") &&
      conflictingSingulars.has(call.name)
    ) {
      continue;
    }
    if (
      (call.kind === "hasMany" || call.kind === "hasAndBelongsToMany") &&
      conflictingCollections.has(call.name)
    ) {
      continue;
    }
    for (const line of renderCall(
      info,
      call,
      aliases,
      targets,
      opts.attributesNullable ?? false,
      isKnownTarget,
    )) {
      if (!line.skipIfPresent || !memberPresent(info, line)) {
        out.push(line.text);
        if (!line.isStatic) synthesizedInstanceNames.add(line.declaredName);
      }
    }
  }
  for (const l of renderLoaderOverloads(info, aliases, targets, opts.ancestors, isKnownTarget)) {
    if (!info.existingMembers.has(l.declaredName)) {
      out.push(l.text);
      synthesizedInstanceNames.add(l.declaredName);
    }
  }
  for (const line of renderSchemaColumnDeclares(info, synthesizedInstanceNames, opts)) {
    out.push(line);
  }
  return out;
}

function boundKnownTarget(
  host: ClassInfo,
  opts: SynthesizeOptions,
): ((name: string) => boolean) | undefined {
  const predicate = opts.isKnownTarget;
  if (!predicate) return undefined;
  return (name: string) => predicate(name, host);
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
  const entries = Object.entries(cols).sort(([a], [b]) => a.localeCompare(b));
  const composedCols = opts.composedOfColumns?.get(info.name);
  for (const [col, value] of entries) {
    if (synthesizedInstanceNames.has(col)) continue;
    if (info.existingMembers.has(col)) continue;
    if (col === "id") continue;
    if (composedCols?.has(col)) continue;
    if (info.skipSchemaColumns.has(col)) continue;
    const tsType = isForeignKeyColumn(col, value)
      ? `${AR_IMPORT}.PrimaryKeyValue`
      : renderSchemaValueType(value);
    out.push(`${INDENT}declare ${renderDeclaredMemberName(col)}: ${tsType};`);
  }
  return out;
}

function isForeignKeyColumn(col: string, value: SchemaColumnValue): boolean {
  if (col === "id" || !col.endsWith("_id")) return false;
  const type = typeof value === "string" ? value : value.type;
  return type === "integer" || type === "big_integer" || type === "bigint";
}

function renderSchemaValueType(value: SchemaColumnValue): string {
  if (typeof value === "string") return tsTypeFor(value);
  let tsT = tsTypeFor(value.type);
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

const identifierScanner = ts.createScanner(ts.ScriptTarget.ES2022, true);
function isValidIdentifier(name: string): boolean {
  if (name.length === 0) return false;
  identifierScanner.setText(name);
  const token = identifierScanner.scan();
  return token === ts.SyntaxKind.Identifier && identifierScanner.getTextPos() === name.length;
}

function renderLoaderOverloads(
  info: ClassInfo,
  aliases: ReadonlyMap<string, string> | undefined,
  targets: ReadonlyMap<string, string> | undefined,
  ancestors: readonly ClassInfo[] | undefined,
  isKnownTarget: ((name: string) => boolean) | undefined,
): RenderedLine[] {
  const belongsToOverloads: string[] = [];
  const hasOneOverloads: string[] = [];
  const sources: ClassInfo[] = [...(ancestors ?? [])].reverse();
  sources.push(info);
  for (const source of sources) {
    for (const call of source.calls) {
      if (call.kind !== "belongsTo" && call.kind !== "hasOne") continue;
      const target =
        call.options["polymorphic"] === "true"
          ? "Base"
          : resolveTarget(source, call, aliases, targets, isKnownTarget);
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

function collectConflictingCollections(info: ClassInfo, opts: SynthesizeOptions): Set<string> {
  const out = new Set<string>();
  const ancestors = opts.ancestors;
  if (!ancestors || ancestors.length === 0) return out;
  const inheritedCollections = new Set<string>();
  for (const anc of ancestors) {
    for (const call of anc.calls) {
      if (call.kind === "hasMany" || call.kind === "hasAndBelongsToMany") {
        inheritedCollections.add(call.name);
      }
    }
  }
  for (const call of info.calls) {
    if (call.kind !== "hasMany" && call.kind !== "hasAndBelongsToMany") continue;
    if (inheritedCollections.has(call.name)) out.add(call.name);
  }
  return out;
}

function collectConflictingSingulars(info: ClassInfo, opts: SynthesizeOptions): Set<string> {
  const out = new Set<string>();
  const ancestors = opts.ancestors;
  if (!ancestors || ancestors.length === 0) return out;
  const aliases = opts.classNameAliases;
  const targets = opts.associationTargets;
  const superNameOf = opts.superNameOf;

  const isKnownTarget = boundKnownTarget(info, opts);
  const target = (host: ClassInfo, call: AssociationCall): string =>
    call.options["polymorphic"] === "true"
      ? "Base"
      : resolveTarget(host, call, aliases, targets, isKnownTarget);
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
    if (ownTarget === base || base === "Base" || classExtends(ownTarget, base, superNameOf))
      continue;
    out.add(call.name);
  }
  return out;
}

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
  isKnownTarget: ((name: string) => boolean) | undefined,
): RenderedLine[] {
  switch (call.kind) {
    case "attribute":
      return renderAttribute(call, attributesNullable);
    case "hasMany":
    case "hasAndBelongsToMany":
      return renderCollectionAssoc(info, call, aliases, targets, isKnownTarget);
    case "belongsTo":
    case "hasOne":
      return renderSingularAssoc(info, call, aliases, targets, isKnownTarget);
    case "scope":
      return renderScope(info, call);
    case "enum":
      return renderEnum(info, call);
    case "defineEnum":
      return renderEnum(info, call);
  }
}

function renderAttribute(call: AttributeCall, nullable: boolean): RenderedLine[] {
  if (call.name === "id") return [];
  const memberName = renderDeclaredMemberName(call.name);
  if (isForeignKeyColumn(call.name, call.railsType)) {
    return [line(`declare ${memberName}: ${AR_IMPORT}.PrimaryKeyValue;`, call.name, false)];
  }
  const tsType = tsTypeFor(call.railsType);
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
  isKnownTarget?: (name: string) => boolean,
): RenderedLine[] {
  const target = resolveTarget(info, call, aliases, targets, isKnownTarget);
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
  isKnownTarget?: (name: string) => boolean,
): RenderedLine[] {
  const target =
    call.options["polymorphic"] === "true"
      ? "Base"
      : resolveTarget(info, call, aliases, targets, isKnownTarget);
  const memberName = renderDeclaredMemberName(call.name);
  return [line(`declare ${memberName}: ${target} | null;`, call.name, false)];
}

function renderScope(info: ClassInfo, call: ScopeCall): RenderedLine[] {
  const argList = call.paramsAfterThis.length === 0 ? "" : call.paramsAfterThis.join(", ");
  return [
    line(
      `declare static ${call.name}: (${argList}) => ${AR_IMPORT}.Relation<${info.name}>;`,
      call.name,
      true,
    ),
  ];
}

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
    out.push(line(`declare ${bang}: () => Promise<true | undefined>;`, bang, false));
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
  isKnownTarget?: (name: string) => boolean,
): string {
  const override = targets?.get(`${info.name}#${call.name}`);
  if (override) return override;
  const target = resolveAssociationTarget(call);
  const resolved = aliases?.get(target) ?? target;
  if (isKnownTarget && !isKnownTarget(resolved)) return "Base";
  return resolved;
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

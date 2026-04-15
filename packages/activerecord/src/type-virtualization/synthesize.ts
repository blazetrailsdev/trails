// Render declaration strings from walker output.
//
// Produces one `declare ...;` line per runtime call, skipping members the
// user has already declared by hand. Output is plain text — the splicer
// in virtualize.ts inserts it verbatim after the class body's opening `{`.

import { classify, camelize } from "@blazetrails/activesupport";
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

export function synthesizeDeclares(info: ClassInfo): string[] {
  const out: string[] = [];
  for (const call of info.calls) {
    for (const line of renderCall(info, call)) {
      if (!line.skipIfPresent || !memberPresent(info, line)) out.push(line.text);
    }
  }
  return out;
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
  return [line(`declare ${call.name}: ${tsType};`, call.name, false)];
}

function renderCollectionAssoc(call: AssociationCall): RenderedLine[] {
  const target = resolveTarget(call);
  return [line(`declare ${call.name}: ${target}[];`, call.name, false)];
}

function renderSingularAssoc(call: AssociationCall): RenderedLine[] {
  // `polymorphic: true` on belongsTo can't be narrowed statically — any
  // Base-rooted class could be on the other end. Fall back to `Base | null`.
  const target = call.options["polymorphic"] === "true" ? "Base" : resolveTarget(call);
  return [line(`declare ${call.name}: ${target} | null;`, call.name, false)];
}

function renderScope(info: ClassInfo, call: ScopeCall): RenderedLine[] {
  const argList = call.paramsAfterRel.length === 0 ? "" : call.paramsAfterRel.join(", ");
  return [
    line(`declare static ${call.name}: (${argList}) => Relation<${info.name}>;`, call.name, true),
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
    out.push(line(`declare static ${scopeName}: () => Relation<${info.name}>;`, scopeName, true));
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
    out.push(line(`declare static ${setter}: () => Relation<${info.name}>;`, setter, true));
    out.push(line(`declare static ${notScope}: () => Relation<${info.name}>;`, notScope, true));
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
  const explicit = call.options["className"];
  if (explicit) return stripQuotes(explicit);
  return classify(call.name);
}

function stripQuotes(source: string): string {
  const first = source.charAt(0);
  if ((first === '"' || first === "'" || first === "`") && source.endsWith(first)) {
    return source.slice(1, -1);
  }
  return source;
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

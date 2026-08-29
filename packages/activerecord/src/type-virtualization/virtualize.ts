import ts from "typescript";
import { walk, findIncludeCalls, type WalkOptions, type ClassInfo } from "./walker.js";
import { synthesizeDeclares } from "./synthesize.js";

const INCLUDED_ALIAS = "__TrailsIncluded";
const INCLUDED_IMPORT_LINE = `import type { Included as ${INCLUDED_ALIAS} } from "@blazetrails/activesupport";`;

export interface LineDelta {
  insertedAtLine: number;
  lineCount: number;
}

export interface VirtualizeResult {
  text: string;
  deltas: LineDelta[];
}

export interface VirtualizeOptions extends WalkOptions {
  prependImports?: readonly string[];
  schemaColumnsByTable?: Readonly<
    Record<string, Readonly<Record<string, import("./synthesize.js").SchemaColumnValue>>>
  >;
  classNameAliases?: ReadonlyMap<string, string>;
  attributesNullable?: boolean;
  associationTargets?: ReadonlyMap<string, string>;
  globalSuperNameOf?: ReadonlyMap<string, string>;
  composedOfColumns?: ReadonlyMap<string, ReadonlySet<string>>;
  isKnownTarget?: (name: string, host: import("./walker.js").ClassInfo) => boolean;
}

export function virtualize(
  originalText: string,
  fileName: string,
  options: VirtualizeOptions = {},
): VirtualizeResult {
  const sf = ts.createSourceFile(fileName, originalText, ts.ScriptTarget.ES2022, true);
  const classes = walk(sf, options);
  const { superNameOf: inFileSuperNameOf, ancestorsOf } = buildInheritance(classes);
  const superNameOf: ReadonlyMap<string, string> = (() => {
    if (!options.globalSuperNameOf) return inFileSuperNameOf;
    const merged = new Map<string, string>(options.globalSuperNameOf);
    for (const [k, v] of inFileSuperNameOf) merged.set(k, v);
    return merged;
  })();

  interface Edit {
    pos: number;
    text: string;
    originalLine: number;
    lineCount: number;
  }
  const edits: Edit[] = [];

  for (const info of classes) {
    if (info.skip) continue;
    if (info.openBracePos < 0) continue;
    const decls = synthesizeDeclares(info, {
      schemaColumnsByTable: options.schemaColumnsByTable,
      classNameAliases: options.classNameAliases,
      attributesNullable: options.attributesNullable,
      associationTargets: options.associationTargets,
      composedOfColumns: options.composedOfColumns,
      isKnownTarget: options.isKnownTarget,
      ancestors: ancestorsOf.get(info),
      superNameOf,
    });
    if (decls.length === 0) continue;
    const block = "\n" + decls.join("\n") + "\n";
    edits.push({
      pos: info.openBracePos,
      text: block,
      originalLine: sf.getLineAndCharacterOfPosition(info.openBracePos).line,
      lineCount: decls.length + 1,
    });
  }

  edits.sort((a, b) => b.pos - a.pos);

  let text = originalText;
  for (const e of edits) {
    text = text.slice(0, e.pos) + e.text + text.slice(e.pos);
  }

  const sortedEdits = edits
    .slice()
    .sort((a, b) => a.originalLine - b.originalLine || a.pos - b.pos);
  let cumulative = 0;
  const deltas: LineDelta[] = sortedEdits.map((e) => {
    const d: LineDelta = { insertedAtLine: e.originalLine + cumulative, lineCount: e.lineCount };
    cumulative += e.lineCount;
    return d;
  });

  const includes = findIncludeCalls(sf);
  const effectivePrepends: string[] = [];
  if (options.prependImports) effectivePrepends.push(...options.prependImports);
  if (includes.length > 0) {
    const aliasState = checkIncludedAliasBinding(sf, INCLUDED_ALIAS);
    if (aliasState !== "different") {
      const userInterfaces = collectInterfaceNames(sf);
      interface Group {
        mods: string[];
        exported: boolean;
        typeParams: string;
      }
      const grouped = new Map<string, Group>();
      for (const inc of includes) {
        if (userInterfaces.has(inc.className)) continue;
        const entry = grouped.get(inc.className);
        if (entry) entry.mods.push(inc.moduleExpr);
        else
          grouped.set(inc.className, {
            mods: [inc.moduleExpr],
            exported: inc.classExported,
            typeParams: inc.classTypeParams,
          });
      }
      const interfaceLines: string[] = [];
      for (const [className, { mods, exported, typeParams }] of grouped) {
        const heritage = mods.map((m) => `${INCLUDED_ALIAS}<typeof ${m}>`).join(", ");
        const prefix = exported ? "export " : "";
        interfaceLines.push(`${prefix}interface ${className}${typeParams} extends ${heritage} {}`);
      }
      if (interfaceLines.length > 0) {
        if (aliasState === "absent") effectivePrepends.push(INCLUDED_IMPORT_LINE);
        effectivePrepends.push(...interfaceLines);
      }
    }
  }

  const prependLines = effectivePrepends.length > 0 ? effectivePrepends : undefined;
  if (prependLines && prependLines.length > 0) {
    const importBlock = prependLines.join("\n") + "\n";
    const insertPos = findDirectiveEnd(text);
    const before = text.slice(0, insertPos);
    const newlineCount = (before.match(/\r?\n/g) ?? []).length;
    const insertedAtLine =
      insertPos === 0 ? -1 : before.endsWith("\n") ? newlineCount - 1 : newlineCount;
    text = text.slice(0, insertPos) + importBlock + text.slice(insertPos);
    const prependedLines = (importBlock.match(/\r?\n/g) ?? []).length;
    for (const d of deltas) {
      d.insertedAtLine += prependedLines;
    }
    deltas.unshift({ insertedAtLine, lineCount: prependedLines });
  }

  return { text, deltas };
}

function buildInheritance(classes: readonly ClassInfo[]): {
  superNameOf: ReadonlyMap<string, string>;
  ancestorsOf: ReadonlyMap<ClassInfo, ClassInfo[]>;
} {
  const superNameOf = new Map<string, string>();
  const byName = new Map<string, ClassInfo>();
  for (const info of classes) {
    if (!byName.has(info.name)) byName.set(info.name, info);
    const superName = directSuperName(info.classDecl);
    if (superName && !superNameOf.has(info.name)) superNameOf.set(info.name, superName);
  }
  const ancestorsOf = new Map<ClassInfo, ClassInfo[]>();
  for (const info of classes) {
    const chain: ClassInfo[] = [];
    const seen = new Set<string>([info.name]);
    let superName = superNameOf.get(info.name);
    while (superName && !seen.has(superName)) {
      seen.add(superName);
      const anc = byName.get(superName);
      if (anc) chain.push(anc);
      superName = superNameOf.get(superName);
    }
    ancestorsOf.set(info, chain);
  }
  return { superNameOf, ancestorsOf };
}

function directSuperName(cls: ts.ClassDeclaration): string | undefined {
  for (const hc of cls.heritageClauses ?? []) {
    if (hc.token !== ts.SyntaxKind.ExtendsKeyword) continue;
    const expr = hc.types[0]?.expression;
    if (expr && ts.isIdentifier(expr)) return expr.text;
  }
  return undefined;
}

type AliasBindingState = "absent" | "matches" | "different";

function checkIncludedAliasBinding(sf: ts.SourceFile, alias: string): AliasBindingState {
  let state: AliasBindingState = "absent";
  const escalate = (next: AliasBindingState): void => {
    if (next === "different") state = "different";
    else if (next === "matches" && state !== "different") state = "matches";
  };
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt)) {
      const clause = stmt.importClause;
      if (!clause) continue;
      if (clause.name?.text === alias) {
        escalate("different");
        continue;
      }
      const named = clause.namedBindings;
      if (!named) continue;
      if (ts.isNamespaceImport(named) && named.name.text === alias) {
        escalate("different");
        continue;
      }
      if (!ts.isNamedImports(named)) continue;
      for (const el of named.elements) {
        if (el.name.text !== alias) continue;
        const importedName = el.propertyName?.text ?? el.name.text;
        const fromActivesupport =
          ts.isStringLiteralLike(stmt.moduleSpecifier) &&
          stmt.moduleSpecifier.text === "@blazetrails/activesupport";
        if (fromActivesupport && importedName === "Included") escalate("matches");
        else escalate("different");
      }
      continue;
    }
    if (
      (ts.isTypeAliasDeclaration(stmt) ||
        ts.isInterfaceDeclaration(stmt) ||
        ts.isClassDeclaration(stmt) ||
        ts.isFunctionDeclaration(stmt) ||
        ts.isEnumDeclaration(stmt) ||
        ts.isModuleDeclaration(stmt)) &&
      stmt.name &&
      ts.isIdentifier(stmt.name) &&
      stmt.name.text === alias
    ) {
      escalate("different");
      continue;
    }
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === alias) escalate("different");
      }
    }
  }
  return state;
}

function collectInterfaceNames(sf: ts.SourceFile): Set<string> {
  const out = new Set<string>();
  for (const stmt of sf.statements) {
    if (ts.isInterfaceDeclaration(stmt) && stmt.name) out.add(stmt.name.text);
  }
  return out;
}

function findDirectiveEnd(text: string): number {
  const lineRe = /([^\r\n]*)(\r?\n|$)/g;
  let pos = 0;
  let match: RegExpExecArray | null;
  while ((match = lineRe.exec(text)) !== null) {
    const [full, line, terminator] = match;
    if (terminator === "" && line === "") break;
    const trimmed = line.trimStart();
    const isSingleLineBlockPragma =
      (trimmed.startsWith("/* @ts-nocheck") || trimmed.startsWith("/* @ts-check")) &&
      trimmed.includes("*/");
    if (
      trimmed.startsWith("#!") ||
      trimmed.startsWith("/// <") ||
      trimmed.startsWith("// @ts-nocheck") ||
      trimmed.startsWith("// @ts-check") ||
      isSingleLineBlockPragma ||
      trimmed === ""
    ) {
      pos += full.length;
      if (terminator === "") break;
    } else {
      break;
    }
  }
  return pos;
}

export function remapLine(virtualLine: number, deltas: readonly LineDelta[]): number | null {
  let line = virtualLine;
  for (let i = deltas.length - 1; i >= 0; i--) {
    const d = deltas[i];
    if (!d) continue;
    const injectedStart = d.insertedAtLine;
    const injectedEnd = d.insertedAtLine + d.lineCount;
    if (line > injectedEnd) {
      line -= d.lineCount;
    } else if (line > injectedStart && line <= injectedEnd) {
      return null;
    }
  }
  return line;
}

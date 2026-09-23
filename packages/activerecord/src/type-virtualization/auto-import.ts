/** @noRailsEquivalent PERMANENT */
import * as ts from "typescript/unstable/ast";
import { walk, type ClassInfo } from "./walker.js";
import { resolveAssociationTarget } from "./resolve-target.js";
import { tsApi } from "./ts-api.js";

export function resolveAutoImports(
  originalText: string,
  fileName: string,
  modelRegistry: ReadonlyMap<string, string>,
  baseNames?: readonly string[],
): string[] {
  const sf = tsApi().createSourceFile(fileName, originalText);
  const classes = walk(sf, { baseNames });

  const neededNames = new Set<string>();
  for (const info of classes) {
    collectTargetNames(info, neededNames);
  }

  if (neededNames.size === 0) return [];

  const inScope = collectNamesInScope(sf);
  const imports: string[] = [];

  for (const name of neededNames) {
    if (inScope.has(name)) continue;
    const targetPath = modelRegistry.get(name);
    if (!targetPath) continue;
    const relativePath = computeRelativeImport(fileName, targetPath);
    imports.push(`import type { ${name} } from "${relativePath}";`);
  }

  imports.sort((a, b) => a.localeCompare(b));

  return imports;
}

function collectTargetNames(info: ClassInfo, out: Set<string>): void {
  for (const call of info.calls) {
    if (
      call.kind === "hasMany" ||
      call.kind === "hasAndBelongsToMany" ||
      call.kind === "belongsTo" ||
      call.kind === "hasOne"
    ) {
      const assocCall = call;
      if (call.kind === "belongsTo" && assocCall.options["polymorphic"] === "true") continue;
      out.add(resolveAssociationTarget(assocCall));
    }
  }
}

function collectNamesInScope(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();

  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && stmt.importClause) {
      const clause = stmt.importClause;
      if (clause.name) names.add(clause.name.text);
      if (clause.namedBindings) {
        if (ts.isNamedImports(clause.namedBindings)) {
          for (const el of clause.namedBindings.elements) {
            names.add(el.name.text);
          }
        } else if (ts.isNamespaceImport(clause.namedBindings)) {
          names.add(clause.namedBindings.name.text);
        }
      }
      continue;
    }

    if (ts.isImportEqualsDeclaration(stmt)) {
      names.add(stmt.name.text);
      continue;
    }

    if (
      (ts.isClassDeclaration(stmt) ||
        ts.isInterfaceDeclaration(stmt) ||
        ts.isTypeAliasDeclaration(stmt) ||
        ts.isEnumDeclaration(stmt)) &&
      stmt.name
    ) {
      names.add(stmt.name.text);
    }
  }

  return names;
}

function computeRelativeImport(fromFile: string, toFile: string): string {
  const windows = /^[A-Za-z]:|\\/.test(fromFile) || /^[A-Za-z]:|\\/.test(toFile);
  const key = (segment: string): string => (windows ? segment.toLowerCase() : segment);
  const split = (file: string): [string, string[]] => {
    const slashed = file.replace(/\\/g, "/");
    const root = windows ? (/^(\/\/[^/]+\/[^/]+|[A-Za-z]:)/.exec(slashed)?.[0] ?? "") : "";
    const segments: string[] = [];
    for (const segment of slashed.slice(root.length).split("/")) {
      if (segment === "" || segment === ".") continue;
      if (segment === "..") segments.pop();
      else segments.push(segment);
    }
    return [root, segments];
  };
  const [fromRoot, fromSegments] = split(fromFile);
  const [toRoot, to] = split(toFile);
  if (key(fromRoot) !== key(toRoot)) return `./${toRoot}/${to.join("/")}`.replace(/\.tsx?$/, ".js");
  const fromDir = fromSegments.slice(0, -1);
  let common = 0;
  while (
    common < fromDir.length &&
    common < to.length - 1 &&
    key(fromDir[common]) === key(to[common])
  ) {
    common++;
  }
  let rel = [...fromDir.slice(common).map(() => ".."), ...to.slice(common)].join("/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  rel = rel.replace(/\.tsx?$/, ".js");
  return rel;
}

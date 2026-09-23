/** @noRailsEquivalent PERMANENT */
import * as ts from "typescript/unstable/ast";
import type { Project, Symbol } from "typescript/unstable/sync";
import { tsApi } from "./ts-api.js";

export interface WalkerResult {
  baseNames: Set<string>;
  modelRegistry: Map<string, string>;
}

export function collectBaseDescendants(
  configPath: string,
  rootNames: ReadonlySet<string> = new Set(["Base"]),
): WalkerResult {
  const snapshot = tsApi().createSnapshot({ openProjects: [configPath] });
  try {
    const project = snapshot.getConfiguredProject(configPath)!;
    const { program, checker } = project;
    const baseNames = new Set<string>(rootNames);
    const modelRegistry = new Map<string, string>();
    const memo = new Map<Symbol, boolean>();

    for (const fileName of program.getSourceFileNames()) {
      const sf = program.getSourceFile(fileName);
      if (!sf || sf.isDeclarationFile) continue;
      sf.forEachChild((node) => {
        if (ts.isClassDeclaration(node) && node.name) {
          const sym = checker.getSymbolAtLocation(node.name);
          if (sym && walkClass(sym, project, rootNames, baseNames, memo)) {
            const existing = modelRegistry.get(sym.name);
            if (
              !existing ||
              sf.fileName.length < existing.length ||
              (sf.fileName.length === existing.length && sf.fileName < existing)
            ) {
              modelRegistry.set(sym.name, sf.fileName);
            }
          }
        }
      });
    }

    return { baseNames, modelRegistry };
  } finally {
    snapshot.dispose();
  }
}

function walkClass(
  sym: Symbol,
  project: Project,
  rootNames: ReadonlySet<string>,
  result: Set<string>,
  memo: Map<Symbol, boolean>,
): boolean {
  const cached = memo.get(sym);
  if (cached !== undefined) return cached;

  memo.set(sym, false);

  if (rootNames.has(sym.name)) {
    result.add(sym.name);
    memo.set(sym, true);
    return true;
  }

  for (const handle of sym.declarations) {
    const decl = handle.resolve(project);
    if (!decl || !ts.isClassDeclaration(decl)) continue;
    for (const heritage of decl.heritageClauses ?? []) {
      if (heritage.token !== ts.SyntaxKind.ExtendsKeyword) continue;
      for (const typeNode of heritage.types) {
        if (!ts.isExpressionWithTypeArguments(typeNode)) continue;
        const parentType = project.checker.getTypeAtLocation(typeNode.expression);
        const parentSym = parentType.getSymbol();
        if (!parentSym) continue;
        if (walkClass(parentSym, project, rootNames, result, memo)) {
          result.add(sym.name);
          memo.set(sym, true);
          return true;
        }
      }
    }
  }

  return false;
}

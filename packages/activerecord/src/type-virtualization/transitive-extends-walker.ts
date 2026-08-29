import ts from "typescript";

export interface WalkerResult {
  baseNames: Set<string>;
  modelRegistry: Map<string, string>;
}

export function collectBaseDescendants(
  program: ts.Program,
  rootNames: ReadonlySet<string> = new Set(["Base"]),
): WalkerResult {
  const checker = program.getTypeChecker();
  const baseNames = new Set<string>(rootNames);
  const modelRegistry = new Map<string, string>();
  const memo = new Map<ts.Symbol, boolean>();

  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile) continue;
    ts.forEachChild(sf, (node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        const sym = checker.getSymbolAtLocation(node.name);
        if (sym && walkClass(sym, checker, rootNames, baseNames, memo)) {
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
}

function walkClass(
  sym: ts.Symbol,
  checker: ts.TypeChecker,
  rootNames: ReadonlySet<string>,
  result: Set<string>,
  memo: Map<ts.Symbol, boolean>,
): boolean {
  const cached = memo.get(sym);
  if (cached !== undefined) return cached;

  memo.set(sym, false);

  if (rootNames.has(sym.name)) {
    result.add(sym.name);
    memo.set(sym, true);
    return true;
  }

  const decls = sym.getDeclarations();
  if (!decls) return false;

  for (const decl of decls) {
    if (!ts.isClassDeclaration(decl)) continue;
    for (const heritage of decl.heritageClauses ?? []) {
      if (heritage.token !== ts.SyntaxKind.ExtendsKeyword) continue;
      for (const typeNode of heritage.types) {
        const parentType = checker.getTypeAtLocation(typeNode.expression);
        const parentSym = parentType.getSymbol();
        if (!parentSym) continue;
        if (walkClass(parentSym, checker, rootNames, result, memo)) {
          result.add(sym.name);
          memo.set(sym, true);
          return true;
        }
      }
    }
  }

  return false;
}

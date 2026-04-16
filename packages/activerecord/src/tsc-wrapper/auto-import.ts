import ts from "typescript";
import * as path from "node:path";
import { walk, type ClassInfo, type AssociationCall } from "../type-virtualization/walker.js";
import { resolveAssociationTarget } from "../type-virtualization/resolve-target.js";

/**
 * For each file being virtualized, compute the set of target class
 * names referenced by association calls that are NOT already in scope,
 * look them up in the model registry, and return `import type` lines
 * to prepend.
 */
export function resolveAutoImports(
  originalText: string,
  fileName: string,
  modelRegistry: ReadonlyMap<string, string>,
  baseNames?: readonly string[],
): string[] {
  const sf = ts.createSourceFile(fileName, originalText, ts.ScriptTarget.ES2022, true);
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

  // Sort for determinism — iteration order of `neededNames` depends
  // on association discovery order, which shouldn't affect the
  // virtualized text / line deltas.
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
      const assocCall = call as AssociationCall;
      // Polymorphic belongsTo emits `Base` (not a user class) in
      // `synthesize.ts`, so auto-injecting `import type { <Target> }`
      // would be unused and can trigger noUnusedLocals/lint errors
      // in user projects.
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
      // Any local import binding (default, named, OR namespace)
      // suppresses auto-import generation for the same name. Even
      // though `import * as X from "..."` binds `X` as a namespace
      // (not a type-namespace binding that can satisfy the association
      // target type), auto-injecting `import type { X }` next to it
      // would produce a duplicate-identifier error, which is worse
      // than the user-fixable "can't use namespace as type" diagnostic.
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

    // Only type-namespace declarations suppress auto-imports. Value-
    // only declarations (functions, variables) don't introduce types.
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
  const fromDir = path.dirname(fromFile);
  let rel = path.relative(fromDir, toFile);
  // Normalize Windows backslashes to POSIX forward slashes.
  rel = rel.replace(/\\/g, "/");
  // Ensure it starts with ./ or ../
  if (!rel.startsWith(".")) rel = "./" + rel;
  // Replace .ts extension with .js for ESM TypeScript imports
  rel = rel.replace(/\.tsx?$/, ".js");
  return rel;
}

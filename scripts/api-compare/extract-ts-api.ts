#!/usr/bin/env npx tsx
/**
 * Extracts the public API surface from our TypeScript packages.
 * Uses the TypeScript Compiler API.
 * Outputs output/ts-api.json
 */

import * as ts from "typescript";
import * as path from "path";
import * as fs from "fs";
import type { ApiManifest, PackageInfo, ClassInfo, MethodInfo, ParamInfo } from "./types.js";
import { ROOT_DIR, OUTPUT_DIR, PACKAGES, PACKAGE_DIR_OVERRIDES, packageSrcDir } from "./config.js";

function main() {
  const manifest: ApiManifest = {
    source: "typescript",
    generatedAt: new Date().toISOString(),
    packages: {},
  };

  for (const pkg of PACKAGES) {
    const pkgDir = packageSrcDir(pkg);
    manifest.packages[pkg] = extractPackage(pkg, pkgDir);
  }

  // Print summary
  for (const [pkg, data] of Object.entries(manifest.packages)) {
    const classCount = Object.keys(data.classes).length;
    const moduleCount = Object.keys(data.modules).length;
    let methodCount = 0;
    for (const cls of Object.values(data.classes)) {
      methodCount += cls.instanceMethods.length + cls.classMethods.length;
    }
    console.log(
      `  ${pkg}: ${classCount} classes, ${moduleCount} modules, ${methodCount} public methods`,
    );
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, "ts-api.json");
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
  console.log(`\nWritten to ${outputPath}`);
}

interface PendingReExport {
  fromFile: string; // relative path of the file that re-exports
  localName: string; // name exposed by `fromFile`
  sourceName: string; // original name in the source module
  moduleSpecifier: string; // e.g. "./migration-errors.js"
}

function extractPackage(pkgName: string, srcDir: string): PackageInfo {
  const files = getAllTsFiles(srcDir);
  const info: PackageInfo = { classes: {}, modules: {}, fileFunctions: {} };
  const pendingReExports: PendingReExport[] = [];

  // Create a TypeScript program
  const dirName = PACKAGE_DIR_OVERRIDES[pkgName] ?? pkgName;
  const tsConfigPath = path.join(ROOT_DIR, "packages", dirName, "tsconfig.json");
  let compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    esModuleInterop: true,
    declaration: true,
    skipLibCheck: true,
  };

  if (fs.existsSync(tsConfigPath)) {
    const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
    if (configFile.config) {
      const parsed = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(tsConfigPath),
      );
      compilerOptions = { ...compilerOptions, ...parsed.options };
    }
  }

  const program = ts.createProgram(files, compilerOptions);
  const checker = program.getTypeChecker();

  for (const sourceFile of program.getSourceFiles()) {
    const filePath = sourceFile.fileName;
    // Only process our source files (not node_modules or test files)
    if (!filePath.startsWith(srcDir)) continue;
    if (filePath.endsWith(".test.ts")) continue;
    if (filePath.endsWith(".d.ts")) continue;

    // POSIX-normalize relPath so manifest keys are platform-stable.
    // Windows path.relative() yields backslashes; api-compare keys —
    // and resolveRelModule below — assume forward slashes.
    const relPath = path.relative(srcDir, filePath).replace(/\\/g, "/");
    let fileHasClassOrModule = false;
    const fileFunctions: MethodInfo[] = [];
    // Local-name → source-module map for this file, used to resolve the
    // two-step re-export pattern (`import { X } ...; export { X };`).
    const localImports = new Map<string, { sourceName: string; moduleSpecifier: string }>();

    ts.forEachChild(sourceFile, (node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        if (!isExported(node)) return;
        const classInfo = extractClass(node, checker, relPath);
        if (classInfo) {
          const classKey = `${relPath}:${classInfo.name}`;
          info.classes[classKey] = classInfo;
          fileHasClassOrModule = true;
        }
      } else if (ts.isInterfaceDeclaration(node) && node.name) {
        if (!isExported(node)) return;
        const name = node.name.text;
        const modKey = `${relPath}:${name}`;
        const extracted = extractInterface(node, checker, relPath);
        const existing = info.modules[modKey];
        if (existing) {
          // Merge declaration-merged interfaces (same name, same file)
          const existingNames = new Set(existing.instanceMethods.map((m) => m.name));
          for (const m of extracted.instanceMethods) {
            if (!existingNames.has(m.name)) existing.instanceMethods.push(m);
          }
          for (const e of extracted.extends) {
            if (!existing.extends.includes(e)) existing.extends.push(e);
          }
        } else {
          info.modules[modKey] = extracted;
        }
        fileHasClassOrModule = true;
      } else if (ts.isModuleDeclaration(node) && node.name) {
        if (!isExported(node)) return;
        const name = node.name.text;
        const modKey = `${relPath}:${name}`;
        info.modules[modKey] = extractNamespace(node, checker, relPath);
        fileHasClassOrModule = true;
      } else if (ts.isExportDeclaration(node)) {
        // Handle `export * as Foo from "./bar.js"` — namespace re-exports
        // Only record if not already defined by an interface/namespace declaration
        if (node.exportClause && ts.isNamespaceExport(node.exportClause)) {
          const name = node.exportClause.name.text;
          const modKey = `${relPath}:${name}`;
          if (info.modules[modKey]) return;
          info.modules[modKey] = {
            name,
            file: relPath,
            includes: [],
            extends: [],
            instanceMethods: [],
            classMethods: [],
          };
          fileHasClassOrModule = true;
        } else if (
          node.exportClause &&
          ts.isNamedExports(node.exportClause) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier)
        ) {
          // Handle `export { X, Y } from "./z.js"` — single-step named
          // re-exports. Record each re-exported name as "pending" keyed
          // under this file's relPath; resolved in a post-pass once
          // every file has been walked (the source file may come later
          // in the list).
          for (const spec of node.exportClause.elements) {
            const localName = spec.name.text;
            const sourceName = spec.propertyName?.text ?? localName;
            pendingReExports.push({
              fromFile: relPath,
              localName,
              sourceName,
              moduleSpecifier: node.moduleSpecifier.text,
            });
          }
        } else if (
          node.exportClause &&
          ts.isNamedExports(node.exportClause) &&
          !node.moduleSpecifier
        ) {
          // Handle the two-step pattern:
          //   import { X } from "./y.js";
          //   export { X };
          // Look up each exported name in localImports (built during
          // the same forEachChild pass) to recover the source module.
          for (const spec of node.exportClause.elements) {
            const localName = spec.name.text;
            const sourceName = spec.propertyName?.text ?? localName;
            const imported = localImports.get(sourceName);
            if (!imported) continue;
            pendingReExports.push({
              fromFile: relPath,
              localName,
              sourceName: imported.sourceName,
              moduleSpecifier: imported.moduleSpecifier,
            });
          }
        }
      } else if (ts.isImportDeclaration(node)) {
        // Track local imports so the two-step re-export branch above
        // can resolve `export { X };` back to its source module.
        if (
          node.importClause?.namedBindings &&
          ts.isNamedImports(node.importClause.namedBindings) &&
          ts.isStringLiteral(node.moduleSpecifier)
        ) {
          const spec = node.moduleSpecifier.text;
          if (spec.startsWith("./") || spec.startsWith("../")) {
            for (const el of node.importClause.namedBindings.elements) {
              const localName = el.name.text;
              const sourceName = el.propertyName?.text ?? localName;
              localImports.set(localName, { sourceName, moduleSpecifier: spec });
            }
          }
        }
      } else if (ts.isFunctionDeclaration(node) && node.name && isExported(node)) {
        const line = node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1;
        fileFunctions.push({
          name: node.name.text,
          visibility: "public",
          params: extractParameters(node.parameters),
          isStatic: false,
          line,
          file: relPath,
        });
      }
    });

    // Extract members from mixin functions that return a class (constructor type).
    // e.g., `export function Attributes<T>(Base: T) { class M { constructor(); get attributes() {} } return M; }`
    // The inner class is invisible to the top-level walker, but TypeScript's return
    // type inference gives us access to its members.
    ts.forEachChild(sourceFile, (node) => {
      if (!ts.isFunctionDeclaration(node) || !node.name || !isExported(node)) return;
      const sig = checker.getSignatureFromDeclaration(node);
      if (!sig) return;
      const returnType = checker.getReturnTypeOfSignature(sig);
      const constructSigs = returnType.getConstructSignatures();
      if (constructSigs.length === 0) return;

      const instanceType = constructSigs[0].getReturnType();
      const mixinKey = `${relPath}:${node.name.text}__mixin`;
      const mixinMethods: MethodInfo[] = [];

      for (const prop of instanceType.getProperties()) {
        if (prop.name.startsWith("#")) continue;
        if (prop.flags & ts.SymbolFlags.Prototype) continue;
        const decl = prop.valueDeclaration ?? prop.declarations?.[0];
        if (!decl) continue;
        if (hasModifier(decl, ts.SyntaxKind.PrivateKeyword)) continue;
        if (hasModifier(decl, ts.SyntaxKind.ProtectedKeyword)) continue;
        const line = decl.getSourceFile().getLineAndCharacterOfPosition(decl.getStart()).line + 1;
        mixinMethods.push({
          name: prop.name,
          visibility: "public",
          params: [],
          isStatic: false,
          line,
          file: relPath,
        });
      }

      // Add constructor
      if (constructSigs.length > 0) {
        mixinMethods.push({
          name: "constructor",
          visibility: "public",
          params: [],
          isStatic: false,
          line: node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1,
          file: relPath,
        });
      }

      if (mixinMethods.length > 0) {
        info.modules[mixinKey] = {
          name: `${node.name.text}__mixin`,
          file: relPath,
          includes: [],
          extends: [],
          instanceMethods: mixinMethods,
          classMethods: [],
        };
        fileHasClassOrModule = true;
      }
    });

    // Also capture functions exported via `export { foo, bar }` (named export lists).
    // Resolve aliases so ExportSpecifier nodes reach the underlying FunctionDeclaration.
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (moduleSymbol) {
      const exports = checker.getExportsOfModule(moduleSymbol);
      for (const sym of exports) {
        // Keep _-prefixed exports — Rails has public methods like _load_from, _reflect_on_association
        if (fileFunctions.some((f) => f.name === sym.name)) continue;
        const resolved = sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
        const decl = resolved.valueDeclaration ?? resolved.declarations?.[0];
        if (decl && decl.getSourceFile() === sourceFile) {
          let params: ParamInfo[] = [];
          let isFunctionLike = false;

          if (ts.isFunctionDeclaration(decl)) {
            isFunctionLike = true;
            params = extractParameters(decl.parameters);
          } else if (ts.isVariableDeclaration(decl) && decl.initializer) {
            const init = decl.initializer;
            if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
              isFunctionLike = true;
              params = extractParameters(init.parameters);
            } else {
              // Handle `export const foo = existingFunction` aliases
              const type = checker.getTypeAtLocation(init);
              const signatures = type.getCallSignatures();
              if (signatures.length > 0) {
                isFunctionLike = true;
                const sigDecl = signatures[0].declaration;
                if (sigDecl && ts.isFunctionLike(sigDecl)) {
                  params = extractParameters(sigDecl.parameters);
                }
              }
            }
          }

          if (isFunctionLike) {
            const line =
              decl.getSourceFile().getLineAndCharacterOfPosition(decl.getStart()).line + 1;
            fileFunctions.push({
              name: sym.name,
              visibility: "public",
              params,
              isStatic: false,
              line,
              file: relPath,
            });
          }
        }
      }
    }

    // Always record file-level functions so compare.ts can match methods
    // against the file regardless of whether a class/interface wrapper exists.
    if (fileFunctions.length > 0) {
      info.fileFunctions[relPath] = fileFunctions;
    }

    // If a file has exported functions but no class/interface/namespace,
    // also create a module entry from the file name for backward compat.
    if (!fileHasClassOrModule && fileFunctions.length > 0) {
      const baseName = path.basename(relPath, ".ts");
      const moduleName = baseName
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("");
      const autoModKey = `${relPath}:${moduleName}`;
      if (!info.modules[autoModKey] && !info.classes[autoModKey]) {
        info.modules[autoModKey] = {
          name: moduleName,
          file: relPath,
          includes: [],
          extends: [],
          instanceMethods: fileFunctions,
          classMethods: [],
        };
      }
    }
  }

  // Post-pass: resolve named re-exports. For each `export { X } from
  // "./y.js"`, if ./y.js defined `X` (and we haven't already registered
  // `fromFile:X` via a local declaration), clone the class entry under
  // the re-exporting file's path so api-compare sees the class where
  // Rails expects it.
  for (const re of pendingReExports) {
    const key = `${re.fromFile}:${re.localName}`;
    if (info.classes[key] || info.modules[key]) continue;
    const targetRel = resolveRelModule(re.fromFile, re.moduleSpecifier);
    if (!targetRel) continue;
    const sourceKey = `${targetRel}:${re.sourceName}`;
    const sourceClass = info.classes[sourceKey];
    if (sourceClass) {
      info.classes[key] = { ...sourceClass, name: re.localName, file: re.fromFile };
      continue;
    }
    const sourceModule = info.modules[sourceKey];
    if (sourceModule) {
      info.modules[key] = { ...sourceModule, name: re.localName, file: re.fromFile };
    }
  }

  return info;
}

/**
 * Resolve a relative module specifier (e.g. "./migration-errors.js")
 * against a file's relative path. Returns the resolved file's path
 * in the same POSIX-normalized form used as PackageInfo keys, or
 * null if the specifier doesn't target a local file. Caller must
 * already have POSIX-normalized `fromRel`.
 */
export function resolveRelModule(fromRel: string, spec: string): string | null {
  if (!spec.startsWith("./") && !spec.startsWith("../")) return null;
  const fromDir = path.posix.dirname(fromRel);
  // Strip .js / .ts extension; api-compare keys use .ts paths.
  const withoutExt = spec.replace(/\.(js|ts)$/, "");
  return path.posix.normalize(path.posix.join(fromDir, withoutExt)) + ".ts";
}

function extractClass(
  node: ts.ClassDeclaration,
  checker: ts.TypeChecker,
  file: string,
): ClassInfo | null {
  const name = node.name?.text;
  if (!name) return null;

  let superclass: string | undefined;
  if (node.heritageClauses) {
    for (const clause of node.heritageClauses) {
      if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
        superclass = clause.types[0]?.expression.getText();
      }
    }
  }

  const instanceMethods: MethodInfo[] = [];
  const classMethods: MethodInfo[] = [];
  const includes: string[] = [];
  const extendsArr: string[] = [];

  if (node.heritageClauses) {
    for (const clause of node.heritageClauses) {
      if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
        for (const type of clause.types) {
          includes.push(type.expression.getText());
        }
      }
    }
  }

  for (const member of node.members) {
    // Skip private/protected members
    if (hasModifier(member, ts.SyntaxKind.PrivateKeyword)) continue;
    if (hasModifier(member, ts.SyntaxKind.ProtectedKeyword)) continue;
    const memberName = getMemberName(member);
    // Skip _-prefixed non-method members (backing fields), but keep _-prefixed methods
    // since Rails has public methods like _load_from, _reflect_on_association, etc.
    if (
      memberName?.startsWith("_") &&
      !ts.isMethodDeclaration(member) &&
      !ts.isGetAccessorDeclaration(member) &&
      !ts.isSetAccessorDeclaration(member)
    )
      continue;

    const isStatic = hasModifier(member, ts.SyntaxKind.StaticKeyword);
    const line = member.getSourceFile().getLineAndCharacterOfPosition(member.getStart()).line + 1;

    if (ts.isMethodDeclaration(member) && memberName) {
      const params = extractParameters(member.parameters);
      const method: MethodInfo = {
        name: memberName,
        visibility: "public",
        params,
        line,
        file,
        isStatic,
      };
      if (isStatic) {
        classMethods.push(method);
      } else {
        instanceMethods.push(method);
      }
    } else if (ts.isConstructorDeclaration(member)) {
      const params = extractParameters(member.parameters);
      instanceMethods.push({
        name: "constructor",
        visibility: "public",
        params,
        line,
        file,
      });
    } else if (ts.isGetAccessorDeclaration(member) && memberName) {
      const method: MethodInfo = {
        name: memberName,
        visibility: "public",
        params: [],
        line,
        file,
        isStatic,
      };
      if (isStatic) {
        classMethods.push(method);
      } else {
        instanceMethods.push(method);
      }
    } else if (ts.isSetAccessorDeclaration(member) && memberName) {
      const params = extractParameters(member.parameters);
      const method: MethodInfo = {
        name: memberName,
        visibility: "public",
        params,
        line,
        file,
        isStatic,
      };
      if (isStatic) {
        classMethods.push(method);
      } else {
        instanceMethods.push(method);
      }
    } else if (ts.isPropertyDeclaration(member) && memberName) {
      // Public properties are like attr_reader/attr_accessor
      // Only record them if they're not readonly (readonly = getter only conceptually)
      const method: MethodInfo = {
        name: memberName,
        visibility: "public",
        params: [],
        line,
        file,
        isStatic,
      };
      if (isStatic) {
        classMethods.push(method);
      } else {
        instanceMethods.push(method);
      }
    }
  }

  return {
    name,
    superclass,
    file,
    includes,
    extends: extendsArr,
    instanceMethods,
    classMethods,
  };
}

function extractInterface(
  node: ts.InterfaceDeclaration,
  checker: ts.TypeChecker,
  file: string,
): ClassInfo {
  const name = node.name.text;
  const instanceMethods: MethodInfo[] = [];
  const extendsArr: string[] = [];

  if (node.heritageClauses) {
    for (const clause of node.heritageClauses) {
      if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
        for (const type of clause.types) {
          const exprText = type.expression.getText();
          extendsArr.push(exprText);

          // Resolve mapped/generic types (e.g. Included<typeof X>) via
          // the type checker so their computed properties appear as methods.
          try {
            const resolved = checker.getTypeAtLocation(type);
            for (const prop of resolved.getProperties()) {
              const propName = prop.getName();
              // Keep _-prefixed properties — Rails has public methods like _reflect_on_association
              const propType = checker.getTypeOfSymbolAtLocation(prop, type);
              const signatures = propType.getCallSignatures();
              if (signatures.length > 0) {
                instanceMethods.push({
                  name: propName,
                  visibility: "public",
                  params: [],
                  line: 0,
                  file,
                });
              }
            }
          } catch {
            // If type resolution fails, fall back to extends-based resolution
          }
        }
      }
    }
  }

  for (const member of node.members) {
    const memberName = member.name && ts.isIdentifier(member.name) ? member.name.text : undefined;
    if (!memberName) continue;

    const line = member.getSourceFile().getLineAndCharacterOfPosition(member.getStart()).line + 1;

    if (ts.isMethodSignature(member)) {
      instanceMethods.push({
        name: memberName,
        visibility: "public",
        params: member.parameters ? extractParameters(member.parameters) : [],
        line,
        file,
      });
    }
  }

  return {
    name,
    file,
    includes: [],
    extends: extendsArr,
    instanceMethods,
    classMethods: [],
  };
}

function extractNamespace(
  node: ts.ModuleDeclaration,
  checker: ts.TypeChecker,
  file: string,
): ClassInfo {
  const name = node.name.text;
  const instanceMethods: MethodInfo[] = [];

  if (node.body && ts.isModuleBlock(node.body)) {
    for (const stmt of node.body.statements) {
      if (ts.isFunctionDeclaration(stmt) && stmt.name && isExported(stmt)) {
        const line = stmt.getSourceFile().getLineAndCharacterOfPosition(stmt.getStart()).line + 1;
        instanceMethods.push({
          name: stmt.name.text,
          visibility: "public",
          params: extractParameters(stmt.parameters),
          line,
          file,
        });
      } else if (ts.isVariableStatement(stmt) && isExported(stmt)) {
        const line = stmt.getSourceFile().getLineAndCharacterOfPosition(stmt.getStart()).line + 1;
        for (const decl of stmt.declarationList.declarations) {
          if (!ts.isIdentifier(decl.name)) continue;
          const init = decl.initializer;
          let params: ParamInfo[] = [];
          let isFunctionLike = false;
          if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
            isFunctionLike = true;
            params = extractParameters(init.parameters);
          } else if (init) {
            const type = checker.getTypeAtLocation(init);
            const signatures = type.getCallSignatures();
            if (signatures.length > 0) {
              isFunctionLike = true;
              const sigDecl = signatures[0].declaration;
              if (sigDecl && ts.isFunctionLike(sigDecl)) {
                params = extractParameters(sigDecl.parameters);
              }
            }
          }
          if (isFunctionLike) {
            instanceMethods.push({
              name: decl.name.text,
              visibility: "public",
              params,
              line,
              file,
            });
          }
        }
      }
    }
  }

  return {
    name,
    file,
    includes: [],
    extends: [],
    instanceMethods,
    classMethods: [],
  };
}

function extractParameters(params: ts.NodeArray<ts.ParameterDeclaration>): ParamInfo[] {
  return params.map((p) => {
    const name = p.name.getText();
    let kind: ParamInfo["kind"] = "required";
    if (p.dotDotDotToken) {
      kind = "rest";
    } else if (p.questionToken || p.initializer) {
      kind = "optional";
    }
    const result: ParamInfo = { name, kind };
    if (p.initializer) {
      result.default = "...";
    }
    return result;
  });
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some((m) => m.kind === kind) ?? false;
}

function getMemberName(member: ts.ClassElement): string | undefined {
  if (member.name) {
    if (ts.isIdentifier(member.name)) {
      return member.name.text;
    }
    if (ts.isStringLiteral(member.name)) {
      return member.name.text;
    }
    if (ts.isComputedPropertyName(member.name)) {
      return member.name.getText();
    }
  }
  return undefined;
}

function isExported(node: ts.Node): boolean {
  return hasModifier(node, ts.SyntaxKind.ExportKeyword);
}

function getAllTsFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllTsFiles(fullPath));
    } else if (
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".d.ts")
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

// Only run when invoked as a script (not when imported for its
// exports by the test file). fileURLToPath + argv[1] is the common
// ESM "if __main__" pattern; resolve argv[1] first so the guard
// works regardless of whether the caller passed a relative path or
// went through a wrapper (matches the pattern in
// scripts/guides-typecheck/check.ts).
import { fileURLToPath as _fileURLToPath } from "node:url";
if (process.argv[1] && path.resolve(process.argv[1]) === _fileURLToPath(import.meta.url)) {
  main();
}

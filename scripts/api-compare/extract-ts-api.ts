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

function extractPackage(pkgName: string, srcDir: string): PackageInfo {
  const files = getAllTsFiles(srcDir);
  const info: PackageInfo = { classes: {}, modules: {}, fileFunctions: {} };

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

    const relPath = path.relative(srcDir, filePath);
    let fileHasClassOrModule = false;
    const fileFunctions: MethodInfo[] = [];

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
        info.modules[modKey] = extractInterface(node, relPath);
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

    // Also capture functions exported via `export { foo, bar }` (named export lists).
    // Resolve aliases so ExportSpecifier nodes reach the underlying FunctionDeclaration.
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (moduleSymbol) {
      const exports = checker.getExportsOfModule(moduleSymbol);
      for (const sym of exports) {
        if (sym.name.startsWith("_")) continue;
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

  return info;
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
    // Skip private/protected and _-prefixed members
    if (hasModifier(member, ts.SyntaxKind.PrivateKeyword)) continue;
    if (hasModifier(member, ts.SyntaxKind.ProtectedKeyword)) continue;
    const memberName = getMemberName(member);
    if (memberName?.startsWith("_")) continue;

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

function extractInterface(node: ts.InterfaceDeclaration, file: string): ClassInfo {
  const name = node.name.text;
  const instanceMethods: MethodInfo[] = [];
  const extendsArr: string[] = [];

  if (node.heritageClauses) {
    for (const clause of node.heritageClauses) {
      if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
        for (const type of clause.types) {
          extendsArr.push(type.expression.getText());
        }
      }
    }
  }

  for (const member of node.members) {
    const memberName = member.name && ts.isIdentifier(member.name) ? member.name.text : undefined;
    if (!memberName || memberName.startsWith("_")) continue;

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

main();

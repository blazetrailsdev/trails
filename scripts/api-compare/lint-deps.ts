#!/usr/bin/env npx tsx
/**
 * Cross-package dependency lint.
 *
 * For each Rails method that uses a sibling package (e.g., ActiveRecord → Arel),
 * checks whether the corresponding TypeScript method also uses it. Reports a
 * score and per-file details, similar to api:compare.
 *
 * Usage:
 *   npx tsx scripts/api-compare/lint-deps.ts [--package activerecord] [--dep arel]
 */

import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import type { ApiManifest, ClassInfo } from "./types.js";
import { OUTPUT_DIR, packageSrcDir } from "./config.js";
import { rubyFileToTs, rubyMethodToTs } from "./conventions.js";

// ---------------------------------------------------------------------------
// Dependency rules — add new entries to extend to other packages
// ---------------------------------------------------------------------------

interface DepRule {
  package: string;
  dependency: string;
  tsImport: string;
  tsIdentifiers: string[];
}

const RULES: DepRule[] = [
  {
    package: "activerecord",
    dependency: "arel",
    tsImport: "@blazetrails/arel",
    tsIdentifiers: ["arelTable", "_compileArelNode"],
  },
  {
    package: "activerecord",
    dependency: "activemodel",
    tsImport: "@blazetrails/activemodel",
    tsIdentifiers: [],
  },
];

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };
  return {
    filterPkg: get("--package") ?? null,
    filterDep: get("--dep") ?? null,
  };
}

// ---------------------------------------------------------------------------
// Ruby manifest: collect methods that use a given dependency
// ---------------------------------------------------------------------------

interface RubyDepMethod {
  rubyName: string;
  rubyModule: string;
  rubyFile: string;
  depRefs: string[];
}

function collectRubyDepMethods(ruby: ApiManifest, pkg: string, dep: string): RubyDepMethod[] {
  const rubyPkg = ruby.packages[pkg];
  if (!rubyPkg) return [];

  const results: RubyDepMethod[] = [];
  const seen = new Set<string>();

  const scan = (entities: Record<string, unknown>) => {
    for (const [fqn, raw] of Object.entries(entities)) {
      const info = raw as ClassInfo;

      for (const m of [...info.instanceMethods, ...info.classMethods]) {
        if (m.deps?.includes(dep)) {
          const key = `${fqn}:${m.file || info.file}:${m.name}`;
          if (seen.has(key)) continue;
          seen.add(key);
          results.push({
            rubyName: m.name,
            rubyModule: fqn,
            rubyFile: m.file || info.file || "",
            depRefs: m.depRefs?.[dep] || [],
          });
        }
      }
    }
  };
  scan(rubyPkg.classes);
  scan(rubyPkg.modules);
  return results;
}

// ---------------------------------------------------------------------------
// TS analysis: detect dependency usage per method
// ---------------------------------------------------------------------------

type TsDepMap = Map<string, Map<string, boolean>>; // file -> method -> usesDep

function analyzeTsDepUsage(pkgSrcDir: string, tsImport: string, tsIdentifiers: string[]): TsDepMap {
  const result: TsDepMap = new Map();
  const allFiles = getAllTsFiles(pkgSrcDir);
  if (allFiles.length === 0) return result;

  const program = ts.createProgram(allFiles, {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    noEmit: true,
  });

  const knownIds = new Set(tsIdentifiers);

  for (const sourceFile of program.getSourceFiles()) {
    if (!sourceFile.fileName.startsWith(pkgSrcDir)) continue;
    if (sourceFile.fileName.endsWith(".test.ts")) continue;
    if (sourceFile.fileName.endsWith(".d.ts")) continue;

    const relPath = path.relative(pkgSrcDir, sourceFile.fileName);

    // Collect import bindings from the target package
    const importedNames = new Set<string>();
    for (const stmt of sourceFile.statements) {
      if (!ts.isImportDeclaration(stmt)) continue;
      const specifier = (stmt.moduleSpecifier as ts.StringLiteral).text;
      if (specifier !== tsImport) continue;
      const clause = stmt.importClause;
      if (!clause) continue;
      if (clause.name) importedNames.add(clause.name.text);
      if (clause.namedBindings) {
        if (ts.isNamedImports(clause.namedBindings)) {
          for (const el of clause.namedBindings.elements) {
            importedNames.add(el.name.text);
          }
        } else if (ts.isNamespaceImport(clause.namedBindings)) {
          importedNames.add(clause.namedBindings.name.text);
        }
      }
    }

    // Check each method's signature and body for dependency references.
    const methodMap = new Map<string, boolean>();
    visitMethodDeclarations(sourceFile, (name, methodNode) => {
      const uses = methodUsesDepImport(methodNode, importedNames, knownIds);
      const existing = methodMap.get(name);
      if (existing === undefined || uses) methodMap.set(name, uses);
    });
    if (methodMap.size > 0) result.set(relPath, methodMap);
  }

  return result;
}

function visitMethodDeclarations(
  sourceFile: ts.SourceFile,
  callback: (name: string, node: ts.Node) => void,
) {
  const visit = (node: ts.Node) => {
    if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
      callback(node.name.text, node);
      return;
    }
    if (ts.isGetAccessorDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
      callback(node.name.text, node);
      return;
    }
    if (ts.isSetAccessorDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
      callback(node.name.text, node);
      return;
    }
    if (ts.isConstructorDeclaration(node)) {
      callback("constructor", node);
      return;
    }
    if (ts.isFunctionDeclaration(node) && node.name) {
      callback(node.name.text, node);
      return;
    }
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer) {
          if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
            callback(decl.name.text, decl.initializer);
          }
        }
      }
      return;
    }
    if (ts.isPropertyDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
      if (
        node.initializer &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
      ) {
        callback(node.name.text, node.initializer);
        return;
      }
    }

    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
}

function methodUsesDepImport(
  node: ts.Node,
  importedNames: Set<string>,
  knownIdentifiers: Set<string>,
): boolean {
  // Check the entire method declaration: parameter types, return type, and body.
  // Skip identifiers in declaration name positions (param names, method names)
  // to avoid false positives from names that happen to match import names.
  let found = false;
  const check = (n: ts.Node) => {
    if (found) return;
    if (ts.isIdentifier(n)) {
      if (isDeclarationName(n)) return;
      if (importedNames.has(n.text) || knownIdentifiers.has(n.text)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(n, check);
  };
  check(node);
  return found;
}

function isDeclarationName(id: ts.Identifier): boolean {
  const parent = id.parent;
  if (!parent) return false;
  if (ts.isParameter(parent) && parent.name === id) return true;
  if (ts.isMethodDeclaration(parent) && parent.name === id) return true;
  if (ts.isFunctionDeclaration(parent) && parent.name === id) return true;
  if (ts.isVariableDeclaration(parent) && parent.name === id) return true;
  if (ts.isPropertyDeclaration(parent) && parent.name === id) return true;
  if (ts.isGetAccessorDeclaration(parent) && parent.name === id) return true;
  if (ts.isSetAccessorDeclaration(parent) && parent.name === id) return true;
  if (ts.isTypeParameterDeclaration(parent) && parent.name === id) return true;
  return false;
}

function getAllTsFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (
        entry.name.endsWith(".ts") &&
        !entry.name.endsWith(".test.ts") &&
        !entry.name.endsWith(".d.ts")
      )
        results.push(full);
    }
  };
  walk(dir);
  return results;
}

// ---------------------------------------------------------------------------
// Cross-reference
// ---------------------------------------------------------------------------

interface Violation {
  rubyFile: string;
  tsFile: string;
  rubyMethod: string;
  tsMethod: string;
  rubyModule: string;
  depRefs: string[];
}

interface Compliant {
  rubyFile: string;
  tsFile: string;
  rubyMethod: string;
  tsMethod: string;
  rubyModule: string;
}

interface Unmatched {
  rubyFile: string;
  rubyMethod: string;
  rubyModule: string;
}

function crossReference(
  rubyMethods: RubyDepMethod[],
  tsDepMap: TsDepMap,
): { violations: Violation[]; compliant: Compliant[]; unmatched: Unmatched[] } {
  const violations: Violation[] = [];
  const compliant: Compliant[] = [];
  const unmatched: Unmatched[] = [];
  const seen = new Set<string>();

  for (const rm of rubyMethods) {
    const tsCandidates = rubyMethodToTs(rm.rubyName);
    if (!tsCandidates) continue;

    const tsFile = rubyFileToTs(rm.rubyFile);
    const dedupeKey = `${tsFile}:${tsCandidates[0]}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const fileMethods = tsDepMap.get(tsFile);
    if (!fileMethods) {
      unmatched.push({
        rubyFile: rm.rubyFile,
        rubyMethod: rm.rubyName,
        rubyModule: rm.rubyModule,
      });
      continue;
    }

    let matchedTsName: string | null = null;
    let uses = false;
    for (const candidate of tsCandidates) {
      if (fileMethods.has(candidate)) {
        matchedTsName = candidate;
        uses = fileMethods.get(candidate)!;
        break;
      }
    }

    if (!matchedTsName) {
      unmatched.push({
        rubyFile: rm.rubyFile,
        rubyMethod: rm.rubyName,
        rubyModule: rm.rubyModule,
      });
      continue;
    }

    const entry = {
      rubyFile: rm.rubyFile,
      tsFile,
      rubyMethod: rm.rubyName,
      tsMethod: matchedTsName,
      rubyModule: rm.rubyModule,
    };
    if (uses) compliant.push(entry);
    else violations.push({ ...entry, depRefs: rm.depRefs });
  }

  return { violations, compliant, unmatched };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

interface LintResult {
  rule: DepRule;
  violations: Violation[];
  compliant: Compliant[];
  unmatched: Unmatched[];
}

function printReport(results: LintResult[]) {
  for (const { rule, violations, compliant, unmatched } of results) {
    const total = violations.length + compliant.length;
    const pct = total > 0 ? Math.round((compliant.length / total) * 1000) / 10 : 100;

    console.log(`\nDependency Lint -- ${rule.package} -> ${rule.dependency}`);
    console.log("=".repeat(60));

    const violationsByFile = new Map<string, Violation[]>();
    for (const v of violations) {
      const list = violationsByFile.get(v.tsFile) || [];
      list.push(v);
      violationsByFile.set(v.tsFile, list);
    }

    const compliantByFile = new Map<string, Compliant[]>();
    for (const c of compliant) {
      const list = compliantByFile.get(c.tsFile) || [];
      list.push(c);
      compliantByFile.set(c.tsFile, list);
    }

    const allFiles = new Set([...violationsByFile.keys(), ...compliantByFile.keys()]);
    for (const f of [...allFiles].sort()) {
      const fv = violationsByFile.get(f) || [];
      const fc = compliantByFile.get(f) || [];
      if (fv.length === 0) continue;

      console.log(`\n  ${f}`);
      for (const v of fv) {
        const refs = v.depRefs.slice(0, 3).join(", ");
        console.log(`    \u2717 ${v.tsMethod} -- Rails uses ${rule.dependency} (${refs})`);
      }
      for (const c of fc) {
        console.log(`    \u2713 ${c.tsMethod}`);
      }
    }

    console.log(`\n  ${compliant.length}/${total} methods use ${rule.dependency} (${pct}%)`);
    if (violations.length > 0) {
      console.log(`  ${violations.length} methods need ${rule.dependency} migration`);
    }
    if (unmatched.length > 0) {
      console.log(
        `  ${unmatched.length} Rails ${rule.dependency}-using methods not yet implemented in TS`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const { filterPkg, filterDep } = parseArgs();

  const rubyPath = path.join(OUTPUT_DIR, "rails-api.json");
  if (!fs.existsSync(rubyPath)) {
    console.error("Missing rails-api.json -- run extract-ruby-api.rb first");
    process.exit(1);
  }
  const ruby: ApiManifest = JSON.parse(fs.readFileSync(rubyPath, "utf-8"));

  const activeRules = RULES.filter((r) => {
    if (filterPkg && r.package !== filterPkg) return false;
    if (filterDep && r.dependency !== filterDep) return false;
    return true;
  });

  if (activeRules.length === 0) {
    console.error("No matching dependency rules found.");
    console.error("Available rules:");
    for (const r of RULES) {
      console.error(`  --package ${r.package} --dep ${r.dependency}`);
    }
    process.exit(1);
  }

  const allResults: LintResult[] = [];

  for (const rule of activeRules) {
    const rubyMethods = collectRubyDepMethods(ruby, rule.package, rule.dependency);

    const pkgSrcDir = packageSrcDir(rule.package);
    const tsDepMap = analyzeTsDepUsage(pkgSrcDir, rule.tsImport, rule.tsIdentifiers);

    const { violations, compliant, unmatched } = crossReference(rubyMethods, tsDepMap);
    allResults.push({ rule, violations, compliant, unmatched });
  }

  // Write JSON report
  const report = {
    generatedAt: new Date().toISOString(),
    rules: allResults.map(({ rule, violations, compliant, unmatched }) => ({
      package: rule.package,
      dependency: rule.dependency,
      summary: {
        compliant: compliant.length,
        violations: violations.length,
        unmatched: unmatched.length,
        total: violations.length + compliant.length,
        percent:
          violations.length + compliant.length > 0
            ? Math.round((compliant.length / (violations.length + compliant.length)) * 1000) / 10
            : 100,
      },
      violations,
      compliant,
      unmatched,
    })),
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const jsonPath = path.join(OUTPUT_DIR, "dep-lint.json");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  printReport(allResults);

  const totalViolations = allResults.reduce((sum, r) => sum + r.violations.length, 0);
  if (totalViolations > 0) {
    process.exit(1);
  }
}

main();

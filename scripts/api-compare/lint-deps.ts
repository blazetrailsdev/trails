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
import { fileURLToPath } from "url";
import * as ts from "typescript";
import type { ApiManifest, ClassInfo } from "./types.js";
import { OUTPUT_DIR, packageSrcDir } from "./config.js";
import { rubyFileToTs, rubyMethodToTs } from "./conventions.js";
import { isNotImplementedStub } from "./extract-ts-api.js";

// ---------------------------------------------------------------------------
// Dependency rules — add new entries to extend to other packages
// ---------------------------------------------------------------------------

interface DepRule {
  package: string;
  dependency: string;
  tsImport: string;
  tsIdentifiers: string[];
  blocking: boolean;
}

const RULES: DepRule[] = [
  {
    package: "activerecord",
    dependency: "arel",
    tsImport: "@blazetrails/arel",
    tsIdentifiers: ["arelTable", "_arelTable", "_compileArelNode"],
    blocking: true,
  },
  {
    package: "activerecord",
    dependency: "activemodel",
    tsImport: "@blazetrails/activemodel",
    tsIdentifiers: [],
    blocking: true,
  },
  {
    package: "activerecord",
    dependency: "activesupport",
    tsImport: "@blazetrails/activesupport",
    tsIdentifiers: [],
    blocking: false,
  },
  {
    // Rails Arel references ActiveModel::Attribute in nodes/casted.rb,
    // nodes/homogeneous_in.rb, and visitors/{to_sql,dot}.rb.
    package: "arel",
    dependency: "activemodel",
    tsImport: "@blazetrails/activemodel",
    tsIdentifiers: [],
    blocking: false,
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
    showUnmatched: args.includes("--show-unmatched"),
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

interface TsMethodDepInfo {
  uses: boolean;
  refs: Set<string>;
}
type TsDepMap = Map<string, Map<string, TsMethodDepInfo>>; // file -> method -> dep info

function isPkgSourceFile(sf: ts.SourceFile, pkgSrcDir: string): boolean {
  return (
    sf.fileName.startsWith(pkgSrcDir) &&
    !sf.fileName.endsWith(".test.ts") &&
    !sf.fileName.endsWith(".d.ts")
  );
}

export function collectDirectImports(sf: ts.SourceFile, tsImport: string): Set<string> {
  const names = new Set<string>();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const specifier = (stmt.moduleSpecifier as ts.StringLiteral).text;
    if (!isImportFromPackage(specifier, tsImport)) continue;
    const clause = stmt.importClause;
    if (!clause) continue;
    if (clause.name) names.add(clause.name.text);
    if (clause.namedBindings) {
      if (ts.isNamedImports(clause.namedBindings)) {
        for (const el of clause.namedBindings.elements) names.add(el.name.text);
      } else if (ts.isNamespaceImport(clause.namedBindings)) {
        names.add(clause.namedBindings.name.text);
      }
    }
  }
  return names;
}

// Visits every top-level "taint candidate" — a binding whose body or
// initializer could (transitively) use the dep, making the binding
// itself a wrapper that callers should inherit credit from.
//
// Includes non-exported helpers because a same-file caller can still
// reach them, and value-initialized constants (e.g. `const booleanType =
// new BooleanType()`) so that methods referencing the constant by name
// get credited too.
function visitTopLevelTaintCandidates(
  sf: ts.SourceFile,
  callback: (name: ts.Identifier, body: ts.Node, anchor: ts.Node) => void,
) {
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.body) {
      callback(stmt.name, stmt, stmt);
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer) {
          callback(decl.name, decl.initializer, stmt);
        }
      }
    }
  }
}

/**
 * Find top-level functions in the package whose bodies (transitively)
 * reference tsImport. These act as "wrappers" — a method that calls
 * `executionContextId()` should get credit for using activesupport because
 * `executionContextId`'s body calls `getAsyncContext()`.
 *
 * Runs to a fixed point so multi-level wrappers propagate.
 */
export function collectTaintedSymbols(
  program: ts.Program,
  pkgSrcDir: string,
  tsImport: string,
  tsIdentifiers: string[],
  dep: string,
): Set<ts.Symbol> {
  const checker = program.getTypeChecker();
  const knownIds = new Set(tsIdentifiers);
  const tainted = new Set<ts.Symbol>();
  const directCache = new Map<ts.SourceFile, Set<string>>();
  const getDirect = (sf: ts.SourceFile): Set<string> => {
    let s = directCache.get(sf);
    if (!s) {
      s = collectDirectImports(sf, tsImport);
      directCache.set(sf, s);
    }
    return s;
  };

  type Candidate = { sf: ts.SourceFile; name: ts.Identifier; body: ts.Node; anchor: ts.Node };
  const candidates: Candidate[] = [];
  for (const sf of program.getSourceFiles()) {
    if (!isPkgSourceFile(sf, pkgSrcDir)) continue;
    visitTopLevelTaintCandidates(sf, (name, body, anchor) => {
      candidates.push({ sf, name, body, anchor });
    });
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const { sf, name, body, anchor } of candidates) {
      const sym = checker.getSymbolAtLocation(name);
      if (!sym || tainted.has(sym)) continue;
      if (
        methodUsesDepImport(body, getDirect(sf), knownIds, dep, sf, anchor, {
          checker,
          taintedSymbols: tainted,
          // A lint-deps-ignore opt-out should not taint the wrapper —
          // otherwise an "uses raw SQL; no Arel needed" helper would
          // grant credit to every caller and hide real violations.
          skipIgnoreAnnotation: true,
        })
      ) {
        tainted.add(sym);
        changed = true;
      }
    }
  }
  return tainted;
}

function analyzeTsDepUsage(
  pkgSrcDir: string,
  tsImport: string,
  tsIdentifiers: string[],
  dep: string,
): TsDepMap {
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

  const checker = program.getTypeChecker();
  const knownIds = new Set(tsIdentifiers);
  const taintedSymbols = collectTaintedSymbols(program, pkgSrcDir, tsImport, tsIdentifiers, dep);

  for (const sourceFile of program.getSourceFiles()) {
    if (!isPkgSourceFile(sourceFile, pkgSrcDir)) continue;

    // Normalize separators to POSIX so the keys match rubyFileToTs
    // output (which uses path.posix.* for cross-platform stability).
    // Without this, Windows path.relative emits backslashes and the
    // tsDepMap.get(rubyFileToTs(...)) lookup misses.
    const relPath = path.relative(pkgSrcDir, sourceFile.fileName).split(path.sep).join("/");
    const importedNames = collectDirectImports(sourceFile, tsImport);

    const methodMap = new Map<string, TsMethodDepInfo>();
    visitMethodDeclarations(sourceFile, (name, methodNode, anchor) => {
      const refs = new Set<string>();
      const uses = methodUsesDepImport(
        methodNode,
        importedNames,
        knownIds,
        dep,
        sourceFile,
        anchor,
        { checker, taintedSymbols },
        refs,
      );
      const existing = methodMap.get(name);
      if (existing === undefined) {
        methodMap.set(name, { uses, refs });
      } else {
        existing.uses = existing.uses || uses;
        for (const r of refs) existing.refs.add(r);
      }
    });
    if (methodMap.size > 0) result.set(relPath, methodMap);
  }

  return result;
}

function visitMethodDeclarations(
  sourceFile: ts.SourceFile,
  // anchor: the node whose leading trivia holds doc comments (e.g. VariableStatement, not its initializer)
  callback: (name: string, node: ts.Node, anchor: ts.Node) => void,
) {
  const visit = (node: ts.Node) => {
    if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
      callback(node.name.text, node, node);
      return;
    }
    if (ts.isGetAccessorDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
      callback(node.name.text, node, node);
      return;
    }
    if (ts.isSetAccessorDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
      callback(node.name.text, node, node);
      return;
    }
    if (ts.isConstructorDeclaration(node)) {
      callback("constructor", node, node);
      return;
    }
    if (ts.isFunctionDeclaration(node) && node.name) {
      if (!isNotImplementedStub(node.body)) callback(node.name.text, node, node);
      return;
    }
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer) {
          if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
            if (!isNotImplementedStub(decl.initializer.body)) {
              // anchor = VariableStatement so lint-deps-ignore above `const foo = ...` is found
              callback(decl.name.text, decl.initializer, node);
            }
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
        callback(node.name.text, node.initializer, node);
        return;
      }
    }

    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
}

/**
 * Match an import specifier against a package root, including subpath
 * imports (e.g. "@blazetrails/activesupport/message-verifier" matches
 * tsImport "@blazetrails/activesupport"). Requires a "/" boundary so
 * "@blazetrails/activesupporting" does not match "@blazetrails/activesupport".
 */
export function isImportFromPackage(specifier: string, tsImport: string): boolean {
  return specifier === tsImport || specifier.startsWith(tsImport + "/");
}

export function isWithinTypeNode(node: ts.Node): boolean {
  let current = node.parent;
  while (current) {
    if (ts.isTypeNode(current)) return true;
    current = current.parent;
  }
  return false;
}

export function hasLintDepsIgnore(node: ts.Node, dep: string, sourceFile: ts.SourceFile): boolean {
  const fullText = sourceFile.getFullText();
  const nodeStart = node.getFullStart();
  const trivia = fullText.slice(nodeStart, node.getStart(sourceFile));
  const re = /\/\/\s*lint-deps-ignore:\s*(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(trivia)) !== null) {
    if (m[1] === dep) return true;
  }
  return false;
}

export interface TransitiveContext {
  checker: ts.TypeChecker;
  taintedSymbols: Set<ts.Symbol>;
  // Suppresses lint-deps-ignore detection. Used during taint
  // computation so an opt-out helper doesn't spuriously taint callers.
  skipIgnoreAnnotation?: boolean;
}

export function methodUsesDepImport(
  node: ts.Node,
  importedNames: Set<string>,
  knownIdentifiers: Set<string>,
  dep: string,
  sourceFile: ts.SourceFile,
  anchor: ts.Node = node,
  transitive?: TransitiveContext,
  collectRefs?: Set<string>,
): boolean {
  if (!transitive?.skipIgnoreAnnotation && hasLintDepsIgnore(anchor, dep, sourceFile)) return true;
  let found = false;
  // Walk top-down so we can distinguish:
  //   - signature type positions (param/return/typeParam of the function
  //     itself) — these COUNT because the method's API surface is
  //     bound to the dep;
  //   - body type positions (casts, satisfies, local-var annotations) —
  //     these DON'T count because they have no runtime effect;
  //   - runtime references — always count.
  const check = (n: ts.Node, inSignatureType: boolean) => {
    if (found && !collectRefs) return;

    // Resolve namespace property accesses: Nodes.OuterJoin → "OuterJoin"
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression)) {
      if (importedNames.has(n.expression.text)) {
        found = true;
        collectRefs?.add(n.name.text);
        if (!collectRefs) return;
      }
    }

    if (ts.isIdentifier(n)) {
      if (!isDeclarationName(n)) {
        // Skip namespace identifiers that are the left side of a property
        // access — the property access handler above captures the leaf.
        if (collectRefs && ts.isPropertyAccessExpression(n.parent) && n.parent.expression === n) {
          // don't record the namespace import itself as a ref
        } else {
          const inType = isWithinTypeNode(n);
          if (!inType || inSignatureType) {
            if (importedNames.has(n.text) || knownIdentifiers.has(n.text)) {
              found = true;
              collectRefs?.add(n.text);
              if (!collectRefs) return;
            }
            if (transitive && transitive.taintedSymbols.size > 0) {
              const sym = transitive.checker.getSymbolAtLocation(n);
              if (sym) {
                const resolved =
                  sym.flags & ts.SymbolFlags.Alias ? transitive.checker.getAliasedSymbol(sym) : sym;
                if (transitive.taintedSymbols.has(resolved)) {
                  found = true;
                  if (!collectRefs) return;
                }
              }
            }
          }
        }
      }
    }
    ts.forEachChild(n, (c) => {
      // Non-body children of a function-like are signature territory
      // (typeParameters, parameters, return type) — stay in sig mode.
      const childInSig =
        inSignatureType || (ts.isFunctionLike(n) && c !== (n as ts.FunctionLikeDeclaration).body);
      check(c, childInSig);
    });
  };
  check(node, false);
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

interface RefMismatch {
  rubyFile: string;
  tsFile: string;
  rubyMethod: string;
  tsMethod: string;
  rubyModule: string;
  rubyRefs: string[];
  tsRefs: string[];
  missingInTs: string[];
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

interface CrossReferenceResult {
  violations: Violation[];
  compliant: Compliant[];
  unmatched: Unmatched[];
  refMismatches: RefMismatch[];
}

const RUBY_NAMESPACE_ROOTS = new Set(["Arel", "ActiveModel", "ActiveRecord", "ActiveSupport"]);

function normalizeRubyRef(ref: string): string | null {
  const parts = ref.split("::");
  const leaf = parts.pop() ?? ref;
  if (RUBY_NAMESPACE_ROOTS.has(leaf)) return null;
  return leaf;
}

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function crossReference(rubyMethods: RubyDepMethod[], tsDepMap: TsDepMap): CrossReferenceResult {
  const violations: Violation[] = [];
  const compliant: Compliant[] = [];
  const unmatched: Unmatched[] = [];
  const refMismatches: RefMismatch[] = [];
  const seen = new Set<string>();

  for (const rm of rubyMethods) {
    const tsCandidates = rubyMethodToTs(rm.rubyName);
    if (!tsCandidates) continue;

    const tsFile = rubyFileToTs(rm.rubyFile);
    // Key by Ruby method name — two Ruby methods can map to the same TS candidate
    // (`is_number?` and `number?` both → "isNumber"), keying by TS name drops one.
    const dedupeKey = `${tsFile}:${rm.rubyName}`;
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
    let info: TsMethodDepInfo | undefined;
    for (const candidate of tsCandidates) {
      if (fileMethods.has(candidate)) {
        matchedTsName = candidate;
        info = fileMethods.get(candidate)!;
        break;
      }
    }

    if (!matchedTsName || !info) {
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

    // Method name matching a Ruby depRef class name counts as implementing
    // that protocol (e.g., serializeCastValue → ActiveModel::Type::SerializeCastValue).
    const implementsProtocol =
      !info.uses &&
      rm.depRefs.some((ref) => {
        const simpleName = ref.split("::").pop() ?? "";
        return simpleName.toLowerCase() === matchedTsName!.toLowerCase();
      });
    if (info.uses || implementsProtocol) {
      compliant.push(entry);

      if (rm.depRefs.length > 0 && info.refs.size > 0) {
        const rubyNormalized = rm.depRefs
          .map(normalizeRubyRef)
          .filter((r): r is string => r !== null);
        const tsRefNames = [...info.refs];
        const tsSet = new Set(tsRefNames.map((r) => r.toLowerCase()));
        const missingInTs = rubyNormalized.filter((r) => {
          const lower = r.toLowerCase();
          const camel = snakeToCamel(r).toLowerCase();
          return !tsSet.has(lower) && !tsSet.has(camel) && !tsSet.has("_" + camel);
        });
        if (missingInTs.length > 0) {
          refMismatches.push({
            ...entry,
            rubyRefs: rubyNormalized,
            tsRefs: tsRefNames,
            missingInTs,
          });
        }
      }
    } else {
      violations.push({ ...entry, depRefs: rm.depRefs });
    }
  }

  return { violations, compliant, unmatched, refMismatches };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

interface LintResult {
  rule: DepRule;
  violations: Violation[];
  compliant: Compliant[];
  unmatched: Unmatched[];
  refMismatches: RefMismatch[];
}

function printReport(results: LintResult[], showUnmatched: boolean) {
  for (const { rule, violations, compliant, unmatched, refMismatches } of results) {
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
      if (showUnmatched) {
        for (const u of unmatched) {
          console.log(`    ? ${u.rubyModule}#${u.rubyMethod} (${u.rubyFile})`);
        }
      }
    }
    if (refMismatches.length > 0) {
      console.log(
        `\n  ${refMismatches.length} ref mismatches (uses ${rule.dependency} but different types):`,
      );
      for (const m of refMismatches) {
        console.log(`    ≠ ${m.tsMethod} -- missing ${m.missingInTs.join(", ")}  (${m.tsFile})`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const { filterPkg, filterDep, showUnmatched } = parseArgs();

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
    const tsDepMap = analyzeTsDepUsage(
      pkgSrcDir,
      rule.tsImport,
      rule.tsIdentifiers,
      rule.dependency,
    );

    const { violations, compliant, unmatched, refMismatches } = crossReference(
      rubyMethods,
      tsDepMap,
    );
    allResults.push({ rule, violations, compliant, unmatched, refMismatches });
  }

  // Write JSON report
  const report = {
    generatedAt: new Date().toISOString(),
    rules: allResults.map(({ rule, violations, compliant, unmatched, refMismatches }) => ({
      package: rule.package,
      dependency: rule.dependency,
      summary: {
        compliant: compliant.length,
        violations: violations.length,
        unmatched: unmatched.length,
        refMismatches: refMismatches.length,
        total: violations.length + compliant.length,
        percent:
          violations.length + compliant.length > 0
            ? Math.round((compliant.length / (violations.length + compliant.length)) * 1000) / 10
            : 100,
      },
      violations,
      compliant,
      unmatched,
      refMismatches,
    })),
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const jsonPath = path.join(OUTPUT_DIR, "dep-lint.json");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  printReport(allResults, showUnmatched);

  const blockingViolations = allResults.reduce(
    (sum, r) => sum + (r.rule.blocking ? r.violations.length : 0),
    0,
  );
  if (blockingViolations > 0) {
    process.exit(1);
  }
}

const resolveReal = (p: string): string => {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};
if (
  process.argv[1] &&
  resolveReal(fileURLToPath(import.meta.url)) === resolveReal(process.argv[1])
) {
  main();
}

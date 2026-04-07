#!/usr/bin/env -S npx tsx
/**
 * Internal call-graph lint.
 *
 * For each matched method between Rails and TypeScript, compares which
 * internal methods are called. Reports methods where Rails calls an
 * internal method but the TS version doesn't.
 *
 * Usage:
 *   npx tsx scripts/api-compare/lint-calls.ts [--package activerecord] [--file relation.ts]
 */

import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import type { ApiManifest, ClassInfo, MethodInfo } from "./types.js";
import { OUTPUT_DIR, packageSrcDir } from "./config.js";
import { rubyFileToTs, rubyMethodToTs } from "./conventions.js";

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };
  return {
    filterPkg: get("--package") ?? "activerecord",
    filterFile: get("--file") ?? null,
  };
}

// ---------------------------------------------------------------------------
// Ruby: collect methods with their call lists
// ---------------------------------------------------------------------------

interface RubyMethodWithCalls {
  rubyName: string;
  tsCandidates: string[];
  rubyModule: string;
  rubyFile: string;
  calls: string[];
}

function collectRubyMethodCalls(ruby: ApiManifest, pkg: string): RubyMethodWithCalls[] {
  const rubyPkg = ruby.packages[pkg];
  if (!rubyPkg) return [];

  const results: RubyMethodWithCalls[] = [];
  const scan = (entities: Record<string, unknown>) => {
    for (const [fqn, raw] of Object.entries(entities)) {
      const info = raw as ClassInfo;
      for (const m of [...info.instanceMethods, ...info.classMethods] as MethodInfo[]) {
        if (!m.calls || m.calls.length === 0) continue;
        const tsCandidates = rubyMethodToTs(m.name);
        if (!tsCandidates) continue;
        results.push({
          rubyName: m.name,
          tsCandidates,
          rubyModule: fqn,
          rubyFile: m.file || info.file || "",
          calls: m.calls,
        });
      }
    }
  };
  scan(rubyPkg.classes);
  scan(rubyPkg.modules);
  return results;
}

// ---------------------------------------------------------------------------
// TS: extract method calls from each method body
// ---------------------------------------------------------------------------

type TsCallMap = Map<string, Map<string, Set<string>>>; // file -> method -> called methods

function analyzeTsCalls(pkgSrcDir: string): TsCallMap {
  const result: TsCallMap = new Map();
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

  for (const sourceFile of program.getSourceFiles()) {
    if (!sourceFile.fileName.startsWith(pkgSrcDir)) continue;
    if (sourceFile.fileName.endsWith(".test.ts")) continue;
    if (sourceFile.fileName.endsWith(".d.ts")) continue;

    const relPath = path.relative(pkgSrcDir, sourceFile.fileName);
    const fileMap = new Map<string, Set<string>>();

    const addMethod = (name: string, body: ts.Node) => {
      const calls = new Set<string>();
      collectCallsFromBody(body, calls);
      const existing = fileMap.get(name);
      if (existing) {
        for (const c of calls) existing.add(c);
      } else {
        fileMap.set(name, calls);
      }
    };

    const visit = (node: ts.Node) => {
      if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name) && node.body) {
        addMethod(node.name.text, node.body);
      } else if (
        ts.isGetAccessorDeclaration(node) &&
        node.name &&
        ts.isIdentifier(node.name) &&
        node.body
      ) {
        addMethod(node.name.text, node.body);
      } else if (ts.isConstructorDeclaration(node) && node.body) {
        addMethod("constructor", node.body);
      } else if (ts.isFunctionDeclaration(node) && node.name && node.body) {
        addMethod(node.name.text, node.body);
      } else if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.initializer) {
            if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
              addMethod(decl.name.text, decl.initializer.body);
            }
          }
        }
      } else if (
        ts.isPropertyDeclaration(node) &&
        node.name &&
        ts.isIdentifier(node.name) &&
        node.initializer
      ) {
        if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
          addMethod(node.name.text, node.initializer.body);
        }
      }

      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);

    if (fileMap.size > 0) result.set(relPath, fileMap);
  }

  return result;
}

function collectCallsFromBody(body: ts.Node, calls: Set<string>) {
  const walk = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const name = getCalledMethodName(node.expression);
      if (name) calls.add(name);
    }
    ts.forEachChild(node, walk);
  };
  walk(body);
}

function getCalledMethodName(expr: ts.Expression): string | null {
  // Unqualified: foo(...)
  if (ts.isIdentifier(expr)) return expr.text;
  // this.foo(...) or this?.foo?.()
  if (ts.isPropertyAccessExpression(expr) || ts.isPropertyAccessChain(expr)) {
    if (expr.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(expr.name)) {
      return expr.name.text;
    }
  }
  return null;
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

// Ruby calls to skip: language builtins, collection methods, metaprogramming,
// property-like accessors (Ruby uses methods, TS uses properties), and
// Ruby-specific patterns that don't apply to TypeScript.
const SKIP_CALLS = new Set([
  // Ruby builtins / Object methods
  "new",
  "to_s",
  "to_i",
  "to_f",
  "to_a",
  "to_h",
  "to_sym",
  "to_proc",
  "nil?",
  "is_a?",
  "kind_of?",
  "respond_to?",
  "send",
  "public_send",
  "class",
  "freeze",
  "frozen?",
  "dup",
  "clone",
  "tap",
  "then",
  "raise",
  "puts",
  "print",
  "warn",
  "proc",
  "lambda",
  "block_given?",
  "yield",
  "require",
  "require_relative",
  // Collection / Enumerable
  "map",
  "each",
  "select",
  "reject",
  "flat_map",
  "compact",
  "flatten",
  "reduce",
  "inject",
  "detect",
  "find",
  "collect",
  "filter_map",
  "any?",
  "all?",
  "none?",
  "empty?",
  "size",
  "length",
  "count",
  "first",
  "last",
  "include?",
  "key?",
  "has_key?",
  "keys",
  "fetch",
  "merge",
  "merge!",
  "delete",
  "push",
  "pop",
  "shift",
  "unshift",
  "join",
  "split",
  "strip",
  "gsub",
  "sub",
  "match",
  "scan",
  "sort",
  "sort_by",
  "min",
  "max",
  "sum",
  "uniq",
  "reverse",
  "each_with_object",
  "each_with_index",
  "group_by",
  "index_by",
  "extract!",
  "extract_options!",
  // Metaprogramming / class definition
  "attr_reader",
  "attr_writer",
  "attr_accessor",
  "define_method",
  "alias_method",
  "private",
  "protected",
  "public",
  "module_eval",
  "class_eval",
  "instance_variable_get",
  "instance_variable_set",
  "method_defined?",
  "instance_method_already_implemented?",
  // ActiveSupport extensions on Object
  "present?",
  "blank?",
  "presence",
  "try",
  "in?",
  // Property-like accessors (Ruby self.foo → TS this.foo property)
  "name",
  "call",
  "options",
  "model",
  "klass",
  "reflection",
  "owner",
  "primary_key",
  "table_name",
  "foreign_key",
  "target",
  "scope",
  "type",
  "columns",
  "superclass",
  "table",
  "connection",
  "adapter",
  "pool",
  "config",
  "values",
  "macro",
  "active_record_primary_key",
  "association_primary_key",
  "counter_cache_name",
  "plural_name",
  "class_name",
  "source_reflection",
  "through_reflection",
  "foreign_type",
  "inverse_of",
  "parent_reflection",
  "active_record",
  "extensions",
  "association_scope",
  "loaded",
  "loaded?",
  "stale",
  "inversed",
  // Relation value accessors
  "joins_values",
  "includes_values",
  "where_values",
  "order_values",
  "select_values",
  "group_values",
  "having_values",
  "limit_value",
  "offset_value",
  "lock_value",
  "distinct_value",
  "readonly_value",
  "strict_loading_value",
  "preload_values",
  "eager_load_values",
  "references_values",
  // Connection / threading
  "with_connection",
  "connection_pool",
  "synchronize",
  // Quoting (handled differently in TS)
  "quote_table_name",
  "quote_column_name",
  "quote_default_expression",
  "sanitize_sql_for_conditions",
  "type_for_attribute",
  "attribute_type_decorations",
  "defined_enums",
  // Notification / instrumentation
  "instrument",
  "notify_connection",
  // Database introspection
  "database_version",
  "composite_primary_key?",
]);

interface CallMismatch {
  rubyFile: string;
  tsFile: string;
  rubyMethod: string;
  tsMethod: string;
  rubyModule: string;
  missingCalls: string[]; // camelCase names of calls present in Rails but not TS
  railsCalls: string[];
  tsCalls: string[];
}

function crossReferenceCalls(
  rubyMethods: RubyMethodWithCalls[],
  tsCallMap: TsCallMap,
): CallMismatch[] {
  const mismatches: CallMismatch[] = [];
  const seen = new Set<string>();

  for (const rm of rubyMethods) {
    const tsFile = rubyFileToTs(rm.rubyFile);
    const key = `${rm.rubyModule}:${rm.rubyFile}:${rm.rubyName}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const fileMethods = tsCallMap.get(tsFile);
    if (!fileMethods) continue;

    // Try all TS name candidates to find the matching method
    let matchedTsName: string | null = null;
    let tsCalls: Set<string> | null = null;
    for (const candidate of rm.tsCandidates) {
      const calls = fileMethods.get(candidate);
      if (calls) {
        matchedTsName = candidate;
        tsCalls = calls;
        break;
      }
    }
    if (!matchedTsName || !tsCalls) continue;

    const missingCalls: string[] = [];
    const significantRubyCalls: string[] = [];
    for (const rubyCall of rm.calls) {
      if (SKIP_CALLS.has(rubyCall)) continue;
      if (rubyCall.startsWith("_")) continue;

      const callCandidates = rubyMethodToTs(rubyCall);
      if (!callCandidates) continue;

      significantRubyCalls.push(rubyCall);
      const found = callCandidates.some((c) => tsCalls!.has(c));
      if (!found) {
        missingCalls.push(`${callCandidates[0]} (${rubyCall})`);
      }
    }

    if (missingCalls.length > 0 && significantRubyCalls.length > 0) {
      // Only report if a meaningful fraction of calls are missing
      const matchRate = 1 - missingCalls.length / significantRubyCalls.length;
      if (matchRate < 0.8) {
        // More than 20% of significant calls are missing
        mismatches.push({
          rubyFile: rm.rubyFile,
          tsFile,
          rubyMethod: rm.rubyName,
          tsMethod: matchedTsName,
          rubyModule: rm.rubyModule,
          missingCalls: missingCalls.slice(0, 5),
          railsCalls: significantRubyCalls,
          tsCalls: [...tsCalls],
        });
      }
    }
  }

  return mismatches;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function printReport(mismatches: CallMismatch[], filterFile: string | null) {
  if (filterFile) {
    mismatches = mismatches.filter((m) => m.tsFile.includes(filterFile));
  }

  // Group by file
  const byFile = new Map<string, CallMismatch[]>();
  for (const m of mismatches) {
    const list = byFile.get(m.tsFile) || [];
    list.push(m);
    byFile.set(m.tsFile, list);
  }

  console.log(`\nInternal Call Graph Lint`);
  console.log("=".repeat(60));

  let totalMismatches = 0;
  for (const [file, ms] of [...byFile.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`\n  ${file}`);
    for (const m of ms) {
      console.log(`    ${m.tsMethod} — missing: ${m.missingCalls.join(", ")}`);
      totalMismatches++;
    }
  }

  console.log(`\n  ${totalMismatches} methods with call graph mismatches`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const { filterPkg, filterFile } = parseArgs();

  const rubyPath = path.join(OUTPUT_DIR, "rails-api.json");
  if (!fs.existsSync(rubyPath)) {
    console.error("Missing rails-api.json -- run extract-ruby-api.rb first");
    process.exit(1);
  }
  const ruby: ApiManifest = JSON.parse(fs.readFileSync(rubyPath, "utf-8"));

  const rubyMethods = collectRubyMethodCalls(ruby, filterPkg);
  console.log(`Found ${rubyMethods.length} Rails methods with call data`);

  const pkgSrcDir = packageSrcDir(filterPkg);
  const tsCallMap = analyzeTsCalls(pkgSrcDir);

  const mismatches = crossReferenceCalls(rubyMethods, tsCallMap);

  // Write JSON
  const jsonPath = path.join(OUTPUT_DIR, "call-lint.json");
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify({ mismatches }, null, 2));

  printReport(mismatches, filterFile);
}

main();

#!/usr/bin/env npx tsx
/**
 * Compares Ruby Rails API with our TypeScript API surface.
 * Loads both JSON manifests, maps Ruby → TS names, and generates reports.
 */

import * as fs from "fs";
import * as path from "path";
import type {
  ApiManifest,
  ClassInfo,
  MethodInfo,
  ComparisonResult,
  ClassComparison,
  MethodComparison,
  MethodStatus,
} from "./types.js";
import { rubyMethodToTs, CLASS_MAP, MODULE_CONTRIBUTIONS } from "./naming-map.js";

const SCRIPT_DIR = __dirname;
const OUTPUT_DIR = path.join(SCRIPT_DIR, "output");

function main() {
  const rubyPath = path.join(OUTPUT_DIR, "rails-api.json");
  const tsPath = path.join(OUTPUT_DIR, "ts-api.json");

  if (!fs.existsSync(rubyPath)) {
    console.error("Missing rails-api.json — run extract-ruby-api.rb first");
    process.exit(1);
  }
  if (!fs.existsSync(tsPath)) {
    console.error("Missing ts-api.json — run extract-ts-api.ts first");
    process.exit(1);
  }

  const ruby: ApiManifest = JSON.parse(fs.readFileSync(rubyPath, "utf-8"));
  const ts: ApiManifest = JSON.parse(fs.readFileSync(tsPath, "utf-8"));

  // Build a quick lookup: package:ClassName -> ClassInfo from TS
  const tsLookup = new Map<string, ClassInfo>();
  for (const [pkg, pkgInfo] of Object.entries(ts.packages)) {
    for (const [name, cls] of Object.entries(pkgInfo.classes)) {
      tsLookup.set(`${pkg}:${name}`, cls);
    }
  }

  // Build a lookup for Ruby classes/modules by FQN
  const rubyLookup = new Map<string, ClassInfo>();
  for (const pkgInfo of Object.values(ruby.packages)) {
    for (const [fqn, cls] of Object.entries(pkgInfo.classes)) {
      rubyLookup.set(fqn, cls as unknown as ClassInfo);
    }
    for (const [fqn, mod] of Object.entries(pkgInfo.modules)) {
      rubyLookup.set(fqn, mod as unknown as ClassInfo);
    }
  }

  const result: ComparisonResult = {
    generatedAt: new Date().toISOString(),
    railsVersion: "8.0.2",
    summary: {
      totalRubyMethods: 0,
      matched: 0,
      missing: 0,
      extra: 0,
      signatureMismatch: 0,
      coveragePercent: 0,
    },
    packages: {},
  };

  // Get unique TS classes to compare
  const tsClassesToCompare = new Set<string>();
  for (const tsKey of Object.values(CLASS_MAP)) {
    tsClassesToCompare.add(tsKey);
  }

  // For each TS class, gather all Ruby methods from contributing modules
  for (const tsKey of tsClassesToCompare) {
    const tsClass = tsLookup.get(tsKey);
    if (!tsClass) continue;

    const [pkg] = tsKey.split(":");
    if (!result.packages[pkg]) {
      result.packages[pkg] = [];
    }

    const contributions = MODULE_CONTRIBUTIONS[tsKey];
    if (!contributions) {
      // Try direct mapping only
      continue;
    }

    // Collect all Ruby instance methods from contributing modules
    const rubyInstanceMethods = new Map<string, MethodInfo>();
    const rubyClassMethods = new Map<string, MethodInfo>();

    for (const rubyFqn of contributions) {
      const rubyCls = rubyLookup.get(rubyFqn);
      if (!rubyCls) continue;

      for (const m of rubyCls.instanceMethods) {
        if (!rubyInstanceMethods.has(m.name)) {
          rubyInstanceMethods.set(m.name, m);
        }
      }
      for (const m of rubyCls.classMethods) {
        if (!rubyClassMethods.has(m.name)) {
          rubyClassMethods.set(m.name, m);
        }
      }
    }

    // Build TS method lookup
    const tsInstanceLookup = new Map<string, MethodInfo[]>();
    for (const m of tsClass.instanceMethods) {
      const existing = tsInstanceLookup.get(m.name);
      if (existing) {
        existing.push(m);
      } else {
        tsInstanceLookup.set(m.name, [m]);
      }
    }
    const tsClassLookup = new Map<string, MethodInfo[]>();
    for (const m of tsClass.classMethods) {
      const existing = tsClassLookup.get(m.name);
      if (existing) {
        existing.push(m);
      } else {
        tsClassLookup.set(m.name, [m]);
      }
    }

    const instanceComparisons = compareMethods(rubyInstanceMethods, tsInstanceLookup);
    const classComparisons = compareMethods(rubyClassMethods, tsClassLookup);

    // Find extras (TS methods with no Ruby counterpart)
    const instanceExtras = findExtras(tsClass.instanceMethods, rubyInstanceMethods);
    const classExtras = findExtras(tsClass.classMethods, rubyClassMethods);

    const allComparisons = [...instanceComparisons, ...classComparisons];
    const matched = allComparisons.filter((c) => c.status === "matched").length;
    const missing = allComparisons.filter((c) => c.status === "missing").length;
    const sigMismatch = allComparisons.filter((c) => c.status === "signature_mismatch").length;
    const extra = instanceExtras.length + classExtras.length;
    const total = allComparisons.length;
    const coverage = total > 0 ? Math.round((matched / total) * 1000) / 10 : 0;

    result.packages[pkg].push({
      rubyClass: contributions.join(" + "),
      tsClass: tsKey,
      package: pkg,
      instanceMethods: [...instanceComparisons, ...instanceExtras],
      classMethods: [...classComparisons, ...classExtras],
      coveragePercent: coverage,
      matched,
      missing,
      extra,
      signatureMismatch: sigMismatch,
    });
  }

  // Compute summary
  for (const comparisons of Object.values(result.packages)) {
    for (const cls of comparisons) {
      result.summary.totalRubyMethods += cls.matched + cls.missing + cls.signatureMismatch;
      result.summary.matched += cls.matched;
      result.summary.missing += cls.missing;
      result.summary.extra += cls.extra;
      result.summary.signatureMismatch += cls.signatureMismatch;
    }
  }
  result.summary.coveragePercent =
    result.summary.totalRubyMethods > 0
      ? Math.round((result.summary.matched / result.summary.totalRubyMethods) * 1000) / 10
      : 0;

  // Write JSON report
  const jsonPath = path.join(OUTPUT_DIR, "comparison-report.json");
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));

  // Write Markdown report
  const mdPath = path.join(OUTPUT_DIR, "comparison-report.md");
  fs.writeFileSync(mdPath, generateMarkdown(result));

  // Print summary to terminal
  printSummary(result);
}

function compareMethods(
  rubyMethods: Map<string, MethodInfo>,
  tsMethods: Map<string, MethodInfo[]>,
): MethodComparison[] {
  const results: MethodComparison[] = [];

  for (const [rubyName, rubyMethod] of rubyMethods) {
    const tsName = rubyMethodToTs(rubyName);
    if (tsName === null) {
      // Explicitly skipped
      continue;
    }

    const tsOverloads = tsMethods.get(tsName);
    if (!tsOverloads || tsOverloads.length === 0) {
      results.push({
        rubyName,
        tsName,
        status: "missing",
        rubyParams: rubyMethod.params,
      });
      continue;
    }

    // Pick the best-matching overload (closest required param count)
    const rubyParamCount = countRequiredParams(rubyMethod.params);
    let bestMatch = tsOverloads[0];
    let bestDiff = Math.abs(countRequiredParams(bestMatch.params) - rubyParamCount);
    for (let i = 1; i < tsOverloads.length; i++) {
      const diff = Math.abs(countRequiredParams(tsOverloads[i].params) - rubyParamCount);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestMatch = tsOverloads[i];
      }
    }

    const tsParamCount = countRequiredParams(bestMatch.params);

    if (rubyParamCount !== tsParamCount) {
      results.push({
        rubyName,
        tsName,
        status: "signature_mismatch",
        rubyParams: rubyMethod.params,
        tsParams: bestMatch.params,
        notes: `Ruby has ${rubyParamCount} required params, TS has ${tsParamCount}`,
      });
    } else {
      results.push({
        rubyName,
        tsName,
        status: "matched",
        rubyParams: rubyMethod.params,
        tsParams: bestMatch.params,
      });
    }
  }

  return results;
}

function findExtras(
  tsMethods: MethodInfo[],
  rubyMethods: Map<string, MethodInfo>,
): MethodComparison[] {
  const results: MethodComparison[] = [];

  // Build a set of all TS names that Ruby methods map to
  const mappedTsNames = new Set<string>();
  for (const rubyName of rubyMethods.keys()) {
    const tsName = rubyMethodToTs(rubyName);
    if (tsName) mappedTsNames.add(tsName);
  }

  for (const tsMethod of tsMethods) {
    if (!mappedTsNames.has(tsMethod.name)) {
      // Skip constructor, common TS patterns
      if (tsMethod.name === "constructor") continue;
      results.push({
        rubyName: "",
        tsName: tsMethod.name,
        status: "extra",
        tsParams: tsMethod.params,
      });
    }
  }

  return results;
}

function countRequiredParams(params: { kind: string }[]): number {
  return params.filter((p) => p.kind === "required").length;
}

function generateMarkdown(result: ComparisonResult): string {
  const lines: string[] = [];

  lines.push("# Rails API Comparison Report");
  lines.push("");
  lines.push(`Generated: ${result.generatedAt}`);
  lines.push(`Rails version: ${result.railsVersion}`);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Ruby methods | ${result.summary.totalRubyMethods} |`);
  lines.push(`| Matched | ${result.summary.matched} |`);
  lines.push(`| Missing | ${result.summary.missing} |`);
  lines.push(`| Signature mismatch | ${result.summary.signatureMismatch} |`);
  lines.push(`| Extra (TS only) | ${result.summary.extra} |`);
  lines.push(`| **Coverage** | **${result.summary.coveragePercent}%** |`);
  lines.push("");

  for (const [pkg, comparisons] of Object.entries(result.packages)) {
    lines.push(`## ${pkg}`);
    lines.push("");

    for (const cls of comparisons) {
      lines.push(`### ${cls.tsClass}`);
      lines.push(`Ruby source: ${cls.rubyClass}`);
      lines.push(
        `Coverage: ${cls.coveragePercent}% (${cls.matched} matched, ${cls.missing} missing, ${cls.signatureMismatch} signature mismatch, ${cls.extra} extra)`,
      );
      lines.push("");

      const allMethods = [...cls.instanceMethods, ...cls.classMethods];
      if (allMethods.length === 0) {
        lines.push("_No methods to compare_");
        lines.push("");
        continue;
      }

      // Group by status
      const matched = allMethods.filter((m) => m.status === "matched");
      const missing = allMethods.filter((m) => m.status === "missing");
      const sigMismatch = allMethods.filter((m) => m.status === "signature_mismatch");
      const extra = allMethods.filter((m) => m.status === "extra");

      if (matched.length > 0) {
        lines.push("<details>");
        lines.push(`<summary>Matched (${matched.length})</summary>`);
        lines.push("");
        for (const m of matched) {
          lines.push(`- \`${m.rubyName}\` -> \`${m.tsName}\``);
        }
        lines.push("");
        lines.push("</details>");
        lines.push("");
      }

      if (missing.length > 0) {
        lines.push(`**Missing (${missing.length}):**`);
        for (const m of missing) {
          const params =
            m.rubyParams?.map((p) => `${p.name}${p.kind === "optional" ? "?" : ""}`).join(", ") ??
            "";
          lines.push(`- \`${m.rubyName}(${params})\` -> expected \`${m.tsName}\``);
        }
        lines.push("");
      }

      if (sigMismatch.length > 0) {
        lines.push(`**Signature Mismatch (${sigMismatch.length}):**`);
        for (const m of sigMismatch) {
          lines.push(`- \`${m.rubyName}\` -> \`${m.tsName}\`: ${m.notes}`);
        }
        lines.push("");
      }

      if (extra.length > 0) {
        lines.push("<details>");
        lines.push(`<summary>Extra - TS only (${extra.length})</summary>`);
        lines.push("");
        for (const m of extra) {
          lines.push(`- \`${m.tsName}\``);
        }
        lines.push("");
        lines.push("</details>");
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}

function printSummary(result: ComparisonResult) {
  console.log("\n========================================");
  console.log("  Rails API Comparison Report");
  console.log("========================================\n");

  console.log(`  Total Ruby methods:   ${result.summary.totalRubyMethods}`);
  console.log(`  Matched:              ${result.summary.matched}`);
  console.log(`  Missing:              ${result.summary.missing}`);
  console.log(`  Signature mismatch:   ${result.summary.signatureMismatch}`);
  console.log(`  Extra (TS only):      ${result.summary.extra}`);
  console.log(`  Coverage:             ${result.summary.coveragePercent}%`);
  console.log("");

  for (const [pkg, comparisons] of Object.entries(result.packages)) {
    const pkgMatched = comparisons.reduce((s, c) => s + c.matched, 0);
    const pkgTotal = comparisons.reduce(
      (s, c) => s + c.matched + c.missing + c.signatureMismatch,
      0,
    );
    const pkgCoverage = pkgTotal > 0 ? Math.round((pkgMatched / pkgTotal) * 1000) / 10 : 0;
    console.log(`  ${pkg}: ${pkgCoverage}% (${pkgMatched}/${pkgTotal})`);
    for (const cls of comparisons) {
      const total = cls.matched + cls.missing + cls.signatureMismatch;
      if (total > 0) {
        console.log(
          `    ${cls.tsClass.split(":")[1]}: ${cls.coveragePercent}% (${cls.matched}/${total})`,
        );
      }
    }
  }
  console.log("\n========================================\n");
}

main();

#!/usr/bin/env tsx
/**
 * D-1 Rails-shape migration codemod — PG/MySQL adapter-specific variant.
 *
 * Targets test files in `adapters/postgresql/` and `adapters/abstract-mysql-adapter/`
 * that directly instantiate `new PostgreSQLAdapter(PG_TEST_URL)` or
 * `new Mysql2Adapter(MYSQL_TEST_URL)` instead of using `createTestAdapter()`.
 *
 * Two structural variants are handled:
 *
 *   A) **beforeAll** — adapter created once in `beforeAll`, used throughout.
 *      `withTransactionalFixtures(() => adapter)` replaced with
 *      `useHandlerTransactionalFixtures()`.
 *
 *   B) **beforeEach** — adapter created per-test for DDL isolation. No
 *      transactional fixtures; DDL managed manually.
 *
 * Both variants produce:
 *   - `setupHandlerSuite()` at module level
 *   - `adapter = Base.connection as AdapterType` instead of `new Adapter(URL)`
 *   - `this.adapter = adapter` removed from static blocks
 *   - `adapter.close()` removed (handler manages lifecycle)
 *
 * Usage:
 *   pnpm tsx scripts/d1-migrate-pg-mysql.ts <file>...           # dry-run
 *   pnpm tsx scripts/d1-migrate-pg-mysql.ts --write <file>...   # apply
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Project, type SourceFile } from "ts-morph";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

export type Result =
  | { file: string; status: "transformed"; details: string[] }
  | { file: string; status: "skipped"; reason: string }
  | { file: string; status: "already-migrated" }
  | { file: string; status: "no-op" };

function relPathToHelpers(filePath: string): string {
  const dir = dirname(filePath);
  const target = resolve(ROOT, "packages/activerecord/src/test-helpers");
  let rel = relative(dir, target);
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel.replace(/\\/g, "/");
}

function relPathToIndex(filePath: string): string {
  const dir = dirname(filePath);
  const target = resolve(ROOT, "packages/activerecord/src/index.js");
  let rel = relative(dir, dirname(target));
  if (!rel.startsWith(".")) rel = "./" + rel;
  return (rel + "/index.js").replace(/\\/g, "/");
}

type AdapterKind = "pg" | "mysql";

interface PatternInfo {
  kind: AdapterKind;
  adapterType: string; // "PostgreSQLAdapter" | "Mysql2Adapter"
  hasWithTxFixtures: boolean;
  hasDefineSchema: boolean;
  hasFreshAdapterFn: boolean;
}

function analyze(sf: SourceFile): PatternInfo | { skip: string } {
  // Already-migrated check
  for (const imp of sf.getImportDeclarations()) {
    if (imp.getModuleSpecifierValue().endsWith("/setup-handler-suite.js")) {
      return { skip: "already-migrated" };
    }
  }

  // Detect adapter kind
  const text = sf.getFullText();
  let kind: AdapterKind | undefined;
  let adapterType: string | undefined;
  if (/new PostgreSQLAdapter\(/.test(text) || /freshAdapter\(\)/.test(text)) {
    kind = "pg";
    adapterType = "PostgreSQLAdapter";
  } else if (/new Mysql2Adapter\(/.test(text)) {
    kind = "mysql";
    adapterType = "Mysql2Adapter";
  }
  if (!kind || !adapterType) return { skip: "no PG/MySQL adapter instantiation found" };

  // Must have this.adapter = adapter
  if (!/this\.adapter\s*=\s*adapter/.test(text)) {
    return { skip: "no this.adapter = adapter assignment" };
  }

  const hasWithTxFixtures = /withTransactionalFixtures\s*\(/.test(text);
  const hasDefineSchema = /defineSchema\s*\(\s*adapter/.test(text);
  const hasFreshAdapterFn = /async function freshAdapter/.test(text);

  return { kind, adapterType, hasWithTxFixtures, hasDefineSchema, hasFreshAdapterFn };
}

export function migrateText(inputText: string, filePath: string): string | { skip: string } {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    useInMemoryFileSystem: false,
    compilerOptions: { target: 99 },
  });
  const sf = project.createSourceFile(filePath, inputText, { overwrite: true });
  const info = analyze(sf);
  if ("skip" in info) return { skip: info.skip };
  const helpersRel = relPathToHelpers(filePath);
  transform(sf, info, helpersRel, filePath);
  sf.formatText();
  return sf.getFullText();
}

function transform(
  sf: SourceFile,
  info: PatternInfo,
  helpersRel: string,
  filePath: string,
): string[] {
  const details: string[] = [];

  function ensureImport(spec: string, names: string[]) {
    let imp = sf.getImportDeclarations().find((i) => i.getModuleSpecifierValue() === spec);
    if (!imp) {
      imp = sf.addImportDeclaration({
        moduleSpecifier: spec,
        namedImports: names.map((n) => ({ name: n })),
      });
    } else {
      const existing = imp.getNamedImports().map((n) => n.getName());
      const toAdd = names.filter((n) => !existing.includes(n));
      if (toAdd.length) imp.addNamedImports(toAdd.map((n) => ({ name: n })));
    }
  }

  // 1) Replace `adapter = new PostgreSQLAdapter(PG_TEST_URL)` / `new Mysql2Adapter(MYSQL_TEST_URL)`
  //    with `adapter = Base.connection as AdapterType`
  const adapterNewPattern =
    info.kind === "pg"
      ? /new PostgreSQLAdapter\(PG_TEST_URL\)/g
      : /new Mysql2Adapter\(MYSQL_TEST_URL\)/g;
  const replacement = `Base.connection as ${info.adapterType}`;

  let fullText = sf.getFullText();
  const newText = fullText.replace(adapterNewPattern, replacement);
  if (newText !== fullText) {
    sf.replaceWithText(newText);
    details.push(
      `replaced new ${info.adapterType}(...) with Base.connection as ${info.adapterType}`,
    );
  }

  // 2) Replace `await freshAdapter()` with `Base.connection as AdapterType`
  if (info.hasFreshAdapterFn) {
    let text = sf.getFullText();
    text = text.replace(/await freshAdapter\(\)/g, `Base.connection as ${info.adapterType}`);
    // Remove the freshAdapter function declaration
    text = text.replace(/async function freshAdapter\(\)[\s\S]*?\n\}\n/m, "");
    sf.replaceWithText(text);
    details.push("replaced freshAdapter() with Base.connection cast");
  }

  // 3) Remove `.close()` calls on any variable rewritten to Base.connection
  //    (both `adapter` and ad-hoc names like `setup`)
  {
    let text = sf.getFullText();
    text = text.replace(/\s*await (?:adapter|setup)\.close\(\);?\s*\n/g, "\n");
    sf.replaceWithText(text);
    details.push("removed .close() calls");
  }

  // 4) Remove `this.adapter = adapter` assignments
  {
    let text = sf.getFullText();
    // Remove `this.adapter = adapter;` and `this.adapter = adapter as any;` statements
    // Handle both standalone lines and inline within static blocks
    text = text.replace(/\s*this\.adapter\s*=\s*adapter(?:\s+as\s+any)?\s*;\s*/g, " ");
    sf.replaceWithText(text);
    details.push("removed this.adapter = adapter assignments");
  }

  // 5) Clean up empty static blocks
  {
    let text = sf.getFullText();
    // Match static { } with only whitespace inside (multi-line and single-line)
    text = text.replace(/\s*static\s*\{\s*\}\s*\n?/g, "\n");
    sf.replaceWithText(text);
    details.push("cleaned empty static blocks");
  }

  // 6) Rewrite defineSchema(adapter, ...) → defineSchema(...)
  if (info.hasDefineSchema) {
    let text = sf.getFullText();
    text = text.replace(/defineSchema\(\s*adapter\s*,\s*/g, "defineSchema(");
    sf.replaceWithText(text);
    details.push("rewrote defineSchema(adapter, ...) → defineSchema(...)");
  }

  // 7) Replace withTransactionalFixtures(() => adapter) with useHandlerTransactionalFixtures()
  if (info.hasWithTxFixtures) {
    let text = sf.getFullText();
    text = text.replace(
      /\s*withTransactionalFixtures\(\s*\(\)\s*=>\s*adapter\s*\)\s*;?\s*\n/g,
      "\n",
    );
    sf.replaceWithText(text);
    details.push("removed withTransactionalFixtures(() => adapter)");
  }

  // 8) Remove empty afterAll blocks (after removing close() calls, some may be empty)
  {
    let text = sf.getFullText();
    // Remove afterAll(async () => { }) with only whitespace
    text = text.replace(/\s*afterAll\(\s*async\s*\(\)\s*=>\s*\{\s*\}\s*\)\s*;?\s*\n/g, "\n");
    // Also remove empty afterEach blocks
    text = text.replace(/\s*afterEach\(\s*async\s*\(\)\s*=>\s*\{\s*\}\s*\)\s*;?\s*\n/g, "\n");
    sf.replaceWithText(text);
    details.push("cleaned empty afterAll/afterEach blocks");
  }

  // 9) Insert setupHandlerSuite() + optionally useHandlerTransactionalFixtures() at module level.
  //    Find the first describeIfPg/describeIfMysql call and insert before it.
  {
    let text = sf.getFullText();
    const describeIfPattern = info.kind === "pg" ? "describeIfPg(" : "describeIfMysql(";
    const idx = text.indexOf(describeIfPattern);
    if (idx >= 0) {
      // Find start of line
      let lineStart = idx;
      while (lineStart > 0 && text[lineStart - 1] !== "\n") lineStart--;
      // Check for preceding comment block
      let insertPos = lineStart;
      if (lineStart > 0) {
        const before = text.substring(0, lineStart);
        const lines = before.split("\n");
        // Walk backwards over comment lines
        let i = lines.length - 1;
        while (i >= 0 && /^\s*\/\//.test(lines[i])) i--;
        if (i < lines.length - 1) {
          insertPos = lines.slice(0, i + 1).join("\n").length + 1;
        }
      }

      let insertion = "setupHandlerSuite();\n";
      if (info.hasWithTxFixtures) {
        insertion += "useHandlerTransactionalFixtures();\n";
      }
      insertion += "\n";

      text = text.substring(0, insertPos) + insertion + text.substring(insertPos);
      sf.replaceWithText(text);
      details.push("inserted setupHandlerSuite() at module level");
    }
  }

  // 10) Add imports
  ensureImport(`${helpersRel}/setup-handler-suite.js`, ["setupHandlerSuite"]);
  if (info.hasWithTxFixtures) {
    ensureImport(`${helpersRel}/use-handler-transactional-fixtures.js`, [
      "useHandlerTransactionalFixtures",
    ]);
  }

  // Ensure Base is imported
  const indexRel = relPathToIndex(filePath);
  ensureImport(indexRel, ["Base"]);

  // 11) Clean up stale imports
  // Remove withTransactionalFixtures import if no longer used
  {
    const text = sf.getFullText();
    if (
      info.hasWithTxFixtures &&
      !/withTransactionalFixtures/.test(text.replace(/import[^;]*;/g, ""))
    ) {
      for (const imp of [...sf.getImportDeclarations()]) {
        if (!imp.getModuleSpecifierValue().endsWith("/with-transactional-fixtures.js")) continue;
        imp.remove();
        details.push("removed with-transactional-fixtures.js import");
      }
    }
  }

  // Remove PG_TEST_URL / MYSQL_TEST_URL from imports if no longer used
  {
    const text = sf.getFullText();
    for (const imp of [...sf.getImportDeclarations()]) {
      const spec = imp.getModuleSpecifierValue();
      if (!spec.endsWith("/test-helper.js")) continue;
      for (const n of [...imp.getNamedImports()]) {
        const name = n.getName();
        if (name !== "PG_TEST_URL" && name !== "MYSQL_TEST_URL") continue;
        // Check if used outside imports
        const usageCount = (text.match(new RegExp(`\\b${name}\\b`, "g")) || []).length;
        const importCount = (text.match(new RegExp(`import[^;]*${name}[^;]*;`, "g")) || []).length;
        if (usageCount <= importCount) {
          n.remove();
          details.push(`removed unused ${name} import`);
        }
      }
    }
  }

  // Remove PostgreSQLAdapter / Mysql2Adapter from imports if no longer used
  {
    const text = sf.getFullText();
    for (const imp of [...sf.getImportDeclarations()]) {
      const spec = imp.getModuleSpecifierValue();
      if (!spec.endsWith("/test-helper.js")) continue;
      for (const n of [...imp.getNamedImports()]) {
        const name = n.getName();
        if (name !== "PostgreSQLAdapter" && name !== "Mysql2Adapter") continue;
        // Still used for the `as` cast, so keep it
      }
    }
  }

  // Remove defineSchema import if no longer used
  {
    const text = sf.getFullText();
    if (!/defineSchema\(/.test(text.replace(/import[^;]*;/g, ""))) {
      for (const imp of [...sf.getImportDeclarations()]) {
        if (!imp.getModuleSpecifierValue().endsWith("/define-schema.js")) continue;
        imp.remove();
        details.push("removed define-schema.js import");
      }
    }
  }

  return details;
}

export function migrateFile(filePath: string): Result {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { target: 99, allowJs: false },
  });
  const sf = project.addSourceFileAtPath(filePath);
  const info = analyze(sf);
  if ("skip" in info) {
    if (info.skip === "already-migrated") return { file: filePath, status: "already-migrated" };
    return { file: filePath, status: "skipped", reason: info.skip };
  }
  const helpersRel = relPathToHelpers(filePath);
  let details: string[];
  try {
    details = transform(sf, info, helpersRel, filePath);
  } catch (e) {
    return {
      file: filePath,
      status: "skipped",
      reason: `transform error: ${(e as Error).message}`,
    };
  }
  sf.formatText();
  return { file: filePath, status: "transformed", details };
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const files = args.filter((a) => !a.startsWith("--"));
  if (files.length === 0) {
    console.error(
      "usage: d1-migrate-pg-mysql <file>...               # dry-run\n" +
        "       d1-migrate-pg-mysql --write <file>...       # apply changes",
    );
    process.exit(1);
  }
  if (!write) console.error("(dry-run — pass --write to apply changes)");
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { target: 99 },
  });
  const results: Result[] = [];
  for (const f of files) {
    const abs = resolve(f);
    if (!existsSync(abs)) {
      results.push({ file: f, status: "skipped", reason: "file not found" });
      continue;
    }
    const sf = project.addSourceFileAtPath(abs);
    const info = analyze(sf);
    if ("skip" in info) {
      if (info.skip === "already-migrated") {
        results.push({ file: f, status: "already-migrated" });
      } else {
        results.push({ file: f, status: "skipped", reason: info.skip });
      }
      sf.forget();
      continue;
    }
    const helpersRel = relPathToHelpers(abs);
    let details: string[];
    try {
      details = transform(sf, info, helpersRel, abs);
    } catch (e) {
      results.push({
        file: f,
        status: "skipped",
        reason: `transform error: ${(e as Error).message}`,
      });
      sf.forget();
      continue;
    }
    if (write) {
      await sf.save();
      try {
        execFileSync("pnpm", ["prettier", "--write", "--log-level", "warn", abs], {
          stdio: ["ignore", "ignore", "pipe"],
        });
      } catch (e) {
        details.push(`WARN: prettier failed: ${(e as Error).message}`);
      }
    }
    results.push({ file: f, status: "transformed", details });
    sf.forget();
  }
  console.log(JSON.stringify(results, null, 2));
  const skipped = results.filter((r) => r.status === "skipped");
  console.error(
    `\n${results.length} files: ${results.filter((r) => r.status === "transformed").length} transformed, ${skipped.length} skipped, ${results.filter((r) => r.status === "already-migrated").length} already-migrated`,
  );
  if (skipped.length) {
    console.error("\nSkipped files:");
    for (const s of skipped) console.error(`  ${s.file}: ${(s as any).reason}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}

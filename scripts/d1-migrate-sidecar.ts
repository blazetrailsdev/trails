#!/usr/bin/env tsx
/**
 * D-1 Rails-shape migration codemod — sidecar adapter variant.
 *
 * Sibling to scripts/d1-migrate.ts (which handles the standard `createTestAdapter`
 * pattern). This script targets the 11 files that use `createSidecarTestAdapter`,
 * which returns `{ adapter, fixtures }` (the shared raw DatabaseAdapter) rather
 * than a TestAdapterFixtures wrapper.
 *
 * Two structural variants are handled:
 *
 *   A) **Module-level** — `let adapter` and `beforeAll` at the top of the file
 *      (outside any `describe`). Same final shape as the standard codemod.
 *
 *   B) **Describe-scoped** — `let adapter`, `beforeAll`, and
 *      `withTransactionalFixtures` live inside the outer `describe` callback.
 *      These are hoisted to module level during transformation.
 *
 * Both variants produce the same output:
 *   - `setupHandlerSuite()` at module level
 *   - `useHandlerTransactionalFixtures()` at module level
 *   - `beforeAll(async () => { await defineSchema({...}); })` at module level
 *   - `this.adapter = adapter` removed from static blocks
 *
 * Files the codemod cannot handle (e.g. inline `createSidecarTestAdapter()` inside
 * an `it()` body) are skipped with a logged reason.
 *
 * Usage:
 *   pnpm tsx scripts/d1-migrate-sidecar.ts <file>...           # dry-run (default)
 *   pnpm tsx scripts/d1-migrate-sidecar.ts --write <file>...   # apply to disk
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Project,
  SyntaxKind,
  Node,
  type SourceFile,
  type CallExpression,
  type ExpressionStatement,
  type VariableDeclaration,
  type Block,
} from "ts-morph";

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

function findCallInNode(
  node: Node,
  predicate: (call: CallExpression) => boolean,
): CallExpression | undefined {
  let found: CallExpression | undefined;
  node.forEachDescendant((d, traversal) => {
    if (d.isKind(SyntaxKind.CallExpression) && predicate(d as CallExpression)) {
      found = d as CallExpression;
      traversal.stop();
    }
  });
  return found;
}

function callNameMatches(call: CallExpression, name: string): boolean {
  const expr = call.getExpression();
  if (expr.isKind(SyntaxKind.Identifier)) return expr.getText() === name;
  if (expr.isKind(SyntaxKind.PropertyAccessExpression)) {
    return (expr as any).getName() === name;
  }
  return false;
}

/** Describes where the sidecar adapter pattern lives in the file. */
type PatternScope = "module" | "describe";

interface SidecarPatternInfo {
  scope: PatternScope;
  adapterVarName: string;
  adapterDecl: VariableDeclaration;
  /** The ExpressionStatement containing the `beforeAll(...)` that inits the adapter */
  beforeAllStmt: ExpressionStatement;
  /** The `({ adapter } = createSidecarTestAdapter())` expression statement */
  adapterInitStmt: ExpressionStatement;
  defineSchemaCall: CallExpression;
  /** The `withTransactionalFixtures(() => adapter)` statement (if present) */
  withTxFixturesStmt: ExpressionStatement | null;
  /**
   * For "describe" scope: the describe ExpressionStatement so we can insert
   * setupHandlerSuite() before it at module level.
   */
  describeStmt: ExpressionStatement | null;
}

function analyze(sf: SourceFile): SidecarPatternInfo | { skip: string } {
  // Already-migrated check
  for (const imp of sf.getImportDeclarations()) {
    if (imp.getModuleSpecifierValue().endsWith("/setup-handler-suite.js")) {
      return { skip: "already-migrated" };
    }
  }

  // Must import createSidecarTestAdapter
  const hasSidecarImport = sf.getImportDeclarations().some((imp) => {
    if (!imp.getModuleSpecifierValue().endsWith("/test-adapter.js")) return false;
    return imp.getNamedImports().some((n) => n.getName() === "createSidecarTestAdapter");
  });
  if (!hasSidecarImport) return { skip: "no createSidecarTestAdapter import" };

  // Find where the sidecar call lives to determine scope
  const sidecarCall = findCallInNode(sf, (c) => callNameMatches(c, "createSidecarTestAdapter"));
  if (!sidecarCall) return { skip: "createSidecarTestAdapter not called" };

  // Determine if the call is inside a beforeAll body or inline (e.g. inside `it()`)
  // Walk up ancestors to find the enclosing statement at describe/module level
  const enclosingBeforeAll = sidecarCall.getFirstAncestorByKind(SyntaxKind.CallExpression);
  if (!enclosingBeforeAll || !callNameMatches(enclosingBeforeAll, "beforeAll")) {
    return {
      skip: "createSidecarTestAdapter() is not inside a beforeAll — likely inline usage (e.g. inside it()); requires manual migration",
    };
  }

  // The beforeAll ExpressionStatement
  const beforeAllStmt = enclosingBeforeAll.getFirstAncestorByKind(SyntaxKind.ExpressionStatement);
  if (!beforeAllStmt) return { skip: "could not find beforeAll ExpressionStatement" };

  // The ExpressionStatement containing the sidecarCall itself
  const adapterInitStmt = sidecarCall.getFirstAncestorByKind(SyntaxKind.ExpressionStatement);
  if (!adapterInitStmt) return { skip: "could not find adapter init ExpressionStatement" };

  // Determine scope: is beforeAllStmt a direct child of SourceFile or inside a describe?
  const beforeAllParent = beforeAllStmt.getParent();
  let scope: PatternScope;
  let describeStmt: ExpressionStatement | null = null;

  if (beforeAllParent?.isKind(SyntaxKind.SourceFile)) {
    scope = "module";
  } else if (beforeAllParent?.isKind(SyntaxKind.Block)) {
    // Inside an arrow function body; check if that arrow function is inside a describe call
    const arrowFn = beforeAllParent.getParent();
    if (!arrowFn?.isKind(SyntaxKind.ArrowFunction)) {
      return { skip: "beforeAll is nested in unexpected structure" };
    }
    const describeCall = arrowFn.getParent();
    if (
      !describeCall?.isKind(SyntaxKind.CallExpression) ||
      !callNameMatches(describeCall as CallExpression, "describe")
    ) {
      return { skip: "beforeAll is inside an arrow function that is not a describe callback" };
    }
    scope = "describe";
    describeStmt = describeCall.getFirstAncestorByKind(SyntaxKind.ExpressionStatement) ?? null;
  } else {
    return { skip: `unexpected beforeAll parent kind: ${beforeAllParent?.getKindName()}` };
  }

  // Find the `let adapter: SidecarAdapter` declaration
  // Search in the same scope as beforeAll
  let adapterDecl: VariableDeclaration | undefined;
  let adapterVarName: string | undefined;

  const scopeStatements: Node[] =
    scope === "module" ? sf.getStatements() : (beforeAllParent as Block).getStatements();

  for (const stmt of scopeStatements) {
    if (!stmt.isKind(SyntaxKind.VariableStatement)) continue;
    const vs = stmt.asKindOrThrow(SyntaxKind.VariableStatement);
    if (vs.getDeclarationKind() !== "let") continue;
    for (const decl of vs.getDeclarations()) {
      const typeText = decl.getTypeNode()?.getText() ?? "";
      if (/SidecarAdapter/.test(typeText) && !decl.getInitializer()) {
        adapterDecl = decl;
        adapterVarName = decl.getName();
        break;
      }
    }
    if (adapterDecl) break;
  }

  if (!adapterDecl || !adapterVarName) {
    return {
      skip: "could not find `let adapter: SidecarAdapter` declaration in the expected scope",
    };
  }

  // Find defineSchema(adapter, {...}) inside the beforeAll body
  const beforeAllBody = (enclosingBeforeAll.getArguments()[0] as any)?.getBody?.() as
    | Block
    | undefined;
  if (!beforeAllBody) return { skip: "beforeAll has no block body" };

  const defineSchemaCall = findCallInNode(beforeAllBody, (c) => callNameMatches(c, "defineSchema"));
  if (!defineSchemaCall) return { skip: "no defineSchema call inside beforeAll" };

  // Verify defineSchema first arg is the adapter
  const firstArg = defineSchemaCall.getArguments()[0];
  if (!firstArg || firstArg.getText() !== adapterVarName) {
    return {
      skip: `defineSchema first arg is "${firstArg?.getText()}" not "${adapterVarName}" — unexpected shape`,
    };
  }

  // Reference scan: ensure the adapter variable is only used in supported contexts.
  // Supported: defineSchema first arg, the createSidecarTestAdapter assignment,
  // withTransactionalFixtures arrow body, this.adapter = adapter, ClassName.adapter = adapter.
  // Anything else (e.g. dropAllTables(adapter), adapter.execute()) requires manual migration.
  const adapterRefs = sf.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => {
    if (id.getText() !== adapterVarName) return false;
    const parent = id.getParent();
    if (!parent) return false;
    // Skip the declaration itself
    if (Node.isVariableDeclaration(parent) && parent.getNameNode() === id) return false;
    // Skip property-access *names* (e.g. the `.adapter` in `this.adapter`)
    if (parent.isKind(SyntaxKind.PropertyAccessExpression) && (parent as any).getNameNode() === id)
      return false;
    // Skip import/export specifier names
    if (
      parent.isKind(SyntaxKind.ImportSpecifier) ||
      parent.isKind(SyntaxKind.ExportSpecifier) ||
      parent.isKind(SyntaxKind.NamedImports)
    )
      return false;
    return true;
  });

  for (const ref of adapterRefs) {
    const parent = ref.getParent();
    if (!parent) continue;
    // Allowed: defineSchema(adapter, ...)
    if (parent === defineSchemaCall) continue;
    // Allowed: the entire adapterInitStmt (createSidecarTestAdapter destructuring assignment)
    if (adapterInitStmt.getDescendants().includes(ref as any)) continue;
    // Allowed: `adapter = createSidecarTestAdapter()` assignment in beforeAll
    if (
      Node.isBinaryExpression(parent) &&
      parent.getOperatorToken().getKind() === SyntaxKind.EqualsToken &&
      parent.getLeft() === ref
    ) {
      const rhs = parent.getRight();
      if (
        rhs.isKind(SyntaxKind.CallExpression) &&
        callNameMatches(rhs as CallExpression, "createSidecarTestAdapter")
      )
        continue;
    }
    // Allowed: arrow body of withTransactionalFixtures, e.g. `() => adapter`
    if (Node.isArrowFunction(parent) && parent.getBody() === ref) {
      const arrowParent = parent.getParent();
      if (
        arrowParent &&
        Node.isCallExpression(arrowParent) &&
        callNameMatches(arrowParent, "withTransactionalFixtures")
      )
        continue;
    }
    // Allowed: `this.adapter = adapter` or `ClassName.adapter = adapter`
    if (
      Node.isBinaryExpression(parent) &&
      parent.getOperatorToken().getKind() === SyntaxKind.EqualsToken &&
      parent.getRight() === ref
    ) {
      const lhs = parent.getLeft();
      if (lhs.isKind(SyntaxKind.PropertyAccessExpression)) {
        const pae = lhs as any;
        if (pae.getName() === "adapter") continue;
      }
    }
    return {
      skip: `adapter variable "${adapterVarName}" used in unsupported context: ${parent.getKindName()} -> ${parent.getText().slice(0, 80)}`,
    };
  }

  // Find withTransactionalFixtures in the same scope as beforeAll
  let withTxFixturesStmt: ExpressionStatement | null = null;
  const searchNode: Node = scope === "module" ? sf : (beforeAllParent as Block);
  for (const child of searchNode.isKind(SyntaxKind.SourceFile)
    ? sf.getStatements()
    : (searchNode as Block).getStatements()) {
    if (!child.isKind(SyntaxKind.ExpressionStatement)) continue;
    const call = child
      .asKindOrThrow(SyntaxKind.ExpressionStatement)
      .getExpressionIfKind(SyntaxKind.CallExpression);
    if (call && callNameMatches(call, "withTransactionalFixtures")) {
      withTxFixturesStmt = child.asKindOrThrow(SyntaxKind.ExpressionStatement);
      break;
    }
  }

  return {
    scope,
    adapterVarName,
    adapterDecl,
    beforeAllStmt,
    adapterInitStmt,
    defineSchemaCall,
    withTxFixturesStmt,
    describeStmt,
  };
}

function transform(sf: SourceFile, info: SidecarPatternInfo, helpersRel: string): string[] {
  const details: string[] = [];

  // Helper to add or extend an import
  function ensureImport(spec: string, names: string[]) {
    let imp = sf.getImportDeclarations().find((i) => i.getModuleSpecifierValue() === spec);
    if (!imp) {
      imp = sf.addImportDeclaration({
        moduleSpecifier: spec,
        namedImports: names.map((n) => ({ name: n })),
      });
      details.push(`added import ${spec}`);
    } else {
      const existing = imp.getNamedImports().map((n) => n.getName());
      const toAdd = names.filter((n) => !existing.includes(n));
      if (toAdd.length) imp.addNamedImports(toAdd.map((n) => ({ name: n })));
    }
  }

  // 1) Determine insertion point for setupHandlerSuite() + useHandlerTransactionalFixtures()
  //    Always insert at module level. For scope=module, insert before the existing beforeAll.
  //    For scope=describe, insert before the describe statement.
  const insertBeforeStmt =
    info.scope === "module" ? info.beforeAllStmt : (info.describeStmt ?? info.beforeAllStmt);

  // 2) Remove adapter init statement from beforeAll body
  info.adapterInitStmt.remove();
  details.push(`removed ({ ${info.adapterVarName} } = createSidecarTestAdapter()) statement`);

  // 3) Rewrite defineSchema(adapter, X[, opts]) → defineSchema(X[, opts])
  //    Capture the updated call text *after* removing the adapter arg so all
  //    remaining args (schema, optional opts) are preserved verbatim.
  info.defineSchemaCall.removeArgument(0);
  const defineSchemaCallText = info.defineSchemaCall.getText();
  details.push(`rewrote defineSchema(${info.adapterVarName}, ...) → defineSchema(...)`);

  // 4) For scope=describe: the beforeAll (now only containing defineSchema) is inside the
  //    describe. We move it to module level by removing it from the describe and inserting
  //    a new module-level one. For scope=module it stays in place.
  if (info.scope === "describe") {
    info.beforeAllStmt.remove();
    details.push("removed beforeAll from inside describe");
  }

  // 5) Remove the adapter variable declaration
  {
    const declStmt = info.adapterDecl.getParent()?.getParent();
    if (declStmt && !declStmt.wasForgotten()) {
      const decls = (declStmt as any).getDeclarations?.();
      if (decls?.length === 1) {
        declStmt.remove();
        details.push(`removed \`let ${info.adapterVarName}\` declaration`);
      } else {
        info.adapterDecl.remove();
        details.push(`removed \`${info.adapterVarName}\` declarator`);
      }
    }
  }

  // 6) Remove withTransactionalFixtures(() => adapter) call
  if (info.withTxFixturesStmt && !info.withTxFixturesStmt.wasForgotten()) {
    info.withTxFixturesStmt.remove();
    details.push("removed withTransactionalFixtures(() => adapter) call");
  }

  // 7) Insert setupHandlerSuite() + useHandlerTransactionalFixtures() at module level,
  //    and if scope=describe also insert the module-level beforeAll.
  //    Find current index of insertBeforeStmt (may have shifted due to previous removes).
  if (!insertBeforeStmt.wasForgotten()) {
    const stmts = sf.getStatements();
    const idx = stmts.indexOf(insertBeforeStmt);
    if (idx < 0) throw new Error("insertBeforeStmt not found in module statements");

    if (info.scope === "describe") {
      sf.insertStatements(idx, [
        `setupHandlerSuite();`,
        `useHandlerTransactionalFixtures();`,
        `beforeAll(async () => {\n  await ${defineSchemaCallText};\n});`,
      ]);
      details.push(
        "inserted setupHandlerSuite(), useHandlerTransactionalFixtures(), beforeAll at module level",
      );
    } else {
      sf.insertStatements(idx, [`setupHandlerSuite();`, `useHandlerTransactionalFixtures();`]);
      details.push(
        "inserted setupHandlerSuite() and useHandlerTransactionalFixtures() before beforeAll",
      );
    }
  } else if (info.scope === "describe") {
    // insertBeforeStmt was removed; append to module level
    sf.addStatements([
      `setupHandlerSuite();`,
      `useHandlerTransactionalFixtures();`,
      `beforeAll(async () => {\n  await ${defineSchemaCallText};\n});`,
    ]);
    details.push("appended setupHandlerSuite(), useHandlerTransactionalFixtures(), beforeAll");
  } else {
    throw new Error("insertBeforeStmt was forgotten and scope is module");
  }

  // 8) Remove `this.adapter = adapter` (static blocks) and `ClassName.adapter = adapter`
  //    (dynamic assignments outside static blocks); drop empty static blocks
  sf.forEachDescendant((d) => {
    if (!d.isKind(SyntaxKind.ExpressionStatement) || d.wasForgotten()) return;
    const expr = d.getExpressionIfKind(SyntaxKind.BinaryExpression);
    if (!expr) return;
    if (expr.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) return;
    const lhs = expr.getLeft();
    if (!lhs.isKind(SyntaxKind.PropertyAccessExpression)) return;
    const pae = lhs as any;
    if (pae.getName() !== "adapter") return;
    // Match both `this.adapter = adapter` and `ClassName.adapter = adapter`
    const rhs = expr.getRight();
    if (rhs.getText() !== info.adapterVarName) return;
    d.remove();
    details.push("removed .adapter = adapter assignment");
  });

  sf.forEachDescendant((d) => {
    if (d.isKind(SyntaxKind.ClassStaticBlockDeclaration) && !d.wasForgotten()) {
      const body = d.getBody();
      if (body.getStatements().length === 0) {
        d.remove();
        details.push("removed empty static block");
      }
    }
  });

  // 9) Add new imports
  ensureImport(`${helpersRel}/setup-handler-suite.js`, ["setupHandlerSuite"]);
  ensureImport(`${helpersRel}/use-handler-transactional-fixtures.js`, [
    "useHandlerTransactionalFixtures",
  ]);

  // 10) Clean up stale test-adapter.js imports
  for (const imp of [...sf.getImportDeclarations()]) {
    if (!imp.getModuleSpecifierValue().endsWith("/test-adapter.js")) continue;
    for (const n of [...imp.getNamedImports()]) {
      const name = n.getName();
      if (name !== "createSidecarTestAdapter" && name !== "SidecarAdapter") continue;
      const refs = sf
        .getDescendantsOfKind(SyntaxKind.Identifier)
        .filter((id) => id.getText() === name && id !== n.getNameNode());
      if (refs.length === 0) n.remove();
    }
    if (imp.getNamedImports().length === 0 && !imp.getDefaultImport()) {
      imp.remove();
      details.push("removed empty test-adapter.js import");
    }
  }

  // 11) Clean up withTransactionalFixtures import if no longer used
  for (const imp of [...sf.getImportDeclarations()]) {
    if (!imp.getModuleSpecifierValue().endsWith("/with-transactional-fixtures.js")) continue;
    for (const n of [...imp.getNamedImports()]) {
      if (n.getName() !== "withTransactionalFixtures") continue;
      const refs = sf
        .getDescendantsOfKind(SyntaxKind.Identifier)
        .filter((id) => id.getText() === "withTransactionalFixtures" && id !== n.getNameNode());
      if (refs.length === 0) n.remove();
    }
    if (imp.getNamedImports().length === 0 && !imp.getDefaultImport()) {
      imp.remove();
      details.push("removed empty with-transactional-fixtures.js import");
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
  const analysis = analyze(sf);
  if ("skip" in analysis) {
    if (analysis.skip === "already-migrated") return { file: filePath, status: "already-migrated" };
    return { file: filePath, status: "skipped", reason: analysis.skip };
  }
  const helpersRel = relPathToHelpers(filePath);
  let details: string[];
  try {
    details = transform(sf, analysis, helpersRel);
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

export function migrateText(text: string, filePath: string): string | { skip: string } {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    useInMemoryFileSystem: false,
    compilerOptions: { target: 99 },
  });
  const sf = project.createSourceFile(filePath, text, { overwrite: true });
  const analysis = analyze(sf);
  if ("skip" in analysis) return { skip: analysis.skip };
  const helpersRel = relPathToHelpers(filePath);
  transform(sf, analysis, helpersRel);
  sf.formatText();
  return sf.getFullText();
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const files = args.filter((a) => !a.startsWith("--"));
  if (files.length === 0) {
    console.error(
      "usage: d1-migrate-sidecar <file>...               # dry-run (default)\n" +
        "       d1-migrate-sidecar --write <file>...       # apply changes",
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
    const analysis = analyze(sf);
    if ("skip" in analysis) {
      if (analysis.skip === "already-migrated") {
        results.push({ file: f, status: "already-migrated" });
      } else {
        results.push({ file: f, status: "skipped", reason: analysis.skip });
      }
      sf.forget();
      continue;
    }
    const helpersRel = relPathToHelpers(abs);
    let details: string[];
    try {
      details = transform(sf, analysis, helpersRel);
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

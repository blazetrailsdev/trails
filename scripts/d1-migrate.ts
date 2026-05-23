#!/usr/bin/env tsx
/**
 * D-1 Rails-shape migration codemod.
 *
 * Transforms test files from the legacy `createTestAdapter()` + `Model.adapter = adapter`
 * bypass to the Rails-shape `setupHandlerSuite()` + handler-resolved adapter.
 *
 * Handles only the **standard pattern**:
 *   - module-level `let adapter` declaration with `createTestAdapter()` initialization
 *     inside a `beforeAll`
 *   - `defineSchema(adapter, { ... })` called once inside that same `beforeAll`
 *   - optional pre-existing `withTransactionalFixtures(() => adapter)` at
 *     module level (if absent, the codemod inserts the handler-resolved form
 *     — every transformed file ends up calling `withTransactionalFixtures`)
 *   - `this.adapter = adapter` inside class static blocks
 *
 * Anything more exotic (sidecar adapters, `defineSchema` inside `it()`, adapter
 * declared inside a `describe`, custom adapter wrappers) is detected and skipped
 * with a logged reason so it can be handled manually.
 *
 * Usage:
 *   pnpm tsx scripts/d1-migrate.ts <file>...           # dry-run (default; prints plan)
 *   pnpm tsx scripts/d1-migrate.ts --write <file>...   # apply changes to disk
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
  type ImportDeclaration,
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

function findCall(
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

interface PatternInfo {
  adapterVarName: string;
  beforeAllStmt: ExpressionStatement;
  defineSchemaCall: CallExpression;
  schemaArg: string; // text of schema object
  testAdapterImport: ImportDeclaration;
  withTxFixturesCall: CallExpression | null;
  hasFreshAdapterHelper: boolean;
}

function analyze(sf: SourceFile): PatternInfo | { skip: string } {
  // Already-migrated check
  for (const imp of sf.getImportDeclarations()) {
    if (imp.getModuleSpecifierValue().endsWith("/setup-handler-suite.js")) {
      return { skip: "already-migrated" };
    }
  }

  // Forbid sidecar-style adapters
  const sidecarCall = findCall(
    sf,
    (c) =>
      callNameMatches(c, "createSidecarTestAdapter") ||
      callNameMatches(c, "createPooledTestAdapter"),
  );
  if (sidecarCall) return { skip: "uses createSidecarTestAdapter/createPooledTestAdapter" };

  // Must import createTestAdapter
  let testAdapterImport: ImportDeclaration | undefined;
  for (const imp of sf.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    if (spec.endsWith("/test-adapter.js")) {
      const named = imp.getNamedImports().map((n) => n.getName());
      if (named.includes("createTestAdapter")) {
        testAdapterImport = imp;
        break;
      }
    }
  }
  if (!testAdapterImport) return { skip: "no createTestAdapter import" };

  // Must have a module-level `let <adapter>: <Type>` declaration
  let adapterVarName: string | null = null;
  for (const stmt of sf.getVariableStatements()) {
    if (stmt.getDeclarationKind() !== "let") continue;
    for (const decl of stmt.getDeclarations()) {
      const init = decl.getInitializer();
      if (init) continue;
      const typeText = decl.getTypeNode()?.getText() ?? "";
      if (/TestDatabaseAdapter|DatabaseAdapter/.test(typeText)) {
        adapterVarName = decl.getName();
        break;
      }
    }
    if (adapterVarName) break;
  }
  if (!adapterVarName) return { skip: "no module-level adapter let declaration" };

  // Find beforeAll at module level
  const beforeAllStmts = sf
    .getStatements()
    .filter(
      (s) =>
        s.isKind(SyntaxKind.ExpressionStatement) &&
        s.getExpressionIfKind(SyntaxKind.CallExpression)?.getExpression().getText() === "beforeAll",
    );
  if (beforeAllStmts.length === 0) return { skip: "no module-level beforeAll" };
  if (beforeAllStmts.length > 1) return { skip: "multiple module-level beforeAll blocks" };
  const beforeAllStmt = beforeAllStmts[0].asKindOrThrow(SyntaxKind.ExpressionStatement);
  const beforeAllCall = beforeAllStmt.getExpressionIfKindOrThrow(SyntaxKind.CallExpression);

  // Find defineSchema call inside beforeAll
  const defineSchemaCalls: CallExpression[] = [];
  beforeAllCall.forEachDescendant((d) => {
    if (
      d.isKind(SyntaxKind.CallExpression) &&
      callNameMatches(d as CallExpression, "defineSchema")
    ) {
      defineSchemaCalls.push(d as CallExpression);
    }
  });
  if (defineSchemaCalls.length === 0) return { skip: "no defineSchema in beforeAll" };
  if (defineSchemaCalls.length > 1) return { skip: "multiple defineSchema calls in beforeAll" };
  const defineSchemaCall = defineSchemaCalls[0];

  // Check no defineSchema is called outside the beforeAll
  let externalDefineSchema = false;
  sf.forEachDescendant((d) => {
    if (
      d.isKind(SyntaxKind.CallExpression) &&
      callNameMatches(d as CallExpression, "defineSchema") &&
      !defineSchemaCalls.includes(d as CallExpression)
    ) {
      externalDefineSchema = true;
    }
  });
  if (externalDefineSchema) return { skip: "defineSchema called outside beforeAll" };

  // Confirm defineSchema args: (adapterVar, <schemaObject>)
  const dsArgs = defineSchemaCall.getArguments();
  if (dsArgs.length !== 2) return { skip: `defineSchema expected 2 args, got ${dsArgs.length}` };
  if (dsArgs[0].getText() !== adapterVarName) {
    return { skip: `defineSchema first arg is "${dsArgs[0].getText()}", not "${adapterVarName}"` };
  }
  const schemaArg = dsArgs[1].getText();

  // Locate withTransactionalFixtures call (optional)
  const withTxCalls = sf
    .getStatements()
    .map((s) => s.getExpressionIfKind?.(SyntaxKind.CallExpression))
    .filter((c): c is CallExpression => !!c && callNameMatches(c, "withTransactionalFixtures"));
  if (withTxCalls.length > 1) return { skip: "multiple withTransactionalFixtures calls" };
  const withTxFixturesCall = withTxCalls[0] ?? null;

  // Ensure no createTable / migration mid-test (best-effort string check)
  const fullText = sf.getFullText();
  if (/\b(createTable|migration\.up|migration\.run)\b/.test(fullText)) {
    return { skip: "looks like DDL inside test body (createTable/migration)" };
  }

  // Check that the adapter variable is only used as: defineSchema arg, withTransactionalFixtures arrow,
  // assignment target inside beforeAll, or `this.adapter = <var>` inside static blocks.
  // If used elsewhere (e.g., adapter.execute()), skip.
  const adapterRefs = sf.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => {
    if (id.getText() !== adapterVarName) return false;
    const parent = id.getParent();
    if (!parent) return false;
    // Skip the declaration itself
    if (Node.isVariableDeclaration(parent) && parent.getNameNode() === id) return false;
    // Skip property-access *names* (e.g. the `.adapter` in `this.adapter`); only `.expression` is a ref
    if (
      parent.isKind(SyntaxKind.PropertyAccessExpression) &&
      (parent as any).getNameNode() === id
    ) {
      return false;
    }
    // Skip import/export specifier names
    if (
      parent.isKind(SyntaxKind.ImportSpecifier) ||
      parent.isKind(SyntaxKind.ExportSpecifier) ||
      parent.isKind(SyntaxKind.NamedImports)
    ) {
      return false;
    }
    return true;
  });

  for (const ref of adapterRefs) {
    const parent = ref.getParent();
    if (!parent) continue;
    // Allowed: defineSchema(adapter, ...)
    if (parent === defineSchemaCall) continue;
    // Allowed: `adapter = createTestAdapter()` assignment in beforeAll
    if (
      Node.isBinaryExpression(parent) &&
      parent.getOperatorToken().getKind() === SyntaxKind.EqualsToken &&
      parent.getLeft() === ref
    ) {
      const rhs = parent.getRight();
      if (
        rhs.isKind(SyntaxKind.CallExpression) &&
        callNameMatches(rhs as CallExpression, "createTestAdapter")
      ) {
        continue;
      }
    }
    // Allowed: arrow body of withTransactionalFixtures, e.g. `() => adapter`
    if (Node.isArrowFunction(parent) && parent.getBody() === ref) {
      const arrowParent = parent.getParent();
      if (
        arrowParent &&
        Node.isCallExpression(arrowParent) &&
        callNameMatches(arrowParent, "withTransactionalFixtures")
      ) {
        continue;
      }
    }
    // Allowed: `this.adapter = adapter` inside static block / class
    if (
      Node.isBinaryExpression(parent) &&
      parent.getOperatorToken().getKind() === SyntaxKind.EqualsToken &&
      parent.getRight() === ref
    ) {
      const lhs = parent.getLeft();
      if (lhs.isKind(SyntaxKind.PropertyAccessExpression)) {
        const pae = lhs as any;
        if (pae.getExpression().getText() === "this" && pae.getName() === "adapter") {
          continue;
        }
      }
    }
    return {
      skip: `adapter variable "${adapterVarName}" used in unsupported context: ${parent.getKindName()} -> ${parent.getText().slice(0, 80)}`,
    };
  }

  return {
    adapterVarName,
    beforeAllStmt,
    defineSchemaCall,
    schemaArg,
    testAdapterImport,
    withTxFixturesCall,
    hasFreshAdapterHelper: false,
  };
}

function transform(sf: SourceFile, info: PatternInfo, helpersRel: string): string[] {
  const details: string[] = [];

  // 1) Rewrite imports.
  // Remove ./test-adapter.js imports of createTestAdapter & TestDatabaseAdapter
  for (const imp of sf.getImportDeclarations()) {
    if (imp.getModuleSpecifierValue().endsWith("/test-adapter.js")) {
      const named = imp.getNamedImports();
      for (const n of [...named]) {
        if (n.getName() === "createTestAdapter" || n.getName() === "TestDatabaseAdapter") {
          n.remove();
        }
      }
      if (imp.getNamedImports().length === 0 && !imp.getDefaultImport()) {
        imp.remove();
        details.push("removed empty test-adapter.js import");
      }
    }
  }
  // Remove ./adapter.js DatabaseAdapter import if unused elsewhere
  for (const imp of [...sf.getImportDeclarations()]) {
    if (imp.getModuleSpecifierValue().endsWith("/adapter.js")) {
      const named = imp.getNamedImports();
      for (const n of [...named]) {
        if (n.getName() === "DatabaseAdapter") {
          // Conservatively remove only if no remaining reference outside this import
          const refs = sf
            .getDescendantsOfKind(SyntaxKind.Identifier)
            .filter((id) => id.getText() === "DatabaseAdapter" && id !== n.getNameNode());
          if (refs.length === 0) n.remove();
        }
      }
      if (imp.getNamedImports().length === 0 && !imp.getDefaultImport()) {
        imp.remove();
      }
    }
  }

  // Add new imports if missing. The codemod no longer emits beforeAll/afterAll
  // teardown inline (that lives inside useHandlerTransactionalFixtures), nor
  // does it reference TransactionalFixturesAdapter, clearAppliedSchemaSignatures,
  // dropAllTables, or Base.adapter at the call site. The helper imports all of
  // those internally — keep the per-file import surface minimal.
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
  ensureImport(`${helpersRel}/setup-handler-suite.js`, ["setupHandlerSuite"]);

  // 2) Remove the matching declarator from any module-level `let` statement.
  // If the statement combines multiple declarations (e.g. `let adapter: ..., other = ...`),
  // only the adapter declarator is removed; the statement itself is dropped only if it
  // becomes empty.
  for (const stmt of [...sf.getVariableStatements()]) {
    if (stmt.wasForgotten() || stmt.getDeclarationKind() !== "let") continue;
    for (const decl of [...stmt.getDeclarations()]) {
      if (decl.getName() === info.adapterVarName) {
        // ts-morph removes the parent VariableStatement automatically when
        // its last declarator is dropped, so no extra cleanup is needed.
        decl.remove();
        details.push(`removed "let ${info.adapterVarName}" declarator`);
      }
    }
  }

  // 3) Replace beforeAll body: replace `adapter = createTestAdapter()` and rewrite defineSchema
  // Easiest: rewrite via text by manipulating statements directly.
  const beforeAllCall = info.beforeAllStmt.getExpressionIfKindOrThrow(SyntaxKind.CallExpression);
  const beforeAllArrow = beforeAllCall.getArguments()[0];
  if (!beforeAllArrow || !Node.isArrowFunction(beforeAllArrow)) {
    throw new Error("beforeAll arg is not an arrow function");
  }
  const body = beforeAllArrow.getBody();
  if (!Node.isBlock(body)) {
    throw new Error("beforeAll arrow body is not a block");
  }

  // Find & remove `adapter = createTestAdapter()` statement
  for (const stmt of [...body.getStatements()]) {
    const expr = stmt.getExpressionIfKind?.(SyntaxKind.BinaryExpression);
    if (
      expr &&
      expr.getOperatorToken().getKind() === SyntaxKind.EqualsToken &&
      expr.getLeft().getText() === info.adapterVarName
    ) {
      const rhs = expr.getRight();
      if (
        rhs.isKind(SyntaxKind.CallExpression) &&
        callNameMatches(rhs as CallExpression, "createTestAdapter")
      ) {
        stmt.remove();
        details.push("removed `adapter = createTestAdapter()`");
      }
    }
  }

  // Rewrite defineSchema(adapter, X) → defineSchema(X)
  info.defineSchemaCall.removeArgument(0);
  details.push("rewrote defineSchema(adapter, X) → defineSchema(X)");
  beforeAllArrow.setIsAsync(true);

  // 4) Insert `setupHandlerSuite(); useHandlerTransactionalFixtures();` before beforeAll.
  // The helper encapsulates the withTransactionalFixtures registration and the
  // afterAll dropAllTables + clearAppliedSchemaSignatures teardown. Pool-level
  // fixture pinning (handled inside ConnectionPool#pinConnectionBang under
  // `{ fixture: true }`) is what makes the cross-context beforeEach/afterEach
  // pairing work — no per-file proxy or _txAdapter declaration needed.
  // `insertStatements` expects an index into `sf.getStatements()`, not the
  // raw child index (which counts every AST child including syntax-list
  // wrappers). Look the statement up by identity in the statements array.
  const beforeAllIdx = sf.getStatements().indexOf(info.beforeAllStmt);
  if (beforeAllIdx < 0) throw new Error("beforeAllStmt no longer in SourceFile.getStatements()");
  sf.insertStatements(beforeAllIdx, [`setupHandlerSuite();`, `useHandlerTransactionalFixtures();`]);
  ensureImport(`${helpersRel}/use-handler-transactional-fixtures.js`, [
    "useHandlerTransactionalFixtures",
  ]);

  // 5) Drop any pre-existing module-level `withTransactionalFixtures(...)` call —
  // `useHandlerTransactionalFixtures()` already registers it.
  if (info.withTxFixturesCall) {
    const parentStmt = info.withTxFixturesCall.getFirstAncestorByKind(
      SyntaxKind.ExpressionStatement,
    );
    if (parentStmt) {
      parentStmt.remove();
      details.push("removed legacy withTransactionalFixtures(() => adapter) call");
    }
  }

  // The withTransactionalFixtures import is no longer needed if it was only used
  // by the call we just deleted. Conservatively drop the named import if nothing
  // else references it.
  for (const imp of [...sf.getImportDeclarations()]) {
    if (!imp.getModuleSpecifierValue().endsWith("/with-transactional-fixtures.js")) continue;
    for (const n of [...imp.getNamedImports()]) {
      if (n.getName() !== "withTransactionalFixtures") continue;
      const refs = sf
        .getDescendantsOfKind(SyntaxKind.Identifier)
        .filter((id) => id.getText() === "withTransactionalFixtures" && id !== n.getNameNode());
      if (refs.length === 0) n.remove();
    }
    if (imp.getNamedImports().length === 0 && !imp.getDefaultImport()) imp.remove();
  }

  // 7) Remove `this.adapter = adapter` inside static blocks; drop empty static blocks
  sf.forEachDescendant((d) => {
    if (!d.isKind(SyntaxKind.ExpressionStatement)) return;
    const expr = d.getExpressionIfKind(SyntaxKind.BinaryExpression);
    if (!expr) return;
    if (expr.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) return;
    const lhs = expr.getLeft();
    if (!lhs.isKind(SyntaxKind.PropertyAccessExpression)) return;
    const pae = lhs as any;
    if (pae.getExpression().getText() !== "this" || pae.getName() !== "adapter") return;
    if (expr.getRight().getText() !== info.adapterVarName) return;
    d.remove();
    details.push("removed this.adapter = adapter assignment");
  });

  // Remove now-empty static blocks
  sf.forEachDescendant((d) => {
    if (d.isKind(SyntaxKind.ClassStaticBlockDeclaration)) {
      const body = d.getBody();
      if (body.getStatements().length === 0) {
        d.remove();
        details.push("removed empty static block");
      }
    }
  });

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
    if (analysis.skip === "already-migrated") {
      return { file: filePath, status: "already-migrated" };
    }
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
  // Save and return text
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
  const dryRun = args.includes("--dry-run");
  const write = args.includes("--write");
  if (dryRun && write) {
    console.error("error: --dry-run and --write are mutually exclusive");
    process.exit(2);
  }
  const files = args.filter((a) => !a.startsWith("--"));
  if (files.length === 0) {
    console.error(
      "usage: d1-migrate <file>...               # dry-run (default)\n" +
        "       d1-migrate --write <file>...       # apply changes",
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

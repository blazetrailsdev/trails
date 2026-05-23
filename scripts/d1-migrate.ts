#!/usr/bin/env tsx
/**
 * D-1 Rails-shape migration codemod.
 *
 * Transforms test files from the legacy `createTestAdapter()` + `Model.adapter = adapter`
 * bypass to the Rails-shape `setupHandlerSuite()` + handler-resolved adapter.
 *
 * Handles two standard patterns:
 *
 * **Module-level** (`scope: "module"`):
 *   - `let adapter` at module level, initialized in a module-level `beforeAll`
 *   - `defineSchema(adapter, {...})` inside that `beforeAll`
 *   - optional `withTransactionalFixtures(() => adapter)` at module level
 *   - `this.adapter = adapter` inside class static blocks, or `ClassName.adapter = adapter`
 *
 * **Describe-level** (`scope: "describe"`):
 *   - exactly one top-level `describe(name, () => { ... })` with `let adapter`
 *     declared inside its callback body (not at module level)
 *   - same `beforeAll`/`defineSchema`/`withTransactionalFixtures` pattern,
 *     but scoped inside the describe block
 *   - helpers are inserted inside the describe block; vitest scopes hooks
 *     to the enclosing `describe` automatically
 *
 * Anything more exotic (sidecar adapters, multiple adapters, `defineSchema`
 * outside `beforeAll`, multiple describes with distinct adapters) is skipped
 * with a logged reason.
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
  type Block,
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
  scope: "module" | "describe";
  /** For describe-level: the Block node of the describe callback body. */
  describeBody?: Block;
  /** For describe-level: a simple `afterAll(dropAllTables)` to remove — covered by useHandlerTransactionalFixtures. */
  afterAllToRemove?: ExpressionStatement;
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

  // Try module-level `let <adapter>: <Type>` declaration first.
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

  if (adapterVarName) {
    return analyzeModuleLevel(sf, adapterVarName, testAdapterImport);
  }

  // Fall back to describe-level pattern.
  return analyzeDescribeLevel(sf, testAdapterImport);
}

/** Shared adapter-ref safety check used by both module- and describe-level analysis. */
function checkAdapterRefs(
  sf: SourceFile,
  adapterVarName: string,
  defineSchemaCall: CallExpression,
  afterAllToRemove: ExpressionStatement | undefined,
): { skip: string } | null {
  const adapterRefs = sf.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => {
    if (id.getText() !== adapterVarName) return false;
    const parent = id.getParent();
    if (!parent) return false;
    if (Node.isVariableDeclaration(parent) && parent.getNameNode() === id) return false;
    if (
      parent.isKind(SyntaxKind.PropertyAccessExpression) &&
      (parent as any).getNameNode() === id
    ) {
      return false;
    }
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
    if (parent === defineSchemaCall) continue;
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
    if (
      Node.isBinaryExpression(parent) &&
      parent.getOperatorToken().getKind() === SyntaxKind.EqualsToken &&
      parent.getRight() === ref
    ) {
      const lhs = parent.getLeft();
      if (lhs.isKind(SyntaxKind.PropertyAccessExpression)) {
        const pae = lhs as any;
        const obj = pae.getExpression();
        // Only allow `this.adapter` (static blocks) or `ClassName.adapter` (Identifier.adapter).
        // Reject casts, arbitrary expressions, nested property accesses, etc.
        if (
          pae.getName() === "adapter" &&
          (obj.isKind(SyntaxKind.ThisKeyword) || obj.isKind(SyntaxKind.Identifier))
        ) {
          continue;
        }
      }
    }
    // Allowed: dropAllTables(adapter) inside the afterAll we will remove
    if (afterAllToRemove) {
      let cur: Node | undefined = ref.getParent();
      let underAfterAll = false;
      while (cur) {
        if (cur === afterAllToRemove) {
          underAfterAll = true;
          break;
        }
        cur = cur.getParent();
      }
      if (underAfterAll) continue;
    }
    return {
      skip: `adapter variable "${adapterVarName}" used in unsupported context: ${parent.getKindName()} -> ${parent.getText().slice(0, 80)}`,
    };
  }
  return null;
}

/** Shared beforeAll/defineSchema extraction used by both module- and describe-level. */
function extractBeforeAllAndSchema(
  stmts: ReturnType<SourceFile["getStatements"]>,
  label: string,
): { beforeAllStmt: ExpressionStatement; defineSchemaCall: CallExpression } | { skip: string } {
  const beforeAllStmts = stmts.filter(
    (s) =>
      s.isKind(SyntaxKind.ExpressionStatement) &&
      s.getExpressionIfKind(SyntaxKind.CallExpression)?.getExpression().getText() === "beforeAll",
  );
  if (beforeAllStmts.length === 0) return { skip: `no ${label} beforeAll` };
  if (beforeAllStmts.length > 1) return { skip: `multiple ${label} beforeAll blocks` };
  const beforeAllStmt = beforeAllStmts[0].asKindOrThrow(SyntaxKind.ExpressionStatement);
  const beforeAllCall = beforeAllStmt.getExpressionIfKindOrThrow(SyntaxKind.CallExpression);

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
  return { beforeAllStmt, defineSchemaCall: defineSchemaCalls[0] };
}

function analyzeModuleLevel(
  sf: SourceFile,
  adapterVarName: string,
  testAdapterImport: ImportDeclaration,
): PatternInfo | { skip: string } {
  const stmts = sf.getStatements();
  const result = extractBeforeAllAndSchema(stmts, "module-level");
  if ("skip" in result) return result;
  const { beforeAllStmt, defineSchemaCall } = result;

  let externalDefineSchema = false;
  sf.forEachDescendant((d) => {
    if (
      d.isKind(SyntaxKind.CallExpression) &&
      callNameMatches(d as CallExpression, "defineSchema") &&
      d !== defineSchemaCall
    ) {
      externalDefineSchema = true;
    }
  });
  if (externalDefineSchema) return { skip: "defineSchema called outside beforeAll" };

  const dsArgs = defineSchemaCall.getArguments();
  if (dsArgs.length !== 2) return { skip: `defineSchema expected 2 args, got ${dsArgs.length}` };
  if (dsArgs[0].getText() !== adapterVarName) {
    return { skip: `defineSchema first arg is "${dsArgs[0].getText()}", not "${adapterVarName}"` };
  }
  const schemaArg = dsArgs[1].getText();

  const withTxCalls = stmts
    .map((s) => s.getExpressionIfKind?.(SyntaxKind.CallExpression))
    .filter((c): c is CallExpression => !!c && callNameMatches(c, "withTransactionalFixtures"));
  if (withTxCalls.length > 1) return { skip: "multiple withTransactionalFixtures calls" };
  const withTxFixturesCall = withTxCalls[0] ?? null;

  const fullText = sf.getFullText();
  if (/\b(createTable|migration\.up|migration\.run)\b/.test(fullText)) {
    return { skip: "looks like DDL inside test body (createTable/migration)" };
  }

  const refErr = checkAdapterRefs(sf, adapterVarName, defineSchemaCall, undefined);
  if (refErr) return refErr;

  return {
    adapterVarName,
    beforeAllStmt,
    defineSchemaCall,
    schemaArg,
    testAdapterImport,
    withTxFixturesCall,
    hasFreshAdapterHelper: false,
    scope: "module",
  };
}

function analyzeDescribeLevel(
  sf: SourceFile,
  testAdapterImport: ImportDeclaration,
): PatternInfo | { skip: string } {
  // Find top-level describe calls
  const topDescribes = sf.getStatements().filter((s): s is ExpressionStatement => {
    if (!s.isKind(SyntaxKind.ExpressionStatement)) return false;
    const call = s.getExpressionIfKind(SyntaxKind.CallExpression);
    return !!call && callNameMatches(call, "describe");
  });
  if (topDescribes.length === 0) return { skip: "no top-level describe" };

  // Only handle the single-describe case for now; multiple describes with
  // distinct adapters need manual migration.
  if (topDescribes.length > 1) {
    // Check if any describe has a let adapter inside; if so, it's the multi-describe case
    for (const ds of topDescribes) {
      const call = ds.getExpressionIfKind(SyntaxKind.CallExpression)!;
      const cb = call.getArguments()[1] ?? call.getArguments()[0];
      if (!cb || !Node.isArrowFunction(cb)) continue;
      const body = cb.getBody();
      if (!Node.isBlock(body)) continue;
      for (const stmt of body.getStatements()) {
        if (stmt.isKind(SyntaxKind.VariableStatement)) {
          const vs = stmt.asKindOrThrow(SyntaxKind.VariableStatement);
          if (vs.getDeclarationKind() !== "let") continue;
          for (const decl of vs.getDeclarations()) {
            const typeText = decl.getTypeNode()?.getText() ?? "";
            if (/TestDatabaseAdapter|DatabaseAdapter/.test(typeText) && !decl.getInitializer()) {
              return { skip: "multiple top-level describes with describe-level adapters" };
            }
          }
        }
      }
    }
    return { skip: "multiple top-level describes (no describe-level adapters found)" };
  }

  const describeStmt = topDescribes[0];
  const describeCall = describeStmt.getExpressionIfKindOrThrow(SyntaxKind.CallExpression);
  // describe("Name", () => { ... }) — callback is last arg
  const args = describeCall.getArguments();
  const cb = args[args.length - 1];
  if (!cb || !Node.isArrowFunction(cb))
    return { skip: "describe callback is not an arrow function" };
  const body = cb.getBody();
  if (!Node.isBlock(body)) return { skip: "describe callback body is not a block" };

  // Find `let adapter` inside describe body (direct child only)
  let adapterVarName: string | null = null;
  for (const stmt of body.getStatements()) {
    if (!stmt.isKind(SyntaxKind.VariableStatement)) continue;
    const vs = stmt.asKindOrThrow(SyntaxKind.VariableStatement);
    if (vs.getDeclarationKind() !== "let") continue;
    for (const decl of vs.getDeclarations()) {
      if (decl.getInitializer()) continue;
      const typeText = decl.getTypeNode()?.getText() ?? "";
      if (/TestDatabaseAdapter|DatabaseAdapter/.test(typeText)) {
        if (adapterVarName) return { skip: "multiple let adapter declarations inside describe" };
        adapterVarName = decl.getName();
      }
    }
  }
  if (!adapterVarName) return { skip: "no describe-level adapter let declaration" };

  // Must have exactly one createTestAdapter() call inside the describe (in beforeAll)
  const ctaCalls: CallExpression[] = [];
  body.forEachDescendant((d) => {
    if (
      d.isKind(SyntaxKind.CallExpression) &&
      callNameMatches(d as CallExpression, "createTestAdapter")
    ) {
      ctaCalls.push(d as CallExpression);
    }
  });
  if (ctaCalls.length !== 1) {
    return { skip: `expected 1 createTestAdapter() inside describe, found ${ctaCalls.length}` };
  }

  const bodyStmts = body.getStatements();
  const result = extractBeforeAllAndSchema(bodyStmts, "describe-level");
  if ("skip" in result) return result;
  const { beforeAllStmt, defineSchemaCall } = result;

  // No defineSchema outside beforeAll
  let externalDefineSchema = false;
  sf.forEachDescendant((d) => {
    if (
      d.isKind(SyntaxKind.CallExpression) &&
      callNameMatches(d as CallExpression, "defineSchema") &&
      d !== defineSchemaCall
    ) {
      externalDefineSchema = true;
    }
  });
  if (externalDefineSchema) return { skip: "defineSchema called outside beforeAll" };

  const dsArgs = defineSchemaCall.getArguments();
  if (dsArgs.length !== 2) return { skip: `defineSchema expected 2 args, got ${dsArgs.length}` };
  if (dsArgs[0].getText() !== adapterVarName) {
    return { skip: `defineSchema first arg is "${dsArgs[0].getText()}", not "${adapterVarName}"` };
  }
  const schemaArg = dsArgs[1].getText();

  // Find withTransactionalFixtures inside describe body
  const withTxCalls = bodyStmts
    .map((s) => s.getExpressionIfKind?.(SyntaxKind.CallExpression))
    .filter((c): c is CallExpression => !!c && callNameMatches(c, "withTransactionalFixtures"));
  if (withTxCalls.length > 1) return { skip: "multiple withTransactionalFixtures calls" };
  const withTxFixturesCall = withTxCalls[0] ?? null;

  // Find afterAll inside describe body that is ONLY `await dropAllTables(adapter)`
  // (covered by useHandlerTransactionalFixtures — safe to remove).
  let afterAllToRemove: ExpressionStatement | undefined;
  for (const stmt of bodyStmts) {
    if (!stmt.isKind(SyntaxKind.ExpressionStatement)) continue;
    const call = stmt.getExpressionIfKind(SyntaxKind.CallExpression);
    if (!call || call.getExpression().getText() !== "afterAll") continue;
    const cbArg = call.getArguments()[0];
    if (!cbArg || !Node.isArrowFunction(cbArg)) continue;
    const cbBody = cbArg.getBody();
    if (!Node.isBlock(cbBody)) continue;
    const cbStmts = cbBody.getStatements().filter((s) => !s.isKind(SyntaxKind.EmptyStatement));
    if (cbStmts.length !== 1) continue;
    const only = cbStmts[0];
    if (!only.isKind(SyntaxKind.ExpressionStatement)) continue;
    const onlyExpr = only.asKindOrThrow(SyntaxKind.ExpressionStatement).getExpression();
    // Match: `await dropAllTables(adapter)`
    const awaitExpr = onlyExpr.isKind(SyntaxKind.AwaitExpression)
      ? (onlyExpr as any).getExpression()
      : onlyExpr;
    if (
      awaitExpr.isKind(SyntaxKind.CallExpression) &&
      callNameMatches(awaitExpr as CallExpression, "dropAllTables") &&
      (awaitExpr as CallExpression).getArguments()[0]?.getText() === adapterVarName
    ) {
      afterAllToRemove = stmt.asKindOrThrow(SyntaxKind.ExpressionStatement);
    }
  }

  const fullText = sf.getFullText();
  if (/\b(createTable|migration\.up|migration\.run)\b/.test(fullText)) {
    return { skip: "looks like DDL inside test body (createTable/migration)" };
  }

  const refErr = checkAdapterRefs(sf, adapterVarName, defineSchemaCall, afterAllToRemove);
  if (refErr) return refErr;

  return {
    adapterVarName,
    beforeAllStmt,
    defineSchemaCall,
    schemaArg,
    testAdapterImport,
    withTxFixturesCall,
    hasFreshAdapterHelper: false,
    scope: "describe",
    describeBody: body,
    afterAllToRemove,
  };
}

function transform(sf: SourceFile, info: PatternInfo, helpersRel: string): string[] {
  const details: string[] = [];

  // 1) Add new imports now; clean up stale imports AFTER beforeAll body is rewritten
  // (so reference-counting reflects the post-transform state).

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

  // 2) Remove the matching `let adapter` declarator.
  // For module-level scope: scan sf.getVariableStatements().
  // For describe-level scope: scan the describe body statements.
  const letAdapterSearchScope =
    info.scope === "describe"
      ? info
          .describeBody!.getStatements()
          .filter((s) => s.isKind(SyntaxKind.VariableStatement))
          .map((s) => s.asKindOrThrow(SyntaxKind.VariableStatement))
      : sf.getVariableStatements();
  for (const stmt of [...letAdapterSearchScope]) {
    if (stmt.wasForgotten() || stmt.getDeclarationKind() !== "let") continue;
    for (const decl of [...stmt.getDeclarations()]) {
      if (decl.getName() === info.adapterVarName) {
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
  // For describe-level, insert inside the describe callback body; vitest scopes
  // hooks to the enclosing describe automatically.
  if (info.scope === "describe") {
    const describeBodyStmts = info.describeBody!.getStatements();
    const beforeAllIdx = describeBodyStmts.indexOf(info.beforeAllStmt);
    if (beforeAllIdx < 0) throw new Error("beforeAllStmt no longer in describe body statements");
    info.describeBody!.insertStatements(beforeAllIdx, [
      `setupHandlerSuite();`,
      `useHandlerTransactionalFixtures();`,
    ]);
  } else {
    const beforeAllIdx = sf.getStatements().indexOf(info.beforeAllStmt);
    if (beforeAllIdx < 0) throw new Error("beforeAllStmt no longer in SourceFile.getStatements()");
    sf.insertStatements(beforeAllIdx, [
      `setupHandlerSuite();`,
      `useHandlerTransactionalFixtures();`,
    ]);
  }
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

  // 5b) For describe-level: remove afterAll(dropAllTables) that is now covered by
  // useHandlerTransactionalFixtures.
  if (info.afterAllToRemove && !info.afterAllToRemove.wasForgotten()) {
    info.afterAllToRemove.remove();
    details.push("removed afterAll(dropAllTables) — covered by useHandlerTransactionalFixtures");
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

  // 7) Remove `this.adapter = adapter` (static blocks) and `ClassName.adapter = adapter`
  sf.forEachDescendant((d) => {
    if (!d.isKind(SyntaxKind.ExpressionStatement)) return;
    const expr = d.getExpressionIfKind(SyntaxKind.BinaryExpression);
    if (!expr) return;
    if (expr.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) return;
    const lhs = expr.getLeft();
    if (!lhs.isKind(SyntaxKind.PropertyAccessExpression)) return;
    const pae = lhs as any;
    if (pae.getName() !== "adapter") return;
    // Only remove class-level wiring: `this.adapter` (static blocks) or `ClassName.adapter`.
    const obj = pae.getExpression();
    if (!obj.isKind(SyntaxKind.ThisKeyword) && !obj.isKind(SyntaxKind.Identifier)) return;
    if (expr.getRight().getText() !== info.adapterVarName) return;
    d.remove();
    details.push("removed .adapter = adapter assignment");
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

  // Clean up stale imports now that beforeAll body has been rewritten.
  // Removes createTestAdapter / TestDatabaseAdapter only when no references remain.
  for (const imp of [...sf.getImportDeclarations()]) {
    if (imp.getModuleSpecifierValue().endsWith("/test-adapter.js")) {
      for (const n of [...imp.getNamedImports()]) {
        const name = n.getName();
        if (name !== "createTestAdapter" && name !== "TestDatabaseAdapter") continue;
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
  }
  // Remove drop-all-tables.js import if unused
  for (const imp of [...sf.getImportDeclarations()]) {
    if (!imp.getModuleSpecifierValue().endsWith("/drop-all-tables.js")) continue;
    for (const n of [...imp.getNamedImports()]) {
      if (n.getName() !== "dropAllTables") continue;
      const refs = sf
        .getDescendantsOfKind(SyntaxKind.Identifier)
        .filter((id) => id.getText() === "dropAllTables" && id !== n.getNameNode());
      if (refs.length === 0) n.remove();
    }
    if (imp.getNamedImports().length === 0 && !imp.getDefaultImport()) imp.remove();
  }
  // Remove ./adapter.js DatabaseAdapter import if unused elsewhere
  for (const imp of [...sf.getImportDeclarations()]) {
    if (imp.getModuleSpecifierValue().endsWith("/adapter.js")) {
      for (const n of [...imp.getNamedImports()]) {
        if (n.getName() !== "DatabaseAdapter") continue;
        const refs = sf
          .getDescendantsOfKind(SyntaxKind.Identifier)
          .filter((id) => id.getText() === "DatabaseAdapter" && id !== n.getNameNode());
        if (refs.length === 0) n.remove();
      }
      if (imp.getNamedImports().length === 0 && !imp.getDefaultImport()) imp.remove();
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

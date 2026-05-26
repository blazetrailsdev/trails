#!/usr/bin/env tsx
/**
 * D-1 multi-describe migration codemod.
 *
 * Handles files with multiple top-level `describe` blocks, each with its own
 * `let adapter` + `beforeAll` setup. Transforms each describe independently:
 *
 *   - `let adapter` + adapter creation → `setupHandlerSuite()`
 *   - `defineSchema(adapter, schema)` → `defineSchema(schema)` single-arg
 *   - `withTransactionalFixtures(() => adapter)` → `useHandlerTransactionalFixtures()`
 *   - `afterAll(dropAllTables(adapter))` removed (covered by handler fixtures)
 *   - `this.adapter = adapter` / `ClassName.adapter = adapter` removed from static blocks
 *   - empty static blocks removed
 *
 * Also handles the `freshAdapter()` wrapper pattern:
 *   - If freshAdapter wraps createTestAdapter() + defineSchema(), inlines the schema
 *   - If freshAdapter wraps only createTestAdapter(), rewrites the beforeAll defineSchema
 *   - Removes freshAdapter() if all references are eliminated
 *
 * Usage:
 *   pnpm tsx scripts/d1-migrate-multi-describe.ts <file>...           # dry-run
 *   pnpm tsx scripts/d1-migrate-multi-describe.ts --write <file>...   # apply
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
  type VariableStatement,
  type ArrowFunction,
} from "ts-morph";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

export type Result =
  | {
      file: string;
      status: "transformed";
      details: string[];
      describesTransformed: number;
      describesSkipped: number;
    }
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

function callNameMatches(call: CallExpression, name: string): boolean {
  const expr = call.getExpression();
  if (expr.isKind(SyntaxKind.Identifier)) return expr.getText() === name;
  if (expr.isKind(SyntaxKind.PropertyAccessExpression)) {
    return (expr as any).getName() === name;
  }
  return false;
}

interface FreshAdapterInfo {
  /** The function declaration/variable statement node */
  node: Node;
  /** Whether it wraps defineSchema (vs just createTestAdapter) */
  wrapsDefineSchema: boolean;
  /** If it wraps defineSchema, the schema argument text */
  schemaArg?: string;
  /** The function name */
  name: string;
}

function analyzeFreshAdapterHelper(sf: SourceFile): FreshAdapterInfo | null {
  // Look for module-level function declarations or const arrow functions
  // that wrap createTestAdapter() ± defineSchema()
  for (const stmt of sf.getStatements()) {
    let funcName: string | undefined;
    let funcBody: Node | undefined;

    if (stmt.isKind(SyntaxKind.FunctionDeclaration)) {
      const fd = stmt;
      funcName = fd.getName();
      funcBody = fd.getBody();
    } else if (stmt.isKind(SyntaxKind.VariableStatement)) {
      const vs = stmt.asKindOrThrow(SyntaxKind.VariableStatement);
      for (const decl of vs.getDeclarations()) {
        const init = decl.getInitializer();
        if (init && Node.isArrowFunction(init) && /fresh.*adapter/i.test(decl.getName())) {
          funcName = decl.getName();
          funcBody = init.getBody();
          break;
        }
      }
    }

    if (!funcName || !funcBody) continue;
    if (!/fresh.*adapter/i.test(funcName)) continue;

    // Check if body contains createTestAdapter
    let hasCreateTestAdapter = false;
    let hasDefineSchema = false;
    let schemaArg: string | undefined;

    funcBody.forEachDescendant((d) => {
      if (d.isKind(SyntaxKind.CallExpression)) {
        const call = d as CallExpression;
        if (callNameMatches(call, "createTestAdapter")) hasCreateTestAdapter = true;
        if (callNameMatches(call, "defineSchema")) {
          hasDefineSchema = true;
          const args = call.getArguments();
          if (args.length === 2) schemaArg = args[1].getText();
        }
      }
    });

    if (!hasCreateTestAdapter) continue;

    return {
      node: stmt,
      wrapsDefineSchema: hasDefineSchema,
      schemaArg,
      name: funcName,
    };
  }
  return null;
}

interface DescribeInfo {
  describeStmt: ExpressionStatement;
  describeBody: Block;
  adapterVarName: string;
  adapterVarStmt: VariableStatement;
  beforeAllStmt: ExpressionStatement;
  /** The defineSchema call — may be inside beforeAll or inside freshAdapter */
  defineSchemaCall: CallExpression | null;
  /** Text of the schema argument to defineSchema */
  schemaArg: string | null;
  /** The withTransactionalFixtures call statement */
  withTxStmt: ExpressionStatement | null;
  /** afterAll(dropAllTables) statement to remove */
  afterAllToRemove: ExpressionStatement | null;
  /** Whether beforeAll calls freshAdapter instead of direct createTestAdapter+defineSchema */
  usesFreshAdapter: boolean;
  /** The freshAdapter assignment expression (to rewrite) */
  freshAdapterAssignStmt?: ExpressionStatement;
}

function analyzeDescribe(
  describeStmt: ExpressionStatement,
  freshAdapter: FreshAdapterInfo | null,
): DescribeInfo | { skip: string } {
  const describeCall = describeStmt.getExpressionIfKindOrThrow(SyntaxKind.CallExpression);
  const args = describeCall.getArguments();
  const cb = args[args.length - 1];
  if (!cb || !Node.isArrowFunction(cb))
    return { skip: "describe callback is not an arrow function" };
  const body = cb.getBody();
  if (!Node.isBlock(body)) return { skip: "describe callback body is not a block" };

  // Find `let adapter` inside describe body
  let adapterVarName: string | null = null;
  let adapterVarStmt: VariableStatement | null = null;
  for (const stmt of body.getStatements()) {
    if (!stmt.isKind(SyntaxKind.VariableStatement)) continue;
    const vs = stmt.asKindOrThrow(SyntaxKind.VariableStatement);
    if (vs.getDeclarationKind() !== "let") continue;
    for (const decl of vs.getDeclarations()) {
      if (decl.getInitializer()) continue;
      const typeText = decl.getTypeNode()?.getText() ?? "";
      if (/TestDatabaseAdapter|DatabaseAdapter/.test(typeText)) {
        if (adapterVarName) return { skip: "multiple let adapter declarations" };
        adapterVarName = decl.getName();
        adapterVarStmt = vs;
      }
    }
  }
  if (!adapterVarName || !adapterVarStmt)
    return { skip: "no describe-level adapter let declaration" };

  // Find beforeAll
  const bodyStmts = body.getStatements();
  const beforeAllStmts = bodyStmts.filter(
    (s) =>
      s.isKind(SyntaxKind.ExpressionStatement) &&
      s.getExpressionIfKind(SyntaxKind.CallExpression)?.getExpression().getText() === "beforeAll",
  );
  if (beforeAllStmts.length === 0) return { skip: "no beforeAll" };
  if (beforeAllStmts.length > 1) return { skip: "multiple beforeAll blocks" };
  const beforeAllStmt = beforeAllStmts[0].asKindOrThrow(SyntaxKind.ExpressionStatement);
  const beforeAllCall = beforeAllStmt.getExpressionIfKindOrThrow(SyntaxKind.CallExpression);

  // Determine if beforeAll uses freshAdapter or direct createTestAdapter
  let usesFreshAdapter = false;
  let defineSchemaCall: CallExpression | null = null;
  let schemaArg: string | null = null;

  if (freshAdapter) {
    // Check if beforeAll body contains `adapter = freshAdapter()` or `adapter = await freshAdapter()`
    beforeAllCall.forEachDescendant((d) => {
      if (d.isKind(SyntaxKind.BinaryExpression)) {
        const be = d as any;
        if (
          be.getOperatorToken().getKind() === SyntaxKind.EqualsToken &&
          be.getLeft().getText() === adapterVarName
        ) {
          const rhs = be.getRight();
          const callExpr = rhs.isKind(SyntaxKind.AwaitExpression) ? rhs.getExpression() : rhs;
          if (
            callExpr.isKind(SyntaxKind.CallExpression) &&
            callNameMatches(callExpr as CallExpression, freshAdapter.name)
          ) {
            usesFreshAdapter = true;
          }
        }
      }
    });
  }

  if (usesFreshAdapter && freshAdapter?.wrapsDefineSchema) {
    // freshAdapter wraps defineSchema — schema comes from the helper
    schemaArg = freshAdapter.schemaArg ?? null;
    // No defineSchema call in beforeAll to rewrite — we'll insert one
  } else {
    // Look for defineSchema in beforeAll
    const defineSchemaCalls: CallExpression[] = [];
    beforeAllCall.forEachDescendant((d) => {
      if (
        d.isKind(SyntaxKind.CallExpression) &&
        callNameMatches(d as CallExpression, "defineSchema")
      ) {
        defineSchemaCalls.push(d as CallExpression);
      }
    });

    if (defineSchemaCalls.length === 0 && !usesFreshAdapter) {
      return { skip: "no defineSchema in beforeAll" };
    }
    if (defineSchemaCalls.length > 1) return { skip: "multiple defineSchema calls in beforeAll" };

    if (defineSchemaCalls.length === 1) {
      defineSchemaCall = defineSchemaCalls[0];
      const dsArgs = defineSchemaCall.getArguments();
      if (dsArgs.length !== 2)
        return { skip: `defineSchema expected 2 args, got ${dsArgs.length}` };
      if (dsArgs[0].getText() !== adapterVarName) {
        return { skip: `defineSchema first arg is not adapter var` };
      }
      schemaArg = dsArgs[1].getText();
    }
  }

  // Find withTransactionalFixtures
  let withTxStmt: ExpressionStatement | null = null;
  for (const stmt of bodyStmts) {
    if (!stmt.isKind(SyntaxKind.ExpressionStatement)) continue;
    const call = stmt.getExpressionIfKind(SyntaxKind.CallExpression);
    if (call && callNameMatches(call, "withTransactionalFixtures")) {
      withTxStmt = stmt.asKindOrThrow(SyntaxKind.ExpressionStatement);
      break;
    }
  }

  // Find afterAll(dropAllTables(adapter))
  let afterAllToRemove: ExpressionStatement | null = null;
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

  // Check for unsupported adapter refs within this describe
  const adapterRefs = body.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => {
    if (id.getText() !== adapterVarName) return false;
    const parent = id.getParent();
    if (!parent) return false;
    if (Node.isVariableDeclaration(parent) && parent.getNameNode() === id) return false;
    if (parent.isKind(SyntaxKind.PropertyAccessExpression) && (parent as any).getNameNode() === id)
      return false;
    if (parent.isKind(SyntaxKind.ImportSpecifier) || parent.isKind(SyntaxKind.ExportSpecifier))
      return false;
    return true;
  });

  for (const ref of adapterRefs) {
    const parent = ref.getParent();
    if (!parent) continue;
    // Skip refs inside defineSchemaCall
    if (defineSchemaCall) {
      let cur: Node | undefined = ref;
      let underDefineSchema = false;
      while (cur) {
        if (cur === defineSchemaCall) {
          underDefineSchema = true;
          break;
        }
        cur = cur.getParent();
      }
      if (underDefineSchema) continue;
    }
    // Skip adapter = createTestAdapter() or adapter = freshAdapter()
    if (Node.isBinaryExpression(parent)) {
      const be = parent as any;
      if (be.getOperatorToken().getKind() === SyntaxKind.EqualsToken && be.getLeft() === ref) {
        const rhs = be.getRight();
        const callExpr = rhs.isKind(SyntaxKind.AwaitExpression) ? rhs.getExpression() : rhs;
        if (callExpr.isKind(SyntaxKind.CallExpression)) {
          const cn = callExpr as CallExpression;
          if (
            callNameMatches(cn, "createTestAdapter") ||
            (freshAdapter && callNameMatches(cn, freshAdapter.name))
          ) {
            continue;
          }
        }
      }
    }
    // Skip this.adapter = adapter / ClassName.adapter = adapter
    if (Node.isBinaryExpression(parent)) {
      const be = parent as any;
      if (be.getOperatorToken().getKind() === SyntaxKind.EqualsToken && be.getRight() === ref) {
        const lhs = be.getLeft();
        if (lhs.isKind(SyntaxKind.PropertyAccessExpression)) {
          const pae = lhs as any;
          const obj = pae.getExpression();
          if (
            pae.getName() === "adapter" &&
            (obj.isKind(SyntaxKind.ThisKeyword) || obj.isKind(SyntaxKind.Identifier))
          ) {
            continue;
          }
        }
      }
    }
    // Skip () => adapter (withTransactionalFixtures callback)
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
    // Skip refs under afterAllToRemove
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
      skip: `adapter "${adapterVarName}" used in unsupported context: ${parent.getText().slice(0, 80)}`,
    };
  }

  // DDL check within the describe body
  const bodyText = body.getText();
  if (/\b(createTable|migration\.up|migration\.run)\b/.test(bodyText)) {
    return { skip: "DDL inside test body (createTable/migration)" };
  }

  return {
    describeStmt,
    describeBody: body,
    adapterVarName,
    adapterVarStmt,
    beforeAllStmt,
    defineSchemaCall,
    schemaArg,
    withTxStmt,
    afterAllToRemove,
    usesFreshAdapter,
  };
}

function transformDescribe(
  info: DescribeInfo,
  freshAdapter: FreshAdapterInfo | null,
  helpersRel: string,
  ensureImport: (spec: string, names: string[]) => void,
): string[] {
  const details: string[] = [];
  const { describeBody, adapterVarName, beforeAllStmt, schemaArg } = info;

  // 1) Remove `let adapter` declarator
  if (!info.adapterVarStmt.wasForgotten()) {
    for (const decl of [...info.adapterVarStmt.getDeclarations()]) {
      if (decl.getName() === adapterVarName) {
        decl.remove();
      }
    }
    // If the variable statement is now empty, remove it
    if (!info.adapterVarStmt.wasForgotten() && info.adapterVarStmt.getDeclarations().length === 0) {
      info.adapterVarStmt.remove();
    }
    details.push(`removed "let ${adapterVarName}"`);
  }

  // 2) Rewrite beforeAll body
  const beforeAllCall = beforeAllStmt.getExpressionIfKindOrThrow(SyntaxKind.CallExpression);
  const beforeAllArrow = beforeAllCall.getArguments()[0];
  if (!beforeAllArrow || !Node.isArrowFunction(beforeAllArrow)) {
    throw new Error("beforeAll arg is not an arrow function");
  }
  const baBody = beforeAllArrow.getBody();
  if (!Node.isBlock(baBody)) {
    throw new Error("beforeAll arrow body is not a block");
  }

  if (info.usesFreshAdapter) {
    // Remove `adapter = [await] freshAdapter()` statement
    for (const stmt of [...baBody.getStatements()]) {
      const expr = stmt.getExpressionIfKind?.(SyntaxKind.BinaryExpression);
      if (!expr) continue;
      if (
        expr.getOperatorToken().getKind() === SyntaxKind.EqualsToken &&
        expr.getLeft().getText() === adapterVarName
      ) {
        const rhs = expr.getRight();
        const callExpr = rhs.isKind(SyntaxKind.AwaitExpression)
          ? (rhs as any).getExpression()
          : rhs;
        if (
          callExpr.isKind(SyntaxKind.CallExpression) &&
          freshAdapter &&
          callNameMatches(callExpr as CallExpression, freshAdapter.name)
        ) {
          if (freshAdapter.wrapsDefineSchema && schemaArg) {
            // Replace with defineSchema(schema)
            stmt.replaceWithText(`await defineSchema(${schemaArg});`);
            details.push("replaced freshAdapter() with defineSchema(schema)");
          } else {
            // freshAdapter only wraps createTestAdapter — remove the line;
            // defineSchema is handled separately below
            stmt.remove();
            details.push("removed freshAdapter() call");
          }
        }
      }
    }
  } else {
    // Remove `adapter = createTestAdapter()` statement
    for (const stmt of [...baBody.getStatements()]) {
      const expr = stmt.getExpressionIfKind?.(SyntaxKind.BinaryExpression);
      if (!expr) continue;
      if (
        expr.getOperatorToken().getKind() === SyntaxKind.EqualsToken &&
        expr.getLeft().getText() === adapterVarName
      ) {
        const rhs = expr.getRight();
        const callExpr = rhs.isKind(SyntaxKind.AwaitExpression)
          ? (rhs as any).getExpression()
          : rhs;
        if (
          callExpr.isKind(SyntaxKind.CallExpression) &&
          callNameMatches(callExpr as CallExpression, "createTestAdapter")
        ) {
          stmt.remove();
          details.push("removed adapter = createTestAdapter()");
        }
      }
    }
  }

  // Rewrite defineSchema(adapter, X) → defineSchema(X) if present
  if (info.defineSchemaCall && !info.defineSchemaCall.wasForgotten()) {
    info.defineSchemaCall.removeArgument(0);
    details.push("rewrote defineSchema(adapter, X) → defineSchema(X)");
  }

  beforeAllArrow.setIsAsync(true);

  // 3) Insert setupHandlerSuite() + useHandlerTransactionalFixtures() before beforeAll
  const describeBodyStmts = describeBody.getStatements();
  const beforeAllIdx = describeBodyStmts.indexOf(beforeAllStmt);
  if (beforeAllIdx < 0) throw new Error("beforeAllStmt no longer in describe body");
  describeBody.insertStatements(beforeAllIdx, [
    `setupHandlerSuite();`,
    `useHandlerTransactionalFixtures();`,
  ]);
  ensureImport(`${helpersRel}/setup-handler-suite.js`, ["setupHandlerSuite"]);
  ensureImport(`${helpersRel}/use-handler-transactional-fixtures.js`, [
    "useHandlerTransactionalFixtures",
  ]);
  details.push("inserted setupHandlerSuite + useHandlerTransactionalFixtures");

  // 4) Remove withTransactionalFixtures
  if (info.withTxStmt && !info.withTxStmt.wasForgotten()) {
    info.withTxStmt.remove();
    details.push("removed withTransactionalFixtures");
  }

  // 5) Remove afterAll(dropAllTables)
  if (info.afterAllToRemove && !info.afterAllToRemove.wasForgotten()) {
    info.afterAllToRemove.remove();
    details.push("removed afterAll(dropAllTables)");
  }

  // 6) Remove this.adapter = adapter / ClassName.adapter = adapter in this describe
  describeBody.forEachDescendant((d) => {
    if (!d.isKind(SyntaxKind.ExpressionStatement)) return;
    const expr = d.getExpressionIfKind(SyntaxKind.BinaryExpression);
    if (!expr) return;
    if (expr.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) return;
    const lhs = expr.getLeft();
    if (!lhs.isKind(SyntaxKind.PropertyAccessExpression)) return;
    const pae = lhs as any;
    if (pae.getName() !== "adapter") return;
    const obj = pae.getExpression();
    if (!obj.isKind(SyntaxKind.ThisKeyword) && !obj.isKind(SyntaxKind.Identifier)) return;
    if (expr.getRight().getText() !== adapterVarName) return;
    d.remove();
    details.push("removed .adapter = adapter assignment");
  });

  // 7) Remove empty static blocks in this describe
  describeBody.forEachDescendant((d) => {
    if (d.isKind(SyntaxKind.ClassStaticBlockDeclaration)) {
      const sbBody = d.getBody();
      if (sbBody.getStatements().length === 0) {
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
  return migrateSourceFile(sf, filePath);
}

export function migrateText(text: string, filePath: string): string | { skip: string } {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    useInMemoryFileSystem: false,
    compilerOptions: { target: 99 },
  });
  const sf = project.createSourceFile(filePath, text, { overwrite: true });
  const result = migrateSourceFile(sf, filePath);
  if (result.status !== "transformed") {
    return { skip: result.status === "skipped" ? result.reason : result.status };
  }
  sf.formatText();
  return sf.getFullText();
}

function migrateSourceFile(sf: SourceFile, filePath: string): Result {
  // Must import createTestAdapter — if absent, nothing left to migrate
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
  if (!testAdapterImport) {
    const hasHandlerImport = sf
      .getImportDeclarations()
      .some((i) => i.getModuleSpecifierValue().endsWith("/setup-handler-suite.js"));
    if (hasHandlerImport) return { file: filePath, status: "already-migrated" };
    return { file: filePath, status: "skipped", reason: "no createTestAdapter import" };
  }

  // Find freshAdapter helper
  const freshAdapter = analyzeFreshAdapterHelper(sf);

  // Find top-level describe calls
  const topDescribes = sf.getStatements().filter((s): s is ExpressionStatement => {
    if (!s.isKind(SyntaxKind.ExpressionStatement)) return false;
    const call = s.getExpressionIfKind(SyntaxKind.CallExpression);
    return !!call && callNameMatches(call, "describe");
  });

  if (topDescribes.length < 2) {
    return {
      file: filePath,
      status: "skipped",
      reason: "not a multi-describe file (use standard codemod)",
    };
  }

  // Analyze each describe
  const analyses: Array<DescribeInfo | { skip: string; describeStmt: ExpressionStatement }> = [];
  for (const ds of topDescribes) {
    const result = analyzeDescribe(ds, freshAdapter);
    if ("skip" in result) {
      analyses.push({ ...result, describeStmt: ds });
    } else {
      analyses.push(result);
    }
  }

  // Need at least one transformable describe
  const transformable = analyses.filter((a): a is DescribeInfo => !("skip" in a));
  if (transformable.length === 0) {
    const reasons = analyses.filter(
      (a): a is { skip: string; describeStmt: ExpressionStatement } => "skip" in a,
    );
    return {
      file: filePath,
      status: "skipped",
      reason: `all ${topDescribes.length} describes skipped: ${reasons.map((r) => r.skip).join("; ")}`,
    };
  }

  const helpersRel = relPathToHelpers(filePath);
  const allDetails: string[] = [];

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

  // Transform each transformable describe (process in reverse order to preserve indices)
  for (const info of [...transformable].reverse()) {
    try {
      const details = transformDescribe(info, freshAdapter, helpersRel, ensureImport);
      allDetails.push(...details);
    } catch (e) {
      allDetails.push(`WARN: describe transform failed: ${(e as Error).message}`);
    }
  }

  // Remove freshAdapter function if no remaining references
  if (freshAdapter && !freshAdapter.node.wasForgotten()) {
    const refs = sf.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => {
      if (id.getText() !== freshAdapter.name) return false;
      // Exclude the declaration itself
      const parent = id.getParent();
      if (Node.isFunctionDeclaration(parent)) return false;
      if (Node.isVariableDeclaration(parent) && parent.getNameNode() === id) return false;
      return true;
    });
    if (refs.length === 0) {
      freshAdapter.node.remove();
      allDetails.push(`removed unused ${freshAdapter.name}() helper`);
    }
  }

  // Clean up stale imports
  const importCleanups = [
    { moduleSuffix: "/test-adapter.js", names: ["createTestAdapter", "TestDatabaseAdapter"] },
    { moduleSuffix: "/with-transactional-fixtures.js", names: ["withTransactionalFixtures"] },
    { moduleSuffix: "/drop-all-tables.js", names: ["dropAllTables"] },
    { moduleSuffix: "/adapter.js", names: ["DatabaseAdapter"] },
  ];

  for (const { moduleSuffix, names } of importCleanups) {
    for (const imp of [...sf.getImportDeclarations()]) {
      if (!imp.getModuleSpecifierValue().endsWith(moduleSuffix)) continue;
      for (const n of [...imp.getNamedImports()]) {
        const name = n.getName();
        if (!names.includes(name)) continue;
        const refs = sf
          .getDescendantsOfKind(SyntaxKind.Identifier)
          .filter((id) => id.getText() === name && id !== n.getNameNode());
        if (refs.length === 0) n.remove();
      }
      if (imp.getNamedImports().length === 0 && !imp.getDefaultImport()) {
        imp.remove();
        allDetails.push(`removed empty ${moduleSuffix} import`);
      }
    }
  }

  // Also remove `afterAll` from vitest import if no longer used
  for (const imp of [...sf.getImportDeclarations()]) {
    if (imp.getModuleSpecifierValue() !== "vitest") continue;
    for (const n of [...imp.getNamedImports()]) {
      if (n.getName() !== "afterAll") continue;
      const refs = sf
        .getDescendantsOfKind(SyntaxKind.Identifier)
        .filter((id) => id.getText() === "afterAll" && id !== n.getNameNode());
      if (refs.length === 0) {
        n.remove();
        allDetails.push("removed unused afterAll from vitest import");
      }
    }
  }

  sf.formatText();

  const skippedCount = analyses.length - transformable.length;
  return {
    file: filePath,
    status: "transformed",
    details: allDetails,
    describesTransformed: transformable.length,
    describesSkipped: skippedCount,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const files = args.filter((a) => !a.startsWith("--"));
  if (files.length === 0) {
    console.error(
      "usage: d1-migrate-multi-describe <file>...           # dry-run\n" +
        "       d1-migrate-multi-describe --write <file>...   # apply",
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
    const result = migrateSourceFile(sf, abs);
    if (result.status === "transformed" && write) {
      await sf.save();
      try {
        execFileSync("pnpm", ["prettier", "--write", "--log-level", "warn", abs], {
          stdio: ["ignore", "ignore", "pipe"],
        });
      } catch (e) {
        (result as any).details.push(`WARN: prettier failed: ${(e as Error).message}`);
      }
    }
    results.push(result);
    sf.forget();
  }

  console.log(JSON.stringify(results, null, 2));
  const transformed = results.filter((r) => r.status === "transformed");
  const skipped = results.filter((r) => r.status === "skipped");
  console.error(
    `\n${results.length} files: ${transformed.length} transformed, ${skipped.length} skipped, ${results.filter((r) => r.status === "already-migrated").length} already-migrated`,
  );
  if (transformed.length) {
    let totalDescribes = 0;
    let totalSkippedDescribes = 0;
    for (const t of transformed) {
      if ("describesTransformed" in t) {
        totalDescribes += (t as any).describesTransformed;
        totalSkippedDescribes += (t as any).describesSkipped;
      }
    }
    console.error(
      `  Total describes: ${totalDescribes} transformed, ${totalSkippedDescribes} skipped within transformed files`,
    );
  }
  if (skipped.length) {
    console.error("\nSkipped files:");
    for (const s of skipped) console.error(`  ${s.file}: ${(s as any).reason}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}

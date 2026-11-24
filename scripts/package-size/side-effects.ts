/**
 * Audits a package's `lib/**\/*.ts` for module-scope side effects and derives
 * the `sideEffects` array its package.json declares (RFC 0100,
 * `accurate-side-effects-declarations`).
 *
 * The audit method: a module is side-effect free only when every top-level
 * statement is one of
 *
 * - an `import` with bindings, or an `export … from` (a bare `import "x"` is a
 *   side effect: it exists only to run `x`);
 * - a type-only declaration (`interface`, `type`, `declare`, an ambient
 *   `namespace`);
 * - a `function` declaration;
 * - a `class` whose `extends`, computed member names and static initializers
 *   are pure, and which has no `static { }` block and no decorator;
 * - a `const` / `let` / `var` / `export default` / `enum` whose initializers are
 *   pure.
 *
 * A pure expression is a literal, an identifier, a function or arrow, a pure
 * class expression, an object / array / template literal of pure parts, a
 * property read of a pure expression, a unary / binary / conditional /
 * `as` / `satisfies` of pure operands, or one of the allocation calls in
 * `PURE_CALLS` / `PURE_NEWS` with pure arguments. Anything else (a call, an
 * assignment, a `new` of another class, `include(...)`, `constSet(...)`,
 * `register(...)`) is a side effect, so the module is listed. The rule
 * over-reports by design: a module wrongly listed only costs bytes, a module
 * wrongly omitted is dropped by the bundler and fails at run time.
 *
 * `pnpm tsx scripts/package-size/side-effects.ts --write` rewrites each audited
 * package's `sideEffects`; without `--write` it exits 1 on any drift.
 * `side-effects.test.ts` holds the same check in CI.
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript-5";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The `import { Base } from "@blazetrails/activerecord"` closure the RFC sizes. */
export const AUDITED_PACKAGES = [
  "activerecord",
  "activemodel",
  "activesupport",
  "arel",
  "date",
  "i18n",
  "globalid",
  "did-you-mean",
  "ruby-compat",
] as const;

const PURE_CALLS = new Set(["Symbol", "Symbol.for", "Object.freeze", "Object.create"]);
const PURE_NEWS = new Set(["Map", "Set", "WeakMap", "WeakSet", "WeakRef", "RegExp", "Error"]);

function calleeName(expr: ts.Expression): string | null {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
    return `${expr.expression.text}.${expr.name.text}`;
  }
  return null;
}

function isPureName(name: ts.PropertyName | ts.BindingName): boolean {
  return !ts.isComputedPropertyName(name) || isPureExpression(name.expression);
}

function isPureClass(node: ts.ClassLikeDeclaration): boolean {
  if (ts.canHaveDecorators(node) && ts.getDecorators(node)?.length) return false;
  for (const clause of node.heritageClauses ?? []) {
    if (clause.token !== ts.SyntaxKind.ExtendsKeyword) continue;
    for (const type of clause.types) if (!isPureExpression(type.expression)) return false;
  }
  for (const member of node.members) {
    if (ts.isClassStaticBlockDeclaration(member)) return false;
    if (ts.canHaveDecorators(member) && ts.getDecorators(member)?.length) return false;
    if (member.name && !isPureName(member.name)) return false;
    const isStatic = ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Static;
    if (isStatic && ts.isPropertyDeclaration(member) && member.initializer) {
      if (!isPureExpression(member.initializer)) return false;
    }
  }
  return true;
}

export function isPureExpression(expr: ts.Expression): boolean {
  if (
    ts.isLiteralExpression(expr) ||
    ts.isNoSubstitutionTemplateLiteral(expr) ||
    ts.isIdentifier(expr) ||
    ts.isFunctionExpression(expr) ||
    ts.isArrowFunction(expr)
  ) {
    return true;
  }
  switch (expr.kind) {
    case ts.SyntaxKind.TrueKeyword:
    case ts.SyntaxKind.FalseKeyword:
    case ts.SyntaxKind.NullKeyword:
    case ts.SyntaxKind.ThisKeyword:
    case ts.SyntaxKind.OmittedExpression:
      return true;
  }
  if (ts.isClassExpression(expr)) return isPureClass(expr);
  if (
    ts.isParenthesizedExpression(expr) ||
    ts.isAsExpression(expr) ||
    ts.isSatisfiesExpression(expr) ||
    ts.isNonNullExpression(expr) ||
    ts.isTypeAssertionExpression(expr) ||
    ts.isSpreadElement(expr) ||
    ts.isTypeOfExpression(expr) ||
    ts.isVoidExpression(expr)
  ) {
    return isPureExpression(expr.expression);
  }
  if (ts.isPrefixUnaryExpression(expr)) {
    return (
      expr.operator !== ts.SyntaxKind.PlusPlusToken &&
      expr.operator !== ts.SyntaxKind.MinusMinusToken &&
      isPureExpression(expr.operand)
    );
  }
  if (ts.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind;
    if (op >= ts.SyntaxKind.FirstAssignment && op <= ts.SyntaxKind.LastAssignment) return false;
    return isPureExpression(expr.left) && isPureExpression(expr.right);
  }
  if (ts.isConditionalExpression(expr)) {
    return (
      isPureExpression(expr.condition) &&
      isPureExpression(expr.whenTrue) &&
      isPureExpression(expr.whenFalse)
    );
  }
  if (ts.isPropertyAccessExpression(expr)) return isPureExpression(expr.expression);
  if (ts.isElementAccessExpression(expr)) {
    return isPureExpression(expr.expression) && isPureExpression(expr.argumentExpression);
  }
  if (ts.isTemplateExpression(expr)) {
    return expr.templateSpans.every((span) => isPureExpression(span.expression));
  }
  if (ts.isArrayLiteralExpression(expr)) return expr.elements.every(isPureExpression);
  if (ts.isObjectLiteralExpression(expr)) {
    return expr.properties.every((prop) => {
      if (ts.isSpreadAssignment(prop)) return isPureExpression(prop.expression);
      if (prop.name && !isPureName(prop.name)) return false;
      if (ts.isPropertyAssignment(prop)) return isPureExpression(prop.initializer);
      return true;
    });
  }
  if (ts.isCallExpression(expr)) {
    const name = calleeName(expr.expression);
    return name !== null && PURE_CALLS.has(name) && expr.arguments.every(isPureExpression);
  }
  if (ts.isNewExpression(expr)) {
    const name = calleeName(expr.expression);
    return name !== null && PURE_NEWS.has(name) && (expr.arguments ?? []).every(isPureExpression);
  }
  return false;
}

function isAmbient(node: ts.Statement): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)
  );
}

export function isPureStatement(stmt: ts.Statement): boolean {
  if (ts.isImportDeclaration(stmt)) return stmt.importClause !== undefined;
  if (ts.isImportEqualsDeclaration(stmt)) return true;
  if (ts.isExportDeclaration(stmt)) return true;
  if (
    ts.isInterfaceDeclaration(stmt) ||
    ts.isTypeAliasDeclaration(stmt) ||
    ts.isFunctionDeclaration(stmt) ||
    ts.isEmptyStatement(stmt) ||
    isAmbient(stmt)
  ) {
    return true;
  }
  if (ts.isModuleDeclaration(stmt)) {
    return isTypeOnlyModule(stmt);
  }
  if (ts.isClassDeclaration(stmt)) return isPureClass(stmt);
  if (ts.isEnumDeclaration(stmt)) {
    return stmt.members.every((m) => !m.initializer || isPureExpression(m.initializer));
  }
  if (ts.isVariableStatement(stmt)) {
    return stmt.declarationList.declarations.every(
      (decl) =>
        ts.isIdentifier(decl.name) && (!decl.initializer || isPureExpression(decl.initializer)),
    );
  }
  if (ts.isExportAssignment(stmt)) return isPureExpression(stmt.expression);
  return false;
}

function isTypeOnlyModule(stmt: ts.ModuleDeclaration): boolean {
  const body = stmt.body;
  if (!body) return true;
  if (ts.isModuleBlock(body)) {
    return body.statements.every(
      (s) =>
        ts.isInterfaceDeclaration(s) ||
        ts.isTypeAliasDeclaration(s) ||
        (ts.isModuleDeclaration(s) && isTypeOnlyModule(s)),
    );
  }
  return ts.isModuleDeclaration(body) && isTypeOnlyModule(body);
}

export function hasModuleSideEffects(source: string, fileName = "module.ts"): boolean {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false);
  return !sf.statements.every(isPureStatement);
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (/\.ts$/.test(entry.name) && !/\.d\.ts$|\.test\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** The `./dist/…js` paths of every module in `packages/<pkg>/lib` with a side effect. */
export async function auditPackage(pkg: string): Promise<string[]> {
  const lib = path.join(REPO_ROOT, "packages", pkg, "lib");
  const listed: string[] = [];
  for (const file of await walk(lib)) {
    if (hasModuleSideEffects(await readFile(file, "utf8"), file)) {
      const rel = path.relative(lib, file).split(path.sep).join("/");
      listed.push(`./dist/${rel.replace(/\.ts$/, ".js")}`);
    }
  }
  return listed.sort();
}

export async function readSideEffects(pkg: string): Promise<unknown> {
  const manifest = JSON.parse(
    await readFile(path.join(REPO_ROOT, "packages", pkg, "package.json"), "utf8"),
  ) as { sideEffects?: unknown };
  return manifest.sideEffects;
}

async function writeSideEffects(pkg: string, listed: string[]): Promise<void> {
  const file = path.join(REPO_ROOT, "packages", pkg, "package.json");
  const manifest = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  const ordered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(manifest)) {
    if (key === "sideEffects") continue;
    ordered[key] = value;
    if (key === "files") ordered.sideEffects = listed.length === 0 ? false : listed;
  }
  if (!("sideEffects" in ordered)) ordered.sideEffects = listed.length === 0 ? false : listed;
  await writeFile(file, `${JSON.stringify(ordered, null, 2)}\n`);
}

async function main(): Promise<void> {
  const write = process.argv.includes("--write");
  let drift = 0;
  for (const pkg of AUDITED_PACKAGES) {
    const listed = await auditPackage(pkg);
    const expected = listed.length === 0 ? false : listed;
    const declared = await readSideEffects(pkg);
    const same = JSON.stringify(declared) === JSON.stringify(expected);
    console.log(`${pkg}: ${listed.length} side-effecting module(s)${same ? "" : " (drift)"}`);
    if (same) continue;
    if (write) await writeSideEffects(pkg, listed);
    else drift++;
  }
  if (drift > 0) {
    console.error("sideEffects drift: run `pnpm tsx scripts/package-size/side-effects.ts --write`");
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}

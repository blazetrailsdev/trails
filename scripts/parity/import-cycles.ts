/**
 * The module-eval import-cycle ratchet (CLAUDE.md § "Call-time constant
 * resolution").
 *
 * Builds one graph over every package's library root (`lib`, RFC 0223, or
 * `src`) of the imports that survive
 * emit, relative specifiers and `@blazetrails/*` workspace specifiers alike (a
 * workspace specifier resolves through the target package's `exports`, its
 * `dist` path read back to the `lib` or `src` file it is built from). An import whose
 * bindings are read only in type positions is elided by `tsc` (the repo does
 * not set `verbatimModuleSyntax`), so it costs no runtime edge whether or not it
 * is spelled `import type`. Inside each cycle of that graph, a module importing
 * itself included, an edge is a hazard only where an imported binding is read
 * while the importing module body runs: an `extends` clause, a static field
 * initializer or static block, a decorator, a computed member name, or any
 * top-level expression. Assigning a namespace object (`Seat.X = XModule`)
 * reads no binding, since ESM creates it before any module body runs, and is
 * not counted; nor is a read of a module's own namespace placed after its last
 * runtime declaration, when every member it declares is initialized; such a
 * read counts instead as a read of every binding the module re-exports. A read inside a function, method, accessor,
 * constructor or instance field initializer is deferred and is not counted:
 * ESM import bindings are live, so being in a cycle is harmless there.
 * A module-eval reference to an exported `function` declaration that does not
 * call it is not counted either: ESM instantiates function declarations before
 * any module body runs.
 *
 * Each such edge can throw `Cannot access 'X' before initialization` when the
 * graph is entered at the wrong module. `import-cycles-mark.json` lists every
 * edge allowed today, keyed by its ends and the names it reads, each converged by the story it names. The list only
 * shrinks: an edge not on it reds the gate, a listed edge that no longer
 * exists reds it as stale, `--tighten` drops the stale rows, and there is no
 * reseed. `--list` prints every hazard with the names it reads and the line of
 * the first module-eval read.
 *
 * A name is resolved against the parameters and block-scoped declarations
 * that enclose its read, so a local shadowing an import is not a read of it.
 * Type positions are read from the AST rather than a checker, so a
 * value-namespace merge (a class and an interface of one name) is counted by
 * its value reads only.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import ts from "typescript-5";

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const MARK_FILE = path.join(ROOT_DIR, "scripts/parity/import-cycles-mark.json");

export interface Mark {
  story: string;
  edges: string[];
}

export interface Edge {
  from: string;
  to: string;
  /** Imported local names read at module-eval time. */
  evalNames: string[];
  /** 1-based line of the first module-eval read. */
  evalLine: number;
}

interface ScannedEdge {
  to: string;
  evalNames: Set<string>;
  evalLine: number;
  /** Each module-eval name's exported name (`*` for a namespace) and whether a read calls it. */
  evalRefs: Map<string, { imported: string; called: boolean }>;
}

export type Resolver = (from: string, spec: string) => string | null;

async function listSources(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const d of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) {
      if (d.name === "node_modules" || d.name === "dist") continue;
      out.push(...(await listSources(full)));
    } else if (
      d.isFile() &&
      d.name.endsWith(".ts") &&
      !d.name.endsWith(".d.ts") &&
      !d.name.endsWith(".test.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

function firstExisting(candidates: string[], files: Set<string>): string | null {
  return candidates.find((c) => files.has(c)) ?? null;
}

function sourceCandidates(base: string): string[] {
  return [base.replace(/\.js$/, ".ts"), base, `${base}.ts`, path.join(base, "index.ts")];
}

function exportTarget(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    return exportTarget(v.import ?? v.default);
  }
  return null;
}

/** The `exports` target for `subpath` (`.` or `./x`), wildcard keys included. */
export function matchExports(exportsField: unknown, subpath: string): string | null {
  if (typeof exportsField === "string") return subpath === "." ? exportsField : null;
  if (!exportsField || typeof exportsField !== "object") return null;
  const map = exportsField as Record<string, unknown>;
  if (!Object.keys(map).some((k) => k.startsWith("."))) {
    return subpath === "." ? exportTarget(map) : null;
  }
  if (subpath in map) return exportTarget(map[subpath]);
  for (const [key, value] of Object.entries(map)) {
    const star = key.indexOf("*");
    if (star < 0) continue;
    const prefix = key.slice(0, star);
    const suffix = key.slice(star + 1);
    if (subpath.startsWith(prefix) && subpath.endsWith(suffix)) {
      const hit = subpath.slice(prefix.length, subpath.length - suffix.length);
      return exportTarget(value)?.replace("*", hit) ?? null;
    }
  }
  return null;
}

interface WorkspacePackage {
  dir: string;
  exports: unknown;
  main: string | undefined;
}

export function makeResolver(
  files: Set<string>,
  packages: Map<string, WorkspacePackage>,
): Resolver {
  return (from, spec) => {
    if (spec.startsWith(".")) {
      return firstExisting(sourceCandidates(path.resolve(path.dirname(from), spec)), files);
    }
    const m = /^(@blazetrails\/[^/]+)(\/.*)?$/.exec(spec);
    const pkg = m && packages.get(m[1]);
    if (!pkg) return null;
    const subpath = m[2] ? `.${m[2]}` : ".";
    const target =
      matchExports(pkg.exports, subpath) ?? (subpath === "." ? (pkg.main ?? null) : null);
    if (!target) return null;
    const rest = target.replace(/^\.?\/?dist\//, "").replace(/\.d\.ts$|\.js$/, ".ts");
    return firstExisting(sourceCandidates(path.join(pkg.dir, "lib", rest)), files);
  };
}

function isTypePosition(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node; n; n = n.parent) {
    if (ts.isTypeNode(n) && !ts.isExpressionWithTypeArguments(n)) return true;
    if (ts.isExpressionWithTypeArguments(n)) {
      const clause = n.parent;
      if (ts.isHeritageClause(clause)) {
        if (clause.token === ts.SyntaxKind.ImplementsKeyword) return true;
        if (ts.isInterfaceDeclaration(clause.parent)) return true;
      }
      return false;
    }
    if (
      ts.isInterfaceDeclaration(n) ||
      ts.isTypeAliasDeclaration(n) ||
      ts.isImportDeclaration(n) ||
      ts.isImportEqualsDeclaration(n)
    ) {
      return true;
    }
    if (ts.isExportSpecifier(n)) return n.isTypeOnly || n.parent.parent.isTypeOnly;
    if (ts.isStatement(n) || ts.isSourceFile(n)) return false;
  }
  return false;
}

/** Whether `id` names a binding rather than a property or declaration name. */
function isReference(id: ts.Identifier): boolean {
  const p = id.parent;
  if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
  if (ts.isQualifiedName(p) && p.right === id) return false;
  if (ts.isLabeledStatement(p) && p.label === id) return false;
  if ((ts.isBreakStatement(p) || ts.isContinueStatement(p)) && p.label === id) return false;
  if (ts.isExportSpecifier(p) && p.propertyName === undefined && p.name !== id) return false;
  if (ts.isExportSpecifier(p) && p.propertyName !== undefined && p.name === id) return false;
  if (
    (ts.isPropertyAssignment(p) ||
      ts.isPropertyDeclaration(p) ||
      ts.isMethodDeclaration(p) ||
      ts.isGetAccessorDeclaration(p) ||
      ts.isSetAccessorDeclaration(p) ||
      ts.isPropertySignature(p) ||
      ts.isMethodSignature(p) ||
      ts.isEnumMember(p) ||
      ts.isBindingElement(p) ||
      ts.isVariableDeclaration(p) ||
      ts.isParameter(p) ||
      ts.isFunctionDeclaration(p) ||
      ts.isFunctionExpression(p) ||
      ts.isClassDeclaration(p) ||
      ts.isClassExpression(p) ||
      ts.isJsxAttribute(p)) &&
    p.name === id
  ) {
    return false;
  }
  return true;
}

function bindsName(name: ts.BindingName, text: string): boolean {
  if (ts.isIdentifier(name)) return name.text === text;
  return name.elements.some((el) => !ts.isOmittedExpression(el) && bindsName(el.name, text));
}

function declaresInStatements(statements: readonly ts.Statement[], text: string): boolean {
  return statements.some(
    (s) =>
      (ts.isVariableStatement(s) &&
        s.declarationList.declarations.some((d) => bindsName(d.name, text))) ||
      ((ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s) || ts.isEnumDeclaration(s)) &&
        s.name?.text === text),
  );
}

/** Whether a `var` in `body`, outside any nested function or static block, binds `text`. */
function hoistsVar(body: ts.Node, text: string): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found || ts.isFunctionLike(n) || ts.isClassStaticBlockDeclaration(n)) return;
    if (
      ts.isVariableDeclarationList(n) &&
      !(n.flags & ts.NodeFlags.BlockScoped) &&
      n.declarations.some((d) => bindsName(d.name, text))
    ) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(body, visit);
  return found;
}

/** Whether a declaration between `id` and the module scope binds its name. */
function isShadowed(id: ts.Identifier): boolean {
  const text = id.text;
  for (let n: ts.Node = id; n.parent && !ts.isSourceFile(n.parent); n = n.parent) {
    const p = n.parent;
    if (ts.isFunctionLike(p)) {
      if (p.parameters.some((param) => bindsName(param.name, text))) return true;
      if ("body" in p && p.body && hoistsVar(p.body, text)) return true;
      if ((ts.isFunctionExpression(p) || ts.isClassExpression(p)) && p.name?.text === text) {
        return true;
      }
    }
    if (ts.isClassExpression(p) && p.name?.text === text) return true;
    if (ts.isClassStaticBlockDeclaration(p) && hoistsVar(p.body, text)) return true;
    if ((ts.isBlock(p) || ts.isModuleBlock(p)) && declaresInStatements(p.statements, text)) {
      return true;
    }
    if (ts.isCaseBlock(p)) {
      if (p.clauses.some((c) => declaresInStatements(c.statements, text))) return true;
    }
    if (
      ts.isCatchClause(p) &&
      p.variableDeclaration &&
      bindsName(p.variableDeclaration.name, text)
    ) {
      return true;
    }
    if (
      (ts.isForStatement(p) || ts.isForInStatement(p) || ts.isForOfStatement(p)) &&
      p.initializer &&
      ts.isVariableDeclarationList(p.initializer) &&
      p.initializer.declarations.some((d) => bindsName(d.name, text))
    ) {
      return true;
    }
  }
  return false;
}

/** Whether a function or arrow expression is called where it is written. */
function isInvokedInPlace(fn: ts.Node): boolean {
  if (!ts.isFunctionExpression(fn) && !ts.isArrowFunction(fn)) return false;
  let callee: ts.Node = fn;
  while (ts.isParenthesizedExpression(callee.parent)) callee = callee.parent;
  return ts.isCallExpression(callee.parent) && callee.parent.expression === callee;
}

/** The innermost function or member whose body defers a read at `node`, or `null` at module-eval time. */
function deferringBoundary(node: ts.Node): ts.Node | null {
  for (let n: ts.Node = node; n.parent; n = n.parent) {
    const p = n.parent;
    if (
      ts.isFunctionDeclaration(p) ||
      ts.isFunctionExpression(p) ||
      ts.isArrowFunction(p) ||
      ts.isMethodDeclaration(p) ||
      ts.isConstructorDeclaration(p) ||
      ts.isGetAccessorDeclaration(p) ||
      ts.isSetAccessorDeclaration(p)
    ) {
      if ("name" in p && p.name === n) continue;
      if (ts.isDecorator(n)) continue;
      if (isInvokedInPlace(p)) continue;
      return p;
    }
    if (ts.isPropertyDeclaration(p) && p.initializer === n) {
      const isStatic = ts.getModifiers(p)?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword);
      if (!isStatic) return p;
    }
  }
  return null;
}

/**
 * A file's top-level function declarations and `const` function or arrow bindings, by name.
 * A module-eval call of one counts only the reads its own body makes; a closure nested in
 * it stays deferred, since whether the closure runs during the call is not decidable here.
 */
function localFunctions(sf: ts.SourceFile): Map<ts.Node, string> {
  const out = new Map<ts.Node, string>();
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.body) out.set(stmt, stmt.name.text);
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        const init = d.initializer;
        if (
          ts.isIdentifier(d.name) &&
          init &&
          (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
        ) {
          out.set(init, d.name.text);
        }
      }
    }
  }
  return out;
}

export function parseErrors(file: string, text: string): string[] {
  const out = ts.transpileModule(text, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext },
  });
  return (out.diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}

export function scanFile(file: string, text: string, resolve: Resolver): ScannedEdge[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const locals = new Map<string, string>();
  const importedAs = new Map<string, string>();
  const reExports: { to: string; names: string[] }[] = [];
  const namespaces = new Set<string>();
  const edges = new Map<string, ScannedEdge & { value: boolean }>();
  const edgeFor = (to: string) => {
    let e = edges.get(to);
    if (!e)
      edges.set(
        to,
        (e = { to, evalNames: new Set(), evalLine: 0, evalRefs: new Map(), value: false }),
      );
    return e;
  };
  const fnNodes = localFunctions(sf);
  const fnNames = new Set(fnNodes.values());
  const fnReads = new Map<string, { name: string; node: ts.Node }[]>();
  const fnCalls = new Map<string, Set<string>>();
  const evalCalls = new Set<string>();
  const addEval = (name: string, node: ts.Node) => {
    const e = edgeFor(locals.get(name)!);
    e.evalNames.add(name);
    const p = node.parent;
    const called =
      ts.isIdentifier(node) &&
      (((ts.isCallExpression(p) || ts.isNewExpression(p)) && p.expression === node) ||
        (ts.isTaggedTemplateExpression(p) && p.tag === node));
    const prev = e.evalRefs.get(name);
    e.evalRefs.set(name, {
      imported: importedAs.get(name) ?? "*",
      called: called || (prev?.called ?? false),
    });
    if (!e.evalLine) e.evalLine = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  };
  const read = (name: string, node: ts.Node) => {
    const e = edgeFor(locals.get(name)!);
    e.value = true;
    if (isNamespaceAssignment(name, node)) return;
    if (isTrailingOwnNamespace(name, node)) {
      for (const r of reExports) {
        const re = edgeFor(r.to);
        for (const n of r.names) {
          re.evalNames.add(n);
          re.evalRefs.set(n, { imported: n, called: re.evalRefs.get(n)?.called ?? false });
        }
        if (!re.evalLine)
          re.evalLine = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      }
      return;
    }
    const boundary = deferringBoundary(node);
    if (boundary === null) addEval(name, node);
    else if (fnNodes.has(boundary)) {
      const owner = fnNodes.get(boundary)!;
      if (!fnReads.has(owner)) fnReads.set(owner, []);
      fnReads.get(owner)!.push({ name, node });
    }
  };
  const call = (callee: string, node: ts.Node) => {
    const boundary = deferringBoundary(node);
    if (boundary === null) evalCalls.add(callee);
    else if (fnNodes.has(boundary)) {
      const owner = fnNodes.get(boundary)!;
      if (!fnCalls.has(owner)) fnCalls.set(owner, new Set());
      fnCalls.get(owner)!.add(callee);
    }
  };

  const lastDeclarationEnd = Math.max(
    0,
    ...sf.statements
      .filter(
        (s) =>
          (ts.isFunctionDeclaration(s) ||
            ts.isClassDeclaration(s) ||
            ts.isVariableStatement(s) ||
            ts.isEnumDeclaration(s) ||
            ts.isExportAssignment(s)) &&
          !ts.getModifiers(s)?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword),
      )
      .map((s) => s.end),
  );
  const isNamespaceAssignment = (name: string, node: ts.Node) =>
    namespaces.has(name) &&
    ts.isBinaryExpression(node.parent) &&
    node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    node.parent.right === node;
  const isTrailingOwnNamespace = (name: string, node: ts.Node) =>
    locals.get(name) === file &&
    namespaces.has(name) &&
    ts.isIdentifier(node) &&
    !ts.isPropertyAccessExpression(node.parent) &&
    !ts.isElementAccessExpression(node.parent) &&
    node.getStart(sf) > lastDeclarationEnd;

  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const to = resolve(file, stmt.moduleSpecifier.text);
      if (!to) continue;
      const clause = stmt.importClause;
      if (!clause) {
        edgeFor(to).value = true;
        continue;
      }
      if (clause.isTypeOnly) continue;
      if (clause.name) {
        locals.set(clause.name.text, to);
        importedAs.set(clause.name.text, "default");
      }
      const nb = clause.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) {
        locals.set(nb.name.text, to);
        namespaces.add(nb.name.text);
      }
      if (nb && ts.isNamedImports(nb)) {
        for (const s of nb.elements) {
          if (s.isTypeOnly) continue;
          locals.set(s.name.text, to);
          importedAs.set(s.name.text, (s.propertyName ?? s.name).text);
        }
      }
    } else if (
      ts.isExportDeclaration(stmt) &&
      !stmt.isTypeOnly &&
      stmt.moduleSpecifier &&
      ts.isStringLiteral(stmt.moduleSpecifier)
    ) {
      const to = resolve(file, stmt.moduleSpecifier.text);
      if (!to) continue;
      const named = stmt.exportClause;
      if (named && ts.isNamedExports(named) && named.elements.every((e) => e.isTypeOnly)) continue;
      edgeFor(to).value = true;
      reExports.push({
        to,
        names:
          named && ts.isNamedExports(named)
            ? named.elements
                .filter((e) => !e.isTypeOnly)
                .map((e) => (e.propertyName ?? e.name).text)
            : ["*"],
      });
    }
  }

  const visit = (node: ts.Node): void => {
    if (
      ts.isIdentifier(node) &&
      locals.has(node.text) &&
      isReference(node) &&
      !isTypePosition(node) &&
      !isShadowed(node)
    ) {
      if (ts.isExportSpecifier(node.parent)) edgeFor(locals.get(node.text)!).value = true;
      else read(node.text, node);
    }
    if (
      ts.isShorthandPropertyAssignment(node) &&
      locals.has(node.name.text) &&
      !isShadowed(node.name)
    ) {
      read(node.name.text, node);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      fnNames.has(node.expression.text) &&
      !locals.has(node.expression.text) &&
      !isShadowed(node.expression)
    ) {
      call(node.expression.text, node);
    }
    ts.forEachChild(node, visit);
  };
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt)) continue;
    if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier) continue;
    visit(stmt);
  }
  const seen = new Set<string>();
  const queue = [...evalCalls];
  while (queue.length) {
    const fn = queue.pop()!;
    if (seen.has(fn)) continue;
    seen.add(fn);
    for (const r of fnReads.get(fn) ?? []) addEval(r.name, r.node);
    for (const next of fnCalls.get(fn) ?? []) queue.push(next);
  }

  return [...edges.values()].filter((e) => e.value);
}

function stronglyConnected(graph: Map<string, string[]>): string[][] {
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const out: string[][] = [];
  for (const root of graph.keys()) {
    if (idx.has(root)) continue;
    const work: { v: string; i: number }[] = [{ v: root, i: 0 }];
    idx.set(root, index);
    low.set(root, index++);
    stack.push(root);
    onStack.add(root);
    while (work.length) {
      const frame = work[work.length - 1];
      const succ = graph.get(frame.v) ?? [];
      if (frame.i < succ.length) {
        const w = succ[frame.i++];
        if (!idx.has(w)) {
          idx.set(w, index);
          low.set(w, index++);
          stack.push(w);
          onStack.add(w);
          work.push({ v: w, i: 0 });
        } else if (onStack.has(w)) {
          low.set(frame.v, Math.min(low.get(frame.v)!, idx.get(w)!));
        }
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1].v;
        low.set(parent, Math.min(low.get(parent)!, low.get(frame.v)!));
      }
      if (low.get(frame.v) === idx.get(frame.v)) {
        const comp: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          comp.push(w);
        } while (w !== frame.v);
        out.push(comp);
      }
    }
  }
  return out;
}

async function workspacePackages(root: string): Promise<Map<string, WorkspacePackage>> {
  const out = new Map<string, WorkspacePackage>();
  const packagesDir = path.join(root, "packages");
  for (const dir of (await fs.readdir(packagesDir)).sort()) {
    const manifest = path.join(packagesDir, dir, "package.json");
    const text = await fs.readFile(manifest, "utf-8").catch(() => null);
    if (!text) continue;
    const json = JSON.parse(text) as { name?: string; exports?: unknown; main?: string };
    if (json.name) {
      out.set(json.name, {
        dir: path.join(packagesDir, dir),
        exports: json.exports,
        main: json.main,
      });
    }
  }
  return out;
}

/** Every module-eval edge inside an import cycle, across the workspace. */
/**
 * The names a file exports as `function` declarations. ESM instantiates a
 * function declaration before any module body runs, so a module-eval
 * reference to one that does not call it cannot meet a TDZ.
 */
export function hoistedFunctionExports(file: string, text: string): Set<string> {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const out = new Set<string>();
  for (const stmt of sf.statements) {
    if (
      ts.isFunctionDeclaration(stmt) &&
      stmt.name &&
      stmt.body &&
      ts.getModifiers(stmt)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      out.add(stmt.name.text);
    }
  }
  return out;
}

export async function measureEdges(root = ROOT_DIR): Promise<Edge[]> {
  const packages = await workspacePackages(root);
  const list: string[] = [];
  for (const pkg of packages.values()) {
    const src = path.join(pkg.dir, "lib");
    if ((await fs.stat(src).catch(() => null))?.isDirectory())
      list.push(...(await listSources(src)));
  }
  const resolve = makeResolver(new Set(list), packages);
  const scans = new Map<string, ScannedEdge[]>();
  const hoisted = new Map<string, Set<string>>();
  for (const f of list) {
    const text = await fs.readFile(f, "utf-8");
    scans.set(f, scanFile(f, text, resolve));
    hoisted.set(f, hoistedFunctionExports(f, text));
  }
  const graph = new Map([...scans].map(([f, s]) => [f, s.map((e) => e.to)]));
  const comp = new Map<string, number>();
  stronglyConnected(graph).forEach((c, i) => c.forEach((f) => comp.set(f, i)));
  const edges: Edge[] = [];
  for (const [from, s] of scans) {
    for (const e of s) {
      if (comp.get(from) !== comp.get(e.to)) continue;
      const fns = hoisted.get(e.to) ?? new Set();
      const names = [...e.evalNames].filter((n) => {
        const ref = e.evalRefs.get(n);
        return !ref || ref.called || !fns.has(ref.imported);
      });
      if (names.length === 0) continue;
      edges.push({
        from: path.relative(root, from),
        to: path.relative(root, e.to),
        evalNames: names.sort(),
        evalLine: e.evalLine,
      });
    }
  }
  return edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

export function edgeKey(e: Edge): string {
  return `${e.from} -> ${e.to} [${e.evalNames.join(", ")}]`;
}

/** The listed edges that still exist; the list never gains a row. */
export function tighten(mark: Mark, current: Edge[]): Mark {
  const live = new Set(current.map(edgeKey));
  return { ...mark, edges: mark.edges.filter((k) => live.has(k)) };
}

function describe(e: Edge): string {
  return `${e.from}:${e.evalLine} -> ${e.to}  [${e.evalNames.join(", ")}]`;
}

export async function main(args: string[] = [], root = ROOT_DIR): Promise<string> {
  const markFile = path.join(root, path.relative(ROOT_DIR, MARK_FILE));
  const current = await measureEdges(root);
  if (args.includes("--list")) return current.map(describe).join("\n");
  const mark = JSON.parse(await fs.readFile(markFile, "utf-8")) as Mark;
  if (args.includes("--tighten")) {
    await fs.writeFile(markFile, JSON.stringify(tighten(mark, current), null, 2) + "\n");
    return `import-cycles: stale rows dropped from ${path.relative(root, markFile)}`;
  }
  const allowed = new Set(mark.edges);
  const added = current.filter((e) => !allowed.has(edgeKey(e)));
  if (added.length > 0) {
    throw new Error(
      `import-cycles gate: ${added.length} module-eval read(s) inside an import cycle are ` +
        `not on the list. Move the read into a function body, break the cycle, or use a ` +
        `namespace seat (CLAUDE.md § "Call-time constant resolution"); never add a row:\n` +
        added.map((e) => `  ${describe(e)}`).join("\n"),
    );
  }
  const live = new Set(current.map(edgeKey));
  const stale = mark.edges.filter((k) => !live.has(k));
  if (stale.length > 0) {
    throw new Error(
      "import-cycles gate: STALE row (a listed edge no longer exists). " +
        "Run `pnpm parity:import-cycles:tighten` and commit the mark file:\n" +
        stale.map((k) => `  ${k}`).join("\n"),
    );
  }
  return "import-cycles gate: OK";
}

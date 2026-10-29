/**
 * The module-eval import-cycle ratchet (CLAUDE.md § "Call-time constant
 * resolution").
 *
 * Builds, per package, the graph of relative imports that survive emit: an
 * import whose bindings are read only in type positions is elided by `tsc`
 * (the repo does not set `verbatimModuleSyntax`), so it costs no runtime edge
 * whether or not it is spelled `import type`. Inside each strongly connected
 * component of that graph, an edge is a hazard only where an imported binding
 * is read while the importing module body runs — an `extends` clause, a static
 * field initializer or static block, a decorator, a computed member name, or
 * any top-level expression. A read inside a function, method, accessor,
 * constructor or instance field initializer is deferred and is not counted:
 * ESM import bindings are live, so being in a cycle is harmless there.
 *
 * Each such edge can throw `Cannot access 'X' before initialization` when the
 * graph is entered at the wrong module. The counts per package are held in
 * `import-cycles-mark.json` and only go down: `--tighten` writes each mark
 * DOWN, there is no reseed, and `--list` prints every counted edge with the
 * names it reads and the line of the first eval-time read.
 *
 * The scan is syntactic: it does not see shadowing, and it reads type
 * positions from the AST rather than a checker, so a value-namespace merge
 * (a class and an interface of one name) is counted by its value reads only.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import ts from "typescript-5";

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const MARK_FILE = path.join(ROOT_DIR, "scripts/parity/import-cycles-mark.json");

export type Marks = Record<string, number>;

export interface Edge {
  from: string;
  to: string;
  /** Imported local names read at module-eval time. */
  evalNames: string[];
  /** 1-based line of the first module-eval read. */
  evalLine: number;
}

interface FileImports {
  edges: { to: string; evalNames: Set<string>; evalLine: number }[];
}

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

function resolveSpecifier(from: string, spec: string, files: Set<string>): string | null {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(from), spec);
  const candidates = [
    base.replace(/\.js$/, ".ts"),
    base,
    `${base}.ts`,
    path.join(base, "index.ts"),
  ];
  return candidates.find((c) => files.has(c)) ?? null;
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
    if (ts.isExportSpecifier(n)) return true;
    if (ts.isStatement(n) || ts.isSourceFile(n)) return false;
  }
  return false;
}

/** Whether `id` names a binding rather than a property or declaration name. */
function isReference(id: ts.Identifier): boolean {
  const p = id.parent;
  if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
  if (ts.isQualifiedName(p) && p.right === id) return false;
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
      ts.isClassDeclaration(p) ||
      ts.isLabeledStatement(p) ||
      ts.isJsxAttribute(p)) &&
    p.name === id
  ) {
    return false;
  }
  return true;
}

/** Whether a read at `node` runs while the module body is evaluated. */
function isModuleEvalTime(node: ts.Node): boolean {
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
      return false;
    }
    if (ts.isPropertyDeclaration(p) && p.initializer === n) {
      const isStatic = ts.getModifiers(p)?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword);
      if (!isStatic) return false;
    }
  }
  return true;
}

export function scanFile(file: string, text: string, files: Set<string>): FileImports {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const locals = new Map<string, string>();
  const edges = new Map<
    string,
    { to: string; evalNames: Set<string>; evalLine: number; value: boolean }
  >();
  const edgeFor = (to: string) => {
    let e = edges.get(to);
    if (!e) edges.set(to, (e = { to, evalNames: new Set(), evalLine: 0, value: false }));
    return e;
  };

  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const to = resolveSpecifier(file, stmt.moduleSpecifier.text, files);
      if (!to) continue;
      const clause = stmt.importClause;
      if (!clause) {
        edgeFor(to).value = true;
        continue;
      }
      if (clause.isTypeOnly) continue;
      if (clause.name) locals.set(clause.name.text, to);
      const nb = clause.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) locals.set(nb.name.text, to);
      if (nb && ts.isNamedImports(nb)) {
        for (const s of nb.elements) if (!s.isTypeOnly) locals.set(s.name.text, to);
      }
    } else if (
      ts.isExportDeclaration(stmt) &&
      !stmt.isTypeOnly &&
      stmt.moduleSpecifier &&
      ts.isStringLiteral(stmt.moduleSpecifier)
    ) {
      const to = resolveSpecifier(file, stmt.moduleSpecifier.text, files);
      if (!to) continue;
      const named = stmt.exportClause;
      if (named && ts.isNamedExports(named) && named.elements.every((e) => e.isTypeOnly)) continue;
      edgeFor(to).value = true;
    }
  }

  const visit = (node: ts.Node): void => {
    if (
      ts.isIdentifier(node) &&
      locals.has(node.text) &&
      isReference(node) &&
      !isTypePosition(node)
    ) {
      const e = edgeFor(locals.get(node.text)!);
      e.value = true;
      if (isModuleEvalTime(node)) {
        e.evalNames.add(node.text);
        if (!e.evalLine) e.evalLine = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      }
    }
    if (ts.isShorthandPropertyAssignment(node) && locals.has(node.name.text)) {
      const e = edgeFor(locals.get(node.name.text)!);
      e.value = true;
      if (isModuleEvalTime(node)) {
        e.evalNames.add(node.name.text);
        if (!e.evalLine) e.evalLine = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      }
    }
    ts.forEachChild(node, visit);
  };
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) visit(stmt);
  }

  return { edges: [...edges.values()].filter((e) => e.value) };
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
        if (comp.length > 1) out.push(comp);
      }
    }
  }
  return out;
}

/** Every module-eval edge inside an import cycle, per package. */
export async function measureEdges(root = ROOT_DIR): Promise<Record<string, Edge[]>> {
  const out: Record<string, Edge[]> = {};
  const packagesDir = path.join(root, "packages");
  for (const pkg of (await fs.readdir(packagesDir)).sort()) {
    const src = path.join(packagesDir, pkg, "src");
    if (!(await fs.stat(src).catch(() => null))?.isDirectory()) continue;
    const list = await listSources(src);
    const files = new Set(list);
    const scans = new Map<string, FileImports>();
    for (const f of list) scans.set(f, scanFile(f, await fs.readFile(f, "utf-8"), files));
    const graph = new Map([...scans].map(([f, s]) => [f, s.edges.map((e) => e.to)]));
    const comp = new Map<string, number>();
    stronglyConnected(graph).forEach((c, i) => c.forEach((f) => comp.set(f, i)));
    const edges: Edge[] = [];
    for (const [from, s] of scans) {
      for (const e of s.edges) {
        if (e.evalNames.size === 0 || e.to === from) continue;
        if (comp.get(from) === undefined || comp.get(from) !== comp.get(e.to)) continue;
        edges.push({
          from: path.relative(root, from),
          to: path.relative(root, e.to),
          evalNames: [...e.evalNames].sort(),
          evalLine: e.evalLine,
        });
      }
    }
    if (edges.length)
      out[pkg] = edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  }
  return out;
}

export function counts(edges: Record<string, Edge[]>): Marks {
  return Object.fromEntries(Object.entries(edges).map(([k, v]) => [k, v.length]));
}

/** Each mark lowered to the current count, never raised; a zero row is dropped. */
export function tighten(marks: Marks, current: Marks): Marks {
  const out: Marks = {};
  for (const pkg of Object.keys(marks).sort()) {
    const n = Math.min(marks[pkg], current[pkg] ?? 0);
    if (n > 0) out[pkg] = n;
  }
  return out;
}

export async function main(args: string[] = [], root = ROOT_DIR): Promise<string> {
  const markFile = path.join(root, path.relative(ROOT_DIR, MARK_FILE));
  const edges = await measureEdges(root);
  const current = counts(edges);
  if (args.includes("--list")) {
    return Object.values(edges)
      .flat()
      .map((e) => `${e.from}:${e.evalLine} -> ${e.to}  [${e.evalNames.join(", ")}]`)
      .join("\n");
  }
  const marks = JSON.parse(await fs.readFile(markFile, "utf-8")) as Marks;
  if (args.includes("--tighten")) {
    await fs.writeFile(markFile, JSON.stringify(tighten(marks, current), null, 2) + "\n");
    return `import-cycles: marks tightened in ${path.relative(root, markFile)}`;
  }
  const grew = Object.keys(current)
    .sort()
    .filter((pkg) => current[pkg] > (marks[pkg] ?? 0));
  if (grew.length > 0) {
    const lines = grew.flatMap((pkg) => [
      `  ${pkg}: ${marks[pkg] ?? 0} → ${current[pkg]}`,
      ...edges[pkg].map(
        (e) => `    ${e.from}:${e.evalLine} -> ${e.to}  [${e.evalNames.join(", ")}]`,
      ),
    ]);
    throw new Error(
      `import-cycles gate: module-eval reads inside an import cycle grew. Move the read ` +
        `into a function body, break the cycle, or use a namespace seat (CLAUDE.md ` +
        `§ "Call-time constant resolution"); never raise the mark:\n${lines.join("\n")}`,
    );
  }
  if (JSON.stringify(tighten(marks, current)) !== JSON.stringify(marks)) {
    throw new Error(
      "import-cycles gate: STALE high-water mark (a count fell below its mark). " +
        "Run `pnpm parity:import-cycles:tighten` and commit the mark file.",
    );
  }
  return "import-cycles gate: OK";
}

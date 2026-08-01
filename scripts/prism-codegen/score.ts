import ts from "typescript";

export interface ScoreEntry {
  name: string;
  status: "matched" | "reordered" | "divergent" | "missing";
  generatedSkeleton?: string;
  portSkeleton?: string;
  portFile?: string;
}

export interface FileScore {
  entries: ScoreEntry[];
  matched: number;
  reordered: number;
  divergent: number;
  missing: number;
  conformancePct: number;
}

export interface GlobalPortIndex {
  byName: Map<string, { fn: ts.FunctionLikeDeclaration; file: string }[]>;
}

interface PortIndex {
  byName: Map<string, ts.FunctionLikeDeclaration>;
}

export function indexPortFile(source: string): PortIndex {
  const sf = ts.createSourceFile("port.ts", source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const fns = new Map<string, ts.FunctionLikeDeclaration>();
  const byName = new Map<string, ts.FunctionLikeDeclaration>();

  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      fns.set(node.name.text, node);
      byName.set(node.name.text, node);
    }
    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && node.body) {
      if (!byName.has(node.name.text)) byName.set(node.name.text, node);
    }
    if (
      (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) &&
      ts.isIdentifier(node.name) &&
      node.body
    ) {
      const existing = byName.get(node.name.text);
      const getterOverSetter =
        !!existing && ts.isSetAccessorDeclaration(existing) && ts.isGetAccessorDeclaration(node);
      if (!existing || getterOverSetter) byName.set(node.name.text, node);
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      fns.set(node.name.text, node.initializer);
      if (!byName.has(node.name.text)) byName.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  const resolveRef = (expr: ts.Expression): string | undefined => {
    if (ts.isIdentifier(expr)) return expr.text;
    if (ts.isCallExpression(expr) && expr.arguments.length === 1) {
      return resolveRef(expr.arguments[0]);
    }
    return undefined;
  };
  const visitMaps = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isObjectLiteralExpression(node.initializer)) {
        for (const prop of node.initializer.properties) {
          if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
            const ref = resolveRef(prop.initializer);
            const target = ref ? fns.get(ref) : undefined;
            if (target) byName.set(prop.name.text, target);
          }
        }
      }
      if (ts.isIdentifier(node.name)) {
        const ref = ts.isIdentifier(node.initializer)
          ? node.initializer.text
          : ts.isCallExpression(node.initializer)
            ? resolveRef(node.initializer)
            : undefined;
        const target = ref ? fns.get(ref) : undefined;
        if (target && !byName.has(node.name.text)) byName.set(node.name.text, target);
      }
    }
    ts.forEachChild(node, visitMaps);
  };
  visitMaps(sf);

  return { byName };
}

export function skeleton(fn: ts.FunctionLikeDeclaration): string {
  return skeletonTokens(fn).join(" ");
}

export function skeletonTokens(fn: ts.FunctionLikeDeclaration): string[] {
  const tokens: string[] = [];
  const calleeNodes = new Set<ts.Node>();
  const calleeName = (expr: ts.Expression): string | undefined => {
    if (ts.isIdentifier(expr)) return expr.text;
    if (ts.isPropertyAccessExpression(expr)) {
      if (expr.name.text === "call" && ts.isIdentifier(expr.expression)) {
        return expr.expression.text;
      }
      return expr.name.text;
    }
    return undefined;
  };
  const walk = (node: ts.Node) => {
    switch (node.kind) {
      case ts.SyntaxKind.IfStatement:
        tokens.push("if");
        break;
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForOfStatement:
        tokens.push("loop");
        break;
      case ts.SyntaxKind.TryStatement:
        tokens.push("try");
        break;
      case ts.SyntaxKind.ThrowStatement:
        tokens.push("throw");
        break;
      case ts.SyntaxKind.ConditionalExpression:
        tokens.push("if");
        break;
      case ts.SyntaxKind.NewExpression: {
        const ctor = (node as ts.NewExpression).expression;
        const nm = ts.isIdentifier(ctor)
          ? ctor.text
          : ts.isPropertyAccessExpression(ctor)
            ? ctor.name.text
            : "?";
        tokens.push(`new:${nm}`);
        break;
      }
      case ts.SyntaxKind.CallExpression: {
        const call = node as ts.CallExpression;
        const nm = calleeName(call.expression);
        if (nm && nm !== "__PRISM_TODO") {
          tokens.push(`ref:${normalizeName(nm)}`);
          calleeNodes.add(call.expression);
        }
        break;
      }
      case ts.SyntaxKind.PropertyAccessExpression: {
        if (!calleeNodes.has(node) && (node as ts.PropertyAccessExpression).name.text !== "call") {
          tokens.push(`ref:${normalizeName((node as ts.PropertyAccessExpression).name.text)}`);
        }
        break;
      }
      case ts.SyntaxKind.ElementAccessExpression: {
        // `records[0]` and Ruby's `records.first` are the same reach; token
        // literal indexes as the ordinal word so neither side reads as noise.
        const idx = (node as ts.ElementAccessExpression).argumentExpression;
        if (ts.isNumericLiteral(idx)) {
          const ordinal = ORDINALS[Number(idx.text)];
          tokens.push(ordinal ? `ref:${ordinal}` : `ref:at`);
        }
        break;
      }
    }
    ts.forEachChild(node, walk);
  };
  if (fn.body) walk(fn.body);
  return tokens;
}

const ORDINALS: Record<number, string> = {
  0: "first",
  1: "second",
  2: "third",
  3: "fourth",
  4: "fifth",
};

const TOKEN_CANON: Record<string, string> = {
  forEach: "each",
  eachWithIndex: "each",
  withIndex: "each",
  collect: "map",
  detect: "find",
  inject: "reduce",
  toA: "toArray",
  size: "length",
};

function normalizeName(name: string): string {
  let n = name.replace(/^_+/, "");
  const perform = /^perform([A-Z])(.*)$/.exec(n);
  if (perform) n = perform[1].toLowerCase() + perform[2];
  const pred = /^is([A-Z])(.*)$/.exec(n);
  if (pred) n = pred[1].toLowerCase() + pred[2];
  return TOKEN_CANON[n] ?? n;
}

function paramCount(fn: ts.FunctionLikeDeclaration): number {
  return fn.parameters.filter((p) => !(ts.isIdentifier(p.name) && p.name.text === "this")).length;
}

function multisetEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return [...a].sort().join("\u0000") === [...b].sort().join("\u0000");
}

export function nameCandidates(generatedName: string): string[] {
  const out = [generatedName];
  const m = /^is([A-Z])(.*)$/.exec(generatedName);
  if (m) out.push(m[1].toLowerCase() + m[2]);
  return out;
}

export function indexPortTree(files: { path: string; source: string }[]): GlobalPortIndex {
  const byName = new Map<string, { fn: ts.FunctionLikeDeclaration; file: string }[]>();
  for (const { path: file, source } of files) {
    const idx = indexPortFile(source);
    for (const [name, fn] of idx.byName) {
      const list = byName.get(name) ?? [];
      list.push({ fn, file });
      byName.set(name, list);
    }
  }
  return { byName };
}

export function scoreFile(
  generatedCode: string,
  portSource: string,
  cleanDefs: ReadonlySet<string>,
  globalIndex?: GlobalPortIndex,
): FileScore {
  const genSf = ts.createSourceFile(
    "gen.js",
    generatedCode,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.JS,
  );
  const genFns = new Map<string, ts.FunctionLikeDeclaration>();
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      genFns.set(node.name.text, node);
    }
    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && node.body) {
      genFns.set(node.name.text, node);
    }
    ts.forEachChild(node, visit);
  };
  visit(genSf);

  const port = indexPortFile(portSource);
  const entries: ScoreEntry[] = [];
  for (const [name, fn] of genFns) {
    if (!cleanDefs.has(name)) continue;
    const resolved = resolvePortFn(name, fn, port, globalIndex);
    if (!resolved) {
      entries.push({ name, status: "missing" });
      continue;
    }
    const genTokens = skeletonTokens(fn);
    const portTokens = skeletonTokens(resolved.fn);
    const status =
      genTokens.join(" ") === portTokens.join(" ")
        ? "matched"
        : multisetEqual(genTokens, portTokens)
          ? "reordered"
          : "divergent";
    entries.push({
      name,
      status,
      generatedSkeleton: genTokens.join(" "),
      portSkeleton: portTokens.join(" "),
      portFile: resolved.file,
    });
  }

  const matched = entries.filter((s) => s.status === "matched").length;
  const reordered = entries.filter((s) => s.status === "reordered").length;
  const divergent = entries.filter((s) => s.status === "divergent").length;
  const missing = entries.filter((s) => s.status === "missing").length;
  const present = matched + reordered + divergent;
  return {
    entries,
    matched,
    reordered,
    divergent,
    missing,
    conformancePct: present === 0 ? 0 : ((matched + reordered) / present) * 100,
  };
}

function resolvePortFn(
  name: string,
  genFn: ts.FunctionLikeDeclaration,
  port: PortIndex,
  globalIndex?: GlobalPortIndex,
): { fn: ts.FunctionLikeDeclaration; file?: string } | undefined {
  const candidates = nameCandidates(name);
  for (let i = 0; i < candidates.length; i++) {
    const found = port.byName.get(candidates[i]);
    // A fallback candidate (predicate `isX` falling back to `x`) can collide
    // with a DIFFERENT Rails method whose primary name is `x` (readonly? vs
    // readonly(value)) — require arity agreement before accepting one.
    if (found && (i === 0 || paramCount(found) === paramCount(genFn))) {
      return { fn: found };
    }
  }
  if (globalIndex) {
    for (let i = 0; i < candidates.length; i++) {
      const hits = globalIndex.byName.get(candidates[i]) ?? [];
      // Only an unambiguous cross-file hit counts; collisions stay missing.
      if (hits.length === 1 && (i === 0 || paramCount(hits[0].fn) === paramCount(genFn))) {
        return hits[0];
      }
    }
  }
  return undefined;
}

import ts from "typescript";

export interface ScoreEntry {
  name: string;
  status: "matched" | "divergent" | "missing";
  generatedSkeleton?: string;
  portSkeleton?: string;
}

export interface FileScore {
  entries: ScoreEntry[];
  matched: number;
  divergent: number;
  missing: number;
  conformancePct: number;
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
    }
    ts.forEachChild(node, walk);
  };
  if (fn.body) walk(fn.body);
  return tokens.join(" ");
}

function normalizeName(name: string): string {
  let n = name.replace(/^_+/, "");
  const perform = /^perform([A-Z])(.*)$/.exec(n);
  if (perform) n = perform[1].toLowerCase() + perform[2];
  const pred = /^is([A-Z])(.*)$/.exec(n);
  if (pred) n = pred[1].toLowerCase() + pred[2];
  return n;
}

export function nameCandidates(generatedName: string): string[] {
  const out = [generatedName];
  const m = /^is([A-Z])(.*)$/.exec(generatedName);
  if (m) out.push(m[1].toLowerCase() + m[2]);
  return out;
}

export function scoreFile(
  generatedCode: string,
  portSource: string,
  cleanDefs: ReadonlySet<string>,
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
    const portFn = nameCandidates(name)
      .map((c) => port.byName.get(c))
      .find((p) => p !== undefined);
    if (!portFn) {
      entries.push({ name, status: "missing" });
      continue;
    }
    const genSkel = skeleton(fn);
    const portSkel = skeleton(portFn);
    entries.push({
      name,
      status: genSkel === portSkel ? "matched" : "divergent",
      generatedSkeleton: genSkel,
      portSkeleton: portSkel,
    });
  }

  const matched = entries.filter((s) => s.status === "matched").length;
  const divergent = entries.filter((s) => s.status === "divergent").length;
  const missing = entries.filter((s) => s.status === "missing").length;
  const present = matched + divergent;
  return {
    entries,
    matched,
    divergent,
    missing,
    conformancePct: present === 0 ? 0 : (matched / present) * 100,
  };
}

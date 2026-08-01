import ts from "typescript";
import { methodName, rubyFileToTs } from "./naming.js";

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

export interface PortIndex {
  byName: Map<string, ts.FunctionLikeDeclaration>;
}

/**
 * Which port file each Rails method name is already claimed by: `name` →
 * the port twins of every Rails file that defines a method of that name.
 *
 * The cross-file fallback exists for methods ported *away* from their twin
 * file, but a same-named method in another file is usually not that — it is
 * another Rails class' own method, sitting in its own twin. `SchemaCache`
 * defines `initialize_dup` just as `Associations` does; without ownership the
 * scorer resolved `associations.rb::initializeDup` to schema-cache.ts and
 * reported an unrelated body as a divergence.
 */
export interface PortOwnership {
  claimedBy: Map<string, Set<string>>;
}

/** Every `def name` in a Rails source, mapped to the TS spelling. */
function rubyDefNames(source: string): string[] {
  const out: string[] = [];
  const re = /^\s*def\s+(?:self\.)?([A-Za-z_][A-Za-z0-9_]*[?!=]?)/gm;
  let m;
  while ((m = re.exec(source))) out.push(methodName(m[1]));
  return out;
}

export function buildPortOwnership(rubyFiles: { path: string; source: string }[]): PortOwnership {
  const claimedBy = new Map<string, Set<string>>();
  for (const { path: rubyPath, source } of rubyFiles) {
    const portPath = rubyFileToTs(rubyPath.replace(/^active_record\//, ""));
    for (const name of rubyDefNames(source)) {
      const set = claimedBy.get(name) ?? new Set<string>();
      set.add(portPath);
      claimedBy.set(name, set);
    }
  }
  return { claimedBy };
}

/**
 * A cross-file hit is borrowable unless the file that holds it is the twin of a
 * Rails file that defines the same method itself.
 */
function isBorrowable(name: string, file: string, ownership?: PortOwnership): boolean {
  const owners = ownership?.claimedBy.get(name);
  return !owners || !owners.has(file);
}

/**
 * True when a variable declaration sits directly in the module body — a local
 * helper arrow inside some unrelated function is not a port symbol and must not
 * shadow one.
 */
function isTopLevelDeclaration(node: ts.VariableDeclaration): boolean {
  const statement = node.parent?.parent;
  return (
    !!statement &&
    ts.isVariableStatement(statement) &&
    (ts.isSourceFile(statement.parent) || ts.isModuleBlock(statement.parent))
  );
}

/**
 * Peels the type-only wrappers a mixin indirection map may carry — the real
 * `FinderMethods` map ends `} as const;`, so the declaration's initializer is an
 * `AsExpression` and the object literal underneath would otherwise be skipped.
 */
function unwrapExpression(expr: ts.Expression): ts.Expression {
  let current = expr;
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
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
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) &&
      isTopLevelDeclaration(node)
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
      const initializer = unwrapExpression(node.initializer);
      if (ts.isObjectLiteralExpression(initializer)) {
        for (const prop of initializer.properties) {
          if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
            const ref = resolveRef(prop.initializer);
            const target = ref ? fns.get(ref) : undefined;
            if (target) byName.set(prop.name.text, target);
          }
        }
      }
      if (ts.isIdentifier(node.name)) {
        const ref = ts.isIdentifier(initializer)
          ? initializer.text
          : ts.isCallExpression(initializer)
            ? resolveRef(initializer)
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

/**
 * Body skeleton as a token stream: control keywords plus normalized call and
 * property reaches. Two folds beyond the literal AST shape: logical operators
 * token as `if` between their operands, because Ruby's `a || b` and the port's
 * `const x = a; if (!x) b` are the same conditional reach; and non-numeric
 * element access tokens as `ref:get`, because `h[k]` and the port's
 * `map.get(k)` are the same keyed read.
 */
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
      case ts.SyntaxKind.BinaryExpression: {
        const bin = node as ts.BinaryExpression;
        if (LOGICAL_OPS.has(bin.operatorToken.kind)) {
          walk(bin.left);
          tokens.push("if");
          walk(bin.right);
          return;
        }
        break;
      }
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
        } else {
          tokens.push("ref:get");
        }
        break;
      }
    }
    ts.forEachChild(node, walk);
  };
  if (fn.body) walk(fn.body);
  return tokens;
}

const LOGICAL_OPS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

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
  size: "length",
  modelClass: "model",
  arelTable: "table",
};

export function normalizeName(name: string): string {
  let n = name.replace(/^_+/, "");
  const perform = /^perform([A-Z])(.*)$/.exec(n);
  if (perform) n = perform[1].toLowerCase() + perform[2];
  const pred = /^is([A-Z])(.*)$/.exec(n);
  if (pred) n = pred[1].toLowerCase() + pred[2];
  return Object.hasOwn(TOKEN_CANON, n) ? TOKEN_CANON[n] : n;
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
  ownership?: PortOwnership,
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
    const resolved = resolvePortFn(name, fn, port, globalIndex, ownership);
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

/**
 * Every cross-file port symbol a generated def could plausibly be, under the same
 * name-candidate and arity rules as {@link resolvePortFn}. `resolvePortFn` only
 * *resolves* an unambiguous hit; `codegen:apply` also needs the ambiguous ones,
 * so it can refuse instead of scaffolding a probable duplicate.
 */
export function crossFileHits(
  name: string,
  genFn: ts.FunctionLikeDeclaration,
  globalIndex: GlobalPortIndex,
): { fn: ts.FunctionLikeDeclaration; file: string }[] {
  const out: { fn: ts.FunctionLikeDeclaration; file: string }[] = [];
  const candidates = nameCandidates(name);
  for (let i = 0; i < candidates.length; i++) {
    for (const hit of globalIndex.byName.get(candidates[i]) ?? []) {
      if (i === 0 || paramCount(hit.fn) === paramCount(genFn)) out.push(hit);
    }
  }
  return out;
}

/**
 * The single resolution rule shared by the scorer and `codegen:apply`: a
 * primary-name hit in the twin file wins, then an arity-agreeing fallback
 * candidate, then an unambiguous cross-file hit.
 */
export function resolvePortFn(
  name: string,
  genFn: ts.FunctionLikeDeclaration,
  port: PortIndex,
  globalIndex?: GlobalPortIndex,
  ownership?: PortOwnership,
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
      // Only an unambiguous cross-file hit counts; collisions stay missing, and
      // a hit owned by another Rails file's twin is that file's method, not a
      // relocated port of this one.
      if (
        hits.length === 1 &&
        isBorrowable(candidates[i], hits[0].file, ownership) &&
        (i === 0 || paramCount(hits[0].fn) === paramCount(genFn))
      ) {
        return hits[0];
      }
    }
  }
  return undefined;
}

/**
 * The type pass: the generated tree loaded into the TypeScript checker, and
 * every `any` the lowering wrote replaced by what the checker can see.
 *
 * - A parameter typed `any` becomes the union of the argument types its call
 *   sites pass (`unknown` where nothing calls it), and a module function's
 *   `this: any` the union of the receivers it is called on.
 * - A return annotated `any` is dropped, so TypeScript infers it; one whose
 *   inference then fails (a recursive method, TS7023) is `unknown`.
 * - A local or hoisted temp typed `any` is left to inference (`let x;` takes
 *   the type of what is assigned to it).
 * - A block parameter typed `any` is left to its contextual type, `unknown`
 *   where there is none (TS7006).
 *
 * Each round re-reads the tree, since a typed parameter types the arguments it
 * passes on; it stops when a round changes nothing. What is still an error
 * afterwards is a real type failure in the generated code.
 *
 *   pnpm tsx scripts/codegen/src/type-pass.ts <generated src dir> <package tsconfig>
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript-5";
import { ROOT } from "./gem.js";

interface Edit {
  pos: number;
  end: number;
  text: string;
}

function walkDir(d: string): string[] {
  return readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walkDir(path.join(d, e.name))
      : e.name.endsWith(".ts")
        ? [path.join(d, e.name)]
        : [],
  );
}

/** Bumped on every write, so a program built since the last one is reused. */
let generation = 0;

function applyEdits(file: string, edits: Edit[]): void {
  if (!edits.length) return;
  generation++;
  let text = readFileSync(file, "utf8");
  // Applied from the end backwards; an edit overlapping one already applied
  // (an assertion around an expression another assertion is inside) is
  // dropped, for the next round to reconsider on the edited text.
  let floor = Infinity;
  const seen = new Set<number>();
  for (const e of [...edits].sort((a, b) => b.pos - a.pos || b.end - a.end)) {
    if (seen.has(e.pos) || e.end > floor) continue;
    seen.add(e.pos);
    text = text.slice(0, e.pos) + e.text + text.slice(e.end);
    floor = e.pos;
  }
  writeFileSync(file, text);
}

const isAnyNode = (t: ts.TypeNode | undefined): boolean =>
  !!t && t.kind === ts.SyntaxKind.AnyKeyword;
const isAnyArrayNode = (t: ts.TypeNode | undefined): boolean =>
  !!t && ts.isArrayTypeNode(t) && t.elementType.kind === ts.SyntaxKind.AnyKeyword;

/** Root exports of each `@blazetrails/*` package, for writing a dependency's type by name. */
function pkgRootExports(): Map<string, Set<string>> {
  const raw = JSON.parse(
    readFileSync(path.join(ROOT, "scripts/codegen/data/pkg-exports.json"), "utf8"),
  ) as Record<string, string[]>;
  return new Map(Object.entries(raw).map(([k, v]) => [k, new Set(v)]));
}

export class TypePass {
  private options: ts.CompilerOptions;
  private files: string[];
  private exportsOf = pkgRootExports();
  constructor(
    private srcDir: string,
    tsconfig: string,
    /** The hand port's `src`, whose declared types a twin is given (transplant). */
    private handSrcDir?: string,
  ) {
    const cfg = ts.readConfigFile(tsconfig, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, path.dirname(tsconfig));
    this.options = {
      ...parsed.options,
      noEmit: true,
      composite: false,
      incremental: false,
      rootDir: undefined,
      tsBuildInfoFile: undefined,
    };
    // The leftover runtime shim is hand-shaped helper code, not lowered Ruby.
    this.files = walkDir(srcDir).filter((f) => !f.endsWith("codegen-runtime.ts"));
  }

  private cached?: { program: ts.Program; generation: number };

  /**
   * A program over the tree, bound (the binder sets the parent pointers the
   * passes walk); the same one until an edit is written.
   */
  private program(): ts.Program {
    if (this.cached?.generation === generation) return this.cached.program;
    const p = ts.createProgram(this.files, this.options, undefined, this.cached?.program);
    p.getTypeChecker();
    this.cached = { program: p, generation };
    return p;
  }

  /** Type-only imports each file needs for the types written into it: file → spec → name → local. */
  private pendingImports = new Map<string, Map<string, Map<string, string>>>();

  /**
   * The local name `name` from `spec` has in `sf`: the file's own import of it
   * if there is one, else a new `import type` (aliased if the name is taken).
   */
  private typeLocal(sf: ts.SourceFile, spec: string, name: string): string {
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
      if (st.moduleSpecifier.text !== spec) continue;
      const nb = st.importClause?.namedBindings;
      if (nb && ts.isNamedImports(nb))
        for (const el of nb.elements)
          if ((el.propertyName ?? el.name).text === name) return el.name.text;
    }
    const pf =
      this.pendingImports.get(sf.fileName) ??
      this.pendingImports.set(sf.fileName, new Map()).get(sf.fileName)!;
    const pm = pf.get(spec) ?? pf.set(spec, new Map()).get(spec)!;
    const have = pm.get(name);
    if (have) return have;
    const taken = new Set<string>();
    for (const m of pf.values()) for (const l of m.values()) taken.add(l);
    const declared = (n: string) =>
      taken.has(n) || new RegExp(`\\b${n.replace(/\$/g, "\\$")}\\b`).test(sf.text);
    let local = name;
    for (let i = 2; declared(local); i++) local = `${name}${i}`;
    pm.set(name, local);
    return local;
  }

  /** The `import type` lines a file is owed, as one edit after its last import. */
  private importEdit(sf: ts.SourceFile): Edit | null {
    const pf = this.pendingImports.get(sf.fileName);
    if (!pf?.size) return null;
    this.pendingImports.delete(sf.fileName);
    const lines = [...pf].map(
      ([spec, m]) =>
        `import type { ${[...m].map(([k, v]) => (k === v ? k : `${k} as ${v}`)).join(", ")} } from "${spec}";`,
    );
    const last = [...sf.statements].filter(ts.isImportDeclaration).at(-1);
    const pos = last ? last.getEnd() : 0;
    return { pos, end: pos, text: (last ? "\n" : "") + lines.join("\n") + (last ? "" : "\n") };
  }

  /**
   * A type as source text usable in `file`: a type out of scope there is
   * named through an `import type` at the top of the file, from the generated
   * file's relative path or the dependency package's root; null when it cannot
   * be named from `file`.
   */
  typeText(
    checker: ts.TypeChecker,
    t: ts.Type,
    at: ts.Node,
    file: string,
    depth = 0,
  ): string | null {
    if (t.flags & (ts.TypeFlags.Any | ts.TypeFlags.Never)) return null;
    // A recursive type (an array of arrays of itself) is not walked forever.
    if (depth > 8) return null;
    // Library code never names a test's class: a test job reaching a library
    // parameter is typed by its nearest library superclass (`HelloJob` → `Base`).
    if (!isTestPath(file)) {
      // An array's element type, a union's members, each in turn.
      if (checker.isArrayType(t)) {
        const el = checker.getTypeArguments(t as ts.TypeReference)[0];
        const inner = el ? this.typeText(checker, el, at, file, depth + 1) : null;
        return inner === null ? null : /[|&\s]/.test(inner) ? `(${inner})[]` : `${inner}[]`;
      }
      if (t.isUnion()) {
        const parts = t.types.map((u) => this.typeText(checker, u, at, file, depth + 1));
        return parts.some((x) => x === null) ? null : TypePass.union(parts as string[]);
      }
      t = this.libraryType(checker, t);
    }
    // A type whose symbol chain the checker cannot walk (a deep or cyclic
    // one; activerecord's overflows its stack) is one this pass cannot write.
    let node: ts.TypeNode | undefined;
    try {
      node = checker.typeToTypeNode(
        checker.getBaseTypeOfLiteralType(t),
        at,
        ts.NodeBuilderFlags.NoTruncation | ts.NodeBuilderFlags.IgnoreErrors,
      );
    } catch (e) {
      if (e instanceof RangeError) return null;
      throw e;
    }
    if (!node) return null;
    let text = ts
      .createPrinter({ removeComments: true })
      .printNode(ts.EmitHint.Unspecified, node, at.getSourceFile());
    if (/\bany\b|\(Anonymous|__object|__type|\bthis\b/.test(text) || text.length > 400) return null;
    let ok = true;
    const sf = at.getSourceFile();
    const wanted: [string, string][] = [];
    text = text.replace(/import\("([^"]+)"\)\.([\w$]+)/g, (_m, spec: string, name: string) => {
      let id: string | null = null;
      if (path.isAbsolute(spec) && spec.startsWith(this.srcDir)) {
        id = path.relative(path.dirname(file), spec).replace(/\.d$|\.ts$/, "");
        if (!id.startsWith(".")) id = `./${id}`;
        id = `${id}.js`;
      } else {
        const pkg = /\/packages\/([\w-]+)\//.exec(spec)?.[1];
        const pid = pkg ? `@blazetrails/${pkg}` : null;
        if (pid && this.exportsOf.get(pid)?.has(name)) id = pid;
      }
      if (!id) {
        ok = false;
        return _m;
      }
      wanted.push([id, name]);
      return `@@type${wanted.length - 1}@@`;
    });
    if (!ok) return null;
    // Only now that the whole type can be written are its imports recorded.
    return text.replace(/@@type(\d+)@@/g, (_m, i: string) =>
      this.typeLocal(sf, ...wanted[Number(i)]),
    );
  }

  /** `t`, or for a class (or `typeof` a class) declared in test code, its nearest non-test superclass. */
  private libraryType(checker: ts.TypeChecker, t: ts.Type): ts.Type {
    const declFile = (x: ts.Type) => x.getSymbol()?.declarations?.[0]?.getSourceFile().fileName;
    for (let i = 0; i < 20; i++) {
      const f = declFile(t);
      if (!f || !isTestPath(f)) return t;
      const decl = t.getSymbol()!.declarations![0];
      if (!ts.isClassLike(decl)) return t;
      const isCtor = t.getConstructSignatures().length > 0;
      const ext = decl.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword)
        ?.types[0];
      if (!ext) return t;
      const baseInstance = checker.getTypeAtLocation(ext);
      t = isCtor ? checker.getTypeOfSymbolAtLocation(baseInstance.getSymbol()!, ext) : baseInstance;
    }
    return t;
  }

  /** The union of `types`, `unknown` when empty. */
  static union(types: Iterable<string>): string {
    const set = new Set<string>();
    for (const t of types) for (const p of splitUnion(t)) set.add(p);
    if (!set.size) return "unknown";
    if (set.has("unknown")) return "unknown";
    // A function type in a union is parenthesized (TS1385).
    const wrap = (x: string) =>
      set.size > 1 && /=>/.test(x) && !/^\(.*\)$/.test(x) ? `(${x})` : x;
    return [...set]
      .sort((a, b) => (a === "null" ? 1 : b === "null" ? -1 : 0))
      .map(wrap)
      .join(" | ");
  }

  /**
   * One round over parameters and `this`: the declarations still typed `any`,
   * each given the union of what reaches it. Answers the number of edits.
   */
  paramRound(lastRound: boolean): number {
    const program = this.program();
    const checker = program.getTypeChecker();
    const seen = new Map<ts.ParameterDeclaration, ts.Type[]>();
    const thisSeen = new Map<ts.ParameterDeclaration, ts.Type[]>();
    const add = (
      m: Map<ts.ParameterDeclaration, ts.Type[]>,
      p: ts.ParameterDeclaration,
      t: ts.Type,
    ) => {
      if (t.flags & (ts.TypeFlags.Any | ts.TypeFlags.Never)) return;
      const list = m.get(p) ?? m.set(p, []).get(p)!;
      for (const u of t.isUnion() ? t.types : [t]) list.push(checker.getBaseTypeOfLiteralType(u));
    };
    // The widest of the types that reach a declaration: one assignable to
    // another is dropped (`typeof HelloJob` beside `typeof Base`), so the
    // union names what every caller has in common rather than each caller.
    const widest = (types: ts.Type[]): ts.Type[] => {
      const uniq = [...new Set(types)];
      return uniq.filter(
        (t, i) =>
          !uniq.some(
            (o, j) =>
              j !== i &&
              checker.isTypeAssignableTo(t, o) &&
              (!checker.isTypeAssignableTo(o, t) || j < i),
          ),
      );
    };
    const sourceFiles = this.files
      .map((f) => program.getSourceFile(f))
      .filter(Boolean) as ts.SourceFile[];
    // Every call: each argument's type joins the parameter it lands in.
    const visit = (node: ts.Node, sf: ts.SourceFile): void => {
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const sig = checker.getResolvedSignature(node);
        const decl = sig?.declaration;
        if (
          decl &&
          !ts.isJSDocSignature(decl) &&
          decl.getSourceFile().fileName.startsWith(this.srcDir)
        ) {
          const ps = decl.parameters.filter(
            (p) => !(ts.isIdentifier(p.name) && p.name.text === "this"),
          );
          (node.arguments ?? []).forEach((arg, i) => {
            if (ts.isSpreadElement(arg)) return;
            const p = ps[Math.min(i, ps.length - 1)];
            if (!p || (i >= ps.length && !p.dotDotDotToken)) return;
            if (!isAnyNode(p.type) && !isAnyArrayNode(p.type)) return;
            add(seen, p, checker.getTypeAtLocation(arg));
          });
          // `recv.m(...)` reaches a module function as a method: `recv` is its `this`.
          const thisP = decl.parameters.find(
            (p) => ts.isIdentifier(p.name) && p.name.text === "this",
          );
          if (thisP && isAnyNode(thisP.type) && ts.isCallExpression(node)) {
            const callee = node.expression;
            let recv: ts.Expression | undefined;
            if (ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee))
              recv = callee.expression;
            // `fn.call(recv, …)`: the first argument.
            if (
              ts.isPropertyAccessExpression(callee) &&
              callee.name.text === "call" &&
              node.arguments.length
            )
              recv = node.arguments[0];
            if (recv) add(thisSeen, thisP, checker.getTypeAtLocation(recv));
          }
        }
      }
      ts.forEachChild(node, (c) => visit(c, sf));
    };
    for (const sf of sourceFiles) visit(sf, sf);
    // Every assignment to a field declared `unknown` (an ivar, a class_attribute):
    // its value's type joins the field's.
    const fieldSeen = new Map<ts.Declaration, ts.Type[]>();
    const emptyArrays = new Set<ts.Declaration>();
    const isUnknownNode = (t: ts.TypeNode | undefined) =>
      !!t && t.kind === ts.SyntaxKind.UnknownKeyword;
    const assigns = (node: ts.Node): void => {
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        (ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left))
      ) {
        const sym = checker.getSymbolAtLocation(
          ts.isPropertyAccessExpression(node.left) ? node.left.name : node.left.argumentExpression,
        );
        const d = sym?.declarations?.[0];
        if (
          d &&
          (ts.isPropertyDeclaration(d) || ts.isPropertySignature(d)) &&
          isUnknownNode(d.type) &&
          d.getSourceFile().fileName.startsWith(this.srcDir)
        ) {
          const t = checker.getTypeAtLocation(node.right);
          // `@values = []`: an empty array says nothing of its elements (TS
          // reads `never[]`); the field takes the other assignments' types, or
          // `unknown[]` when there are none.
          const emptyArray =
            checker.isArrayType(t) &&
            !!(checker.getTypeArguments(t as ts.TypeReference)[0]?.flags & ts.TypeFlags.Never);
          if (emptyArray) emptyArrays.add(d);
          else if (!(t.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never))) {
            const list = fieldSeen.get(d) ?? fieldSeen.set(d, []).get(d)!;
            for (const u of t.isUnion() ? t.types : [t])
              list.push(checker.getBaseTypeOfLiteralType(u));
          }
        }
      }
      ts.forEachChild(node, assigns);
    };
    for (const sf of sourceFiles) assigns(sf);
    // Every declaration still typed `any`: its union, or (on the last round, when
    // nothing more can arrive) `unknown`.
    const edits = new Map<string, Edit[]>();
    const push = (sf: ts.SourceFile, e: Edit) =>
      (edits.get(sf.fileName) ?? edits.set(sf.fileName, []).get(sf.fileName)!).push(e);
    let n = 0;
    const decls = (node: ts.Node, sf: ts.SourceFile): void => {
      if (
        ts.isParameter(node) &&
        node.type &&
        (isAnyNode(node.type) || isAnyArrayNode(node.type))
      ) {
        const isThis = ts.isIdentifier(node.name) && node.name.text === "this";
        const types = (isThis ? thisSeen : seen).get(node);
        const texts = widest(types ?? []).map((x) => this.typeText(checker, x, node, sf.fileName));
        // A type that cannot be written here leaves the declaration to a later
        // round, or `unknown` on the last.
        const got = texts.every((x) => x !== null) ? texts : [];
        if (got.length || lastRound) {
          let t = TypePass.union(got);
          // Nothing reaches it: typed by how its body uses it (usageType).
          if (t === "unknown" && !isThis) t = this.usageType(checker, node) ?? t;
          if (!isThis && node.initializer) {
            const it = this.typeText(
              checker,
              checker.getTypeAtLocation(node.initializer),
              node,
              sf.fileName,
            );
            if (it && t !== "unknown") t = TypePass.union([t, it]);
          }
          if (!isThis && node.questionToken && t !== "unknown" && !/\bnull\b/.test(t))
            t = `${t} | null`;

          const text = isAnyArrayNode(node.type) ? (/[|&]/.test(t) ? `(${t})[]` : `${t}[]`) : t;
          push(sf, { pos: node.type.getStart(sf), end: node.type.getEnd(), text });
          n++;
        }
      }
      ts.forEachChild(node, (c) => decls(c, sf));
    };
    for (const sf of sourceFiles) decls(sf, sf);
    for (const d of emptyArrays)
      if (!fieldSeen.has(d)) {
        const sf = d.getSourceFile();
        const t = (d as ts.PropertyDeclaration).type!;
        push(sf, { pos: t.getStart(sf), end: t.getEnd(), text: "unknown[]" });
        n++;
      }
    for (const [d, types] of fieldSeen) {
      const sf = d.getSourceFile();
      const texts = widest(types).map((x) => this.typeText(checker, x, d, sf.fileName));
      if (!texts.length || texts.some((x) => x === null)) continue;
      const t = (d as ts.PropertyDeclaration).type!;
      push(sf, { pos: t.getStart(sf), end: t.getEnd(), text: TypePass.union(texts as string[]) });
      n++;
    }
    for (const sf of sourceFiles) {
      const ie = this.importEdit(sf);
      if (ie) push(sf, ie);
    }
    for (const [f, es] of edits) applyEdits(f, es);
    return n;
  }

  /**
   * The type a value nothing types is used as, when every use agrees: called
   * (a Ruby block or proc, `block.call(x)`) is a function; iterated or sent an
   * Array method is an array; read by key (`options[:wait]`) is a Hash, a plain
   * object. A nil test or a `??` fallback says nothing; any other use, or two
   * kinds, answers null. `decl` is a parameter (uses in its function) or a
   * field (uses as `x.field` anywhere in `scope`).
   */
  usageType(
    checker: ts.TypeChecker,
    decl: ts.Declaration,
    scope?: ts.Node[],
    refIndex?: Map<ts.Symbol, ts.Expression[]>,
  ): string | null {
    const name = (decl as ts.NamedDeclaration).name;
    if (!name || !ts.isIdentifier(name)) return null;
    const sym = checker.getSymbolAtLocation(name);
    if (!sym) return null;
    const fn = decl.parent as ts.Node & { body?: ts.Node };
    const roots: ts.Node[] = scope ?? (fn.body ? [fn.body] : []);
    const ARRAY = new Set([
      "forEach",
      "map",
      "filter",
      "length",
      "push",
      "some",
      "every",
      "find",
      "includes",
      "join",
      "flat",
      "slice",
      "pop",
      "shift",
      "unshift",
      "indexOf",
      "reduce",
      "flatMap",
      "at",
      "concat",
    ]);
    const NIL_TESTS = [
      ts.SyntaxKind.EqualsEqualsToken,
      ts.SyntaxKind.ExclamationEqualsToken,
      ts.SyntaxKind.EqualsEqualsEqualsToken,
      ts.SyntaxKind.ExclamationEqualsEqualsToken,
      ts.SyntaxKind.QuestionQuestionToken,
    ];
    const kinds = new Set<string>();
    const members = new Set<string>();
    let other = false;
    const visit = (n: ts.Node): void => {
      if (other) return;
      const isRef =
        (ts.isIdentifier(n) && n !== name && checker.getSymbolAtLocation(n) === sym) ||
        (ts.isPropertyAccessExpression(n) && checker.getSymbolAtLocation(n.name) === sym);
      if (isRef) {
        const ref = n as ts.Expression;
        const parent = ref.parent;
        const call = (x: ts.Node) => ts.isCallExpression(x.parent) && x.parent.expression === x;
        if (ts.isCallExpression(parent) && parent.expression === ref) kinds.add("fn");
        else if (
          ts.isPropertyAccessExpression(parent) &&
          parent.expression === ref &&
          ["call", "apply"].includes(parent.name.text) &&
          call(parent)
        )
          kinds.add("fn");
        else if (
          (ts.isForOfStatement(parent) && parent.expression === ref) ||
          ts.isSpreadElement(parent)
        )
          kinds.add("array");
        else if (
          ts.isPropertyAccessExpression(parent) &&
          parent.expression === ref &&
          ARRAY.has(parent.name.text)
        )
          kinds.add("array");
        else if (ts.isElementAccessExpression(parent) && parent.expression === ref)
          kinds.add("record");
        else if (ts.isPropertyAccessExpression(parent) && parent.expression === ref) {
          // `x.m()` or `x.attr`: a member of whatever class it is (duckClass),
          // or a Hash's key when every use only reads.
          members.add(parent.name.text);
          kinds.add(call(parent) ? "object" : "record");
        } else if (
          (ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
          parent.arguments?.includes(ref)
        ) {
          // passed on: says nothing
        } else if (ts.isBinaryExpression(parent) && NIL_TESTS.includes(parent.operatorToken.kind)) {
          // says nothing
        } else if (
          // Tested, handed on or held: says nothing of what it is either.
          (ts.isBinaryExpression(parent) &&
            ((parent.left === ref &&
              parent.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword) ||
              (parent.right === ref && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) ||
              parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
              parent.operatorToken.kind === ts.SyntaxKind.BarBarToken)) ||
          ts.isTypeOfExpression(parent) ||
          (ts.isPrefixUnaryExpression(parent) &&
            parent.operator === ts.SyntaxKind.ExclamationToken) ||
          (ts.isConditionalExpression(parent) && parent.condition === ref) ||
          ((ts.isIfStatement(parent) || ts.isWhileStatement(parent)) &&
            parent.expression === ref) ||
          ts.isReturnStatement(parent) ||
          (ts.isVariableDeclaration(parent) && parent.initializer === ref) ||
          ts.isArrayLiteralExpression(parent) ||
          (ts.isPropertyAssignment(parent) && parent.initializer === ref) ||
          ts.isShorthandPropertyAssignment(parent) ||
          ts.isTemplateSpan(parent) ||
          ts.isAsExpression(parent) ||
          ts.isParenthesizedExpression(parent)
        ) {
          // says nothing
        } else if (
          ts.isBinaryExpression(parent) &&
          parent.left === ref &&
          parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
        ) {
          // an assignment to it
        } else other = true;
        if (ts.isPropertyAccessExpression(n)) return;
      }
      ts.forEachChild(n, visit);
    };
    // With an index of the tree's property reads (typeFieldsByUse), each read
    // of the field is visited directly rather than found by a walk.
    if (refIndex) for (const r of refIndex.get(sym) ?? []) visit(r);
    else for (const r of roots) visit(r);
    if (other) return null;
    // Sent methods (and perhaps read attributes): the class it duck-types as.
    if (kinds.has("object") && [...kinds].every((k) => k === "object" || k === "record"))
      return this.duckClass(members, decl);
    if (kinds.size !== 1) return null;
    const k = [...kinds][0];
    return k === "fn"
      ? "(...args: unknown[]) => unknown"
      : k === "array"
        ? "unknown[]"
        : "Record<string, unknown>";
  }

  /** `): any {` returns dropped, so TypeScript infers them. */
  dropAnyReturns(): number {
    const program = this.program();
    let n = 0;
    for (const f of this.files) {
      const sf = program.getSourceFile(f);
      if (!sf) continue;
      const edits: Edit[] = [];
      const visit = (node: ts.Node): void => {
        if (ts.isFunctionLike(node) && !ts.isIndexSignatureDeclaration(node) && node.type) {
          const t = node.type;
          const promiseAny =
            ts.isTypeReferenceNode(t) &&
            ts.isIdentifier(t.typeName) &&
            t.typeName.text === "Promise" &&
            isAnyNode(t.typeArguments?.[0]);
          if (isAnyNode(t) || promiseAny) {
            // The `: ` before the type goes too.
            const colon = sf.text.lastIndexOf(":", t.getStart(sf));
            edits.push({ pos: colon, end: t.getEnd(), text: "" });
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
      applyEdits(f, edits);
      n += edits.length;
    }
    return n;
  }

  /**
   * `let a: any, b: any;` / `const x: any = …` / a block parameter `(x?: any) =>`:
   * the annotation dropped, so the type is the initializer's, the assignments'
   * (an evolving `let`), or the parameter's contextual type.
   */
  dropAnyLocals(): number {
    const program = this.program();
    const checker = program.getTypeChecker();
    let n = 0;
    for (const f of this.files) {
      const sf = program.getSourceFile(f);
      if (!sf) continue;
      const edits: Edit[] = [];
      const drop = (t: ts.TypeNode) => {
        const colon = sf.text.lastIndexOf(":", t.getStart(sf));
        edits.push({ pos: colon, end: t.getEnd(), text: "" });
      };
      const visit = (node: ts.Node): void => {
        if (ts.isVariableDeclaration(node) && isAnyNode(node.type)) drop(node.type!);
        if (
          ts.isParameter(node) &&
          isAnyNode(node.type) &&
          (ts.isArrowFunction(node.parent) || ts.isFunctionExpression(node.parent)) &&
          ts.isCallOrNewExpression(node.parent.parent)
        ) {
          // `this: any` on a function handed to a call goes whole (with its
          // comma): `this` is then the callee's (`onLoad`'s block type).
          if (ts.isIdentifier(node.name) && node.name.text === "this") {
            const fnExpr = node.parent as ts.FunctionExpression;
            const ctxType = checker.getContextualType(fnExpr);
            const ctxThis = ctxType
              ?.getCallSignatures()
              .some((sg) => sg.getDeclaration() && sg.thisParameter);
            // No `this` from the callee (an `rbBlock(…)` wrapper): Ruby runs the
            // block on an instance of the class around it (`rescue_from`, a
            // callback macro), so `this` is that class's instance type.
            const inst = ctxThis ? null : this.enclosingInstance(fnExpr, sf);
            if (inst) {
              edits.push({ pos: node.type!.getStart(sf), end: node.type!.getEnd(), text: inst });
              return;
            }
            const params = fnExpr.parameters;
            const end = params.length > 1 ? params[1].getStart(sf) : node.getEnd();
            edits.push({ pos: node.getStart(sf), end, text: "" });
            return;
          }
          // `x?: any` loses its `?` too: a block parameter's arity is the caller's.
          drop(node.type!);
          if (node.questionToken)
            edits.push({
              pos: node.questionToken.getStart(sf),
              end: node.questionToken.getEnd(),
              text: "",
            });
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
      applyEdits(f, edits);
      n += edits.length;
    }
    return n;
  }

  /**
   * The instance type of the code around `fn`: the class of the static (or
   * instance) method it sits in, or `X` where that method declares
   * `this: typeof X` / `this: X`. Null when there is none.
   */
  enclosingInstance(fn: ts.Node, sf: ts.SourceFile): string | null {
    for (let p = fn.parent; p; p = p.parent) {
      if (ts.isMethodDeclaration(p) || ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p)) {
        const thisP = p.parameters.find((x) => ts.isIdentifier(x.name) && x.name.text === "this");
        if (thisP?.type) {
          const t = thisP.type.getText(sf);
          if (/\bany\b|\bunknown\b/.test(t)) return null;
          return t.startsWith("typeof ") ? t.slice("typeof ".length) : t;
        }
        if (ts.isMethodDeclaration(p) && ts.isClassDeclaration(p.parent) && p.parent.name)
          return p.parent.name.text;
        if (!ts.isFunctionExpression(p)) return null;
      }
      if (ts.isArrowFunction(p)) continue;
    }
    return null;
  }

  /**
   * After the drops: a declaration TypeScript cannot infer (TS7006 implicit-any
   * parameter, TS7022 / TS7023 / TS7024 / TS7034 circular or evolving) is
   * written `unknown`.
   */
  annotateUninferable(): number {
    const program = this.program();
    let n = 0;
    const CODES = new Set([7006, 7022, 7023, 7024, 7031, 7034, 7005]);
    for (const f of this.files) {
      const sf = program.getSourceFile(f);
      if (!sf) continue;
      const edits: Edit[] = [];
      for (const d of program.getSemanticDiagnostics(sf)) {
        if (!CODES.has(d.code) || d.start === undefined) continue;
        let target: ts.Node | undefined;
        const find = (node: ts.Node): void => {
          if (d.start! < node.getStart(sf) || d.start! >= node.getEnd()) return;
          if (ts.isParameter(node) || ts.isVariableDeclaration(node) || ts.isFunctionLike(node))
            target = node;
          ts.forEachChild(node, find);
        };
        find(sf);
        if (!target) continue;
        if (ts.isParameter(target) || ts.isVariableDeclaration(target)) {
          if (target.type) continue;
          const name = target.name;
          edits.push({ pos: name.getEnd(), end: name.getEnd(), text: ": unknown" });
        } else if (ts.isFunctionLike(target) && !target.type) {
          const close = sf.text.indexOf(")", target.parameters.end);
          const asy =
            (ts.getCombinedModifierFlags(target as ts.Declaration) & ts.ModifierFlags.Async) !== 0;
          if (close >= 0)
            edits.push({
              pos: close + 1,
              end: close + 1,
              text: asy ? ": Promise<unknown>" : ": unknown",
            });
        }
      }
      applyEdits(f, edits);
      n += edits.length;
    }
    return n;
  }

  /**
   * Last: no `any` is left. An `x as any` is `x`, whose error (if any) is the
   * real one the cast hid; any other `any` (`any[]`, `Map<any, number>`, a
   * parameter no round could type) is `unknown`.
   */
  sweepAny(): number {
    const program = this.program();
    let n = 0;
    for (const f of this.files) {
      const sf = program.getSourceFile(f);
      if (!sf) continue;
      const edits: Edit[] = [];
      const visit = (node: ts.Node): void => {
        if (ts.isAsExpression(node) && isAnyNode(node.type)) {
          const inner = node.expression;
          edits.push({
            pos: node.getStart(sf),
            end: node.getEnd(),
            text: `(${inner.getText(sf)})`,
          });
          // A cast's own operand may hold another `any`: swept on the next call.
          return;
        }
        if (node.kind === ts.SyntaxKind.AnyKeyword) {
          edits.push({ pos: node.getStart(sf), end: node.getEnd(), text: "unknown" });
          return;
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
      applyEdits(f, edits);
      n += edits.length;
    }
    return n;
  }

  /**
   * Where an `unknown` value meets a typed slot (TS2322 assigning, TS2345
   * passing), the value is asserted to the slot's type: `jobData["job_id"] as
   * string`, the hand port's spelling at the same boundary (activejob core.ts).
   * Ruby checked nothing there either; the assertion says so where it happens.
   */
  assertBoundaries(): number {
    const program = this.program();
    const checker = program.getTypeChecker();
    let n = 0;
    for (const f of this.files) {
      const sf = program.getSourceFile(f);
      if (!sf) continue;
      const edits: Edit[] = [];
      for (const d of program.getSemanticDiagnostics(sf)) {
        if ((d.code !== 2322 && d.code !== 2345) || d.start === undefined) continue;
        let at: ts.Node | undefined;
        const find = (node: ts.Node): void => {
          if (d.start! < node.getStart(sf) || d.start! >= node.getEnd()) return;
          // The node the diagnostic spans, not an outer one starting there
          // (`this.x = v` is reported at `this.x`).
          if (node.getStart(sf) === d.start && ts.isExpression(node)) {
            if (!at || node.getEnd() === d.start + (d.length ?? 0)) at = node;
          }
          ts.forEachChild(node, find);
        };
        find(sf);
        if (!at) continue;
        // The value and the slot it meets.
        let value: ts.Expression | undefined;
        let slot: ts.Type | undefined;
        const p = at.parent;
        if (d.code === 2345) {
          value = at as ts.Expression;
          slot = checker.getContextualType(value);
        } else if (
          ts.isBinaryExpression(p) &&
          p.left === at &&
          p.operatorToken.kind === ts.SyntaxKind.EqualsToken
        ) {
          value = p.right;
          slot = checker.getTypeAtLocation(p.left);
        } else if (ts.isVariableDeclaration(p) && p.name === at && p.initializer) {
          value = p.initializer;
          slot = checker.getTypeAtLocation(p.name);
        } else if (ts.isReturnStatement(p) || ts.isExpression(at)) {
          value = at as ts.Expression;
          slot = checker.getContextualType(value);
          // An async function's return slot is `T | PromiseLike<T>`: assert to `T`.
          if (ts.isReturnStatement(p)) {
            const fn = ts.findAncestor(p, ts.isFunctionLike);
            if (fn?.type && fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) {
              const ret = checker.getTypeFromTypeNode(fn.type);
              slot = checker.getPromisedTypeOfPromise(ret) ?? slot;
            }
          }
        }
        if (!value || !slot || ts.isSpreadElement(value)) continue;
        // A property name is not a value; a shorthand property is written long.
        if (ts.isPropertyAssignment(value.parent) && value.parent.name === value) continue;
        const shorthand = ts.isShorthandPropertyAssignment(value.parent)
          ? value.parent.name.text
          : null;
        if (!(checker.getTypeAtLocation(value).flags & ts.TypeFlags.Unknown)) continue;
        const t = this.typeText(checker, slot, value, f);
        if (!t || t === "unknown") continue;
        edits.push({
          pos: value.getStart(sf),
          end: value.getEnd(),
          text: `${shorthand ? `${shorthand}: ` : ""}(${value.getText(sf)} as ${t})`,
        });
      }
      const ie = this.importEdit(sf);
      if (ie) edits.push(ie);
      applyEdits(f, edits);
      n += edits.length;
    }
    return n;
  }

  /**
   * The most general generated class whose instances answer every name in
   * `members` (a duck type, as Ruby's): among the classes that do, the one the
   * others extend. Library code is not typed by a test's class. Null when none,
   * or when no single one is the most general.
   */
  duckClass(members: Set<string>, at: ts.Node): string | null {
    const program = this.program();
    const c2 = program.getTypeChecker();
    const atFile = at.getSourceFile().fileName;
    const fits: ts.ClassDeclaration[] = [];
    for (const f of this.files) {
      const sf = program.getSourceFile(f);
      if (!sf || (!isTestPath(atFile) && isTestPath(f))) continue;
      for (const st of sf.statements) {
        if (!ts.isClassDeclaration(st) || !st.name) continue;
        const sym = c2.getSymbolAtLocation(st.name);
        if (!sym) continue;
        const names = new Set(
          c2.getPropertiesOfType(c2.getDeclaredTypeOfSymbol(sym)).map((p) => p.name),
        );
        if ([...members].every((m) => names.has(m))) fits.push(st);
      }
    }
    const ancestors = (c: ts.ClassDeclaration): ts.ClassDeclaration[] => {
      const out: ts.ClassDeclaration[] = [];
      let cur: ts.ClassDeclaration | undefined = c;
      for (let i = 0; cur && i < 20; i++) {
        const h: ts.ExpressionWithTypeArguments | undefined = cur.heritageClauses?.find(
          (x) => x.token === ts.SyntaxKind.ExtendsKeyword,
        )?.types[0];
        const d: ts.Declaration | undefined = h
          ? c2.getTypeAtLocation(h.expression).getSymbol()?.declarations?.[0]
          : undefined;
        cur = d && ts.isClassDeclaration(d) ? d : undefined;
        if (cur) out.push(cur);
      }
      return out;
    };
    const key = (c: ts.ClassDeclaration) => `${c.getSourceFile().fileName}#${c.name?.text}`;
    if (!fits.length) {
      // No class answers every name (Ruby's duck type spans subclasses: every
      // adapter answers `enqueue`, only the test adapter `perform_enqueued_jobs`):
      // the nearest class all the classes answering any of them descend from.
      const some: ts.ClassDeclaration[] = [];
      for (const f of this.files) {
        const sf = program.getSourceFile(f);
        if (!sf || (!isTestPath(atFile) && isTestPath(f))) continue;
        for (const st of sf.statements) {
          if (!ts.isClassDeclaration(st) || !st.name) continue;
          const sym = c2.getSymbolAtLocation(st.name);
          if (!sym) continue;
          const own = new Set(
            (st.members ?? []).map((m) => (m.name && ts.isIdentifier(m.name) ? m.name.text : "")),
          );
          if ([...members].some((m) => own.has(m))) some.push(st);
        }
      }
      if (some.length < 2) return null;
      const chains = some.map((c) => [c, ...ancestors(c)].map(key));
      const common = chains[0].find((k) => chains.every((ch) => ch.includes(k)));
      const decl = common
        ? [some[0], ...ancestors(some[0])].find((c) => key(c) === common)
        : undefined;
      if (!decl) return null;
      fits.push(decl);
    }
    const fitNames = new Set(fits.map(key));
    const top = fits.filter(
      (c) =>
        !ancestors(c).some((a) => fitNames.has(`${a.getSourceFile().fileName}#${a.name?.text}`)),
    );
    if (top.length !== 1) return null;
    const decl = top[0];
    if (decl.getSourceFile().fileName === atFile) return decl.name!.text;
    let rel = path
      .relative(path.dirname(atFile), decl.getSourceFile().fileName)
      .replace(/\.ts$/, ".js");
    if (!rel.startsWith(".")) rel = `./${rel}`;
    return this.typeLocal(at.getSourceFile(), rel, decl.name!.text);
  }

  /**
   * A method whose return TypeScript infers as `unknown` (it returns an
   * untyped field: `Base.queue_adapter` answers `_queue_adapter`), typed by how
   * its callers use what it returns: the members sent to the results duck-type
   * the most general generated class that answers them all (duckClass). A
   * library method counts only library callers. Its return gets that type, and
   * the boundary assertions then assert the returned value to it.
   */
  typeReturnsByUse(): number {
    const program = this.program();
    const checker = program.getTypeChecker();
    const sfs = this.files.map((f) => program.getSourceFile(f)).filter(Boolean) as ts.SourceFile[];
    const decls = new Map<ts.FunctionLikeDeclaration, ts.Expression[]>();
    const collect = (n: ts.Node): void => {
      if (ts.isCallExpression(n)) {
        const d = checker.getResolvedSignature(n)?.declaration;
        if (
          d &&
          !ts.isJSDocSignature(d) &&
          (ts.isMethodDeclaration(d) || ts.isFunctionDeclaration(d)) &&
          !d.type &&
          d.getSourceFile().fileName.startsWith(this.srcDir)
        ) {
          const sig = checker.getSignatureFromDeclaration(d);
          const ret = sig ? checker.getReturnTypeOfSignature(sig) : undefined;
          const awaited = ret ? (checker.getAwaitedType(ret) ?? ret) : undefined;
          const parts = awaited ? (awaited.isUnion() ? awaited.types : [awaited]) : [];
          // `unknown`, or only `null` (TypeScript's narrowing of an untyped
          // field across `if (x == null) setX(…)`, which it cannot see assign).
          const unknownRet =
            parts.length > 0 &&
            parts.every(
              (p) => p.flags & (ts.TypeFlags.Unknown | ts.TypeFlags.Null | ts.TypeFlags.Undefined),
            );
          if (
            unknownRet &&
            (isTestPath(d.getSourceFile().fileName) || !isTestPath(n.getSourceFile().fileName))
          ) {
            // `(await x.m())`: the use is of the awaited value.
            let use: ts.Expression = n;
            while (ts.isAwaitExpression(use.parent) || ts.isParenthesizedExpression(use.parent))
              use = use.parent as ts.Expression;
            (decls.get(d) ?? decls.set(d, []).get(d)!).push(use);
          }
        }
      }
      ts.forEachChild(n, collect);
    };
    for (const sf of sfs) collect(sf);
    let n = 0;
    const edits = new Map<string, Edit[]>();
    for (const [d, uses] of decls) {
      const members = new Set<string>();
      for (const u of uses) {
        const p = u.parent;
        if (ts.isPropertyAccessExpression(p) && p.expression === u) members.add(p.name.text);
      }
      if (!members.size) continue;
      const t = this.duckClass(members, d);
      if (!t) continue;
      const sf = d.getSourceFile();
      const close = sf.text.indexOf(")", d.parameters.end);
      const asy = (ts.getCombinedModifierFlags(d) & ts.ModifierFlags.Async) !== 0;
      (edits.get(sf.fileName) ?? edits.set(sf.fileName, []).get(sf.fileName)!).push({
        pos: close + 1,
        end: close + 1,
        text: asy ? `: Promise<${t}>` : `: ${t}`,
      });
      n++;
    }
    for (const sf of sfs) {
      const ie = this.importEdit(sf);
      if (ie) (edits.get(sf.fileName) ?? edits.set(sf.fileName, []).get(sf.fileName)!).push(ie);
    }
    for (const [f, es] of edits) applyEdits(f, es);
    return n;
  }

  /** Fields still declared `unknown`: typed by how the tree uses them (`usageType`). */
  typeFieldsByUse(): number {
    const program = this.program();
    const checker = program.getTypeChecker();
    const sfs = this.files.map((f) => program.getSourceFile(f)).filter(Boolean) as ts.SourceFile[];
    // One walk: every `x.field` read, by the field's symbol.
    const refIndex = new Map<ts.Symbol, ts.Expression[]>();
    const index = (node: ts.Node): void => {
      if (ts.isPropertyAccessExpression(node)) {
        const sym = checker.getSymbolAtLocation(node.name);
        if (sym) (refIndex.get(sym) ?? refIndex.set(sym, []).get(sym)!).push(node);
      }
      ts.forEachChild(node, index);
    };
    for (const sf of sfs) index(sf);
    let n = 0;
    for (const sf of sfs) {
      const edits: Edit[] = [];
      const visit = (node: ts.Node): void => {
        if (
          (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)) &&
          node.type?.kind === ts.SyntaxKind.UnknownKeyword
        ) {
          const t = this.usageType(checker, node, sfs, refIndex);
          if (t) edits.push({ pos: node.type.getStart(sf), end: node.type.getEnd(), text: t });
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
      applyEdits(sf.fileName, edits);
      n += edits.length;
    }
    return n;
  }

  /**
   * The hand port types what the Ruby cannot: each generated parameter or
   * field still `any` / `unknown` takes its hand twin's declared type (same
   * file, class, member and parameter position), written with the generated
   * file's own `import type`s. Runs before the call-site inference, which then
   * types only what has no twin.
   */
  transplantFromHand(): number {
    if (process.env.CODEGEN_NO_HAND || !this.handSrcDir || !existsSync(this.handSrcDir)) return 0;
    const handFiles = walkDir(this.handSrcDir).filter((f) => !/\.test\.ts$/.test(f));
    const hp = ts.createProgram(handFiles, this.options);
    const hc = hp.getTypeChecker();
    // Hand declarations by `file#Owner#member` (`file#.fn` for a function).
    const hand = new Map<
      string,
      ts.SignatureDeclaration | ts.PropertyDeclaration | ts.PropertySignature
    >();
    // By name within the file, where the two ports' shapes differ (a function
    // on a hand Module, a member of a generated class module): unique only.
    const byName = new Map<string, ts.Node | null>();
    const note = (rel: string, name: string, d: ts.Node) => {
      const k = `${rel}#${name}`;
      byName.set(k, byName.has(k) ? null : d);
    };
    for (const f of handFiles) {
      const sf = hp.getSourceFile(f);
      if (!sf) continue;
      const rel = path.relative(this.handSrcDir, f);
      for (const st of sf.statements) {
        if (ts.isFunctionDeclaration(st) && st.name) {
          hand.set(`${rel}#.${st.name.text}`, st);
          note(rel, st.name.text, st);
        }
        if ((ts.isClassDeclaration(st) || ts.isInterfaceDeclaration(st)) && st.name)
          for (const m of st.members as ts.NodeArray<ts.ClassElement | ts.TypeElement>) {
            if (!m.name || !ts.isIdentifier(m.name)) continue;
            const key = `${rel}#${st.name.text}#${m.name.text}`;
            if (
              ts.isMethodDeclaration(m) ||
              ts.isMethodSignature(m) ||
              ts.isPropertyDeclaration(m) ||
              ts.isPropertySignature(m) ||
              ts.isGetAccessorDeclaration(m)
            )
              if (!hand.has(key)) {
                hand.set(key, m as ts.SignatureDeclaration);
                note(rel, m.name.text, m);
              }
          }
      }
    }
    const program = this.program();
    const gc = program.getTypeChecker();
    const unwritableNames = new Map<string, number>();
    // Name → generated file exporting it (null when several do).
    const genExports = new Map<string, string | null>();
    const genAll = new Map<string, string[]>();
    for (const f of this.files)
      for (const m of readFileSync(f, "utf8").matchAll(
        /^export (?:declare )?(?:abstract )?(?:class|interface|type|enum) ([\w$]+)/gm,
      ))
        (genAll.get(m[1]) ?? genAll.set(m[1], []).get(m[1])!).push(f);
    // Several files export the name (`Base`): the one named for it, shallowest.
    const kebab = (n: string) => n.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
    for (const [name, fs] of genAll) {
      const uniq = [...new Set(fs)];
      if (uniq.length === 1) {
        genExports.set(name, uniq[0]);
        continue;
      }
      const named = uniq
        .filter((f) => path.basename(f, ".ts") === kebab(name))
        .sort((a, b) => a.split("/").length - b.split("/").length);
      genExports.set(
        name,
        named.length &&
          (named.length === 1 || named[0].split("/").length < named[1].split("/").length)
          ? named[0]
          : null,
      );
    }
    const genExport = (name: string, genSf: ts.SourceFile): string | null => {
      const f = genExports.get(name);
      if (!f) return null;
      if (f === genSf.fileName) return "#local";
      let id = path.relative(path.dirname(genSf.fileName), f).replace(/\.ts$/, ".js");
      if (!id.startsWith(".")) id = `./${id}`;
      return id;
    };
    const depExport = (name: string): string | null => {
      const hits = [...this.exportsOf].filter(([, names]) => names.has(name)).map(([pid]) => pid);
      return hits.length === 1 ? hits[0] : null;
    };
    let n = 0;
    const why: Record<string, number> = {};
    const loose = (t: ts.TypeNode | undefined) =>
      !!t && (t.kind === ts.SyntaxKind.AnyKeyword || t.kind === ts.SyntaxKind.UnknownKeyword);
    // A union the hand body narrows (`string | string[] | { column? }`) is no
    // use to a generated body that does not: only one type, null aside, or
    // primitives only.
    const simple = (t: ts.Type): boolean => {
      if (!t.isUnion()) return true;
      const rest = t.types.filter(
        (x) => !(x.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)),
      );
      if (rest.length <= 1) return true;
      if (rest.every((x) => x.flags & ts.TypeFlags.BooleanLiteral)) return true;
      return rest.every(
        (x) =>
          !!(
            x.flags &
            (ts.TypeFlags.StringLike |
              ts.TypeFlags.NumberLike |
              ts.TypeFlags.BooleanLike |
              ts.TypeFlags.BigIntLike)
          ),
      );
    };
    const text = (t: ts.Type, genSf: ts.SourceFile): string | null => {
      if (!simple(t)) {
        why.notSimple = (why.notSimple ?? 0) + 1;
        return null;
      }
      let node: ts.TypeNode | undefined;
      try {
        node = hc.typeToTypeNode(
          t,
          undefined,
          ts.NodeBuilderFlags.NoTruncation | ts.NodeBuilderFlags.IgnoreErrors,
        );
      } catch {
        return null;
      }
      if (!node) return null;
      let out = ts
        .createPrinter({ removeComments: true })
        .printNode(ts.EmitHint.Unspecified, node, genSf);
      if (/\bany\b|\(Anonymous|__object|__type|\bthis\b/.test(out) || out.length > 400) return null;
      let ok = true;
      const wanted: [string, string][] = [];
      out = out.replace(/import\("([^"]+)"\)\.([\w$]+)/g, (m0, spec: string, name: string) => {
        let id: string | null = null;
        if (path.isAbsolute(spec) && spec.startsWith(this.handSrcDir!)) {
          const genPath = path.join(this.srcDir, path.relative(this.handSrcDir!, spec));
          id = path.relative(path.dirname(genSf.fileName), genPath).replace(/\.d$|\.ts$/, "");
          if (!id.startsWith(".")) id = `./${id}`;
          id = `${id}.js`;
        } else {
          const pkg = /\/packages\/([\w-]+)\//.exec(spec)?.[1];
          const pid = pkg ? `@blazetrails/${pkg}` : null;
          if (pid && this.exportsOf.get(pid)?.has(name)) id = pid;
        }
        if (!id) {
          ok = false;
          if (process.env.CODEGEN_TIMING)
            unwritableNames.set(name, (unwritableNames.get(name) ?? 0) + 1);
          return m0;
        }
        wanted.push([id, name]);
        return `@@type${wanted.length - 1}@@`;
      });
      const bare = out
        .replace(/@@type\d+@@/g, "")
        .replace(
          /\b(Record|Promise|Array|Map|Set|ReadonlyArray|Partial|Readonly|Pick|Omit|Exclude|Extract|NonNullable|ReturnType|Parameters|InstanceType|Iterable|IterableIterator|AsyncIterable|PromiseLike|Date|RegExp|Error|Function|Symbol|BigInt)\b/g,
          "",
        )
        .match(/\b[A-Z][\w$]*\b/g);
      // A name printed bare is one the hand file has in scope; the generated
      // tree's own export of it, or a dependency package's, is the same type.
      if (ok && bare) {
        for (const b of new Set(bare)) {
          const id = genExport(b, genSf) ?? depExport(b);
          if (!id) {
            if (process.env.CODEGEN_TIMING)
              unwritableNames.set(b, (unwritableNames.get(b) ?? 0) + 1);
            continue;
          }
          out = out.replace(new RegExp(`(?<![\\w$.@])${b}(?![\\w$])`, "g"), () => {
            wanted.push([id, b]);
            return `@@type${wanted.length - 1}@@`;
          });
        }
      }
      if (
        !ok ||
        /\b[A-Z][\w$]*\b/.test(
          out
            .replace(/@@type\d+@@/g, "")
            .replace(
              /\b(Record|Promise|Array|Map|Set|ReadonlyArray|Partial|Readonly|Pick|Omit|Exclude|Extract|NonNullable|ReturnType|Parameters|InstanceType|Iterable|IterableIterator|AsyncIterable|PromiseLike|Date|RegExp|Error|Function|Symbol|BigInt)\b/g,
              "",
            ),
        )
      )
        return null;
      return out.replace(/@@type(\d+)@@/g, (_m, i: string) => {
        const [id, name] = wanted[Number(i)];
        return id === "#local" ? name : this.typeLocal(genSf, id, name);
      });
    };
    for (const f of this.files) {
      const sf = program.getSourceFile(f);
      if (!sf) continue;
      const rel = path.relative(this.srcDir, f);
      const edits: Edit[] = [];
      const twinOf = (node: ts.Node): ts.Node | undefined => {
        const exact = exactTwin(node);
        if (exact) return exact;
        const nm = (node as ts.NamedDeclaration).name;
        return nm && ts.isIdentifier(nm)
          ? (byName.get(`${rel}#${nm.text}`) ?? undefined)
          : undefined;
      };
      const exactTwin = (node: ts.Node): ts.Node | undefined => {
        if (ts.isFunctionDeclaration(node) && node.name)
          return hand.get(`${rel}#.${node.name.text}`);
        const owner = node.parent;
        if (
          (ts.isClassDeclaration(owner) || ts.isInterfaceDeclaration(owner)) &&
          owner.name &&
          (node as ts.NamedDeclaration).name &&
          ts.isIdentifier((node as ts.NamedDeclaration).name!)
        )
          return hand.get(
            `${rel}#${owner.name.text}#${((node as ts.NamedDeclaration).name as ts.Identifier).text}`,
          );
        return undefined;
      };
      const visit = (node: ts.Node): void => {
        if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
          const twin = twinOf(node) as ts.SignatureDeclaration | undefined;
          if (!twin && node.parameters.some((p) => loose(p.type)))
            why.noTwin = (why.noTwin ?? 0) + 1;
          if (twin && "parameters" in twin) {
            const hps = twin.parameters.filter(
              (p) => !(ts.isIdentifier(p.name) && p.name.text === "this"),
            );
            const gps = node.parameters.filter(
              (p) => !(ts.isIdentifier(p.name) && p.name.text === "this"),
            );
            gps.forEach((gp, i) => {
              const hpar = hps[i];
              if (!loose(gp.type)) return;
              if (!hpar?.type || !!gp.dotDotDotToken !== !!hpar.dotDotDotToken) {
                why.noParam = (why.noParam ?? 0) + 1;
                return;
              }
              const t = text(hc.getTypeFromTypeNode(hpar.type), sf);
              if (t) edits.push({ pos: gp.type!.getStart(sf), end: gp.type!.getEnd(), text: t });
              else why.unwritable = (why.unwritable ?? 0) + 1;
            });
            // The return: only where the generated one is unwritten and inferred
            // loose, and the twin's sync/async agrees with the generated method's.
            if (twin.type && !node.type && node.body && !node.asteriskToken) {
              const gsig = gc.getSignatureFromDeclaration(node);
              const gret = gsig && gc.typeToString(gc.getReturnTypeOfSignature(gsig));
              if (gret && /\b(any|unknown)\b/.test(gret)) {
                const genAsync = !!node.modifiers?.some(
                  (m) => m.kind === ts.SyntaxKind.AsyncKeyword,
                );
                let ht = hc.getTypeFromTypeNode(twin.type);
                const promised = hc.getPromisedTypeOfPromise(ht);
                if (promised) ht = promised;
                if (!promised === !genAsync || (genAsync && !promised)) {
                  const t = text(ht, sf);
                  if (t && t !== "void" && t !== "unknown") {
                    const close = node.parameters.end;
                    const paren = sf.text.indexOf(")", close);
                    edits.push({
                      pos: paren + 1,
                      end: paren + 1,
                      text: `: ${genAsync ? `Promise<${t}>` : t}`,
                    });
                    why.returns = (why.returns ?? 0) + 1;
                  }
                } else why.asyncMismatch = (why.asyncMismatch ?? 0) + 1;
              }
            }
          }
        }
        if ((ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)) && loose(node.type)) {
          // `@x` behind `attr_reader :x` is the generated `_x`; the hand port's
          // twin is the `x` it reads through (a property or a getter).
          let twin = twinOf(node);
          const nm = node.name;
          if (
            !twin &&
            ts.isIdentifier(nm) &&
            nm.text.startsWith("_") &&
            ts.isClassDeclaration(node.parent)
          ) {
            const owner = node.parent;
            const pub = nm.text.slice(1);
            twin =
              (owner.name && hand.get(`${rel}#${owner.name.text}#${pub}`)) ||
              (byName.get(`${rel}#${pub}`) ?? undefined);
          }
          const tn =
            twin &&
            (ts.isPropertyDeclaration(twin) ||
              ts.isPropertySignature(twin) ||
              ts.isGetAccessorDeclaration(twin))
              ? twin.type
              : undefined;
          if (tn) {
            const t = text(hc.getTypeFromTypeNode(tn), sf);
            if (t) {
              edits.push({ pos: node.type!.getStart(sf), end: node.type!.getEnd(), text: t });
              why.fields = (why.fields ?? 0) + 1;
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
      const ie = this.importEdit(sf);
      if (ie) edits.push(ie);
      applyEdits(f, edits);
      n += edits.length;
    }
    if (process.env.CODEGEN_TIMING)
      console.error(
        "type-pass fromHand skipped:",
        JSON.stringify(why),
        JSON.stringify([...unwritableNames].sort((a, b) => b[1] - a[1]).slice(0, 25)),
      );
    return n;
  }

  run(): Record<string, number> {
    const stats: Record<string, number> = {};
    // `CODEGEN_TIMING=1`: each step's time and edit count, to stderr.
    const timed = (name: string, f: () => number): number => {
      const t0 = Date.now();
      const k = f();
      if (process.env.CODEGEN_TIMING)
        console.error(`type-pass ${name}: ${k} edits in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      stats[name] = (stats[name] ?? 0) + k;
      return k;
    };
    const rounds = (name: string, max: number, f: () => number) => {
      for (let round = 0; round < max; round++) if (!timed(name, f)) break;
    };
    timed("returns", () => this.dropAnyReturns());
    timed("locals", () => this.dropAnyLocals());
    timed("fromHand", () => this.transplantFromHand());
    rounds("params", 6, () => this.paramRound(false));
    timed("params", () => this.paramRound(true));
    rounds("uninferable", 3, () => this.annotateUninferable());
    timed("fieldsByUse", () => this.typeFieldsByUse());
    rounds("returnsByUse", 3, () => this.typeReturnsByUse());
    rounds("swept", 4, () => this.sweepAny());
    rounds("asserted", 6, () => this.assertBoundaries());
    return stats;
  }
}

/** A test file or a test helper (test jobs, adapters, models). */
function isTestPath(f: string): boolean {
  return /\.test\.ts$|\/test-helpers\//.test(f);
}

/** The top-level members of a union type's text (`A | (B | C)[]` → `A`, `(B | C)[]`). */
function splitUnion(t: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if ("([{<".includes(ch)) depth++;
    if (")]}>".includes(ch) && t[i - 1] !== "=") depth--;
    if (depth === 0 && t.startsWith(" | ", i)) {
      out.push(cur.trim());
      cur = "";
      i += 2;
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function typePass(
  srcDir: string,
  tsconfig: string,
  handSrcDir?: string,
): Record<string, number> {
  return new TypePass(srcDir, tsconfig, handSrcDir).run();
}

if (process.argv[1]?.endsWith("type-pass.ts")) {
  const [srcDir, tsconfig, handSrc] = process.argv.slice(2);
  console.log(
    typePass(
      path.resolve(srcDir),
      path.resolve(tsconfig),
      handSrc ? path.resolve(handSrc) : undefined,
    ),
  );
}

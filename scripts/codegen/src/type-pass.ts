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
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
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

function applyEdits(file: string, edits: Edit[]): void {
  if (!edits.length) return;
  let text = readFileSync(file, "utf8");
  const seen = new Set<number>();
  for (const e of [...edits].sort((a, b) => b.pos - a.pos)) {
    if (seen.has(e.pos)) continue;
    seen.add(e.pos);
    text = text.slice(0, e.pos) + e.text + text.slice(e.end);
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

  /** A program over the tree, bound (the binder sets the parent pointers the passes walk). */
  private program(): ts.Program {
    const p = ts.createProgram(this.files, this.options);
    p.getTypeChecker();
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
  typeText(checker: ts.TypeChecker, t: ts.Type, at: ts.Node, file: string): string | null {
    if (t.flags & (ts.TypeFlags.Any | ts.TypeFlags.Never)) return null;
    // Library code never names a test's class: a test job reaching a library
    // parameter is typed by its nearest library superclass (`HelloJob` → `Base`).
    if (!isTestPath(file)) {
      // An array's element type, a union's members, each in turn.
      if (checker.isArrayType(t)) {
        const el = checker.getTypeArguments(t as ts.TypeReference)[0];
        const inner = el ? this.typeText(checker, el, at, file) : null;
        return inner === null ? null : /[|&\s]/.test(inner) ? `(${inner})[]` : `${inner}[]`;
      }
      if (t.isUnion()) {
        const parts = t.types.map((u) => this.typeText(checker, u, at, file));
        return parts.some((x) => x === null) ? null : TypePass.union(parts as string[]);
      }
      t = this.libraryType(checker, t);
    }
    const node = checker.typeToTypeNode(
      checker.getBaseTypeOfLiteralType(t),
      at,
      ts.NodeBuilderFlags.NoTruncation | ts.NodeBuilderFlags.IgnoreErrors,
    );
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
    return [...set].sort((a, b) => (a === "null" ? 1 : b === "null" ? -1 : 0)).join(" | ");
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
  usageType(checker: ts.TypeChecker, decl: ts.Declaration, scope?: ts.Node[]): string | null {
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
        else if (
          ts.isPropertyAccessExpression(parent) &&
          parent.expression === ref &&
          !call(parent)
        )
          kinds.add("record");
        else if (
          (ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
          parent.arguments?.includes(ref)
        ) {
          // passed on: says nothing
        } else if (ts.isBinaryExpression(parent) && NIL_TESTS.includes(parent.operatorToken.kind)) {
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
    for (const r of roots) visit(r);
    if (other || kinds.size !== 1) return null;
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
          if (node.getStart(sf) === d.start && ts.isExpression(node) && !at) at = node;
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
        }
        if (!value || !slot || ts.isSpreadElement(value)) continue;
        if (!(checker.getTypeAtLocation(value).flags & ts.TypeFlags.Unknown)) continue;
        const t = this.typeText(checker, slot, value, f);
        if (!t || t === "unknown") continue;
        edits.push({
          pos: value.getStart(sf),
          end: value.getEnd(),
          text: `(${value.getText(sf)} as ${t})`,
        });
      }
      const ie = this.importEdit(sf);
      if (ie) edits.push(ie);
      applyEdits(f, edits);
      n += edits.length;
    }
    return n;
  }

  /** Fields still declared `unknown`: typed by how the tree uses them (`usageType`). */
  typeFieldsByUse(): number {
    const program = this.program();
    const checker = program.getTypeChecker();
    const sfs = this.files.map((f) => program.getSourceFile(f)).filter(Boolean) as ts.SourceFile[];
    let n = 0;
    for (const sf of sfs) {
      const edits: Edit[] = [];
      const visit = (node: ts.Node): void => {
        if (
          (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)) &&
          node.type?.kind === ts.SyntaxKind.UnknownKeyword
        ) {
          const t = this.usageType(checker, node, sfs);
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

  run(): Record<string, number> {
    const stats: Record<string, number> = { returns: 0, locals: 0, params: 0, uninferable: 0 };
    stats.returns += this.dropAnyReturns();
    stats.locals += this.dropAnyLocals();
    for (let round = 0; round < 6; round++) {
      const k = this.paramRound(false);
      stats.params += k;
      if (!k) break;
    }
    stats.params += this.paramRound(true);
    for (let round = 0; round < 3; round++) {
      const k = this.annotateUninferable();
      stats.uninferable += k;
      if (!k) break;
    }
    stats.fieldsByUse = this.typeFieldsByUse();
    stats.swept = 0;
    for (let round = 0; round < 4; round++) {
      const k = this.sweepAny();
      stats.swept += k;
      if (!k) break;
    }
    stats.asserted = 0;
    for (let round = 0; round < 3; round++) {
      const k = this.assertBoundaries();
      stats.asserted += k;
      if (!k) break;
    }
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

export function typePass(srcDir: string, tsconfig: string): Record<string, number> {
  return new TypePass(srcDir, tsconfig).run();
}

if (process.argv[1]?.endsWith("type-pass.ts")) {
  const [srcDir, tsconfig] = process.argv.slice(2);
  console.log(typePass(path.resolve(srcDir), path.resolve(tsconfig)));
}

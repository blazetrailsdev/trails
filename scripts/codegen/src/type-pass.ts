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

  /**
   * A type as source text usable in `file`: a type out of scope there is an
   * `import("…")` type, rewritten to the generated file's relative path or the
   * dependency package's root; null when it cannot be named from `file`.
   */
  typeText(checker: ts.TypeChecker, t: ts.Type, at: ts.Node, file: string): string | null {
    if (t.flags & (ts.TypeFlags.Any | ts.TypeFlags.Never)) return null;
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
    text = text.replace(/import\("([^"]+)"\)\.([\w$]+)/g, (_m, spec: string, name: string) => {
      if (path.isAbsolute(spec) && spec.startsWith(this.srcDir)) {
        let rel = path.relative(path.dirname(file), spec).replace(/\.d$|\.ts$/, "");
        if (!rel.startsWith(".")) rel = `./${rel}`;
        return `import("${rel}.js").${name}`;
      }
      const pkg = /\/packages\/([\w-]+)\//.exec(spec)?.[1];
      const id = pkg ? `@blazetrails/${pkg}` : null;
      if (id && this.exportsOf.get(id)?.has(name)) return `import("${id}").${name}`;
      ok = false;
      return _m;
    });
    return ok ? text : null;
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
    for (const [f, es] of edits) applyEdits(f, es);
    return n;
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
    return stats;
  }
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

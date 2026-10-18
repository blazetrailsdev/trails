/**
 * The signature index, read through the TypeScript checker: the generated tree
 * is loaded with the real declarations of every package it imports (the
 * dependencies' built `.d.ts` and the generated gem files themselves), and each
 * call's resolved signature says which parameters are non-null.
 *
 * A Ruby call passes `nil` where it has one and the callee copes or raises; the
 * generator types a value `T | null` wherever Ruby may answer `nil`
 * (`TimeZone.find`, `Module#name`). Where such an argument meets a parameter
 * typed without `null` / `undefined`, it gets a non-null `!`: a type assertion
 * only, so the emitted JavaScript, and the Ruby behaviour it carries, are
 * unchanged. A member read on such a value (`Time.zone.local`) takes the same
 * `!`: JavaScript's `TypeError` there is Ruby's `NoMethodError` on `nil`.
 *
 *   pnpm tsx scripts/codegen/src/nonnull-pass.ts <generated src dir> <package tsconfig>
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript-5";

const NULLISH = ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void;
const OPEN = ts.TypeFlags.Any | ts.TypeFlags.Unknown;

function walkDir(d: string): string[] {
  return readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walkDir(path.join(d, e.name))
      : e.name.endsWith(".ts")
        ? [path.join(d, e.name)]
        : [],
  );
}

const parts = (t: ts.Type): ts.Type[] => (t.isUnion() ? t.types : [t]);
const admitsNullish = (t: ts.Type): boolean =>
  parts(t).some((p) => p.flags & (NULLISH | OPEN) || (p.flags & ts.TypeFlags.TypeParameter) !== 0);
const isNullable = (t: ts.Type): boolean =>
  !(t.flags & OPEN) &&
  t.isUnion() &&
  t.types.some((p) => p.flags & NULLISH) &&
  t.types.some((p) => !(p.flags & NULLISH));

/** Insertion points (file offset → text), one `!` per nullable argument. */
function findEdits(
  program: ts.Program,
  file: ts.SourceFile,
): { pos: number; wrap: boolean; end: number }[] {
  const checker = program.getTypeChecker();
  const edits: { pos: number; wrap: boolean; end: number }[] = [];
  const visit = (node: ts.Node): void => {
    // `recv.m` on a receiver Ruby may answer `nil` for raises there as Ruby's
    // `NoMethodError` does, so the member read takes `recv!.m`.
    if (
      ts.isPropertyAccessExpression(node) &&
      !node.questionDotToken &&
      !ts.isNonNullExpression(node.expression)
    ) {
      const rt = checker.getTypeAtLocation(node.expression);
      if (isNullable(rt) && checker.getNonNullableType(rt).getProperty(node.name.text)) {
        const e = node.expression;
        const simple =
          ts.isIdentifier(e) ||
          ts.isPropertyAccessExpression(e) ||
          ts.isElementAccessExpression(e) ||
          ts.isCallExpression(e) ||
          ts.isParenthesizedExpression(e) ||
          e.kind === ts.SyntaxKind.ThisKeyword;
        edits.push({ pos: e.getStart(file), end: e.getEnd(), wrap: !simple });
      }
    }
    // A returned or assigned value whose declared slot (the hand twin's return
    // type, a typed field) excludes `null`. Only a read or a call: a `null`
    // literal or a `?? null` is Ruby answering `nil` on purpose, and stays an error.
    const slotValue = ts.isReturnStatement(node)
      ? node.expression
      : ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
        ? node.right
        : undefined;
    if (
      slotValue &&
      (ts.isIdentifier(slotValue) ||
        ts.isPropertyAccessExpression(slotValue) ||
        ts.isElementAccessExpression(slotValue) ||
        ts.isCallExpression(slotValue) ||
        (ts.isAwaitExpression(slotValue) && ts.isCallExpression(slotValue.expression)))
    ) {
      const want = checker.getContextualType(slotValue);
      const at = checker.getTypeAtLocation(slotValue);
      if (
        want &&
        !admitsNullish(want) &&
        isNullable(at) &&
        checker.isTypeAssignableTo(checker.getNonNullableType(at), want)
      )
        edits.push({
          pos: slotValue.getStart(file),
          end: slotValue.getEnd(),
          wrap: ts.isAwaitExpression(slotValue),
        });
    }
    if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && node.arguments?.length) {
      const sig = checker.getResolvedSignature(node);
      const params = sig?.getParameters() ?? [];
      node.arguments.forEach((arg, i) => {
        if (ts.isSpreadElement(arg) || ts.isNonNullExpression(arg)) return;
        const decl = params[Math.min(i, params.length - 1)]?.valueDeclaration;
        if (!decl || !ts.isParameter(decl)) return;
        let pt = checker.getTypeOfSymbolAtLocation(params[Math.min(i, params.length - 1)], node);
        if (decl.dotDotDotToken) {
          if (i < params.length - 1) return;
          const el = checker.getIndexTypeOfType(pt, ts.IndexKind.Number);
          if (!el) return;
          pt = el;
        } else if (i >= params.length) return;
        if (decl.questionToken || decl.initializer) return;
        if (admitsNullish(pt)) return;
        const at = checker.getTypeAtLocation(arg);
        if (!isNullable(at)) return;
        if (!checker.isTypeAssignableTo(checker.getNonNullableType(at), pt)) return;
        const simple =
          ts.isIdentifier(arg) ||
          ts.isPropertyAccessExpression(arg) ||
          ts.isElementAccessExpression(arg) ||
          ts.isCallExpression(arg) ||
          ts.isParenthesizedExpression(arg);
        edits.push({ pos: arg.getStart(file), end: arg.getEnd(), wrap: !simple });
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return edits;
}

/**
 * A method left unannotated so TypeScript infers its return type, but whose
 * return reaches back into itself (TS7023 / TS7024: a recursive `format`),
 * cannot be inferred: it alone is annotated, `any` (`Promise<any>` when async).
 */
function annotateRecursive(program: ts.Program, file: ts.SourceFile): number[] {
  const at: number[] = [];
  for (const d of program.getSemanticDiagnostics(file)) {
    if ((d.code !== 7023 && d.code !== 7024) || d.start === undefined) continue;
    // The innermost function-like node spanning the diagnostic.
    let n: ts.Node | undefined;
    const find = (node: ts.Node): void => {
      if (d.start! < node.getStart(file) || d.start! >= node.getEnd()) return;
      if (ts.isFunctionLike(node)) n = node;
      ts.forEachChild(node, find);
    };
    find(file);
    if (!n || !ts.isFunctionLike(n) || n.type) continue;
    const params = n.parameters;
    const close = file.text.indexOf(")", params.end);
    if (close >= 0 && !at.includes(close + 1)) at.push(close + 1);
  }
  return at;
}

function isAsyncAt(text: string, closeParen: number): boolean {
  const start = text.lastIndexOf("\n", closeParen);
  return /\basync\b/.test(text.slice(start, closeParen));
}

export function nonNullPass(srcDir: string, tsconfig: string): number {
  const cfg = ts.readConfigFile(tsconfig, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, path.dirname(tsconfig));
  const options: ts.CompilerOptions = {
    ...parsed.options,
    noEmit: true,
    composite: false,
    incremental: false,
    rootDir: undefined,
    tsBuildInfoFile: undefined,
  };
  const files = walkDir(srcDir);
  let total = 0;
  {
    const program = ts.createProgram(files, options);
    for (const f of files) {
      const sf = program.getSourceFile(f);
      if (!sf) continue;
      const at = annotateRecursive(program, sf);
      if (!at.length) continue;
      let text = readFileSync(f, "utf8");
      for (const pos of at.sort((a, b) => b - a))
        text = `${text.slice(0, pos)}: ${isAsyncAt(text, pos) ? "Promise<any>" : "any"}${text.slice(pos)}`;
      writeFileSync(f, text);
    }
  }
  // A `!` can change the type an outer call sees, so the pass repeats until
  // nothing is added (two rounds in practice).
  for (let round = 0; round < 3; round++) {
    const program = ts.createProgram(files, options);
    let added = 0;
    for (const f of files) {
      const sf = program.getSourceFile(f);
      if (!sf) continue;
      const edits = findEdits(program, sf);
      if (!edits.length) continue;
      let text = readFileSync(f, "utf8");
      for (const e of edits.sort((a, b) => b.pos - a.pos))
        text = e.wrap
          ? `${text.slice(0, e.pos)}(${text.slice(e.pos, e.end)})!${text.slice(e.end)}`
          : `${text.slice(0, e.end)}!${text.slice(e.end)}`;
      writeFileSync(f, text);
      added += edits.length;
    }
    total += added;
    if (!added) break;
  }
  return total;
}

if (process.argv[1]?.endsWith("nonnull-pass.ts")) {
  const [srcDir, tsconfig] = process.argv.slice(2);
  console.log(
    `non-null assertions added: ${nonNullPass(path.resolve(srcDir), path.resolve(tsconfig))}`,
  );
}

import ts from "typescript";
import { portTreeFiles, type PortFile } from "./files.js";

/**
 * How the port spells a name: as something you call, or as something you read.
 *
 * Ruby draws no such line — `build_relation` and `name` are both calls — so a
 * paren-less, argument-less self-call is only emitted with `()` when the port
 * itself says the name is a method. A getter, a plain property, or a name the
 * port never declares stays a property access, which is what the emitter has
 * always produced.
 */
export interface PortSymbols {
  methods: Set<string>;
  getters: Set<string>;
}

function isFunctionValued(init: ts.Expression | undefined): boolean {
  return init != null && (ts.isArrowFunction(init) || ts.isFunctionExpression(init));
}

function memberName(name: ts.PropertyName | undefined): string | null {
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}

/**
 * Split one port file's declarations into callables and readables. A class
 * property whose initializer is not literally a function is a readable: a
 * mixin assignment like `static aliasAttribute = aliasAttribute` cannot be
 * told apart from `static table = "x"` here, and the conservative answer
 * preserves the emitter's existing output. The same name declared as a
 * function elsewhere in the tree still lands in `methods`.
 */
export function extractPortSymbols(source: string): PortSymbols {
  const sf = ts.createSourceFile("port.ts", source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const methods = new Set<string>();
  const getters = new Set<string>();
  const visitClass = (decl: ts.ClassLikeDeclaration) => {
    for (const m of decl.members) {
      const name = memberName(m.name);
      if (!name) continue;
      if (ts.isMethodDeclaration(m)) methods.add(name);
      else if (ts.isGetAccessor(m) || ts.isSetAccessor(m)) getters.add(name);
      else if (ts.isPropertyDeclaration(m)) {
        if (isFunctionValued(m.initializer)) methods.add(name);
        else getters.add(name);
      }
    }
  };
  const visit = (node: ts.Node) => {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) visitClass(node);
    else if (ts.isFunctionDeclaration(node) && node.name) methods.add(node.name.text);
    else if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && isFunctionValued(d.initializer)) methods.add(d.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return { methods, getters };
}

/** The same split taken over a whole set of port files at once. */
export function mergePortSymbols(files: PortFile[]): PortSymbols {
  const merged: PortSymbols = { methods: new Set(), getters: new Set() };
  for (const { source } of files) {
    const syms = extractPortSymbols(source);
    for (const n of syms.methods) merged.methods.add(n);
    for (const n of syms.getters) merged.getters.add(n);
  }
  return merged;
}

/**
 * Names a paren-less self-call may be emitted as a call for: declared as a
 * callable somewhere in the port tree and as a readable nowhere in it.
 *
 * The veto is tree-wide rather than per-file because the port implements many
 * getters as `this`-typed mixin functions — `arelTable` is a plain exported
 * function in `core.ts` and a `static get` on `Base`, and it is the class
 * declaration that says how `this.arelTable` reads. A self-call carries no
 * receiver type to pick between the two spellings, so any getter spelling
 * anywhere makes the name ineligible and it keeps emitting bare.
 */
export function callableNames(symbols: PortSymbols): Set<string> {
  const names = new Set(symbols.methods);
  for (const name of symbols.getters) names.delete(name);
  return names;
}

let cache: Set<string> | undefined;

/** `callableNames` over the hand-written port tree, computed once per process. */
export function portMethodNames(): Set<string> {
  cache ??= callableNames(mergePortSymbols(portTreeFiles()));
  return cache;
}

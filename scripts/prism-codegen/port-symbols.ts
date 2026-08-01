import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import ts from "typescript";
import { rubyFileToTs } from "./naming.js";
import { TRAILS_AR_SRC, portTreeFiles, type PortFile } from "./files.js";

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
 * property whose initializer is not literally a function is treated as a
 * readable: a mixin assignment like `static aliasAttribute = aliasAttribute`
 * cannot be told apart from `static table = "x"` here, and the conservative
 * answer preserves the emitter's existing output. The same name declared as a
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
        if (!ts.isIdentifier(d.name)) continue;
        if (isFunctionValued(d.initializer)) methods.add(d.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return { methods, getters };
}

/**
 * Whole-port-tree view of the same split, indexed by name so a target file can
 * resolve a name its own twin does not declare — the emitter's self-calls
 * routinely name methods a module mixes in from elsewhere.
 */
export interface PortSymbolManifest {
  methods: Map<string, Set<string>>;
  getters: Map<string, Set<string>>;
}

function record(index: Map<string, Set<string>>, name: string, file: string): void {
  const seen = index.get(name) ?? new Set<string>();
  seen.add(file);
  index.set(name, seen);
}

export function buildPortSymbolManifest(files: PortFile[]): PortSymbolManifest {
  const methods = new Map<string, Set<string>>();
  const getters = new Map<string, Set<string>>();
  for (const { path: file, source } of files) {
    const syms = extractPortSymbols(source);
    for (const n of syms.methods) record(methods, n, file);
    for (const n of syms.getters) record(getters, n, file);
  }
  return { methods, getters };
}

/**
 * Names a paren-less self-call may be emitted as a call for: declared as a
 * callable somewhere in the port tree (the twin file included) and as a
 * readable nowhere in it.
 *
 * The veto is tree-wide rather than twin-only because the port implements many
 * getters as `this`-typed mixin functions — `arelTable` is a plain exported
 * function in `core.ts` and a `static get` on `Base`, and it is the class
 * declaration that says how `this.arelTable` reads. A self-call carries no
 * receiver type to pick between them, so any getter spelling anywhere makes
 * the name ineligible and it keeps emitting as a property access.
 */
export function resolvePortMethods(opts: {
  twinTs: string;
  manifest: PortSymbolManifest;
}): Set<string> {
  const twin = extractPortSymbols(opts.twinTs);
  const names = new Set<string>([...opts.manifest.methods.keys(), ...twin.methods]);
  for (const name of [...opts.manifest.getters.keys(), ...twin.getters]) names.delete(name);
  return names;
}

let manifestCache: PortSymbolManifest | undefined;
export function defaultPortSymbolManifest(): PortSymbolManifest {
  manifestCache ??= buildPortSymbolManifest(portTreeFiles());
  return manifestCache;
}

export function portMethodsForRailsFile(
  railsRelPath: string,
  manifest: PortSymbolManifest = defaultPortSymbolManifest(),
): Set<string> {
  const twinTsAbs = path.join(
    TRAILS_AR_SRC,
    rubyFileToTs(railsRelPath.replace(/^active_record\//, "")),
  );
  const twinTs = existsSync(twinTsAbs) ? readFileSync(twinTsAbs, "utf8") : "";
  return resolvePortMethods({ twinTs, manifest });
}

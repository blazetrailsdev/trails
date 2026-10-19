/**
 * The type oracle: what the hand-written port already decided about each member
 * — accessor vs method, async or not, and the class its value is — read through
 * the TypeScript checker over packages/activerecord/src (dependencies through
 * their built declarations).
 *
 * This is the hint sidecar RFC 0185 planned to generate by tracing Rails' test
 * suite, derived instead from the existing port: the generator uses it for the
 * shape decisions Ruby cannot state (getter or method, Promise or value) and to
 * type receivers so member lookups and `await` follow the receiver, not the name.
 *
 *   pnpm tsx scripts/codegen/src/hand-oracle.ts   → scripts/codegen/data/hand-oracle.json
 */
import * as ts from "typescript-5";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ORACLE_PATH, PKG_DIR } from "./gem.js";

const SRC = path.join(PKG_DIR, "src");

export type TypeRef =
  | { k: "class"; key: string; static?: boolean; nullable?: boolean }
  | { k: "prim"; name: "boolean" | "string" | "number" | "null"; nullable?: boolean }
  | { k: "array"; el: TypeRef | null; nullable?: boolean }
  | { k: "fn" }
  | { k: "hash"; map?: boolean }
  | { k: "gemClass"; fqn: string }
  | null;

export interface MemberInfo {
  kind: "method" | "get" | "prop";
  async: boolean;
  ret: TypeRef;
  arity: number;
  /** Declared parameter types, positionally (methods only). */
  params?: TypeRef[];
}

export interface ClassInfo {
  key: string;
  extends?: string;
  instance: Record<string, MemberInfo>;
  static: Record<string, MemberInfo>;
}

export interface Oracle {
  classes: Record<string, ClassInfo>;
  /** file → exported function name → info */
  functions: Record<string, Record<string, MemberInfo>>;
}

function fileKey(sf: ts.SourceFile): string {
  const f = sf.fileName;
  if (f.startsWith(SRC + "/")) return path.relative(SRC, f).replace(/\.ts$/, ".ts");
  const m = f.match(/packages\/([^/]+)\/(?:dist|src)\/(.*?)(?:\.d)?\.ts$/);
  if (m) return `@${m[1]}/${m[2]}.ts`;
  return path.basename(f);
}

function main(): void {
  const cfgPath = path.join(PKG_DIR, "tsconfig.json");
  const cfg = ts.readConfigFile(cfgPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, path.dirname(cfgPath));
  const roots = parsed.fileNames.filter((f) => !/\.test\.ts$|test-helpers\/|\/support\//.test(f));
  // Dependencies the generated code may call that the hand port never imports
  // (`GlobalID::Locator.locate`, async in trails): read their entry points too.
  for (const dep of ["globalid", "i18n", "date"]) {
    const entry = path.join(PKG_DIR, "..", dep, "dist/index.d.ts");
    if (existsSync(entry)) roots.push(entry);
  }
  const program = ts.createProgram(roots, {
    ...parsed.options,
    noEmit: true,
    composite: false,
    incremental: false,
  });
  const checker = program.getTypeChecker();
  const oracle: Oracle = { classes: {}, functions: {} };

  const classKeyOf = (sym: ts.Symbol | undefined): string | null => {
    if (!sym) return null;
    if (sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
    const d = sym.declarations?.find(
      (x) => ts.isClassDeclaration(x) || ts.isClassExpression(x) || ts.isInterfaceDeclaration(x),
    );
    if (!d) return null;
    return `${fileKey(d.getSourceFile())}#${sym.getName()}`;
  };

  const isMapType = (x: ts.Type): boolean => {
    const n = (x.getSymbol() ?? x.aliasSymbol)?.getName();
    return n === "Map" || n === "Hash";
  };
  const isRecordType = (x: ts.Type): boolean =>
    !!(x.flags & ts.TypeFlags.Object) &&
    !x.getCallSignatures().length &&
    (checker.getIndexInfosOfType(x).length > 0 || x.aliasSymbol?.getName() === "Record");
  const refOf = (t: ts.Type, depth = 0): TypeRef => {
    if (depth > 3) return null;
    if (t.isUnion()) {
      const parts = t.types.filter(
        (x) => !(x.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)),
      );
      const nullable = parts.length < t.types.length ? { nullable: true as const } : {};
      if (parts.every((x) => x.flags & ts.TypeFlags.BooleanLike))
        return { k: "prim", name: "boolean", ...nullable };
      // A hash the hand port types as `Record<…> | Map<…>` may be a Map, so a
      // read or write on it keeps ruby-compat's `hashAref` / `hashAset`
      // (CLAUDE.md "Hash calls on a plain object").
      if (
        parts.length > 1 &&
        parts.some(isMapType) &&
        parts.every((x) => isMapType(x) || isRecordType(x))
      )
        return { k: "hash", map: true, ...nullable };
      if (parts.length === 1) {
        const one = refOf(parts[0], depth + 1);
        return one && one.k !== "fn" && one.k !== "gemClass" && one.k !== "hash"
          ? { ...one, ...nullable }
          : one;
      }
      return null;
    }
    if (t.flags & ts.TypeFlags.BooleanLike) return { k: "prim", name: "boolean" };
    if (t.flags & ts.TypeFlags.StringLike) return { k: "prim", name: "string" };
    if (t.flags & ts.TypeFlags.NumberLike) return { k: "prim", name: "number" };
    if (checker.isArrayType(t)) {
      const el = (t as ts.TypeReference).typeArguments?.[0];
      return { k: "array", el: el ? refOf(el, depth + 1) : null };
    }
    if (t.getCallSignatures().length && !t.getProperties().length) return { k: "fn" };
    const sym = t.getSymbol() ?? t.aliasSymbol;
    if (sym && sym.flags & ts.SymbolFlags.Class && t.getConstructSignatures().length) {
      const k = classKeyOf(sym);
      return k ? { k: "class", key: k, static: true } : null;
    }
    const k = classKeyOf(sym);
    return k ? { k: "class", key: k } : null;
  };

  const unwrapPromise = (t: ts.Type): { inner: ts.Type; async: boolean } => {
    const parts = t.isUnion() ? t.types : [t];
    const p = parts.find((x) => {
      const s = x.getSymbol();
      return s && (s.getName() === "Promise" || s.getName() === "PromiseLike");
    });
    if (!p) return { inner: t, async: false };
    const arg = (p as ts.TypeReference).typeArguments?.[0];
    return { inner: arg ?? p, async: true };
  };

  const memberInfo = (sym: ts.Symbol, at: ts.Node): MemberInfo | null => {
    const decl = sym.valueDeclaration ?? sym.declarations?.[0];
    if (!decl) return null;
    const t = checker.getTypeOfSymbolAtLocation(sym, at);
    if (
      ts.isGetAccessorDeclaration(decl) ||
      ts.isSetAccessorDeclaration(decl) ||
      sym.flags & ts.SymbolFlags.GetAccessor
    ) {
      const { inner, async } = unwrapPromise(t);
      return { kind: "get", async, ret: refOf(inner), arity: 0 };
    }
    const sigs = t.getCallSignatures();
    if (
      (ts.isMethodDeclaration(decl) ||
        ts.isMethodSignature(decl) ||
        ts.isFunctionDeclaration(decl) ||
        sym.flags & ts.SymbolFlags.Method) &&
      sigs.length
    ) {
      const sig = sigs[sigs.length - 1];
      const { inner, async } = unwrapPromise(checker.getReturnTypeOfSignature(sig));
      const params = sig.parameters.map((ps) => refOf(checker.getTypeOfSymbolAtLocation(ps, at)));
      return {
        kind: "method",
        async,
        ret: refOf(inner),
        arity: sig.parameters.length,
        ...(params.some(Boolean) ? { params } : {}),
      };
    }
    if (sigs.length && (ts.isPropertyDeclaration(decl) || ts.isPropertyAssignment(decl))) {
      const sig = sigs[sigs.length - 1];
      const { inner, async } = unwrapPromise(checker.getReturnTypeOfSignature(sig));
      const params = sig.parameters.map((ps) => refOf(checker.getTypeOfSymbolAtLocation(ps, at)));
      return {
        kind: "method",
        async,
        ret: refOf(inner),
        arity: sig.parameters.length,
        ...(params.some(Boolean) ? { params } : {}),
      };
    }
    const { inner, async } = unwrapPromise(t);
    return { kind: "prop", async, ret: refOf(inner), arity: 0 };
  };

  const addClass = (node: ts.ClassLikeDeclaration | ts.InterfaceDeclaration, name: string) => {
    const sf = node.getSourceFile();
    const key = `${fileKey(sf)}#${name}`;
    const sym = (node.name && checker.getSymbolAtLocation(node.name)) || undefined;
    const info: ClassInfo = oracle.classes[key] ?? { key, instance: {}, static: {} };
    const heritage = node.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword)
      ?.types[0];
    if (heritage) {
      const ht = checker.getTypeAtLocation(heritage.expression);
      const hk = classKeyOf(ht.getSymbol());
      if (hk) info.extends = hk;
    }
    // Own members only: a member declared in this class body, or in an interface
    // of the same name merged with it (the mixin-declaration pattern). Inherited
    // members are found by walking `extends` at lookup time.
    const own = (p: ts.Symbol) =>
      (p.declarations ?? []).some(
        (d) =>
          d.parent === node ||
          (ts.isInterfaceDeclaration(d.parent) &&
            d.parent.name.text === name &&
            d.getSourceFile() === sf),
      );
    const type = sym ? checker.getDeclaredTypeOfSymbol(sym) : checker.getTypeAtLocation(node);
    for (const p of checker.getPropertiesOfType(type)) {
      if (!own(p)) continue;
      const m = memberInfo(p, node);
      if (m) info.instance[p.getName()] = m;
    }
    if (ts.isClassLike(node)) {
      const st = sym
        ? checker.getTypeOfSymbolAtLocation(sym, node)
        : checker.getTypeAtLocation(node);
      for (const p of checker.getPropertiesOfType(st)) {
        if (p.getName() === "prototype" || !own(p)) continue;
        const m = memberInfo(p, node);
        if (m) info.static[p.getName()] = m;
      }
      // Private members are not in getPropertiesOfType for some shapes; read the AST.
      for (const mem of node.members) {
        if (!mem.name || !ts.isIdentifier(mem.name)) continue;
        const n = mem.name.text;
        const isStatic =
          ts.getCombinedModifierFlags(mem as ts.Declaration) & ts.ModifierFlags.Static;
        const bag = isStatic ? info.static : info.instance;
        if (bag[n]) continue;
        const ms = checker.getSymbolAtLocation(mem.name);
        const m = ms && memberInfo(ms, mem);
        if (m) bag[n] = m;
      }
    }
    oracle.classes[key] = info;
  };

  for (const sf of program.getSourceFiles()) {
    const fk = fileKey(sf);
    const ours = sf.fileName.startsWith(SRC + "/");
    const dep = /packages\/(arel|activemodel|activesupport|ruby-compat|globalid|i18n|date)\//.test(
      sf.fileName,
    );
    if (!ours && !dep) continue;
    const visit = (n: ts.Node) => {
      if ((ts.isClassDeclaration(n) || ts.isInterfaceDeclaration(n)) && n.name)
        addClass(n, n.name.text);
      else if (
        ts.isVariableDeclaration(n) &&
        ts.isIdentifier(n.name) &&
        n.initializer &&
        ts.isClassExpression(n.initializer)
      )
        addClass(n.initializer, n.name.text);
      else if (
        ours &&
        ts.isVariableDeclaration(n) &&
        ts.isIdentifier(n.name) &&
        n.initializer &&
        ts.isSourceFile(n.parent.parent.parent)
      ) {
        // module objects: `export const Mod = { … }` / `new Module(…)` / defineModule(…)
        const t = checker.getTypeAtLocation(n.name);
        const key = `${fk}#${n.name.text}`;
        const info: ClassInfo = { key, instance: {}, static: {} };
        for (const p of checker.getPropertiesOfType(t)) {
          const m = memberInfo(p, n);
          if (m && m.kind === "method") info.instance[p.getName()] = m;
        }
        if (Object.keys(info.instance).length)
          oracle.classes[key] = { ...info, static: { ...info.instance } };
      } else if (ours && ts.isFunctionDeclaration(n) && n.name && ts.isSourceFile(n.parent)) {
        const s = checker.getSymbolAtLocation(n.name);
        const m = s && memberInfo(s, n);
        if (m) (oracle.functions[fk] ??= {})[n.name.text] = m;
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  const out = ORACLE_PATH;
  writeFileSync(out, JSON.stringify(oracle));
  const nAsync = Object.values(oracle.classes).reduce(
    (a, c) =>
      c.key.startsWith("@")
        ? a
        : a +
          Object.values(c.instance).filter((m) => m.async).length +
          Object.values(c.static).filter((m) => m.async).length,
    0,
  );
  console.log(
    `classes=${Object.keys(oracle.classes).length} asyncMembers=${nAsync} fileFunctionFiles=${Object.keys(oracle.functions).length}`,
  );
}

main();

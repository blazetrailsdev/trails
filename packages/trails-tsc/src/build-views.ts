import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import ts from "typescript-5";
import { camelize, dasherize, pluralize, underscore } from "@blazetrails/activesupport";
import { parse, generateSourceMap } from "@blazetrails/tse-compiler";
import {
  virtualizeTseWithDeltas,
  parseLocalsSignature,
  localsParamType,
  type TseScope,
} from "./plugins/tse.js";

export interface BuildViewsOptions {
  cwd?: string;
  viewsDir?: string;
  outDir?: string;
}

export interface BuildViewsResult {
  count: number;
  files: readonly string[];
}

export async function buildViews(opts: BuildViewsOptions = {}): Promise<BuildViewsResult> {
  const cwd = opts.cwd ?? process.cwd();
  const viewsDir = path.resolve(cwd, opts.viewsDir ?? "app/views");
  const outDir = path.resolve(cwd, opts.outDir ?? ".trails");
  const outViews = path.join(outDir, "views");
  const files = await walkTse(viewsDir);
  const lexicalRel = path.relative(cwd, outViews);
  if (lexicalRel === "" || lexicalRel.startsWith("..") || path.isAbsolute(lexicalRel)) {
    throw new Error(
      `refusing to build into ${JSON.stringify(outViews)} — outDir must resolve under cwd ${JSON.stringify(cwd)}`,
    );
  }
  const realCwd = await fs.realpath(cwd);
  const realOutAncestor = await fs.realpath(await deepestExisting(outViews));
  const realRel = path.relative(realCwd, realOutAncestor);
  if (realRel !== "" && (realRel.startsWith("..") || path.isAbsolute(realRel))) {
    throw new Error(
      `refusing to build into ${JSON.stringify(outViews)} — resolved path ${JSON.stringify(realOutAncestor)} is outside cwd ${JSON.stringify(realCwd)} (symlink escape)`,
    );
  }
  await fs.rm(outViews, { recursive: true, force: true });
  await fs.rm(path.join(outDir, "views-manifest.ts"), { force: true });
  await fs.mkdir(outViews, { recursive: true });
  const registryMap = new Map<string, string[]>();
  const appDir = path.dirname(viewsDir);
  const helpers = await allHelpersFromPath(path.join(appDir, "helpers"));
  const controllers = await allControllers(path.join(appDir, "controllers"));
  const views: ViewShim[] = [];
  for (const rel of files) {
    const src = await fs.readFile(path.join(viewsDir, rel), "utf8");
    const outBase = path.join(outViews, rel);
    const ast = parse(src);
    views.push({
      rel,
      src,
      outBase,
      strictLocals: ast.localsSignature !== null,
      resolved: false,
      ...(await templateScope(appDir, rel, path.dirname(outBase), helpers, controllers)),
    });
    await fs.mkdir(path.dirname(outBase), { recursive: true });
    await writeShim(views[views.length - 1], viewsDir);
    const registryKey = partialRegistryKey(rel);
    if (registryKey !== null && ast.localsSignature !== null) {
      const locals = parseLocalsSignature(ast.localsSignature);
      const existing = registryMap.get(registryKey) ?? [];
      registryMap.set(registryKey, [...existing, localsParamType(ast, locals)]);
    }
  }
  const shimPaths = views.map((v) => v.outBase + ".ts");
  if (shimPaths.length > 0) {
    const host = cachingHost();
    const roots = [...shimPaths, ...controllers.map((c) => c.file)];
    let program = ts.createProgram(roots, EMIT_OPTIONS, host);
    for (
      let pass = 0;
      pass <= views.length && bindCheckedTypes(views, controllers, program);
      pass++
    ) {
      for (const view of views) await writeShim(view, viewsDir);
      program = ts.createProgram(roots, EMIT_OPTIONS, host, program);
    }
    emitDeclarations(program, host, outViews);
  }
  const registryEntries = Array.from(registryMap, ([key, types]) => ({
    key,
    localsType: types.length === 1 ? types[0] : types.map((t) => `(${t})`).join(" & "),
  }));
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(
    path.join(outDir, "template-registry-augmentation.d.ts"),
    emitRegistryAugmentation(registryEntries),
  );
  return { count: files.length, files };
}

async function exists(p: string): Promise<boolean> {
  return (await fs.stat(p).catch(() => null)) !== null;
}

async function deepestExisting(p: string): Promise<string> {
  let cur = path.resolve(p);
  while (!(await exists(cur))) {
    const parent = path.dirname(cur);
    if (parent === cur) return cur;
    cur = parent;
  }
  return cur;
}

async function walkTse(dir: string): Promise<string[]> {
  if (!(await exists(dir))) return [];
  const out: string[] = [];
  const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true });
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".tse")) continue;
    const parent =
      (e as Dirent & { parentPath?: string }).parentPath ??
      (e as Dirent & { path?: string }).path ??
      dir;
    const full = path.join(parent, e.name);
    out.push(path.relative(dir, full).split(path.sep).join("/"));
  }
  return out.sort();
}

async function allHelpersFromPath(helpersDir: string): Promise<string[]> {
  if (!(await exists(helpersDir))) return [];
  const names = (await fs.readdir(helpersDir, { recursive: true, encoding: "utf8" }))
    .map((file) => file.split(path.sep).join("/"))
    .filter((file) => /[-_]helper\.ts$/u.test(file));
  return names.sort();
}

interface Controller {
  file: string;
  name: string;
  path: string;
}

async function allControllers(controllersDir: string): Promise<Controller[]> {
  if (!(await exists(controllersDir))) return [];
  return (await fs.readdir(controllersDir, { recursive: true, encoding: "utf8" }))
    .map((file) => file.split(path.sep).join("/"))
    .filter((file) => file.endsWith("-controller.ts"))
    .sort()
    .map((file) => {
      const controllerPath = underscore(file.slice(0, -"-controller.ts".length));
      return {
        file: path.join(controllersDir, file),
        name: `${constantName(controllerPath)}Controller`,
        path: controllerPath,
      };
    });
}

function importPath(fromDir: string, file: string): string {
  const rel = path.relative(fromDir, file).split(path.sep).join("/").replace(/\.ts$/u, ".js");
  return JSON.stringify(rel.startsWith(".") ? rel : `./${rel}`);
}

function constantName(path_: string): string {
  return camelize(underscore(path_)).split("::").join("");
}

interface ViewShim {
  rel: string;
  src: string;
  outBase: string;
  strictLocals: boolean;
  resolved: boolean;
  model?: { file: string; klass: string };
  view: string[];
  locals: Map<string, Set<string>>;
  base: { view: string[]; locals: Map<string, Set<string>> };
  controller?: Controller;
  layout?: string;
}

async function writeShim(shim: ViewShim, viewsDir: string): Promise<void> {
  const shimDir = path.dirname(shim.outBase);
  const locals = [...shim.locals].map(([name, types]) => `${name}: ${[...types].join(" | ")}`);
  const scope: TseScope = {
    view: relocateImports(shim.view.join(" & "), shimDir),
    locals: relocateImports(locals.length === 0 ? "{}" : `{ ${locals.join("; ")} }`, shimDir),
    resolved: shim.resolved,
  };
  const { ts: code, mappings } = virtualizeTseWithDeltas(shim.src, scope);
  const base = path.basename(shim.rel);
  await fs.writeFile(shim.outBase + ".ts", code + `//# sourceMappingURL=${base}.ts.map\n`);
  const sourceFileName = path
    .relative(shimDir, path.join(viewsDir, shim.rel))
    .split(path.sep)
    .join("/");
  const map = generateSourceMap(`${base}.ts`, sourceFileName, shim.src, mappings);
  await fs.writeFile(shim.outBase + ".ts.map", JSON.stringify(map));
}

function relocateImports(typeText: string, shimDir: string): string {
  return typeText.replace(/import\("([^"]+)"\)/gu, (whole, target: string) =>
    path.isAbsolute(target)
      ? `import(${importPath(shimDir, target.replace(/(\.ts)?$/u, ".ts"))})`
      : whole,
  );
}

const EMIT_OPTIONS: ts.CompilerOptions = {
  declaration: true,
  declarationMap: true,
  emitDeclarationOnly: true,
  skipLibCheck: true,
  strict: true,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ESNext,
};

function cachingHost(): ts.CompilerHost {
  const host = ts.createCompilerHost(EMIT_OPTIONS, true);
  const getSourceFile = host.getSourceFile.bind(host);
  const parsed = new Map<string, ts.SourceFile | undefined>();
  host.getSourceFile = (fileName, ...rest) => {
    if (fileName.endsWith(".tse.ts")) return getSourceFile(fileName, ...rest);
    if (!parsed.has(fileName)) parsed.set(fileName, getSourceFile(fileName, ...rest));
    return parsed.get(fileName);
  };
  return host;
}

function bindCheckedTypes(
  views: ViewShim[],
  controllers: readonly Controller[],
  program: ts.Program,
): boolean {
  const checker = program.getTypeChecker();
  const typeText = (type: ts.Type): string =>
    checker.typeToString(
      type,
      undefined,
      ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseFullyQualifiedType,
    );
  const before = views.map(scopeSignature);
  const partials = new Map<string, ViewShim>();
  const renders = new Map<ViewShim, { calls: number; keys: Map<string, number> }>();
  const unresolved = new Set<ViewShim>();
  let unknownTarget = false;
  let unknownTemplate = false;
  for (const view of views) {
    view.view = [...view.base.view];
    view.locals = new Map([...view.base.locals].map(([k, v]) => [k, new Set(v)]));
    view.resolved = true;
    const key = partialRegistryKey(view.rel);
    if (key !== null && !view.strictLocals) partials.set(key, view);
  }
  const modelPartial = (type: ts.Type): ViewShim | undefined => {
    const symbol = type.getSymbol();
    const file = symbol?.declarations?.[0]?.getSourceFile().fileName;
    if (symbol === undefined || file === undefined) return undefined;
    return [...partials.values()].find(
      (p) => p.model?.klass === symbol.name && path.resolve(p.model.file) === path.resolve(file),
    );
  };
  const objectTypes = (type: ts.Type): ts.Type[] => {
    const nonNull = checker.getNonNullableType(type);
    if (nonNull.isUnion()) return nonNull.types.flatMap(objectTypes);
    if (checker.isArrayType(nonNull)) {
      return checker.getTypeArguments(nonNull as ts.TypeReference).flatMap(objectTypes);
    }
    return [nonNull];
  };
  const sources = [
    ...views.map((v) => ({
      file: v.outBase + ".ts",
      prefix: path.posix.dirname(v.rel),
      inController: false,
    })),
    ...controllers.map((c) => ({ file: c.file, prefix: c.path, inController: true })),
  ];
  for (const { file, prefix, inController } of sources) {
    const sf = program.getSourceFile(file);
    if (sf === undefined) continue;
    const visit = (node: ts.Node): void => {
      const site = ts.isCallExpression(node) ? renderSite(node, inController) : undefined;
      if (site === "unknown") unknownTarget = true;
      else if (site !== undefined && "template" in site) {
        const key = site.template?.includes("/") ? site.template : `${prefix}/${site.template}`;
        if (site.template === undefined) unknownTemplate = true;
        for (const view of views)
          if (view.rel.replace(/\.[^/]*$/u, "") === key) unresolved.add(view);
      } else if (site !== undefined && "object" in site) {
        for (const type of objectTypes(checker.getTypeAtLocation(site.object))) {
          const reached = modelPartial(type);
          if (reached === undefined) unknownTarget = true;
          else if (site.locals !== undefined) unresolved.add(reached);
        }
      }
      const passed = site !== undefined && site !== "unknown" && "name" in site ? site : undefined;
      const target =
        passed &&
        partials.get(passed.name.includes("/") ? passed.name : `${prefix}/${passed.name}`);
      if (passed && target) {
        if (passed.implicitLocals) unresolved.add(target);
        const seen = renders.get(target) ?? { calls: 0, keys: new Map<string, number>() };
        renders.set(target, seen);
        const hash = passed.locals && checker.getTypeAtLocation(passed.locals);
        if (hash && hash.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) unresolved.add(target);
        for (const each of hash === undefined
          ? [undefined]
          : hash.isUnion()
            ? hash.types
            : [hash]) {
          seen.calls++;
          for (const prop of each ? checker.getPropertiesOfType(each) : []) {
            const type = checker.getTypeOfSymbolAtLocation(prop, passed.locals!);
            const types = target.locals.get(prop.name) ?? new Set<string>();
            types.add(typeText(checker.getBaseTypeOfLiteralType(type)));
            target.locals.set(prop.name, types);
            if (prop.flags & ts.SymbolFlags.Optional) continue;
            seen.keys.set(prop.name, (seen.keys.get(prop.name) ?? 0) + 1);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  const members = new Map<Controller, Map<string, string>>();
  const layouts = new Map<Controller, Set<string> | "every">();
  const existing = new Set(views.flatMap((v) => (v.layout === undefined ? [] : [v.layout])));
  for (const controller of controllers) {
    const klass = controllerClass(program, controller);
    if (!klass) continue;
    members.set(controller, controllerMembers(checker, klass, typeText));
    layouts.set(controller, layoutsOf(checker, controllers, existing, klass));
  }
  for (const view of views) {
    const rendering =
      view.layout === undefined
        ? view.controller && [view.controller]
        : controllers.filter((c) => {
            const rendered = layouts.get(c);
            return rendered === "every" || rendered?.has(view.layout!);
          });
    const merged = new Map<string, Set<string>>();
    for (const controller of rendering ?? []) {
      for (const [name, type] of members.get(controller) ?? []) {
        merged.set(name, (merged.get(name) ?? new Set<string>()).add(type));
      }
    }
    const fields = [...merged].map(([name, types]) => {
      const everywhere = (rendering ?? []).every((c) => members.get(c)?.has(name));
      return `${JSON.stringify(name)}: ${[...types, ...(everywhere ? [] : ["undefined"])].join(" | ")}`;
    });
    if (fields.length > 0) view.view.push(`{ ${fields.join("; ")} }`);
  }
  for (const [target, { calls, keys }] of renders) {
    for (const [name, count] of keys) if (count < calls) target.locals.get(name)!.add("undefined");
  }
  for (const view of views) {
    const partial = partialRegistryKey(view.rel) !== null;
    if (unresolved.has(view) || (partial ? unknownTarget : unknownTemplate)) view.resolved = false;
  }
  return views.some((view, i) => scopeSignature(view) !== before[i]);
}

function scopeSignature(view: ViewShim): string {
  return JSON.stringify([view.view, [...view.locals].map(([k, v]) => [k, [...v]]), view.resolved]);
}

function controllerClass(
  program: ts.Program,
  { file, name }: Controller,
): ts.ClassDeclaration | undefined {
  return program
    .getSourceFile(file)
    ?.statements.find(
      (s): s is ts.ClassDeclaration => ts.isClassDeclaration(s) && s.name?.text === name,
    );
}

function controllerMembers(
  checker: ts.TypeChecker,
  klass: ts.ClassDeclaration,
  typeText: (type: ts.Type) => string,
): Map<string, string> {
  const instance = checker.getDeclaredTypeOfSymbol(checker.getSymbolAtLocation(klass.name!)!);
  const members = new Map<string, string>();
  for (const prop of checker.getPropertiesOfType(instance)) {
    const declarations = prop.declarations ?? [];
    if (declarations.every((d) => d.getSourceFile().isDeclarationFile)) continue;
    const type = checker.getTypeOfSymbolAtLocation(prop, klass);
    if (type.getCallSignatures().length > 0) continue;
    members.set(prop.name, typeText(type));
  }
  for (const { name, args } of classMacros(checker, klass)) {
    for (const arg of args.flatMap(stringLiterals)) {
      const member = name === "helperMethod" && instance.getProperty(arg);
      if (member) members.set(arg, typeText(checker.getTypeOfSymbolAtLocation(member, klass)));
      if (name === "addFlashTypes") members.set(arg, "unknown");
    }
  }
  return members;
}

function stringLiterals(arg: ts.Expression): string[] {
  if (ts.isStringLiteral(arg)) return [arg.text];
  return ts.isArrayLiteralExpression(arg) ? arg.elements.flatMap(stringLiterals) : [];
}

function superclassOf(
  checker: ts.TypeChecker,
  klass: ts.ClassDeclaration,
): ts.ClassDeclaration | undefined {
  const superclass = klass.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword)
    ?.types[0];
  const parent = superclass && sourceDeclaration(checker, superclass.expression);
  return parent && ts.isClassDeclaration(parent) ? parent : undefined;
}

function layoutsOf(
  checker: ts.TypeChecker,
  controllers: readonly Controller[],
  existing: ReadonlySet<string>,
  klass: ts.ClassDeclaration,
): Set<string> | "every" {
  const layouts = new Set<string>();
  const add = (type: ts.Type): boolean => {
    if (type.isStringLiteral() && !type.value.startsWith(":")) {
      layouts.add(type.value.replace(/^layouts\//u, ""));
    } else if (checker.typeToString(type) !== "false") {
      return false;
    }
    return true;
  };
  const implied = (from: ts.ClassDeclaration | undefined): void => {
    for (let current = from; current; current = superclassOf(checker, current)) {
      const file = current.getSourceFile().fileName;
      const owner = controllers.find((c) => c.file === file && c.name === current.name?.text);
      if (owner && existing.has(owner.path)) return void layouts.add(owner.path);
    }
  };
  const declared = classMacros(checker, klass).filter((m) => m.name === "layout");
  const nearest = declared.filter((m) => m.depth === declared[0].depth).at(-1);
  const [value, conditions] = nearest?.args ?? [];
  if (value === undefined || value.kind === ts.SyntaxKind.NullKeyword) implied(klass);
  else if (!add(checker.getTypeAtLocation(value))) return "every";
  else if (conditions !== undefined) implied(klass);
  let every = false;
  const perRender = (options: ts.Expression): void => {
    let found: ts.Type[] = [];
    let wide = false;
    const read = (source: ts.Expression): void => {
      const type = checker.getTypeAtLocation(source);
      const layouts: ts.Type[] = [];
      let definite = true;
      for (const part of type.isUnion() ? type.types : [type]) {
        const property = part.getProperty("layout");
        const anything = part.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown);
        if (anything || (!property && part.getStringIndexType())) wide = true;
        if (property) layouts.push(checker.getTypeOfSymbolAtLocation(property, source));
        if (!property || property.flags & ts.SymbolFlags.Optional) definite = false;
      }
      found = definite ? layouts : [...found, ...layouts];
      if (definite) wide = false;
    };
    const literal = ts.isObjectLiteralExpression(options) ? options : undefined;
    if (!literal) read(options);
    for (const p of literal?.properties ?? []) {
      if (ts.isSpreadAssignment(p)) read(p.expression);
      else if (propertyName(p) === "layout") {
        found = [checker.getTypeAtLocation(option(literal!, "layout")!)];
        wide = false;
      }
    }
    if (wide) every = true;
    for (const each of found.flatMap((type) => (type.isUnion() ? type.types : [type]))) {
      if (each.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) continue;
      if (checker.typeToString(each) === "true") implied(klass);
      else if (!add(each)) every = true;
    }
  };
  const visit = (node: ts.Node): void => {
    const callee = ts.isCallExpression(node) ? node.expression : undefined;
    if (
      callee &&
      ts.isPropertyAccessExpression(callee) &&
      callee.expression.kind === ts.SyntaxKind.ThisKeyword &&
      callee.name.text === "render"
    ) {
      (node as ts.CallExpression).arguments.slice(0, 2).forEach(perRender);
    }
    ts.forEachChild(node, visit);
  };
  for (let current: typeof klass | undefined = klass; current; ) {
    visit(current);
    current = superclassOf(checker, current);
  }
  return every ? "every" : layouts;
}

const CLASS_MACROS = ["helperMethod", "layout", "addFlashTypes"];

interface ClassMacro {
  name: string;
  args: readonly ts.Expression[];
  depth: number;
}

function classMacros(checker: ts.TypeChecker, klass: ts.ClassDeclaration): ClassMacro[] {
  const macros: ClassMacro[] = [];
  const scanned = new Set<ts.Node>();
  let depth = 0;
  const macro = (node: ts.Node, isSelf: (receiver?: ts.Expression) => boolean): void => {
    if (ts.isFunctionLike(node)) return;
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const [receiver, name] = ts.isPropertyAccessExpression(callee)
        ? [callee.expression, callee.name.text]
        : [undefined, ts.isIdentifier(callee) ? callee.text : ""];
      const viaCall = name === "call" && receiver !== undefined && ts.isIdentifier(receiver);
      const self = viaCall ? node.arguments[0] : receiver;
      const args = viaCall ? node.arguments.slice(1) : node.arguments;
      const macroName = viaCall ? receiver.text : name;
      if (CLASS_MACROS.includes(macroName) && isSelf(self)) {
        macros.push({ name: macroName, args, depth });
      } else if (name === "include" && isSelf(node.arguments[0])) {
        for (const arg of node.arguments.slice(1)) {
          const included = sourceDeclaration(checker, arg);
          if (included) scanModule(included);
        }
      }
    }
    ts.forEachChild(node, (child) => macro(child, isSelf));
  };
  const resolvesTo =
    (declaration: ts.Node, thisIsSelf: boolean) =>
    (receiver?: ts.Expression): boolean =>
      receiver !== undefined &&
      ((thisIsSelf && receiver.kind === ts.SyntaxKind.ThisKeyword) ||
        sourceDeclaration(checker, receiver) === declaration);
  const isIncludedHook = (name: ts.PropertyName): boolean =>
    (ts.isIdentifier(name) && name.text === "included") ||
    (ts.isComputedPropertyName(name) &&
      ts.isIdentifier(name.expression) &&
      name.expression.text === "included");
  const scanModule = (declaration: ts.Node): void => {
    if (scanned.has(declaration)) return;
    scanned.add(declaration);
    const findHook = (node: ts.Node): void => {
      if (
        (ts.isMethodDeclaration(node) || ts.isPropertyAssignment(node)) &&
        isIncludedHook(node.name)
      ) {
        const hook = ts.isPropertyAssignment(node) ? node.initializer : node;
        const base =
          (ts.isMethodDeclaration(hook) ||
            ts.isArrowFunction(hook) ||
            ts.isFunctionExpression(hook)) &&
          hook.parameters[0];
        if (base && hook.body) macro(hook.body, resolvesTo(base, false));
        return;
      }
      if (ts.isFunctionLike(node)) return;
      ts.forEachChild(node, findHook);
    };
    findHook(declaration);
  };
  const scanClass = (declaration: ts.ClassDeclaration): void => {
    if (scanned.has(declaration)) return;
    scanned.add(declaration);
    const inClass = resolvesTo(declaration, true);
    for (const member of declaration.members) {
      if (ts.isClassStaticBlockDeclaration(member)) {
        macro(member.body, inClass);
      } else if (
        ts.isPropertyDeclaration(member) &&
        member.initializer &&
        ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Static
      ) {
        macro(member.initializer, inClass);
      }
    }
    const atTopLevel = resolvesTo(declaration, false);
    for (const statement of declaration.getSourceFile().statements) {
      if (ts.isExpressionStatement(statement)) macro(statement, atTopLevel);
    }
    const parent = superclassOf(checker, declaration);
    depth++;
    if (parent) scanClass(parent);
  };
  scanClass(klass);
  return macros;
}

function sourceDeclaration(
  checker: ts.TypeChecker,
  expr: ts.Expression,
): ts.Declaration | undefined {
  let symbol = checker.getSymbolAtLocation(expr);
  if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
  return declaration && !declaration.getSourceFile().isDeclarationFile ? declaration : undefined;
}

function renderSite(
  call: ts.CallExpression,
  inController: boolean,
):
  | { name: string; locals?: ts.Expression; implicitLocals: boolean }
  | { object: ts.Expression; locals?: ts.Expression }
  | { template: string | undefined }
  | "unknown"
  | undefined {
  const callee = call.expression;
  const isRender = ts.isIdentifier(callee)
    ? callee.text === "render"
    : ts.isPropertyAccessExpression(callee) &&
      callee.expression.kind === ts.SyntaxKind.ThisKeyword &&
      callee.name.text === "render";
  if (!isRender) return undefined;
  const [first, second] = call.arguments;
  if (!first) return undefined;
  if (ts.isStringLiteral(first)) {
    if (!inController) return { name: first.text, locals: second, implicitLocals: false };
    return second === undefined || !passesLocals(second) ? undefined : { template: first.text };
  }
  if (!ts.isObjectLiteralExpression(first)) return { object: first, locals: second };
  const keys = first.properties.map(propertyName);
  if (keys.includes(undefined)) return "unknown";
  const block = !inController && second !== undefined && isFunction(second);
  const partialKey = block ? "layout" : "partial";
  if (!keys.includes(partialKey)) {
    if (!keys.includes("locals")) return undefined;
    const named = option(first, "template") ?? option(first, "action");
    return { template: named && ts.isStringLiteral(named) ? named.text : undefined };
  }
  const partial = option(first, partialKey);
  if (partial && ts.isStringLiteral(partial)) {
    const implicitLocals = keys.some((k) => k === "collection" || k === "object" || k === "as");
    return { name: partial.text, locals: option(first, "locals"), implicitLocals };
  }
  return "unknown";
}

function propertyName(p: ts.ObjectLiteralElementLike): string | undefined {
  return (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
    (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))
    ? p.name.text
    : undefined;
}

function option(hash: ts.ObjectLiteralExpression, key: string): ts.Expression | undefined {
  const property = hash.properties.find((p) => propertyName(p) === key);
  return property && ts.isPropertyAssignment(property)
    ? property.initializer
    : property && ts.isShorthandPropertyAssignment(property)
      ? property.name
      : undefined;
}

function passesLocals(options: ts.Expression): boolean {
  if (!ts.isObjectLiteralExpression(options)) return true;
  const keys = options.properties.map(propertyName);
  return keys.includes(undefined) || keys.includes("locals");
}

function isFunction(node: ts.Expression): boolean {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

async function templateScope(
  appDir: string,
  rel: string,
  shimDir: string,
  helpers: readonly string[],
  controllers: readonly Controller[],
): Promise<Pick<ViewShim, "view" | "locals" | "model" | "base" | "controller" | "layout">> {
  const view = ['import("@blazetrails/actionview").Base'];
  for (const file of helpers) {
    const name = constantName(file.replace(/[-_]helper\.ts$/u, ""));
    view.push(
      `(typeof import(${importPath(shimDir, path.join(appDir, "helpers", file))}))["${name}Helper"]`,
    );
  }
  view.push(
    "{ [name: `${string}Path`]: (...args: unknown[]) => string; [name: `${string}Url`]: (...args: unknown[]) => string }",
    'Record<"alert" | "notice", unknown>',
  );
  const prefix = path.posix.dirname(rel);
  const layout = /^layouts\/((?:[^/]+\/)*[^_/][^/.]*)\./u.exec(rel)?.[1];
  const controller = layout === undefined ? controllers.find((c) => c.path === prefix) : undefined;
  const locals = new Map<string, Set<string>>();
  let modelClass: ViewShim["model"];
  const partial = /^_([a-z_]\w*)/u.exec(path.posix.basename(rel));
  const element = partial?.[1];
  if (element !== undefined && path.posix.basename(prefix) === pluralize(element)) {
    const namespace = prefix.split("/").slice(0, -1);
    const model = path.join(
      appDir,
      "models",
      ...namespace.map(dasherize),
      `${dasherize(element)}.ts`,
    );
    if (await exists(model)) {
      const klass = constantName([...namespace, element].join("/"));
      locals.set(element, new Set([`import(${JSON.stringify(model)}).${klass}`]));
      modelClass = { file: model, klass };
    }
  }
  return {
    view,
    locals,
    model: modelClass,
    base: { view: [...view], locals: new Map(locals) },
    controller,
    layout,
  };
}

function partialRegistryKey(rel: string): string | null {
  const parts = rel.replace(/\.tse$/u, "").split("/");
  const filename = parts[parts.length - 1];
  if (!filename.startsWith("_")) return null;
  const nameWithoutUnderscore = filename.slice(1).replace(/\.[^.]+$/u, "");
  return [...parts.slice(0, -1), nameWithoutUnderscore].join("/");
}

function emitRegistryAugmentation(entries: Array<{ key: string; localsType: string }>): string {
  const lines: string[] = [
    "// AUTO-GENERATED by `trails-tsc-views build` — do not edit.",
    "// Regenerate by running `trails-tsc-views build`.",
    "",
    "export {};",
    "",
    'declare module "@blazetrails/actionview" {',
    "  interface TemplateRegistry {",
  ];
  for (const { key, localsType } of entries) {
    lines.push(`    ${JSON.stringify(key)}: ${localsType};`);
  }
  lines.push("  }", "}", "");
  return lines.join("\n");
}

function emitDeclarations(program: ts.Program, host: ts.CompilerHost, outViews: string): void {
  const emitResult = program.emit(undefined, (fileName, ...rest) => {
    if (path.resolve(fileName).startsWith(outViews + path.sep)) host.writeFile(fileName, ...rest);
  });
  if (emitResult.emitSkipped) {
    const diagnostics = [...ts.getPreEmitDiagnostics(program), ...emitResult.diagnostics];
    const formatted = ts.formatDiagnostics(ts.sortAndDeduplicateDiagnostics(diagnostics), host);
    throw new Error(`declaration emit failed:\n${formatted}`);
  }
}

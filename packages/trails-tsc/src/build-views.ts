import * as fs from "node:fs";
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

export function buildViews(opts: BuildViewsOptions = {}): BuildViewsResult {
  const cwd = opts.cwd ?? process.cwd();
  const viewsDir = path.resolve(cwd, opts.viewsDir ?? "app/views");
  const outDir = path.resolve(cwd, opts.outDir ?? ".trails");
  const outViews = path.join(outDir, "views");
  const files = walkTse(viewsDir);
  const lexicalRel = path.relative(cwd, outViews);
  if (lexicalRel === "" || lexicalRel.startsWith("..") || path.isAbsolute(lexicalRel)) {
    throw new Error(
      `refusing to build into ${JSON.stringify(outViews)} — outDir must resolve under cwd ${JSON.stringify(cwd)}`,
    );
  }
  const realCwd = fs.realpathSync(cwd);
  const realOutAncestor = fs.realpathSync(deepestExisting(outViews));
  const realRel = path.relative(realCwd, realOutAncestor);
  if (realRel !== "" && (realRel.startsWith("..") || path.isAbsolute(realRel))) {
    throw new Error(
      `refusing to build into ${JSON.stringify(outViews)} — resolved path ${JSON.stringify(realOutAncestor)} is outside cwd ${JSON.stringify(realCwd)} (symlink escape)`,
    );
  }
  fs.rmSync(outViews, { recursive: true, force: true });
  fs.rmSync(path.join(outDir, "views-manifest.ts"), { force: true });
  fs.mkdirSync(outViews, { recursive: true });
  const registryMap = new Map<string, string[]>();
  const appDir = path.dirname(viewsDir);
  const helpers = allHelpersFromPath(path.join(appDir, "helpers"));
  const controllers = allControllers(path.join(appDir, "controllers"));
  const views: ViewShim[] = [];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(viewsDir, rel), "utf8");
    const outBase = path.join(outViews, rel);
    const ast = parse(src);
    views.push({
      rel,
      src,
      outBase,
      strictLocals: ast.localsSignature !== null,
      ...templateScope(appDir, rel, path.dirname(outBase), helpers, controllers),
    });
    fs.mkdirSync(path.dirname(outBase), { recursive: true });
    writeShim(views[views.length - 1], viewsDir);
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
      for (const view of views) writeShim(view, viewsDir);
      program = ts.createProgram(roots, EMIT_OPTIONS, host, program);
    }
    emitDeclarations(program, host, outViews);
  }
  const registryEntries = Array.from(registryMap, ([key, types]) => ({
    key,
    localsType: types.length === 1 ? types[0] : types.map((t) => `(${t})`).join(" & "),
  }));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "template-registry-augmentation.d.ts"),
    emitRegistryAugmentation(registryEntries),
  );
  return { count: files.length, files };
}

function deepestExisting(p: string): string {
  let cur = path.resolve(p);
  while (!fs.existsSync(cur)) {
    const parent = path.dirname(cur);
    if (parent === cur) return cur;
    cur = parent;
  }
  return cur;
}

function walkTse(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const entries = fs.readdirSync(dir, { recursive: true, withFileTypes: true });
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".tse")) continue;
    const parent =
      (e as fs.Dirent & { parentPath?: string }).parentPath ??
      (e as fs.Dirent & { path?: string }).path ??
      dir;
    const full = path.join(parent, e.name);
    out.push(path.relative(dir, full).split(path.sep).join("/"));
  }
  return out.sort();
}

function allHelpersFromPath(helpersDir: string): string[] {
  if (!fs.existsSync(helpersDir)) return [];
  const names = fs
    .readdirSync(helpersDir, { recursive: true, encoding: "utf8" })
    .map((file) => file.split(path.sep).join("/"))
    .filter((file) => /[-_]helper\.ts$/u.test(file));
  return names.sort();
}

interface Controller {
  file: string;
  name: string;
  path: string;
}

function allControllers(controllersDir: string): Controller[] {
  if (!fs.existsSync(controllersDir)) return [];
  return fs
    .readdirSync(controllersDir, { recursive: true, encoding: "utf8" })
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
  view: string[];
  locals: Map<string, Set<string>>;
  base: { view: string[]; locals: Map<string, Set<string>> };
  controller?: Controller;
  layout?: string;
}

function writeShim(shim: ViewShim, viewsDir: string): void {
  const shimDir = path.dirname(shim.outBase);
  const locals = [...shim.locals].map(([name, types]) => `${name}: ${[...types].join(" | ")}`);
  const scope: TseScope = {
    view: relocateImports(shim.view.join(" & "), shimDir),
    locals: relocateImports(locals.length === 0 ? "{}" : `{ ${locals.join("; ")} }`, shimDir),
  };
  const { ts: code, mappings } = virtualizeTseWithDeltas(shim.src, scope);
  const base = path.basename(shim.rel);
  fs.writeFileSync(shim.outBase + ".ts", code + `//# sourceMappingURL=${base}.ts.map\n`);
  const sourceFileName = path
    .relative(shimDir, path.join(viewsDir, shim.rel))
    .split(path.sep)
    .join("/");
  const map = generateSourceMap(`${base}.ts`, sourceFileName, shim.src, mappings);
  fs.writeFileSync(shim.outBase + ".ts.map", JSON.stringify(map));
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
  for (const view of views) {
    view.view = [...view.base.view];
    view.locals = new Map([...view.base.locals].map(([k, v]) => [k, new Set(v)]));
    const key = partialRegistryKey(view.rel);
    if (key !== null && !view.strictLocals) partials.set(key, view);
  }
  for (const view of views) {
    const sf = program.getSourceFile(view.outBase + ".ts");
    if (sf === undefined) continue;
    const prefix = path.posix.dirname(view.rel);
    const visit = (node: ts.Node): void => {
      const passed = ts.isCallExpression(node) ? renderedPartial(node) : undefined;
      const target =
        passed &&
        partials.get(passed.name.includes("/") ? passed.name : `${prefix}/${passed.name}`);
      if (passed && target) {
        const seen = renders.get(target) ?? { calls: 0, keys: new Map<string, number>() };
        renders.set(target, seen);
        const hash = passed.locals && checker.getTypeAtLocation(passed.locals);
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
  for (const controller of controllers) {
    const klass = controllerClass(program, controller);
    if (klass) members.set(controller, controllerMembers(checker, klass, typeText));
  }
  for (const view of views) {
    const rendering =
      view.layout === undefined
        ? view.controller && [view.controller]
        : controllers.filter(
            (c) => layoutOf(checker, program, controllers, views, c) === view.layout,
          );
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
  return views.some((view, i) => scopeSignature(view) !== before[i]);
}

function scopeSignature(view: ViewShim): string {
  return JSON.stringify([view.view, [...view.locals].map(([k, v]) => [k, [...v]])]);
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
  for (const name of exposedHelperMethods(checker, klass)) {
    const member = instance.getProperty(name);
    if (member) members.set(name, typeText(checker.getTypeOfSymbolAtLocation(member, klass)));
  }
  return members;
}

function layoutOf(
  checker: ts.TypeChecker,
  program: ts.Program,
  controllers: readonly Controller[],
  views: readonly ViewShim[],
  controller: Controller,
): string | undefined {
  const layouts = new Set(views.flatMap((v) => (v.layout === undefined ? [] : [v.layout])));
  let klass = controllerClass(program, controller);
  while (klass) {
    const current = klass;
    const owner = controllers.find(
      (c) => c.file === current.getSourceFile().fileName && c.name === current.name?.text,
    );
    if (owner && layouts.has(owner.path)) return owner.path;
    const superclass = current.heritageClauses?.find(
      (h) => h.token === ts.SyntaxKind.ExtendsKeyword,
    )?.types[0];
    const parent = superclass && sourceDeclaration(checker, superclass.expression);
    klass = parent && ts.isClassDeclaration(parent) ? parent : undefined;
  }
  return undefined;
}

function exposedHelperMethods(checker: ts.TypeChecker, klass: ts.ClassDeclaration): string[] {
  const names: string[] = [];
  const scanned = new Set<ts.Node>();
  const scan = (declaration: ts.Node): void => {
    if (scanned.has(declaration)) return;
    scanned.add(declaration);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const name = ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : ts.isIdentifier(callee)
            ? callee.text
            : "";
        if (name === "helperMethod") {
          const flatten = (arg: ts.Expression): void => {
            if (ts.isStringLiteral(arg)) names.push(arg.text);
            else if (ts.isArrayLiteralExpression(arg)) arg.elements.forEach(flatten);
          };
          node.arguments.forEach(flatten);
        } else if (name === "include") {
          for (const arg of node.arguments.slice(1)) {
            const included = sourceDeclaration(checker, arg);
            if (included) scan(included);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(declaration);
    if (!ts.isClassDeclaration(declaration)) return;
    const superclass = declaration.heritageClauses?.find(
      (h) => h.token === ts.SyntaxKind.ExtendsKeyword,
    )?.types[0];
    const parent = superclass && sourceDeclaration(checker, superclass.expression);
    if (parent && ts.isClassDeclaration(parent)) scan(parent);
  };
  scan(klass);
  return names;
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

function renderedPartial(
  call: ts.CallExpression,
): { name: string; locals?: ts.Expression } | undefined {
  if (!ts.isIdentifier(call.expression) || call.expression.text !== "render") return undefined;
  const [first, second] = call.arguments;
  if (first && ts.isStringLiteral(first)) return { name: first.text, locals: second };
  if (!first || !ts.isObjectLiteralExpression(first)) return undefined;
  const option = (key: string): ts.Expression | undefined =>
    first.properties.find(
      (p): p is ts.PropertyAssignment =>
        ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === key,
    )?.initializer;
  const partial = option("partial");
  if (partial && ts.isStringLiteral(partial))
    return { name: partial.text, locals: option("locals") };
  return undefined;
}

function templateScope(
  appDir: string,
  rel: string,
  shimDir: string,
  helpers: readonly string[],
  controllers: readonly Controller[],
): Pick<ViewShim, "view" | "locals" | "base" | "controller" | "layout"> {
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
    if (fs.existsSync(model)) {
      const klass = constantName([...namespace, element].join("/"));
      locals.set(element, new Set([`import(${JSON.stringify(model)}).${klass}`]));
    }
  }
  return {
    view,
    locals,
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

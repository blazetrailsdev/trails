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
      ...templateScope(appDir, rel, path.dirname(outBase), helpers),
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
    let program = ts.createProgram([...shimPaths], EMIT_OPTIONS, host);
    if (bindCheckedTypes(views, program)) {
      for (const view of views) writeShim(view, viewsDir);
      program = ts.createProgram([...shimPaths], EMIT_OPTIONS, host, program);
    }
    emitDeclarations(program, host);
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
    .filter((file) => /[-_]helper\.ts$/u.test(file) && !file.endsWith(".d.ts"));
  return names.sort();
}

function importPath(fromDir: string, file: string): string {
  const rel = path.relative(fromDir, file).split(path.sep).join("/").replace(/\.ts$/u, ".js");
  return JSON.stringify(rel.startsWith(".") ? rel : `./${rel}`);
}

function constantName(path_: string): string {
  return camelize(underscore(path_)).split("::").join("");
}

function helperMethodNames(files: readonly string[]): string[] {
  const names: string[] = [];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.ESNext);
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "helperMethod"
      ) {
        for (const arg of node.arguments) if (ts.isStringLiteral(arg)) names.push(arg.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return names;
}

interface ViewShim {
  rel: string;
  src: string;
  outBase: string;
  strictLocals: boolean;
  view: string[];
  locals: Map<string, Set<string>>;
  controller?: { file: string; name: string; exposed: string[] };
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

function bindCheckedTypes(views: ViewShim[], program: ts.Program): boolean {
  const checker = program.getTypeChecker();
  const typeText = (type: ts.Type): string =>
    checker.typeToString(
      type,
      undefined,
      ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseFullyQualifiedType,
    );
  let changed = false;
  const partials = new Map<string, ViewShim>();
  for (const view of views) {
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
        for (const prop of passed.locals.properties) {
          if (!(ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop))) continue;
          if (!ts.isIdentifier(prop.name)) continue;
          const at = ts.isPropertyAssignment(prop) ? prop.initializer : prop.name;
          const types = target.locals.get(prop.name.text) ?? new Set<string>();
          types.add(typeText(checker.getBaseTypeOfLiteralType(checker.getTypeAtLocation(at))));
          target.locals.set(prop.name.text, types);
          changed = true;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    const controller = view.controller && program.getSourceFile(view.controller.file);
    const klass = controller?.statements.find(
      (s): s is ts.ClassDeclaration =>
        ts.isClassDeclaration(s) && s.name?.text === view.controller!.name,
    );
    const instance =
      klass?.name && checker.getDeclaredTypeOfSymbol(checker.getSymbolAtLocation(klass.name)!);
    if (!instance || !klass) continue;
    const members = view.controller!.exposed.flatMap((name) => {
      const member = instance.getProperty(name);
      return member
        ? [`${name}: ${typeText(checker.getTypeOfSymbolAtLocation(member, klass))}`]
        : [];
    });
    if (members.length > 0) {
      view.view.push(`{ ${members.join("; ")} }`);
      changed = true;
    }
  }
  return changed;
}

function renderedPartial(
  call: ts.CallExpression,
): { name: string; locals: ts.ObjectLiteralExpression } | undefined {
  if (!ts.isIdentifier(call.expression) || call.expression.text !== "render") return undefined;
  const [first, second] = call.arguments;
  if (first && ts.isStringLiteral(first) && second && ts.isObjectLiteralExpression(second)) {
    return { name: first.text, locals: second };
  }
  if (!first || !ts.isObjectLiteralExpression(first)) return undefined;
  const option = (key: string): ts.Expression | undefined =>
    first.properties.find(
      (p): p is ts.PropertyAssignment =>
        ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === key,
    )?.initializer;
  const partial = option("partial");
  const locals = option("locals");
  if (partial && ts.isStringLiteral(partial) && locals && ts.isObjectLiteralExpression(locals)) {
    return { name: partial.text, locals };
  }
  return undefined;
}

function templateScope(
  appDir: string,
  rel: string,
  shimDir: string,
  helpers: readonly string[],
): Pick<ViewShim, "view" | "locals" | "controller"> {
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
  const controllersDir = path.join(appDir, "controllers");
  const file = path.join(
    controllersDir,
    `${prefix.split("/").map(dasherize).join("/")}-controller.ts`,
  );
  let controller: ViewShim["controller"];
  if (prefix !== "." && fs.existsSync(file)) {
    const name = `${constantName(prefix)}Controller`;
    const klass = `import(${importPath(shimDir, file)}).${name}`;
    view.push(
      `{ [K in keyof ${klass} as K extends keyof import("@blazetrails/actionpack").ActionController.Base ? never : ${klass}[K] extends (...args: never) => unknown ? never : K]: ${klass}[K] }`,
    );
    const concerns = path.join(controllersDir, "concerns");
    const exposed = helperMethodNames([
      path.join(controllersDir, "application-controller.ts"),
      file,
      ...(fs.existsSync(concerns)
        ? fs
            .readdirSync(concerns, { recursive: true, encoding: "utf8" })
            .filter((f) => f.endsWith(".ts"))
            .map((f) => path.join(concerns, f))
        : []),
    ]);
    controller = { file, name, exposed };
  }
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
  return { view, locals, controller };
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

function emitDeclarations(program: ts.Program, host: ts.CompilerHost): void {
  const emitResult = program.emit();
  if (emitResult.emitSkipped) {
    const diagnostics = [...ts.getPreEmitDiagnostics(program), ...emitResult.diagnostics];
    const formatted = ts.formatDiagnostics(ts.sortAndDeduplicateDiagnostics(diagnostics), host);
    throw new Error(`declaration emit failed:\n${formatted}`);
  }
}

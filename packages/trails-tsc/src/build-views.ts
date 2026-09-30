import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript-5";
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
  const shimPaths: string[] = [];
  const appDir = path.dirname(viewsDir);
  const helpers = allHelpersFromPath(path.join(appDir, "helpers"));
  for (const rel of files) {
    const src = fs.readFileSync(path.join(viewsDir, rel), "utf8");
    const srcAbsPath = path.join(viewsDir, rel);
    const mapAbsDir = path.dirname(path.join(outViews, rel));
    const scope = templateScope(appDir, rel, mapAbsDir, helpers);
    const { ts: shim, mappings } = virtualizeTseWithDeltas(src, scope);
    const sourceFileName = path.relative(mapAbsDir, srcAbsPath).split(path.sep).join("/");
    const outBase = path.join(outViews, rel);
    fs.mkdirSync(path.dirname(outBase), { recursive: true });
    fs.writeFileSync(outBase + ".ts", shim + `//# sourceMappingURL=${path.basename(rel)}.ts.map\n`);
    const shimMap = generateSourceMap(path.basename(rel) + ".ts", sourceFileName, src, mappings);
    fs.writeFileSync(outBase + ".ts.map", JSON.stringify(shimMap));
    shimPaths.push(outBase + ".ts");
    const ast = parse(src);
    const registryKey = partialRegistryKey(rel);
    if (registryKey !== null && ast.localsSignature !== null) {
      const locals = parseLocalsSignature(ast.localsSignature);
      const existing = registryMap.get(registryKey) ?? [];
      registryMap.set(registryKey, [...existing, localsParamType(ast, locals)]);
    }
  }
  emitDeclarations(shimPaths);
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

function camelize(name: string): string {
  return name.replace(/(?:^|[-_])([a-z\d])/gu, (_, c: string) => c.toUpperCase());
}

function importPath(fromDir: string, file: string): string {
  const rel = path.relative(fromDir, file).split(path.sep).join("/").replace(/\.ts$/u, ".js");
  return JSON.stringify(rel.startsWith(".") ? rel : `./${rel}`);
}

function templateScope(
  appDir: string,
  rel: string,
  shimDir: string,
  helpers: readonly string[],
): TseScope {
  const view = ['import("@blazetrails/actionview").Base'];
  for (const file of helpers) {
    const name = camelize(path.posix.basename(file, ".ts").replace(/[-_]helper$/u, ""));
    view.push(
      `(typeof import(${importPath(shimDir, path.join(appDir, "helpers", file))}))["${name}Helper"]`,
    );
  }
  view.push(
    "{ [name: `${string}Path`]: (...args: unknown[]) => string; [name: `${string}Url`]: (...args: unknown[]) => string }",
    'Record<"alert" | "notice", unknown>',
  );
  const prefix = path.posix.dirname(rel);
  const controller = path.join(appDir, "controllers", `${prefix}-controller.ts`);
  if (prefix !== "." && fs.existsSync(controller)) {
    const klass = `import(${importPath(shimDir, controller)}).${camelize(path.posix.basename(prefix))}Controller`;
    view.push(
      `{ [K in keyof ${klass} as K extends keyof import("@blazetrails/actionpack").ActionController.Base ? never : ${klass}[K] extends (...args: never) => unknown ? never : K]: ${klass}[K] }`,
    );
  }
  const scope: TseScope = { view: view.join(" & ") };
  const partial = /^_([a-z_]\w*)/u.exec(path.posix.basename(rel));
  if (partial !== null && prefix !== ".") {
    const element = partial[1];
    const model = path.join(
      appDir,
      "models",
      ...prefix.split("/").slice(0, -1),
      `${element.replace(/_/gu, "-")}.ts`,
    );
    if (fs.existsSync(model)) {
      scope.locals = `{ ${element}: import(${importPath(shimDir, model)}).${camelize(element)} }`;
    }
  }
  return scope;
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

function emitDeclarations(shimPaths: readonly string[]): void {
  if (shimPaths.length === 0) return;
  const opts: ts.CompilerOptions = {
    declaration: true,
    declarationMap: true,
    emitDeclarationOnly: true,
    skipLibCheck: true,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ESNext,
  };
  const host = ts.createCompilerHost(opts, true);
  const program = ts.createProgram([...shimPaths], opts, host);
  const emitResult = program.emit();
  if (emitResult.emitSkipped) {
    const diagnostics = [...ts.getPreEmitDiagnostics(program), ...emitResult.diagnostics];
    const formatted = ts.formatDiagnostics(ts.sortAndDeduplicateDiagnostics(diagnostics), host);
    throw new Error(`declaration emit failed:\n${formatted}`);
  }
}

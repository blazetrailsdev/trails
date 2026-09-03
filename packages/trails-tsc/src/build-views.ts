import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";
import { compileJs, parse, generateSourceMap } from "@blazetrails/tse-compiler";
import { virtualizeTseWithDeltas, parseLocalsSignature, localsParamType } from "./plugins/tse.js";
import { remapLine } from "./remap.js";

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
  fs.mkdirSync(outViews, { recursive: true });
  const registryMap = new Map<string, string[]>();
  const shimPaths: string[] = [];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(viewsDir, rel), "utf8");
    const { ts: shim, deltas } = virtualizeTseWithDeltas(src);
    const jsFileName = path.basename(rel) + ".js";
    const srcAbsPath = path.join(viewsDir, rel);
    const mapAbsDir = path.dirname(path.join(outViews, rel));
    const sourceFileName = path.relative(mapAbsDir, srcAbsPath).split(path.sep).join("/");
    const result = compileJs(src, { fileName: jsFileName, sourceFileName });
    const outBase = path.join(outViews, rel);
    fs.mkdirSync(path.dirname(outBase), { recursive: true });
    const shimWithUrl = shim + `//# sourceMappingURL=${path.basename(rel)}.ts.map\n`;
    fs.writeFileSync(outBase + ".ts", shimWithUrl);
    const shimMap = deltasToSourceMap(
      path.basename(rel) + ".ts",
      sourceFileName,
      src,
      shim,
      deltas,
    );
    fs.writeFileSync(outBase + ".ts.map", JSON.stringify(shimMap));
    const jsCode = result.sourceMap
      ? result.code + `//# sourceMappingURL=${path.basename(rel)}.js.map\n`
      : result.code;
    fs.writeFileSync(outBase + ".js", jsCode);
    if (result.sourceMap) {
      fs.writeFileSync(outBase + ".js.map", JSON.stringify(result.sourceMap));
    }
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
  fs.writeFileSync(path.join(outDir, "views-manifest.ts"), emitManifest(files));
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

function manifestKey(rel: string): string {
  return rel.replace(/\.tse$/u, "");
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

function deltasToSourceMap(
  file: string,
  sourceFile: string,
  sourceContent: string,
  shimText: string,
  deltas: readonly import("./plugin.js").LineDelta[],
): import("@blazetrails/tse-compiler").RawSourceMap {
  const totalLines = shimText.split("\n").length;
  const mappings: import("@blazetrails/tse-compiler").LineMapping[] = [];
  for (let v = 0; v < totalLines; v++) {
    const s = remapLine(v, deltas);
    if (s !== null) mappings.push({ genLine: v, srcLine: s });
  }
  return generateSourceMap(file, sourceFile, sourceContent, mappings);
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

function emitManifest(files: readonly string[]): string {
  const lines: string[] = [
    "// AUTO-GENERATED by `trails-tsc-views build` — do not edit.",
    "// Regenerate by running `trails-tsc-views build`.",
    "",
    "export const views = {",
  ];
  for (const rel of files) {
    const key = manifestKey(rel);
    const spec = "./views/" + rel + ".js";
    lines.push(`  ${JSON.stringify(key)}: () => import(${JSON.stringify(spec)}),`);
  }
  lines.push(
    "} as const;",
    "",
    "export type ViewKey = keyof typeof views;",
    "",
    "/** Mapped-type registry — value is the loaded template module's default export. */",
    'export type ViewsManifest = { [K in ViewKey]: Awaited<ReturnType<(typeof views)[K]>>["default"] };',
    "",
  );
  return lines.join("\n");
}

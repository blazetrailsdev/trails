import ts from "typescript-5";
import { Dir, File, TopLevel, getFs, getPath, type Pathname } from "@blazetrails/ruby-compat";
import { Registry, writeArtifacts } from "@blazetrails/zeitwerk";
import { buildViews } from "./build-views.js";

interface BootInitializer {
  name: string;
  belongsTo(group: string): boolean;
  run(...args: unknown[]): unknown;
}

interface BootLoader {
  setup?(): Promise<void>;
  eagerLoad?(): Promise<void>;
}

interface BootPaths {
  get(
    path: string,
  ): { toAry(): string[]; extensions(): string[] | undefined; existent(): string[] } | undefined;
}

interface BootEngine {
  config: { root: Pathname | null };
  paths?(): BootPaths;
}

interface BootApplication extends BootEngine {
  config: BootEngine["config"] & { helpersPaths?: readonly string[] };
  railties?(): Iterable<object>;
  initializers: { tsort(): BootInitializer[] };
  initialized?(): boolean;
  autoloaders?: Partial<Record<"main" | "once", BootLoader>>;
}

/** @noRailsEquivalent PERMANENT */
export async function buildAutoload({
  cwd = Dir.pwd(),
  views = false,
}: { cwd?: string; views?: boolean } = {}): Promise<string[]> {
  let applicationFile: string | undefined;
  for (const ext of ["ts", "js"]) {
    const application = File.expandPath(`config/application.${ext}`, cwd);
    if (await File.isExistAsync(application)) {
      applicationFile = application;
      await import(getPath().pathToFileURL!(application).href);
      break;
    }
  }

  const trails = (TopLevel as { Trails?: { application?: BootApplication | null } }).Trails;
  const application = trails?.application;
  if (views && application != null) {
    for (const dir of application.paths?.().get("app/views")?.existent() ?? []) {
      if ((await File.isDirectoryAsync(dir)) && `${dir}/`.includes("/app/views/")) {
        await buildViews({
          cwd: application.config.root?.toString() ?? cwd,
          viewsDir: dir,
          inPlace: true,
        });
      }
    }
  }
  let loaders: BootLoader[] = [];
  if (application != null) {
    loaders = [application.autoloaders?.once, application.autoloaders?.main].filter(
      (loader): loader is BootLoader => loader != null,
    );
  }
  if (application != null && !application.initialized?.()) {
    const own = loaders.map((loader) => Object.getOwnPropertyDescriptors(loader));
    for (const loader of loaders) loader.setup = loader.eagerLoad = async () => {};
    try {
      for (const initializer of application.initializers.tsort()) {
        if (initializer.belongsTo("default")) await initializer.run(application);
        if (initializer.name === "setup_main_autoloader") break;
      }
    } finally {
      loaders.forEach((loader, i) => {
        delete loader.setup;
        delete loader.eagerLoad;
        for (const name of ["setup", "eagerLoad"] as const) {
          if (own[i][name] !== undefined) Object.defineProperty(loader, name, own[i][name]);
        }
      });
    }
  }

  const root = application?.config.root?.toString() ?? cwd;
  const dirs: string[] = [];
  const tagged: [string, string][] = [];
  for (const loader of [...Registry.loaders]) {
    if (application?.initialized?.()) await loader.unload();
    loader.manifestRoot ??= root;
    const dir = await writeArtifacts(loader);
    dirs.push(dir);
    if (loaders.includes(loader)) tagged.push([loader.tag, dir]);
  }
  if (application != null && applicationFile !== undefined) {
    const environmentFile = File.join(
      File.dirname(applicationFile),
      `environment${File.extname(applicationFile)}`,
    );
    if (await File.isExistAsync(environmentFile)) {
      const trailsDir = File.expandPath(".trails", root);
      await writeBoot(trailsDir, root, application, environmentFile);
      await writeEntry(trailsDir, root, applicationFile, environmentFile, tagged);
    }
  }
  return dirs;
}

const BOOT_PATHS = [
  "config/routes.ts",
  "config/routes",
  "config/environments",
  "config/initializers",
  "db/seeds.ts",
  "app/helpers",
  "app/views",
  "config",
];

/** @noRailsEquivalent PERMANENT */
const CONFIG_FILE = /^(?!.*\.d\.[cm]?ts$)(?!.*\.test\.)[^/]+\.[cm]?[tj]s$/;

/** @noRailsEquivalent PERMANENT */
async function configFiles(dir: string, out: Set<string>, top = true): Promise<void> {
  for (const entry of Dir.children(dir).slice().sort()) {
    const full = File.join(dir, entry);
    if (top && entry === "storage" && (await File.isDirectoryAsync(full))) {
      await configFiles(full, out, false);
    } else if (CONFIG_FILE.test(entry) && !(await File.isDirectoryAsync(full))) {
      out.add(full);
    }
  }
}

/** @noRailsEquivalent PERMANENT */
const HELPER_FILE = /[-_]helper\.[cm]?[tj]s$/;

/** @noRailsEquivalent PERMANENT */
async function helperFiles(dir: string, out: Set<string>): Promise<void> {
  for (const entry of Dir.children(dir).slice().sort()) {
    const full = File.join(dir, entry);
    if (await File.isDirectoryAsync(full)) {
      await helperFiles(full, out);
    } else if (HELPER_FILE.test(entry) && !/\.(test|d)\./.test(entry)) {
      out.add(full);
    }
  }
}

/** @noRailsEquivalent PERMANENT */
async function viewEntries(
  trailsDir: string,
  root: string,
  dir: string,
  out: [string, string][],
): Promise<void> {
  const path = getPath();
  const at = `${dir}/`.lastIndexOf("/app/views/");
  if (at === -1) return;
  const outViews = File.join(dir.slice(0, at), ".trails/views");
  for (const rel of (await Dir.globAsync("**/*", 0, { base: dir })).sort()) {
    const file = File.join(dir, rel);
    const compiled = File.join(outViews, `${rel}.js`);
    if ((await File.isDirectoryAsync(file)) || !(await File.isExistAsync(compiled))) continue;
    let source = "";
    for (const byte of await File.binreadAsync(file)) source += String.fromCharCode(byte);
    const specifier = path.relative!(trailsDir, compiled);
    const key = path.relative!(root, file);
    out.push([
      key,
      `  ${JSON.stringify(key)}: async () => ({ ...(await import(${JSON.stringify(specifier.startsWith(".") ? specifier : `./${specifier}`)})), source: ${JSON.stringify(source)} }),`,
    ]);
  }
}

/** @noRailsEquivalent PERMANENT */
const LOADED_PATHS = new Set([
  "config/routes.ts",
  "config/routes",
  "config/environments",
  "config/initializers",
  "db/seeds.ts",
]);

/**
 * Writes `file` to `.trails/compiled/` with its top-level statements in an
 * exported function, so a registered thunk evaluates the body on each call as
 * `Kernel#load` does, and a bundle that inlines every dynamic import
 * (Rollup's `inlineDynamicImports`) evaluates only the declaration at load.
 * Imports and type declarations stay at the top level; exports are answered
 * by the function.
 *
 * @noRailsEquivalent PERMANENT
 */
async function writeLoadFunction(trailsDir: string, root: string, file: string): Promise<string> {
  const path = getPath();
  const out = File.join(
    trailsDir,
    "compiled",
    ...path.relative!(root, file)
      .split("/")
      .map((segment) => (segment === ".." ? "__parent" : segment)),
  );
  const dir = File.dirname(file);
  const outDir = File.dirname(out);
  const text = await getFs().readFile(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const typed = /\.[cm]?ts$/.test(file);
  const top: string[] = [];
  const body: string[] = [];
  const names: string[] = [];
  const rewrite = (spec: ts.Expression) => {
    const value = (spec as ts.StringLiteral).text;
    if (!value.startsWith(".")) return spec.getText(sf);
    const relative = path.relative!(outDir, File.expandPath(value, dir));
    return JSON.stringify(relative.startsWith(".") ? relative : `./${relative}`);
  };
  const isExported = (node: ts.Node) =>
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const bodyText = (node: ts.Node) => {
    const edits: [number, number, string][] = [];
    const visit = (child: ts.Node): void => {
      if (ts.isMetaProperty(child) && child.keywordToken === ts.SyntaxKind.ImportKeyword) {
        edits.push([child.getStart(sf), child.getEnd(), "__importMeta"]);
        meta = true;
        return;
      }
      if (
        ts.isCallExpression(child) &&
        child.expression.kind === ts.SyntaxKind.ImportKeyword &&
        child.arguments[0] !== undefined &&
        ts.isStringLiteralLike(child.arguments[0])
      ) {
        const spec = child.arguments[0];
        edits.push([spec.getStart(sf), spec.getEnd(), rewrite(spec)]);
      }
      ts.forEachChild(child, visit);
    };
    visit(node);
    let out = text.slice(node.getStart(sf), node.getEnd());
    for (const [start, end, value] of edits.reverse()) {
      out = out.slice(0, start - node.getStart(sf)) + value + out.slice(end - node.getStart(sf));
    }
    return out;
  };
  const strip = (node: ts.Node) =>
    bodyText(node)
      .replace(/^export\s+default\s+/, "")
      .replace(/^export\s+/, "");
  let reexports = 0;
  let meta = false;
  for (const statement of sf.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier !== undefined &&
      !statement.isTypeOnly
    ) {
      const ns = `__reexport${(reexports += 1)}`;
      top.push(`import * as ${ns} from ${rewrite(statement.moduleSpecifier)};`);
      const clause = statement.exportClause;
      if (clause === undefined) {
        body.push(
          `for (const [name, value] of Object.entries(${ns})) if (name !== "default") __exports[name] = value;`,
        );
      } else if (ts.isNamespaceExport(clause)) {
        body.push(`__exports[${JSON.stringify(clause.name.text)}] = ${ns};`);
      } else {
        for (const spec of clause.elements) {
          if (spec.isTypeOnly) continue;
          body.push(
            `__exports[${JSON.stringify(spec.name.text)}] = ${ns}[${JSON.stringify((spec.propertyName ?? spec.name).text)}];`,
          );
        }
      }
    } else if (
      (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier !== undefined
    ) {
      const spec = statement.moduleSpecifier;
      top.push(
        `${text.slice(statement.getStart(sf), spec.getStart(sf))}${rewrite(spec)}${text.slice(spec.getEnd(), statement.getEnd())}`,
      );
    } else if (
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isModuleDeclaration(statement) ||
      (ts.canHaveModifiers(statement) &&
        (ts.getModifiers(statement) ?? []).some((m) => m.kind === ts.SyntaxKind.DeclareKeyword))
    ) {
      top.push(statement.getText(sf));
    } else if (ts.isExportAssignment(statement)) {
      body.push(`__exports.default = ${bodyText(statement.expression)};`);
    } else if (ts.isExportDeclaration(statement)) {
      const clause = statement.exportClause;
      if (clause !== undefined && ts.isNamedExports(clause) && !statement.isTypeOnly) {
        for (const spec of clause.elements) {
          if (!spec.isTypeOnly)
            body.push(
              `__exports[${JSON.stringify(spec.name.text)}] = ${(spec.propertyName ?? spec.name).getText(sf)};`,
            );
        }
      }
    } else if (isExported(statement)) {
      const isDefault = (ts.getModifiers(statement as ts.HasModifiers) ?? []).some(
        (m) => m.kind === ts.SyntaxKind.DefaultKeyword,
      );
      if (
        isDefault &&
        (statement as ts.FunctionDeclaration | ts.ClassDeclaration).name === undefined
      ) {
        body.push(`__exports.default = ${strip(statement)};`);
        continue;
      }
      body.push(strip(statement));
      const declared = ts.isVariableStatement(statement)
        ? statement.declarationList.declarations.map((d) => d.name)
        : [(statement as ts.FunctionDeclaration | ts.ClassDeclaration).name];
      for (const name of declared) {
        if (name === undefined || !ts.isIdentifier(name)) continue;
        names.push(
          `__exports[${JSON.stringify(isDefault ? "default" : name.text)}] = ${name.text};`,
        );
      }
    } else {
      body.push(bodyText(statement));
    }
  }
  const original = path.relative!(outDir, file);
  if (meta) {
    top.push(
      'import { getPath as __getPath } from "@blazetrails/ruby-compat";',
      `const __importUrl = new URL(${JSON.stringify(original)}, import.meta.url).href;`,
      "const __importFilename = __getPath().fileURLToPath(__importUrl);",
      `const __importMeta = { ...import.meta, url: __importUrl, filename: __importFilename, dirname: __importFilename.slice(0, __importFilename.lastIndexOf("/")), resolve: (specifier${typed ? ": string" : ""}) => (/^\\.{0,2}\\//.test(specifier) ? new URL(specifier, __importUrl).href : import.meta.resolve(specifier)) };`,
    );
  }
  const source = [
    ...top,
    "",
    "export default async function () {",
    `  const __exports${typed ? ": Record<string, unknown>" : ""} = {};`,
    ...body.flatMap((statement) => statement.split("\n").map((line) => `  ${line}`)),
    ...names.map((line) => `  ${line}`),
    "  return __exports;",
    "}",
    "",
  ].join("\n");
  await getFs().mkdir!(outDir, { recursive: true });
  await getFs().writeFile!(out, source);
  return out;
}

async function writeBoot(
  trailsDir: string,
  root: string,
  application: BootApplication,
  environmentFile?: string,
): Promise<void> {
  const path = getPath();
  const engines = [application, ...(application.railties?.() ?? [])].filter(
    (engine): engine is BootEngine => typeof (engine as BootEngine).paths === "function",
  );
  const files = new Set<string>();
  const loaded = new Set<string>();
  const viewImports: [string, string][] = [];
  for (const engine of engines) {
    const engineRoot = engine.config.root ?? root;
    for (const key of BOOT_PATHS) {
      const node = engine.paths!().get(key);
      if (node === undefined) continue;
      if (key === "config") {
        for (const dir of node.existent()) {
          if (await File.isDirectoryAsync(dir)) await configFiles(dir, files);
        }
        continue;
      }
      if (key === "app/views") {
        for (const dir of node.existent()) {
          if (!(await File.isDirectoryAsync(dir))) continue;
          await viewEntries(trailsDir, root, dir, viewImports);
        }
        continue;
      }
      if (key === "app/helpers") {
        for (const dir of node.existent()) {
          if (await File.isDirectoryAsync(dir)) await helperFiles(dir, files);
        }
        continue;
      }
      if (key !== "config/environments") {
        for (const file of node.existent()) {
          files.add(file);
          if (LOADED_PATHS.has(key) && !(await File.isDirectoryAsync(file))) loaded.add(file);
        }
        continue;
      }
      const glob = `*.{${(node.extensions() ?? ["ts", "js"]).join(",")}}`;
      for (const raw of node.toAry()) {
        const dir = File.expandPath(raw, engineRoot);
        if (!(await File.isDirectoryAsync(dir))) continue;
        for (const file of (await Dir.globAsync(glob, 0, { base: dir })).sort()) {
          if (!File.basename(file, File.extname(file)).includes(".")) {
            files.add(File.join(dir, file));
            loaded.add(File.join(dir, file));
          }
        }
      }
    }
  }
  for (const dir of application.config.helpersPaths ?? []) {
    if (await File.isDirectoryAsync(dir)) await helperFiles(dir, files);
  }
  if (environmentFile !== undefined) loaded.add(environmentFile);
  const entries: string[] = [];
  for (const file of files) {
    const key = JSON.stringify(path.relative!(root, file));
    if (!loaded.has(file)) {
      const specifier = path.relative!(trailsDir, file);
      entries.push(
        `  ${key}: () => import(${JSON.stringify(specifier.startsWith(".") ? specifier : `./${specifier}`)}),`,
      );
      continue;
    }
    const specifier = path.relative!(trailsDir, await writeLoadFunction(trailsDir, root, file));
    entries.push(
      `  ${key}: async () => (await import(${JSON.stringify(specifier.startsWith(".") ? specifier : `./${specifier}`)})).default(),`,
    );
  }
  const boot = [
    `import { ${viewImports.length === 0 ? "" : "loadIseqEval, "}registerCompiledFiles } from "@blazetrails/ruby-compat";`,
    'import { Application } from "@blazetrails/trailties";',
    "",
    "const root = Application.findRoot(import.meta.dirname);",
    "registerCompiledFiles(root, {",
    ...entries,
    ...viewImports.map(([, entry]) => entry),
    "});",
    "",
    ...(viewImports.length === 0
      ? []
      : [
          "await Promise.all(",
          `  ${JSON.stringify(viewImports.map(([rel]) => rel))}.map((view) =>`,
          "    loadIseqEval(`${root}/${view}`),",
          "  ),",
          ");",
          "",
        ]),
  ].join("\n");
  await getFs().mkdir!(trailsDir, { recursive: true });
  await getFs().writeFile!(File.join(trailsDir, "boot.generated.js"), boot);
}

async function writeEntry(
  trailsDir: string,
  root: string,
  applicationFile: string,
  environmentFile: string,
  tagged: [string, string][],
): Promise<void> {
  const specifier = (from: string, to: string) => {
    const relative = getPath().relative!(from, to);
    return relative.startsWith(".") ? relative : `./${relative}`;
  };
  const autoloadDir = File.join(trailsDir, "autoload");
  const imports = tagged.flatMap(([, dir], i) => [
    `import { imports as imports${i} } from ${JSON.stringify(specifier(autoloadDir, File.join(dir, "imports.generated.js")))};`,
    `import manifest${i} from ${JSON.stringify(specifier(autoloadDir, File.join(dir, "manifest.json")))} with { type: "json" };`,
  ]);
  const byTag = tagged.map(([tag], i) => `  ${JSON.stringify(tag)}: [imports${i}, manifest${i}],`);
  const install = [
    'import "../boot.generated.js";',
    'import "@blazetrails/ruby-compat/psych-yaml";',
    'import { Trails } from "@blazetrails/trailties";',
    `import ${JSON.stringify(specifier(autoloadDir, applicationFile))};`,
    ...imports,
    "",
    `const byTag = {\n${byTag.join("\n")}\n};`,
    "",
    "Trails.autoloaders.each((loader) => {",
    "  if (Object.hasOwn(byTag, loader.tag)) [loader.imports, loader.manifest] = byTag[loader.tag];",
    "});",
    "",
  ].join("\n");
  const entry = [
    'import { loadedFileExports, rbFRequireFile } from "@blazetrails/ruby-compat";',
    'import { Application } from "@blazetrails/trailties";',
    'import "./autoload/install.generated.js";',
    "",
    "export default async () => {",
    `  const environment = \`\${Application.findRoot(import.meta.dirname)}/${getPath().relative!(root, environmentFile)}\`;`,
    "  await rbFRequireFile(environment);",
    "  return loadedFileExports(environment).default;",
    "};",
    "",
  ].join("\n");
  const fs = getFs();
  await fs.mkdir!(autoloadDir, { recursive: true });
  await fs.writeFile!(File.join(autoloadDir, "install.generated.js"), install);
  await fs.writeFile!(File.join(trailsDir, "entry.generated.js"), entry);
}

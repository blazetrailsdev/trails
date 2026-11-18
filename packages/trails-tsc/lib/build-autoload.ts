import { Dir, File, TopLevel, getFs, getPath } from "@blazetrails/ruby-compat";
import { Registry, writeArtifacts } from "@blazetrails/zeitwerk";

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
  ):
    | { toAry(): string[]; extensions(): string[] | undefined; existent(): Promise<string[]> }
    | undefined;
}

interface BootEngine {
  config: { root: string | null };
  paths?(): BootPaths;
}

interface BootApplication extends BootEngine {
  config: BootEngine["config"] & { helpersPaths?: readonly string[] };
  railties?(): Iterable<object>;
  initializers: { tsort(): BootInitializer[] };
  autoloaders?: Partial<Record<"main" | "once", BootLoader>>;
}

/** @noRailsEquivalent PERMANENT */
export async function buildAutoload({ cwd = Dir.pwd() }: { cwd?: string } = {}): Promise<string[]> {
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
  let loaders: BootLoader[] = [];
  if (application != null) {
    loaders = [application.autoloaders?.once, application.autoloaders?.main].filter(
      (loader): loader is BootLoader => loader != null,
    );
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

  const root = application?.config.root ?? cwd;
  const dirs: string[] = [];
  const tagged: [string, string][] = [];
  for (const loader of [...Registry.loaders]) {
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
      await writeBoot(trailsDir, root, application);
      await writeEntry(trailsDir, applicationFile, environmentFile, tagged);
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

async function writeBoot(
  trailsDir: string,
  root: string,
  application: BootApplication,
): Promise<void> {
  const path = getPath();
  const engines = [application, ...(application.railties?.() ?? [])].filter(
    (engine): engine is BootEngine => typeof (engine as BootEngine).paths === "function",
  );
  const files = new Set<string>();
  const views: [string, string][] = [];
  for (const engine of engines) {
    const engineRoot = engine.config.root ?? root;
    for (const key of BOOT_PATHS) {
      const node = engine.paths!().get(key);
      if (node === undefined) continue;
      if (key === "config") {
        for (const dir of await node.existent()) {
          if (await File.isDirectoryAsync(dir)) await configFiles(dir, files);
        }
        continue;
      }
      if (key === "app/views") {
        for (const dir of await node.existent()) {
          if (await File.isDirectoryAsync(dir)) await viewEntries(trailsDir, root, dir, views);
        }
        continue;
      }
      if (key === "app/helpers") {
        for (const dir of await node.existent()) {
          if (await File.isDirectoryAsync(dir)) await helperFiles(dir, files);
        }
        continue;
      }
      if (key !== "config/environments") {
        for (const file of await node.existent()) files.add(file);
        continue;
      }
      const glob = `*.{${(node.extensions() ?? ["ts", "js"]).join(",")}}`;
      for (const raw of node.toAry()) {
        const dir = File.expandPath(raw, engineRoot);
        if (!(await File.isDirectoryAsync(dir))) continue;
        for (const file of (await Dir.globAsync(glob, 0, { base: dir })).sort()) {
          if (!File.basename(file, File.extname(file)).includes("."))
            files.add(File.join(dir, file));
        }
      }
    }
  }
  for (const dir of application.config.helpersPaths ?? []) {
    if (await File.isDirectoryAsync(dir)) await helperFiles(dir, files);
  }
  const entries = [...files].map((file) => {
    const specifier = path.relative!(trailsDir, file);
    return `  ${JSON.stringify(path.relative!(root, file))}: () => import(${JSON.stringify(specifier.startsWith(".") ? specifier : `./${specifier}`)}),`;
  });
  const boot = [
    `import { ${views.length === 0 ? "" : "loadIseqEval, "}registerCompiledFiles } from "@blazetrails/ruby-compat";`,
    'import { Application } from "@blazetrails/trailties";',
    "",
    "const root = Application.findRoot(import.meta.dirname);",
    "registerCompiledFiles(root, {",
    ...entries,
    ...views.map(([, entry]) => entry),
    "});",
    "",
    ...(views.length === 0
      ? []
      : [
          "await Promise.all(",
          `  ${JSON.stringify(views.map(([rel]) => rel))}.map((view) =>`,
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
    'import "./autoload/install.generated.js";',
    `export default (await import(${JSON.stringify(specifier(trailsDir, environmentFile))})).default;`,
    "",
  ].join("\n");
  const fs = getFs();
  await fs.mkdir!(autoloadDir, { recursive: true });
  await fs.writeFile!(File.join(autoloadDir, "install.generated.js"), install);
  await fs.writeFile!(File.join(trailsDir, "entry.generated.js"), entry);
}

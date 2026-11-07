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

interface BootApplication {
  config: { root: string | null };
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
      await writeEntry(File.expandPath(".trails", root), applicationFile, environmentFile, tagged);
    }
  }
  return dirs;
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
  const imports = tagged.map(
    ([, dir], i) =>
      `import { imports as imports${i} } from ${JSON.stringify(specifier(autoloadDir, File.join(dir, "imports.generated.js")))};`,
  );
  const byTag = tagged.map(([tag], i) => `  ${JSON.stringify(tag)}: imports${i},`);
  const install = [
    'import { Trails } from "@blazetrails/trailties";',
    `import ${JSON.stringify(specifier(autoloadDir, applicationFile))};`,
    ...imports,
    "",
    `const byTag = {\n${byTag.join("\n")}\n};`,
    "",
    "Trails.autoloaders.each((loader) => {",
    "  if (Object.hasOwn(byTag, loader.tag)) loader.imports = byTag[loader.tag];",
    "});",
    "",
  ].join("\n");
  const entry = [
    'import "./autoload/install.generated.js";',
    `export { default } from ${JSON.stringify(specifier(trailsDir, environmentFile))};`,
    "",
  ].join("\n");
  const fs = getFs();
  await fs.mkdir!(autoloadDir, { recursive: true });
  await fs.writeFile!(File.join(autoloadDir, "install.generated.js"), install);
  await fs.writeFile!(File.join(trailsDir, "entry.generated.js"), entry);
}

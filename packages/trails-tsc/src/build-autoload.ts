import { Dir, File, TopLevel, getPath } from "@blazetrails/ruby-compat";
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
  for (const ext of ["ts", "js"]) {
    const application = File.join(cwd, `config/application.${ext}`);
    if (await File.isExistAsync(application)) {
      await import(getPath().pathToFileURL!(application).href);
      break;
    }
  }

  const trails = (TopLevel as { Trails?: { application?: BootApplication | null } }).Trails;
  const application = trails?.application;
  if (application != null) {
    const loaders = [application.autoloaders?.once, application.autoloaders?.main].filter(
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

  const dirs: string[] = [];
  for (const loader of [...Registry.loaders]) {
    loader.manifestRoot ??= application?.config.root ?? cwd;
    dirs.push(await writeArtifacts(loader));
  }
  return dirs;
}

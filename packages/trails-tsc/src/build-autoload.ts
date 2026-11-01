import { Dir, File, TopLevel, getPath } from "@blazetrails/ruby-compat";
import { Registry, writeArtifacts } from "@blazetrails/zeitwerk";

interface BootInitializer {
  name: string;
  belongsTo(group: string): boolean;
  run(...args: unknown[]): unknown;
}

interface BootApplication {
  initializers: { tsort(): BootInitializer[] };
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
    for (const initializer of application.initializers.tsort()) {
      if (initializer.name === "setup_main_autoloader") break;
      if (initializer.belongsTo("default")) await initializer.run(application);
    }
  }

  const dirs: string[] = [];
  for (const loader of [...Registry.loaders]) {
    loader.manifestRoot ??= cwd;
    dirs.push(await writeArtifacts(loader));
  }
  return dirs;
}

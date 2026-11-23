import { File, Mutex, getFs } from "@blazetrails/ruby-compat";
import type { Loader } from "./loader.js";
import { Autoloads } from "./registry/autoloads.js";
import { ExplicitNamespaces } from "./registry/explicit-namespaces.js";
import { Inceptions } from "./registry/inceptions.js";
import { Loaders } from "./registry/loaders.js";

/** @noRailsEquivalent PERMANENT */
const PACKAGE_MUTEX = new Mutex();

const loaders = new Loaders();
const autoloads = new Autoloads();
const explicitNamespaces = new ExplicitNamespaces();
const inceptions = new Inceptions();

export const Registry = {
  Autoloads,
  ExplicitNamespaces,
  Inceptions,
  Loaders,
  Loader: undefined as typeof Loader | undefined,

  get loaders(): Loaders {
    return loaders;
  },

  /** @noRailsEquivalent PERMANENT */
  loadersByPackageFile: {} as Record<string, Loader>,

  get autoloads(): Autoloads {
    return autoloads;
  },

  get explicitNamespaces(): ExplicitNamespaces {
    return explicitNamespaces;
  },

  get inceptions(): Inceptions {
    return inceptions;
  },

  unregisterLoader(loader: Loader): void {
    for (const [packageFile, l] of Object.entries(this.loadersByPackageFile)) {
      if (l === loader) delete this.loadersByPackageFile[packageFile];
    }
  },

  /** @noRailsEquivalent PERMANENT */
  async loaderForPackage(
    packageFile: string,
    { namespace }: { namespace: object },
  ): Promise<Loader> {
    return PACKAGE_MUTEX.synchronize(async () => {
      if (Object.hasOwn(this.loadersByPackageFile, packageFile)) {
        return this.loadersByPackageFile[packageFile];
      }

      const { name } = JSON.parse(await getFs().readFile(packageFile, "utf8")) as { name: string };
      const loader = new this.Loader!();
      loader.tag = name.slice(name.lastIndexOf("/") + 1);
      if (namespace !== Object) loader.tag = `${loader.realModName(namespace)}-${loader.tag}`;
      const libDir = File.join(File.dirname(packageFile), "lib");
      const rootDir = (await File.isDirectoryAsync(libDir))
        ? libDir
        : File.join(File.dirname(packageFile), "src");
      await loader.pushDir(rootDir, { namespace });
      return (this.loadersByPackageFile[packageFile] = loader);
    });
  },
};

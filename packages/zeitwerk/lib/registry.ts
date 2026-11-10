import { File, Mutex, aryDelete, deleteIf, getFs } from "@blazetrails/ruby-compat";
import type { Loader } from "./loader.js";
import {
  ExplicitNamespaces,
  type ExplicitNamespacesInternals,
} from "./registry/explicit-namespaces.js";
import { Inceptions } from "./registry/inceptions.js";

/** @noRailsEquivalent PERMANENT */
const PACKAGE_MUTEX = new Mutex();

export const Registry = {
  ExplicitNamespaces: ExplicitNamespaces as typeof ExplicitNamespaces & ExplicitNamespacesInternals,
  Inceptions,
  Loader: undefined as typeof Loader | undefined,

  loaders: [] as Loader[],
  /** @noRailsEquivalent PERMANENT */
  loadersByPackageFile: {} as Record<string, Loader>,
  autoloads: {} as Record<string, Loader>,

  registerLoader(loader: Loader): void {
    this.loaders.push(loader);
  },

  unregisterLoader(loader: Loader): void {
    aryDelete(this.loaders, loader);
    for (const [packageFile, l] of Object.entries(this.loadersByPackageFile)) {
      if (l === loader) delete this.loadersByPackageFile[packageFile];
    }
    deleteIf(this.autoloads, (_k, l) => l === loader);
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

  registerAutoload(loader: Loader, abspath: string): Loader {
    return (this.autoloads[abspath] = loader);
  },

  unregisterAutoload(abspath: string): void {
    delete this.autoloads[abspath];
  },

  loaderFor(path: string): Loader | null {
    return this.autoloads[path] ?? null;
  },

  onUnload(loader: Loader): void {
    deleteIf(this.autoloads, (_path, object) => object === loader);
  },
};

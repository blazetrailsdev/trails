import { File, aryDelete, deleteIf, getFs } from "@blazetrails/ruby-compat";
import type { Loader } from "./loader.js";
import { ExplicitNamespaces } from "./registry/explicit-namespaces.js";

export const Registry = {
  ExplicitNamespaces,
  Loader: undefined as typeof Loader | undefined,

  loaders: [] as Loader[],
  gemLoadersByRootFile: {} as Record<string, Loader>,
  autoloads: {} as Record<string, Loader>,

  registerLoader(loader: Loader): void {
    this.loaders.push(loader);
  },

  unregisterLoader(loader: Loader): void {
    aryDelete(this.loaders, loader);
    deleteIf(this.gemLoadersByRootFile, (_k, l) => l === loader);
    deleteIf(this.autoloads, (_k, l) => l === loader);
  },

  /**
   * @inventedArm readFile — PERMANENT
   * @inventedArm pushDir — PERMANENT
   * @inventedArm if — CONVERGEABLE loader-for-gem-memoizes-across-await
   */
  async loaderForGem(rootFile: string, { namespace }: { namespace: object }): Promise<Loader> {
    if (Object.hasOwn(this.gemLoadersByRootFile, rootFile)) {
      return this.gemLoadersByRootFile[rootFile];
    }

    const { name } = JSON.parse(await getFs().readFile(rootFile, "utf8")) as { name: string };
    const loader = new this.Loader!();
    loader.tag = name.slice(name.lastIndexOf("/") + 1);
    if (namespace !== Object) loader.tag = `${loader.realModName(namespace)}-${loader.tag}`;
    await loader.pushDir(File.join(File.dirname(rootFile), "src"), { namespace });
    return (this.gemLoadersByRootFile[rootFile] = loader);
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

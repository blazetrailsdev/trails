import { aryDelete, deleteIf } from "@blazetrails/ruby-compat";
import type { Loader } from "./loader.js";
import { ExplicitNamespaces } from "./registry/explicit-namespaces.js";

export const Registry = {
  ExplicitNamespaces,

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

  registerAutoload(loader: Loader, abspath: string): Loader {
    return (this.autoloads[abspath] = loader);
  },

  /** @missingRailsCall delete — CONVERGEABLE call-set-credits-delete-expression */
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

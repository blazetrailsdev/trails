import { aryDelete } from "@blazetrails/ruby-compat";
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
    for (const [k, l] of Object.entries(this.gemLoadersByRootFile)) {
      if (l === loader) delete this.gemLoadersByRootFile[k];
    }
    for (const [k, l] of Object.entries(this.autoloads)) {
      if (l === loader) delete this.autoloads[k];
    }
  },

  registerAutoload(loader: Loader, abspath: string): Loader {
    return (this.autoloads[abspath] = loader);
  },

  /** @missingRailsCall delete — PERMANENT */
  unregisterAutoload(abspath: string): void {
    delete this.autoloads[abspath];
  },

  loaderFor(path: string): Loader | null {
    return this.autoloads[path] ?? null;
  },

  onUnload(loader: Loader): void {
    for (const [path, object] of Object.entries(this.autoloads)) {
      if (object === loader) delete this.autoloads[path];
    }
  },
};

import type { Loader } from "./loader.js";

export const Registry = {
  loaders: new Set<Loader>(),
  gemLoadersByRootFile: new Map<string, Loader>(),
  autoloads: new Map<string, Loader>(),

  registerLoader(loader: Loader): void {
    this.loaders.add(loader);
  },

  unregisterLoader(loader: Loader): void {
    this.loaders.delete(loader);
    for (const [k, l] of this.gemLoadersByRootFile) {
      if (l === loader) this.gemLoadersByRootFile.delete(k);
    }
    for (const [k, l] of this.autoloads) {
      if (l === loader) this.autoloads.delete(k);
    }
  },

  registerAutoload(loader: Loader, abspath: string): Loader {
    this.autoloads.set(abspath, loader);
    return loader;
  },

  unregisterAutoload(abspath: string): void {
    this.autoloads.delete(abspath);
  },

  loaderFor(path: string): Loader | undefined {
    return this.autoloads.get(path);
  },

  onUnload(loader: Loader): void {
    for (const [path, object] of this.autoloads) {
      if (object === loader) this.autoloads.delete(path);
    }
  },
};

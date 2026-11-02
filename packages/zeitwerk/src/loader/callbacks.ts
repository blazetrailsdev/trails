import { constAdded } from "../core-ext/module.js";
import type { Cref } from "../cref.js";
import { NameError } from "../error.js";
import type { Loader } from "../loader.js";
import { Registry } from "../registry.js";

type OnLoadBlock = (...args: unknown[]) => unknown;

export const Callbacks = {
  /** @internal */
  async onFileAutoloaded(this: Loader, file: string, exports: Record<string, unknown>) {
    const cref = this.autoloads[file];
    delete this.autoloads[file];

    Registry.unregisterAutoload(file);

    if (Object.hasOwn(exports, cref.cname)) {
      cref.set(exports[cref.cname]);
      await constAdded(cref.mod, cref.cname);

      if (this.logger != null) this.log(`constant ${cref} loaded from file ${file}`);
      if (this.isReloadingEnabled()) this.toUnload[file] = cref;
      if (Object.keys(this.onLoadCallbacks).length !== 0) {
        await this.runOnLoadCallbacks(cref.path(), cref.get(), file);
      }
    } else {
      const msg = `expected file ${file} to define constant ${cref}, but didn't`;
      if (this.logger != null) this.log(msg);

      cref.remove();

      if (this.isReloadingEnabled()) this.toUnload[file] = cref;

      throw new NameError(msg, cref.cname);
    }
  },

  /** @internal */
  async onDirAutoloaded(this: Loader, dir: string): Promise<void> {
    await this.dirsAutoloadMonitor.synchronize(async () => {
      const cref = this.autoloads[dir];
      delete this.autoloads[dir];
      if (cref != null) {
        const implicitNamespace = cref.set({});
        const cpath = cref.path();
        if (this.logger != null) this.log(`module ${cpath} autovivified from directory ${dir}`);

        if (this.isReloadingEnabled()) this.toUnload[dir] = cref;

        this.autoloadedDirs.push(dir);

        await this.onNamespaceLoaded(cref, implicitNamespace);

        if (Object.keys(this.onLoadCallbacks).length !== 0) {
          await this.runOnLoadCallbacks(cpath, implicitNamespace, dir);
        }
      }
    });
  },

  /**
   * @internal
   * @inventedArm if — PERMANENT
   */
  async onNamespaceLoaded(this: Loader, cref: Cref, namespace: object): Promise<void> {
    const dirs = this.namespaceDirs.delete(cref);
    if (dirs != null) {
      if (this._manifestConstants != null) {
        await this._defineAutoloadsForNamespace(cref.path(), namespace);
        return;
      }
      for (const dir of dirs) await this.defineAutoloadsForDir(dir, namespace);
    }
  },

  /** @internal */
  async runOnLoadCallbacks(this: Loader, cpath: string, value: unknown, abspath: string) {
    let callbacks = this.onLoadCallbacks[cpath] as OnLoadBlock[] | undefined;
    if (!this.isReloadingEnabled()) delete this.onLoadCallbacks[cpath];
    for (const c of callbacks ?? []) await c(value, abspath);

    callbacks = this.onLoadCallbacks[":ANY"] as OnLoadBlock[] | undefined;
    for (const c of callbacks ?? []) await c(cpath, value, abspath);
  },
};

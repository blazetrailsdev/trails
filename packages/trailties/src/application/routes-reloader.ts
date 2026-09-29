import { FileUpdateChecker, runLoadHooks } from "@blazetrails/activesupport";
import { getPath } from "@blazetrails/ruby-compat";
import type { DrawCallback, Mapper } from "@blazetrails/actionpack";

export interface RouteSetLike {
  disableClearAndFinalize?: boolean;
  clearBang(): void;
  finalizeBang(): void;
  eagerLoadBang(): void;
  draw?(block: DrawCallback): void;
}

export class RoutesReloader {
  paths: string[] = [];
  routeSets: RouteSetLike[] = [];
  externalRoutes: string[] = [];
  eagerLoad = false;
  loaded = false;
  /** @internal */
  runAfterLoadPaths: () => void | Promise<void> = () => {};
  private _updater?: FileUpdateChecker;

  executeIfUpdated(block?: () => Promise<void> | void): Promise<boolean> {
    return this.updater().executeIfUpdated(block);
  }

  isUpdated(): boolean {
    return this.updater().isUpdated();
  }

  async reloadBang(
    loader: (this: RoutesReloader, path: string) => void | Promise<void> = loadRoutesFile,
  ): Promise<void> {
    try {
      for (const s of this.routeSets) {
        s.disableClearAndFinalize = true;
        s.clearBang();
      }
      for (const p of this.paths) await loader.call(this, p);
      await this.runAfterLoadPaths();
      for (const s of this.routeSets) s.finalizeBang();
      if (this.eagerLoad) for (const s of this.routeSets) s.eagerLoadBang();
    } finally {
      for (const s of this.routeSets) s.disableClearAndFinalize = false;
    }
  }

  execute(): Promise<void> {
    this.loaded = true;
    return this.updater().execute();
  }

  async executeUnlessLoaded(application: unknown): Promise<boolean> {
    if (this.loaded) return false;
    await this.execute();
    runLoadHooks("after_routes_loaded", application);
    return true;
  }

  /** @internal */
  private updater(): FileUpdateChecker {
    return (this._updater ??= (() => {
      const dirs = this.externalRoutes.reduce<Record<string, string[]>>((hash, dir) => {
        hash[String(dir)] = ["ts"];
        return hash;
      }, {});

      return new FileUpdateChecker(this.paths, dirs, () => this.reloadBang());
    })());
  }
}

async function loadRoutesFile(this: RoutesReloader, path: string): Promise<void> {
  const p = getPath();
  if (!p.pathToFileURL) {
    throw new Error("PathAdapter.pathToFileURL() is required to load a routes file.");
  }
  const mod = (await import(p.pathToFileURL(path).href)) as {
    drawRoutes?: (mapper: Mapper) => void;
  };
  const drawRoutes = mod.drawRoutes;
  if (typeof drawRoutes !== "function") return;
  for (const set of this.routeSets) set.draw?.((mapper) => drawRoutes(mapper));
}

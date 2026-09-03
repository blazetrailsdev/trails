import { runLoadHooks } from "@blazetrails/activesupport";
import { getPathAsync } from "@blazetrails/ruby-compat";
import type { DrawCallback, Mapper } from "@blazetrails/actionpack";

export interface RouteSetLike {
  disableClearAndFinalize?: boolean;
  clear?(): void;
  finalize?(): void;
  eagerLoad?(): void;
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

  async reload(
    loader: (this: RoutesReloader, path: string) => void | Promise<void> = loadRoutesFile,
  ): Promise<void> {
    try {
      for (const s of this.routeSets) {
        s.disableClearAndFinalize = true;
        s.clear?.();
      }
      for (const p of this.paths) await loader.call(this, p);
      await this.runAfterLoadPaths();
      for (const s of this.routeSets) s.finalize?.();
      if (this.eagerLoad) for (const s of this.routeSets) s.eagerLoad?.();
    } finally {
      for (const s of this.routeSets) s.disableClearAndFinalize = false;
    }
  }

  execute(loader?: (this: RoutesReloader, p: string) => void | Promise<void>): Promise<void> {
    this.loaded = true;
    return this.reload(loader);
  }

  async executeUnlessLoaded(
    application: unknown,
    loader?: (this: RoutesReloader, p: string) => void | Promise<void>,
  ): Promise<boolean> {
    if (this.loaded) return false;
    await this.execute(loader);
    runLoadHooks("after_routes_loaded", application);
    return true;
  }
}

async function loadRoutesFile(this: RoutesReloader, path: string): Promise<void> {
  const p = await getPathAsync();
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

// Port of `Rails::Application::RoutesReloader` from
// `railties/lib/rails/application/routes_reloader.rb`. Rails' watcher half
// (FileUpdateChecker + Ruby `load`) ships with autoloading later; this is
// the protocol the framework calls.
import { getPathAsync, runLoadHooks } from "@blazetrails/activesupport";
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
  /** @internal Rails `attr_writer :run_after_load_paths`. */
  runAfterLoadPaths: () => void | Promise<void> = () => {};

  async reload(
    loader: (this: RoutesReloader, path: string) => void | Promise<void> = loadRoutesFile,
  ): Promise<void> {
    // Rails' `ensure revert` in `def reload!` covers `clear!` too.
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

/**
 * Stands in for Ruby's `load(path)` in `RoutesReloader#reload!`
 * (`routes_reloader.rb:20`). A Rails `config/routes.rb` body is
 * `Rails.application.routes.draw { ... }`, so `load` both evaluates the file
 * and draws it; a trails routes file exports `drawRoutes(mapper)` instead —
 * an ESM module body cannot depend on the app being reachable at import time
 * — so the draw is performed here, against the route sets the reloader was
 * given by `add_routing_paths`.
 */
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

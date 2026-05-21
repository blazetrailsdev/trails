// Port of `Rails::Application::RoutesReloader` from
// `railties/lib/rails/application/routes_reloader.rb`. Rails' watcher half
// (FileUpdateChecker + Ruby `load`) ships with autoloading later; this is
// the protocol the framework calls.
import { runLoadHooks } from "@blazetrails/activesupport";

export interface RouteSetLike {
  disableClearAndFinalize?: boolean;
  clear?(): void;
  finalize?(): void;
  eagerLoad?(): void;
}

export class RoutesReloader {
  paths: string[] = [];
  routeSets: RouteSetLike[] = [];
  externalRoutes: string[] = [];
  eagerLoad = false;
  loaded = false;
  /** @internal Rails `attr_writer :run_after_load_paths`. */
  runAfterLoadPaths: () => void | Promise<void> = () => {};

  async reload(loader: (path: string) => void | Promise<void> = () => {}): Promise<void> {
    // Rails' `ensure revert` in `def reload!` covers `clear!` too.
    try {
      for (const s of this.routeSets) {
        s.disableClearAndFinalize = true;
        s.clear?.();
      }
      for (const p of this.paths) await loader(p);
      await this.runAfterLoadPaths();
      for (const s of this.routeSets) s.finalize?.();
      if (this.eagerLoad) for (const s of this.routeSets) s.eagerLoad?.();
    } finally {
      for (const s of this.routeSets) s.disableClearAndFinalize = false;
    }
  }

  execute(loader?: (p: string) => void | Promise<void>): Promise<void> {
    this.loaded = true;
    return this.reload(loader);
  }

  async executeUnlessLoaded(
    app: unknown,
    loader?: (p: string) => void | Promise<void>,
  ): Promise<boolean> {
    if (this.loaded) return false;
    await this.execute(loader);
    runLoadHooks("after_routes_loaded", app);
    return true;
  }
}

import { FileUpdateChecker, runLoadHooks, TopLevel } from "@blazetrails/activesupport";
import { getPath } from "@blazetrails/ruby-compat";

export interface RouteSetLike {
  disableClearAndFinalize?: boolean;
  clearBang(): void;
  finalizeBang(): void;
  eagerLoadBang(): void;
}

let loads = 0;

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

  async reloadBang(): Promise<void> {
    try {
      this.clearBang();
      await this.loadPaths();
      this.finalizeBang();
      if (this.eagerLoad) for (const s of this.routeSets) s.eagerLoadBang();
    } finally {
      this.revert();
    }
  }

  execute(): Promise<void> {
    this.loaded = true;
    return this.updater().execute();
  }

  async executeUnlessLoaded(): Promise<true | null> {
    if (!this.loaded) {
      await this.execute();
      runLoadHooks("after_routes_loaded", TopLevel.Trails!.application);
      return true;
    }
    return null;
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

  /** @internal */
  private clearBang(): void {
    for (const routes of this.routeSets) {
      routes.disableClearAndFinalize = true;
      routes.clearBang();
    }
  }

  /** @internal */
  private async loadPaths(): Promise<void> {
    const p = getPath();
    for (const path of this.paths) {
      const url = p.pathToFileURL!(path);
      url.searchParams.set("load", String(++loads));
      await import(url.href);
    }
    await this.runAfterLoadPaths();
  }

  /** @internal */
  private finalizeBang(): void {
    for (const s of this.routeSets) s.finalizeBang();
  }

  /** @internal */
  private revert(): void {
    for (const routes of this.routeSets) {
      routes.disableClearAndFinalize = false;
    }
  }
}

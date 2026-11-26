import type { Pathname } from "@blazetrails/ruby-compat/pathname";
import { FileUpdateChecker, runLoadHooks, TopLevel } from "@blazetrails/activesupport";
import { Dir } from "@blazetrails/ruby-compat/dir";
import { compiledFilesIn, loadIseqEval, rbFLoad } from "@blazetrails/ruby-compat/load";
import { RuntimeError } from "@blazetrails/ruby-compat/runtime-error";
import type { DrawCallback } from "@blazetrails/actionpack";

export interface RouteSetLike {
  disableClearAndFinalize?: boolean;
  clearBang(): void;
  finalizeBang(): void;
  eagerLoadBang(): void;
  draw(block: DrawCallback): void;
  drawPaths: Array<string | Pathname>;
}

export class RoutesReloader {
  paths: string[];
  routeSets: RouteSetLike[];
  externalRoutes: Array<string | Pathname>;
  eagerLoad: boolean;
  loaded: boolean;
  /** @internal */
  runAfterLoadPaths: () => void = () => {};
  private _updater?: FileUpdateChecker<void>;
  /** @internal */
  private _drawn: [RouteSetLike, DrawCallback][] | null = null;
  /** @internal */
  private _prefetching?: Promise<void>;

  constructor() {
    this.paths = [];
    this.routeSets = [];
    this.externalRoutes = [];
    this.eagerLoad = false;
    this.loaded = false;
  }

  async executeIfUpdated(block?: () => Promise<void> | void): Promise<boolean> {
    if (this.isUpdated()) await this.prefetchBang();
    return this.updater().executeIfUpdated(block);
  }

  isUpdated(): boolean {
    return this.updater().isUpdated();
  }

  reloadBang(): void {
    try {
      this.clearBang();
      this.loadPaths();
      this.finalizeBang();
      if (this.eagerLoad) for (const s of this.routeSets) s.eagerLoadBang();
    } finally {
      this.revert();
    }
  }

  execute(): void {
    this.loaded = true;
    return this.updater().execute();
  }

  executeUnlessLoaded(): true | null {
    if (!this.loaded) {
      this.execute();
      runLoadHooks("after_routes_loaded", TopLevel.Trails!.application);
      return true;
    }
    return null;
  }

  /** @noRailsEquivalent PERMANENT */
  async prefetchBang(): Promise<void> {
    const previous = this._prefetching;
    const current = Promise.allSettled([previous]).then(() => this._prefetch());
    this._prefetching = current;
    try {
      await current;
    } finally {
      if (this._prefetching === current) this._prefetching = undefined;
    }
  }

  /** @internal */
  private async _prefetch(): Promise<void> {
    const drawn: [RouteSetLike, DrawCallback][] = [];
    const own = this.routeSets.map((routes) => Object.getOwnPropertyDescriptor(routes, "draw"));
    for (const routes of this.routeSets) {
      Object.defineProperty(routes, "draw", {
        value: (block: DrawCallback) => void drawn.push([routes, block]),
        configurable: true,
        writable: true,
      });
    }
    try {
      for (const path of this.paths) await rbFLoad(path);
      for (const routes of this.routeSets) {
        for (const dir of routes.drawPaths) {
          const files = new Set([
            ...(await Dir.globAsync(`${dir}/**/*.ts`)),
            ...compiledFilesIn(`${dir}`),
          ]);
          for (const file of files) await loadIseqEval(file, true);
        }
      }
    } catch (error) {
      this._drawn = null;
      throw error;
    } finally {
      this.routeSets.forEach((routes, i) => {
        const descriptor = own[i];
        if (descriptor) Object.defineProperty(routes, "draw", descriptor);
        else delete (routes as Partial<RouteSetLike>).draw;
      });
    }
    this._drawn = drawn;
  }

  /** @internal */
  private updater(): FileUpdateChecker<void> {
    return (this._updater ??= (() => {
      const dirs = this.externalRoutes.reduce<Record<string, string[]>>((hash, dir) => {
        hash[String(dir)] = ["ts"];
        return hash;
      }, {});

      return new FileUpdateChecker<void>(this.paths, dirs, () => this.reloadBang());
    })());
  }

  /** @internal */
  private clearBang(): void {
    for (const routes of this.routeSets) {
      routes.disableClearAndFinalize = true;
      routes.clearBang();
    }
  }

  /**
   * @internal
   * @inventedArm throw — PERMANENT
   */
  private loadPaths(): void {
    if (this._drawn === null && this.paths.length > 0) {
      throw new RuntimeError("routes files were not prefetched");
    }
    for (const [routes, block] of this._drawn ?? []) routes.draw(block);
    this.runAfterLoadPaths();
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

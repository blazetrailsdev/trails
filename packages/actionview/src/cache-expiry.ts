import { rbEqual } from "@blazetrails/ruby-compat";
import { DetailsKey } from "./lookup-context.js";
import { PathRegistry } from "./path-registry.js";

interface FileWatcher {
  isUpdated(): boolean;
  execute(): void | Promise<void>;
}

type FileWatcherClass = new (
  files: string[],
  dirs: string[],
  block: () => void | Promise<void>,
) => FileWatcher;

export class ViewReloader {
  private _watcherClass: FileWatcherClass;
  private _watchedDirs: string[] | null;
  private _watcher: FileWatcher | null;
  private _previousChange: boolean | undefined;

  constructor({ watcher }: { watcher: FileWatcherClass }) {
    this._watcherClass = watcher;
    this._watchedDirs = null;
    this._watcher = null;
    this._previousChange = false;

    PathRegistry.fileSystemResolverHooks.push(() => this.rebuildWatcher());
  }

  isUpdated(): boolean {
    if (!this._watcher) this.buildWatcher();
    return this._previousChange || this._watcher!.isUpdated();
  }

  execute(): void | Promise<void> {
    if (!this._watcher) return;

    this._previousChange = false;
    const watcher = this._watcher;
    return watcher.execute();
  }

  private reloadBang(): void {
    DetailsKey.clear();
  }

  private buildWatcher(): void {
    const oldWatcher = this._watcher;

    if (!rbEqual(this._watchedDirs, this.dirsToWatch())) {
      this._watchedDirs = this.dirsToWatch();
      const newWatcher = new this._watcherClass([], this._watchedDirs, () => {
        this.reloadBang();
      });
      this._watcher = newWatcher;

      this._previousChange ||= oldWatcher?.isUpdated();
    }
  }

  private rebuildWatcher(): void {
    if (!this._watcher) return;
    this.buildWatcher();
  }

  private dirsToWatch(): string[] {
    return [...new Set(this.allViewPaths())].sort();
  }

  private allViewPaths(): string[] {
    return PathRegistry.allFileSystemResolvers().map((r) => r.path);
  }
}

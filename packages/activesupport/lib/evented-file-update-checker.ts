import {
  ArgumentError,
  block,
  File,
  Mutex,
  ObjectSpace,
  Pathname,
  Thread,
  rbClassNewInstance,
  rbInspect,
  rbObjId,
} from "@blazetrails/ruby-compat";
import { Listen, type Listener } from "@blazetrails/listen";
import { AtomicBoolean } from "@blazetrails/ruby-compat/concurrent/atomic-boolean";
import { ForkTracker } from "./fork-tracker.js";
import { transformKeysBang } from "./hash-utils.js";

export class EventedFileUpdateChecker<R = unknown> {
  private _block: () => R;
  private _core: EventedFileUpdateChecker.Core;

  /** @internal */
  protected constructor(block: () => R, core: EventedFileUpdateChecker.Core) {
    this._block = block;
    this._core = core;
    ObjectSpace.defineFinalizer(this, this._core.finalizer());
  }

  static async new<R>(
    files: string[],
    dirs: Record<string, string | string[]> = {},
    block?: () => R,
  ): Promise<EventedFileUpdateChecker<R>> {
    if (!block) {
      throw new ArgumentError("A block is required to initialize an EventedFileUpdateChecker");
    }

    const core = await EventedFileUpdateChecker.Core.new(files, dirs);
    return rbClassNewInstance(this, block, core) as EventedFileUpdateChecker<R>;
  }

  inspect(): string {
    return `#<ActiveSupport::EventedFileUpdateChecker:${rbObjId(this)} @files=${rbInspect([...this._core.files])}`;
  }

  async isUpdated(): Promise<boolean> {
    if (this._core.isRestart()) {
      await this._core.threadSafely((core) => core.restart());
      this._core.updated.makeTrue();
    }

    return this._core.updated.isTrue();
  }

  async execute(): Promise<Awaited<R>> {
    this._core.updated.makeFalse();
    return await this._block();
  }

  async executeIfUpdated(block?: () => unknown): Promise<true | null> {
    if (await this.isUpdated()) {
      if (block) await block();
      await this.execute();
      return true;
    }
    return null;
  }
}

export namespace EventedFileUpdateChecker {
  export class Core {
    readonly updated: AtomicBoolean;
    readonly files: Set<string>;
    private dirs: Map<string, Set<string>>;
    private _commonPath: string | null;
    private _dtw: string[];
    private _missing: string[];
    private _mutex: Mutex;
    private _listener: Listener | null = null;
    private afterFork!: () => unknown;

    /** @internal */
    protected constructor(files: string[], dirs: Record<string, string | string[]>) {
      this.files = new Set(files.map((file) => File.expandPath(file)));

      this.dirs = new Map();
      for (const [dir, exts] of Object.entries(dirs)) {
        this.dirs.set(
          File.expandPath(dir),
          new Set([exts].flat().map((ext) => ext.toString().replace(/^\.?/, "."))),
        );
      }

      this._commonPath = this.commonPath([...this.dirs.keys()]);

      this._dtw = this.directoriesToWatch();
      this._missing = [];

      this.updated = new AtomicBoolean(false);
      this._mutex = new Mutex();
    }

    static async new(files: string[], dirs: Record<string, string | string[]>): Promise<Core> {
      const core = rbClassNewInstance(this, files, dirs) as Core;
      await core.start();
      core.afterFork = ForkTracker.afterFork(() => new Thread(() => core.start()));
      return core;
    }

    finalizer(): () => void {
      return () => {
        new Thread(() => this.stop());
        ForkTracker.unregister(this.afterFork);
      };
    }

    async threadSafely<T>(block: (core: this) => Promise<T>): Promise<T> {
      return this._mutex.synchronize(() => block(this));
    }

    async start(): Promise<void> {
      this.normalizeDirsBang();
      const all = [...this._dtw, ...this._missing];
      this._dtw = all.filter((dir) => File.isExist(dir));
      this._missing = all.filter((dir) => !File.isExist(dir));
      this._listener =
        this._dtw.length > 0 ? Listen.to(...this._dtw, block(this.changed.bind(this))) : null;
      await this._listener?.start();
    }

    async stop(): Promise<void> {
      await this._listener?.stop();
    }

    async restart(): Promise<void> {
      await this.stop();
      await this.start();
    }

    isRestart(): boolean {
      return this._missing.some((dir) => File.isExist(dir));
    }

    normalizeDirsBang(): void {
      transformKeysBang(this.dirs, (dir) => (File.isExist(dir) ? File.realpath(dir) : dir));
    }

    changed(modified: string[], added: string[], removed: string[]): void {
      if (!this.updated.isTrue()) {
        if ([...modified, ...added, ...removed].some((f) => this.isWatching(f))) {
          this.updated.makeTrue();
        }
      }
    }

    isWatching(file: string): boolean {
      if (this.files.has(file)) {
        return true;
      } else if (File.isDirectory(file)) {
        return false;
      } else {
        const ext = File.extname(file);

        for (const dir of new Pathname(File.dirname(file)).ascend()) {
          const matching = this.dirs.get(dir.toString());

          if (matching && (matching.size === 0 || matching.has(ext))) {
            return true;
          } else if (dir.toString() === this._commonPath || dir.isRoot()) {
            return false;
          }
        }
        return false;
      }
    }

    directoriesToWatch(): string[] {
      const dtw = [...new Set([...this.dirs.keys(), ...[...this.files].map(File.dirname)])];
      const accountedFor = new Set(dtw);
      return dtw.filter(
        (dir) =>
          ![...new Pathname(dir).ascend()]
            .slice(1)
            .some((parent) => accountedFor.has(parent.toString())),
      );
    }

    commonPath(paths: string[]): string | null {
      if (paths.length === 0) return null;
      return (
        paths
          .map((path) => [...new Pathname(path).ascend()].map(String))
          .reduce((a, b) => a.filter((dir) => b.includes(dir)))[0] ?? null
      );
    }
  }
}

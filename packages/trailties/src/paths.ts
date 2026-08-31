import { getFsAsync, getPathAsync } from "@blazetrails/activesupport";
import { glob as fsGlob } from "@blazetrails/activesupport/glob";

export interface PathOptions {
  with?: string | string[];
  glob?: string;
  loadPath?: boolean;
  eagerLoad?: boolean;
  autoload?: boolean;
  autoloadOnce?: boolean;
  exclude?: string[];
}

// Port of railties/lib/rails/paths.rb.
export class Root {
  path: string | null;
  _entries: Map<string, Path> = new Map();

  constructor(path: string | null) {
    this.path = path;
  }

  add(path: string, options: PathOptions = {}): Path {
    const with_ =
      options.with === undefined
        ? [path]
        : Array.isArray(options.with)
          ? options.with
          : [options.with];
    const node = new Path(this, path, with_, options);
    this._entries.set(path, node);
    return node;
  }

  get(path: string): Path | undefined {
    return this._entries.get(path);
  }

  allPaths(): Path[] {
    return Array.from(new Set(this._entries.values()));
  }

  /** Mirrors Rails `Paths::Root#autoload_once` (paths.rb:89-91). */
  autoloadOnce(): Promise<string[]> {
    return this.filterBy((path) => path.isAutoloadOnce());
  }

  /** Mirrors Rails `Paths::Root#eager_load` (paths.rb:93-95). */
  eagerLoad(): Promise<string[]> {
    return this.filterBy((path) => path.isEagerLoad());
  }

  /** Mirrors Rails `Paths::Root#autoload_paths` (paths.rb:97-99). */
  autoloadPaths(): Promise<string[]> {
    return this.filterBy((path) => path.isAutoload());
  }

  /** Mirrors Rails `Paths::Root#load_paths` (paths.rb:101-103). */
  loadPaths(): Promise<string[]> {
    return this.filterBy((path) => path.isLoadPath());
  }

  /** Mirrors Rails `Paths::Root#filter_by` (paths.rb:106-110). Async because
   * trails' `Path#existentDirectories` resolves via async fs. */
  private async filterBy(block: (path: Path) => boolean): Promise<string[]> {
    const out: string[] = [];
    for (const path of this.allPaths()) {
      if (!block(path)) continue;
      const paths = await path.existentDirectories();
      const excluded = new Set<string>();
      for (const p of path.children()) {
        if (block(p)) continue;
        for (const d of await p.existentDirectories()) excluded.add(d);
      }
      for (const d of paths) if (!excluded.has(d)) out.push(d);
    }
    return Array.from(new Set(out));
  }
}

export class Path {
  glob: string | undefined;
  private _paths: string[];
  private _current: string;
  private _root: Root;
  private _loadPath = false;
  private _eagerLoad = false;
  private _autoload = false;
  private _autoloadOnce = false;
  private _exclude: string[] | undefined;

  constructor(root: Root, current: string, paths: string[], options: PathOptions = {}) {
    this._root = root;
    this._current = current;
    this._paths = [...paths];
    this.glob = options.glob;
    this._loadPath = !!options.loadPath;
    this._eagerLoad = !!options.eagerLoad;
    this._autoload = !!options.autoload;
    this._autoloadOnce = !!options.autoloadOnce;
    this._exclude = options.exclude;
  }

  children(): Path[] {
    return [...this._root._entries.keys()]
      .filter((k) => k.startsWith(this._current) && k !== this._current)
      .sort()
      .map((k) => this._root._entries.get(k)!);
  }

  loadPathBang(): void {
    this._loadPath = true;
  }
  isLoadPath(): boolean {
    return this._loadPath;
  }

  eagerLoadBang(): void {
    this._eagerLoad = true;
  }
  isEagerLoad(): boolean {
    return this._eagerLoad;
  }

  autoloadBang(): void {
    this._autoload = true;
  }
  isAutoload(): boolean {
    return this._autoload;
  }

  autoloadOnceBang(): void {
    this._autoloadOnce = true;
  }
  isAutoloadOnce(): boolean {
    return this._autoloadOnce;
  }

  push(path: string): void {
    this._paths.push(path);
  }
  toAry(): string[] {
    return this._paths;
  }
  toA(): Promise<string[]> {
    return this.expanded();
  }

  async expanded(): Promise<string[]> {
    if (this._root.path === null) throw new Error("You need to set a path root");
    const path = await getPathAsync();
    const fs = await getFsAsync();
    const out: string[] = [];
    for (const raw of this._paths) {
      const abs = path.resolve(this._root.path, raw);
      if (this.glob && (await isDir(fs, abs))) {
        // Mirrors Rails Path#files_in (paths.rb:238-240): the exclude list is
        // subtracted from the relative glob results before joining.
        let files = await fsGlob(this.glob, { cwd: abs });
        if (this._exclude) files = files.filter((f) => !this._exclude!.includes(f));
        out.push(...files.map((f) => path.join(abs, f)).sort());
      } else {
        out.push(abs);
      }
    }
    return Array.from(new Set(out));
  }

  async existent(): Promise<string[]> {
    const fs = await getFsAsync();
    const out: string[] = [];
    for (const f of await this.expanded()) {
      if (await fs.exists(f)) {
        out.push(f);
      } else if (fs.lstat && (await isSymlink(fs, f))) {
        throw new Error(`File "${f}" is a symlink that does not point to a valid file`);
      }
    }
    return out;
  }

  async existentDirectories(): Promise<string[]> {
    const fs = await getFsAsync();
    const out: string[] = [];
    for (const f of await this.expanded()) if (await isDir(fs, f)) out.push(f);
    return out;
  }
}

type Fs = Awaited<ReturnType<typeof getFsAsync>>;
async function isDir(fs: Fs, p: string): Promise<boolean> {
  if (!fs.stat) throw new Error("FsAdapter.stat() is required for trailties (async-only).");
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}
async function isSymlink(fs: Fs, p: string): Promise<boolean> {
  try {
    return !!(await fs.lstat!(p)).isSymbolicLink?.();
  } catch {
    return false;
  }
}

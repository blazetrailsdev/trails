import { File } from "@blazetrails/ruby-compat";
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

  autoloadOnce(): Promise<string[]> {
    return this.filterBy((path) => path.isAutoloadOnce());
  }

  eagerLoad(): Promise<string[]> {
    return this.filterBy((path) => path.isEagerLoad());
  }

  autoloadPaths(): Promise<string[]> {
    return this.filterBy((path) => path.isAutoload());
  }

  loadPaths(): Promise<string[]> {
    return this.filterBy((path) => path.isLoadPath());
  }

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
  private _autoloadOnce = false;
  private _eagerLoad = false;
  private _autoload = false;
  private _loadPath = false;
  private _exclude: string[] | undefined;

  constructor(root: Root, current: string, paths: string[], options: PathOptions = {}) {
    this._root = root;
    this._current = current;
    this._paths = [...paths];
    this.glob = options.glob;
    this._exclude = options.exclude;
    this._autoloadOnce = !!options.autoloadOnce;
    this._eagerLoad = !!options.eagerLoad;
    this._autoload = !!options.autoload;
    this._loadPath = !!options.loadPath;
  }

  children(): Path[] {
    return [...this._root._entries.keys()]
      .filter((k) => k.startsWith(this._current) && k !== this._current)
      .sort()
      .map((k) => this._root._entries.get(k)!);
  }

  autoloadOnceBang(): void {
    this._autoloadOnce = true;
  }
  isAutoloadOnce(): boolean {
    return this._autoloadOnce;
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

  loadPathBang(): void {
    this._loadPath = true;
  }
  isLoadPath(): boolean {
    return this._loadPath;
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
    const out: string[] = [];
    for (const raw of this._paths) {
      const abs = File.expandPath(raw, this._root.path);
      if (this.glob && File.isDirectory(abs)) {
        let files = await fsGlob(this.glob, { cwd: abs });
        if (this._exclude) files = files.filter((f) => !this._exclude!.includes(f));
        out.push(...files.map((f) => File.join(abs, f)).sort());
      } else {
        out.push(abs);
      }
    }
    return Array.from(new Set(out));
  }

  async existent(): Promise<string[]> {
    return (await this.expanded()).filter((f) => {
      const doesExist = File.isExist(f);

      if (!doesExist && File.isSymlink(f)) {
        throw new Error(
          `File ${JSON.stringify(f)} is a symlink that does not point to a valid file`,
        );
      }
      return doesExist;
    });
  }

  async existentDirectories(): Promise<string[]> {
    const out: string[] = [];
    for (const f of await this.expanded()) if (File.isDirectory(f)) out.push(f);
    return out;
  }
}

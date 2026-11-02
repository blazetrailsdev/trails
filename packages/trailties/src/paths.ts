import { Dir, File, rbInspect } from "@blazetrails/ruby-compat";

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

  values(): Path[] {
    return [...this._entries.values()];
  }

  keys(): string[] {
    return [...this._entries.keys()];
  }

  valuesAt(...list: string[]): Array<Path | undefined> {
    return list.map((key) => this._entries.get(key));
  }

  allPaths(): Path[] {
    return Array.from(new Set(this.values()));
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
    if (options.autoloadOnce) this.autoloadOnceBang();
    else this.skipAutoloadOnceBang();
    if (options.eagerLoad) this.eagerLoadBang();
    else this.skipEagerLoadBang();
    if (options.autoload) this.autoloadBang();
    else this.skipAutoloadBang();
    if (options.loadPath) this.loadPathBang();
    else this.skipLoadPathBang();
  }

  absoluteCurrent(): string {
    return File.expandPath(this._current, this._root.path!);
  }

  children(): Path[] {
    const keys = this._root
      .keys()
      .filter((k) => k.startsWith(this._current) && k !== this._current);
    return this._root.valuesAt(...keys.sort()) as Path[];
  }

  async first(): Promise<string | undefined> {
    return (await this.expanded())[0];
  }

  async last(): Promise<string | undefined> {
    return (await this.expanded()).at(-1);
  }

  /** @noRailsEquivalent CONVERGEABLE paths-path-expanded-is-async-over-a-sync-dir-glob */
  firstSync(): string | undefined {
    if (this._root.path === null) throw new Error("You need to set a path root");
    const path = this._paths[0];
    return path === undefined ? undefined : File.expandPath(path, this._root.path);
  }

  autoloadOnceBang(): void {
    this._autoloadOnce = true;
  }
  skipAutoloadOnceBang(): void {
    this._autoloadOnce = false;
  }
  isAutoloadOnce(): boolean {
    return this._autoloadOnce;
  }

  eagerLoadBang(): void {
    this._eagerLoad = true;
  }
  skipEagerLoadBang(): void {
    this._eagerLoad = false;
  }
  isEagerLoad(): boolean {
    return this._eagerLoad;
  }

  autoloadBang(): void {
    this._autoload = true;
  }
  skipAutoloadBang(): void {
    this._autoload = false;
  }
  isAutoload(): boolean {
    return this._autoload;
  }

  loadPathBang(): void {
    this._loadPath = true;
  }
  skipLoadPathBang(): void {
    this._loadPath = false;
  }
  isLoadPath(): boolean {
    return this._loadPath;
  }

  each(block: (path: string) => void): void {
    this._paths.forEach((path) => block(path));
  }

  push(path: string): void {
    this._paths.push(path);
  }

  concat(paths: string[]): string[] {
    this._paths.push(...paths);
    return this._paths;
  }

  unshift(...paths: string[]): string[] {
    this._paths.unshift(...paths);
    return this._paths;
  }

  toAry(): string[] {
    return this._paths;
  }
  toA(): Promise<string[]> {
    return this.expanded();
  }

  extensions(): string[] | undefined {
    return this.glob?.match(/\{([\S]+)\}/)?.[1].split(",");
  }

  async expanded(): Promise<string[]> {
    if (this._root.path === null) throw new Error("You need to set a path root");
    const result: string[] = [];
    for (const raw of this._paths) {
      const path = File.expandPath(raw, this._root.path);
      if (this.glob && File.isDirectory(path)) {
        result.push(...(await this.filesIn(path)));
      } else {
        result.push(path);
      }
    }
    return Array.from(new Set(result));
  }

  async existent(): Promise<string[]> {
    return (await this.expanded()).filter((f) => {
      const doesExist = File.isExist(f);

      if (!doesExist && File.isSymlink(f)) {
        throw new Error(`File ${rbInspect(f)} is a symlink that does not point to a valid file`);
      }
      return doesExist;
    });
  }

  async existentDirectories(): Promise<string[]> {
    const out: string[] = [];
    for (const f of await this.expanded()) if (File.isDirectory(f)) out.push(f);
    return out;
  }

  /** @internal */
  private async filesIn(path: string): Promise<string[]> {
    let files = await Dir.globAsync(this.glob!, 0, { base: path });
    if (this._exclude) files = files.filter((f) => !this._exclude!.includes(f));
    return files.map((file) => File.join(path, file)).sort();
  }
}

import { getFsAsync, getPathAsync } from "@blazetrails/activesupport";
import { glob as fsGlob } from "@blazetrails/activesupport/glob";

export interface PathOptions {
  with?: string | string[];
  glob?: string;
  loadPath?: boolean;
}

// Port of railties/lib/rails/paths.rb. Autoload / eager-load APIs are
// intentionally omitted (ESM + bundlers cover those concerns); only
// load_path / load_paths are kept.
export class Root {
  path: string | null;
  _entries: Map<string, Path> = new Map();

  constructor(path: string | null) {
    this.path = path;
  }

  add(path: string, options: PathOptions = {}): Path {
    const withVals =
      options.with === undefined
        ? [path]
        : Array.isArray(options.with)
          ? options.with
          : [options.with];
    const node = new Path(this, path, withVals, options);
    this._entries.set(path, node);
    return node;
  }

  get(path: string): Path | undefined {
    return this._entries.get(path);
  }

  allPaths(): Path[] {
    return Array.from(new Set(this._entries.values()));
  }

  async loadPaths(): Promise<string[]> {
    const out: string[] = [];
    for (const node of this.allPaths()) {
      if (!node.isLoadPath()) continue;
      const dirs = await node.existentDirectories();
      const excluded = new Set<string>();
      for (const child of node.children()) {
        if (child.isLoadPath()) continue;
        for (const d of await child.existentDirectories()) excluded.add(d);
      }
      for (const d of dirs) if (!excluded.has(d)) out.push(d);
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

  constructor(root: Root, current: string, paths: string[], options: PathOptions = {}) {
    this._root = root;
    this._current = current;
    this._paths = [...paths];
    this.glob = options.glob;
    this._loadPath = !!options.loadPath;
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

  push(p: string): void {
    this._paths.push(p);
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
        const files = await fsGlob(this.glob, { cwd: abs });
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

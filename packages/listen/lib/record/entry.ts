import { Dir, File, getFs } from "@blazetrails/ruby-compat";

export interface EntryMeta {
  mtime: number;
  mode: number;
  size: number;
}

export class Entry {
  readonly root: string;
  readonly relative: string | null;
  readonly name: string | null;
  private _realPath: string | null = null;

  constructor(root: string, relative: string | null, name: string | null = null) {
    this.root = root;
    this.relative = relative;
    this.name = name;
  }

  async children(): Promise<Entry[]> {
    const childRelative = this._join();
    return (await this._entries(this.sysPath()))
      .filter((name) => name !== "." && name !== "..")
      .map((name) => new Entry(this.root, childRelative, name));
  }

  async meta(): Promise<EntryMeta> {
    const fs = getFs();
    const lstat = fs.lstat ? await fs.lstat(this.sysPath()) : fs.lstatSync(this.sysPath());
    return { mtime: lstat.mtime.getTime() / 1000, mode: lstat.mode, size: lstat.size };
  }

  recordDirKey(): string {
    return File.join(...[this.relative, this.name].filter((x) => x != null));
  }

  sysPath(): string {
    return File.join(...[this.root, this.relative, this.name].filter((x) => x != null));
  }

  async realPath(): Promise<string> {
    return (this._realPath ??= await File.realpathAsync(this.sysPath()));
  }

  private _join(): string | null {
    const args = [this.relative, this.name].filter((x) => x != null);
    return args.length === 0 ? null : File.join(...args);
  }

  private async _entries(dir: string): Promise<string[]> {
    return await Dir.childrenAsync(dir);
  }
}

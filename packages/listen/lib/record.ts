import { Errno, File, Hash, Queue, SystemCallError } from "@blazetrails/ruby-compat";
import { Entry } from "./record/entry.js";
import { SymlinkDetector } from "./record/symlink-detector.js";
import type { Silencer } from "./silencer.js";

export type FileData = { [key: string]: unknown };

type Tree = Hash<string, FileData>;

export class Record {
  static readonly Entry = Entry;
  static readonly SymlinkDetector = SymlinkDetector;

  readonly root: string;
  private _tree!: Tree;
  private _silencer: Pick<Silencer, "isSilenced">;

  constructor(directory: { toString(): string }, silencer: Pick<Silencer, "isSilenced">) {
    this.resetTree();
    this.root = directory.toString();
    this._silencer = silencer;
  }

  addDir(relPath: { toString(): string }): FileData | undefined {
    if (!this.isEmptyDirname(relPath.toString())) {
      return this._tree.get(relPath.toString());
    }
    return undefined;
  }

  updateFile(relPath: string, data: FileData): void {
    const [dirname, basename] = File.split(relPath);
    this._fastUpdateFile(dirname, basename, data);
  }

  unsetPath(relPath: string): void {
    const [dirname, basename] = File.split(relPath);
    this._fastUnsetPath(dirname, basename);
  }

  fileData(relPath: string): FileData {
    const [dirname, basename] = File.split(relPath);
    if (this.isEmptyDirname(dirname)) {
      return { ...this._tree.get(basename) };
    } else {
      const dir = this._tree.get(dirname)!;
      dir[basename] ??= {};
      return { ...(dir[basename] as FileData) };
    }
  }

  dirEntries(relPath: { toString(): string }): { [key: string]: FileData } {
    const relPathS = relPath.toString();
    const subtree: Iterable<[string, unknown]> = this.isEmptyDirname(relPathS)
      ? this._tree
      : Object.entries(this._tree.get(relPathS)!);

    const result: { [key: string]: FileData } = {};
    for (const [key, values] of subtree) {
      if (values != null && typeof values === "object") {
        result[key] = "mtime" in values ? values : {};
      }
    }
    return result;
  }

  async build(): Promise<void> {
    this.resetTree();
    const symlinkDetector = new SymlinkDetector();
    const remaining = new Queue<Entry>();
    remaining.push(new Entry(this.root, null, null));
    while (!remaining.isEmpty()) await this._fastBuildDir(remaining, symlinkDetector);
  }

  private isEmptyDirname(dirname: string): boolean {
    return dirname === "." || dirname === "";
  }

  private resetTree(): void {
    this._tree = new Hash<string, FileData>((h, k) => {
      const v = {};
      h.set(k, v);
      return v;
    });
  }

  private _fastUpdateFile(dirname: string, basename: string, data: FileData): void {
    if (this.isEmptyDirname(dirname.toString())) {
      this._tree.set(basename, { ...this._tree.get(basename), ...data });
    } else {
      const dir = this._tree.get(dirname)!;
      dir[basename] = { ...(dir[basename] ?? {}), ...data };
    }
  }

  private _fastUnsetPath(dirname: string, basename: string): void {
    if (this.isEmptyDirname(dirname.toString())) {
      if (this._tree.has(basename)) {
        this._tree.delete(basename);
      }
    } else if (this._tree.has(dirname)) {
      delete this._tree.get(dirname)![basename];
    }
  }

  private async _fastBuildDir(
    remaining: Queue<Entry>,
    symlinkDetector: SymlinkDetector,
  ): Promise<void> {
    const entry = await remaining.pop();
    try {
      if (this._silencer.isSilenced(entry.recordDirKey(), "dir")) return;

      const children = await entry.children();
      await symlinkDetector.verifyUnwatchedBang(entry);
      children.forEach((child) => remaining.push(child));
      this.addDir(entry.recordDirKey());
    } catch (e) {
      if (e instanceof Errno.ENOTDIR) {
        await this._fastTryFile(entry);
      } else if (e instanceof SystemCallError || e instanceof SymlinkDetector.Error) {
        this._fastUnsetPath(entry.relative ?? "", entry.name ?? "");
      } else {
        throw e;
      }
    }
  }

  private async _fastTryFile(entry: Entry): Promise<void> {
    try {
      this._fastUpdateFile(entry.relative ?? "", entry.name ?? "", { ...(await entry.meta()) });
    } catch (e) {
      if (e instanceof SystemCallError) {
        this._fastUnsetPath(entry.relative ?? "", entry.name ?? "");
      } else {
        throw e;
      }
    }
  }
}

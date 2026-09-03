import { ArgumentError, Dir, File } from "@blazetrails/ruby-compat";

export class FileUpdateChecker {
  private files: string[];
  private glob?: string;
  private block: () => Promise<void> | void;
  private watchedMemo: string[] | null;
  private updatedAtMemo: Date | null;
  private lastWatched: string[];
  private lastUpdateAt: Date;

  constructor(
    files: string[],
    dirs: Record<string, string | string[]> = {},
    block?: () => Promise<void> | void,
  ) {
    if (!block) {
      throw new ArgumentError("A block is required to initialize a FileUpdateChecker");
    }

    this.files = files;
    this.glob = this.compileGlob(dirs);
    this.block = block;

    this.watchedMemo = null;
    this.updatedAtMemo = null;

    this.lastWatched = this.watched();
    this.lastUpdateAt = this.updatedAt(this.lastWatched);
  }

  updated(): boolean {
    const currentWatched = this.watched();
    if (this.lastWatched.length !== currentWatched.length) {
      this.watchedMemo = currentWatched;
      return true;
    } else {
      const currentUpdatedAt = this.updatedAt(currentWatched);
      if (this.lastUpdateAt.getTime() < currentUpdatedAt.getTime()) {
        this.watchedMemo = currentWatched;
        this.updatedAtMemo = currentUpdatedAt;
        return true;
      } else {
        return false;
      }
    }
  }

  async execute(): Promise<void> {
    this.lastWatched = this.watched();
    this.lastUpdateAt = this.updatedAt(this.lastWatched);
    try {
      await this.block();
    } finally {
      this.watchedMemo = null;
      this.updatedAtMemo = null;
    }
  }

  async executeIfUpdated(block?: () => Promise<void> | void): Promise<boolean> {
    if (this.updated()) {
      if (block) await block();
      await this.execute();
      return true;
    } else {
      return false;
    }
  }

  private watched(): string[] {
    if (this.watchedMemo) return this.watchedMemo;
    const all = this.files.filter((f) => File.isExist(f));
    if (this.glob != null) all.push(...Dir.glob(this.glob));
    return [...new Set(all)];
  }

  private updatedAt(paths: string[]): Date {
    // boundary: `Time.at(0)` (`:107`), compared against `File.mtime`, which
    return this.updatedAtMemo ?? this.maxMtime(paths) ?? new Date(0);
  }

  private maxMtime(paths: string[]): Date | null {
    // boundary: `Time.now` (`:119`), compared against `File.mtime`.
    const timeNow = new Date();
    let maxMtime: Date | null = null;

    for (const path of paths) {
      const mtime = File.mtime(path);

      if (timeNow.getTime() < mtime.getTime()) continue;

      if (maxMtime === null || maxMtime.getTime() < mtime.getTime()) {
        maxMtime = mtime;
      }
    }

    return maxMtime;
  }

  private compileGlob(hash: Record<string, string | string[]>): string | undefined {
    if (Object.keys(hash).length === 0) return undefined;

    const globs = Object.entries(hash).map(
      ([key, value]) => `${this.escape(key)}/**/*${this.compileExt(value) ?? ""}`,
    );
    return `{${globs.join(",")}}`;
  }

  private escape(key: string): string {
    return key.replaceAll(",", "\\,");
  }

  private compileExt(array: string | string[]): string | undefined {
    array = Array.isArray(array) ? array : [array];
    if (array.length === 0) return undefined;
    return `.{${array.join(",")}}`;
  }
}

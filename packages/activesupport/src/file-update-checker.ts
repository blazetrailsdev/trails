import { ArgumentError } from "@blazetrails/ruby-compat";
import { getFs, getPath } from "./fs-adapter.js";

/**
 * = File Update Checker
 *
 * FileUpdateChecker specifies the API used by Rails to watch files
 * and control reloading. The API depends on four methods:
 *
 * * `initialize` which expects two parameters and one block as
 *   described below.
 *
 * * `updated` which returns a boolean if there were updates in
 *   the filesystem or not.
 *
 * * `execute` which executes the given block on initialization
 *   and updates the latest watched files and timestamp.
 *
 * * `executeIfUpdated` which just executes the block if it was updated.
 *
 * After initialization, a call to `executeIfUpdated` must execute
 * the block only if there was really a change in the filesystem.
 *
 * Mirrors: `ActiveSupport::FileUpdateChecker`
 * (`activesupport/lib/active_support/file_update_checker.rb:34-163`).
 *
 * Two deviations, both forced:
 *
 * Ruby's `execute` yields to a synchronous block; trails' consumers
 * (`ActiveRecord::Migration::CheckPending`) hand it an async one, because the
 * work it wraps — `Migration.check_pending_migrations` — reaches the database.
 * So `execute` / `executeIfUpdated` answer a Promise; `updated` stays
 * synchronous exactly as Ruby's `updated?` is.
 *
 * And Ruby's `Dir[@glob]` (`:104`) has no JS counterpart, so the private
 * `dirGlob` expands the `{dir/**\/*.{ext,ext},…}` shape `compileGlob` itself
 * emits with the same sync directory walk
 * `ActiveRecord::MigrationContext#migration_files` already does by hand.
 * Ruby's `@watched` / `@updated_at` memos are spelled `watchedMemo` /
 * `updatedAtMemo` only because a JS class cannot carry a field and a method of
 * the same name.
 */
export class FileUpdateChecker {
  private files: string[];
  private glob?: string;
  private block: () => Promise<void> | void;
  private watchedMemo: string[] | null;
  private updatedAtMemo: Date | null;
  private lastWatched: string[];
  private lastUpdateAt: Date;

  /**
   * It accepts two parameters on initialization. The first is an array
   * of files and the second is an optional hash of directories. The hash must
   * have directories as keys and the value is an array of extensions to be
   * watched under that directory.
   *
   * This method must also receive a block that will be called once a path
   * changes. The array of files and list of directories cannot be changed
   * after FileUpdateChecker has been initialized.
   */
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

  /**
   * Check if any of the entries were updated. If so, the watched and/or
   * updatedAt values are cached until the block is executed via `execute`
   * or `executeIfUpdated`.
   */
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

  /**
   * Executes the given block and updates the latest watched files and
   * timestamp.
   */
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

  /** Execute the block given if updated. */
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
    const { existsSync } = getFs();
    const all = this.files.filter((f) => existsSync(f));
    if (this.glob) all.push(...this.dirGlob(this.glob));
    return [...new Set(all)];
  }

  private updatedAt(paths: string[]): Date {
    // boundary: `Time.at(0)` (`:107`), compared against `FsStatResult#mtime`,
    // which the fs adapter hands back as a JS `Date`.
    return this.updatedAtMemo ?? this.maxMtime(paths) ?? new Date(0);
  }

  /**
   * This method returns the maximum mtime of the files in `paths`, or `null`
   * if the array is empty.
   *
   * Files with a mtime in the future are ignored. Such abnormal situation
   * can happen for example if the user changes the clock by hand. It is
   * healthy to consider this edge case because with mtimes in the future
   * reloading is not triggered.
   */
  private maxMtime(paths: string[]): Date | null {
    const { statSync } = getFs();
    // boundary: `Time.now` (`:119`), compared against `FsStatResult#mtime`.
    const timeNow = new Date();
    let maxMtime: Date | null = null;

    for (const path of paths) {
      const mtime = statSync(path).mtime;

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

  private dirGlob(glob: string): string[] {
    const { readdirSync, existsSync } = getFs();
    const { join } = getPath();
    const results: string[] = [];

    for (const segment of glob.slice(1, -1).split(/(?<!\\),(?![^{]*\})/)) {
      const match = /^(.*)\/\*\*\/\*(?:\.\{(.*)\})?$/.exec(segment);
      if (!match) continue;
      const dir = match[1].replaceAll("\\,", ",");
      const exts = match[2] === undefined ? null : match[2].split(",");

      const collect = (current: string): void => {
        if (!existsSync(current)) return;
        for (const entry of readdirSync(current, { withFileTypes: true })) {
          const full = join(current, entry.name);
          if (entry.isDirectory()) {
            collect(full);
          } else if (exts === null || exts.some((ext) => entry.name.endsWith(`.${ext}`))) {
            results.push(full);
          }
        }
      };
      collect(dir);
    }

    return results;
  }
}

import { ArgumentError } from "./argument-error.js";
import { getFs, getPath, type FsStatResult } from "./fs-adapter.js";

/** `File.directory?` (`vendor/ruby/file.c:1615`). */
function isDirectory(path: string): boolean {
  try {
    return getFs().statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * `SystemCallError` (`vendor/ruby/error.c:3380`), the parent of the `Errno`
 * classes — which is what the fs backend's own errors are: they carry a
 * `.code`. Anything else propagates, as it does past Ruby's
 * `rescue SystemCallError`.
 */
function isSystemCallError(error: unknown): boolean {
  return typeof (error as { code?: unknown } | null | undefined)?.code === "string";
}

/**
 * `Entry_#directory?` (`vendor/ruby/lib/fileutils.rb:2123-2126`), which
 * `lstat!`s — a symlink to a directory is an entry to unlink, not a tree to
 * descend. An adapter with no `lstatSync` falls back to `statSync`, which
 * follows the link and cannot draw that distinction.
 */
function isDirectoryEntry(path: string): boolean {
  const fs = getFs();
  try {
    return (fs.lstatSync ? fs.lstatSync(path) : fs.statSync(path)).isDirectory();
  } catch {
    return false;
  }
}

/** `Entry_#postorder_traverse` (`vendor/ruby/lib/fileutils.rb:2364-2382`). */
function* postorderTraverse(path: string): Generator<string> {
  if (isDirectoryEntry(path)) {
    let children: string[];
    try {
      children = getFs().readdirSync(path);
    } catch (error) {
      if ((error as { code?: string }).code !== "EACCES") throw error;
      yield path;
      return;
    }

    for (const ent of children) {
      yield* postorderTraverse(getPath().join(path, ent));
    }
  }
  yield path;
}

/**
 * `Entry_#remove` (`vendor/ruby/lib/fileutils.rb:2314-2320`), whose
 * `remove_dir1` and `remove_file` are `Dir.rmdir` and `File.unlink`.
 */
function entryRemove(path: string): void {
  if (isDirectoryEntry(path)) {
    getFs().rmdirSync(removeTrailingSlash(path));
  } else {
    getFs().unlinkSync(path);
  }
}

/** `Entry_#exist?` / `#directory?` (`vendor/ruby/lib/fileutils.rb:2109,2123`). */
function statOrNull(path: string): FsStatResult | null {
  try {
    return getFs().statSync(path);
  } catch {
    return null;
  }
}

/**
 * `Errno::EEXIST` (`vendor/ruby/lib/fileutils.rb:1163`) — a `SystemCallError`,
 * whose `.code` the fs layer's own errors carry and callers branch on.
 */
function errnoEexist(path: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(`File exists - ${path}`);
  error.code = "EEXIST";
  return error;
}

/** `remove_trailing_slash` (`vendor/ruby/lib/fileutils.rb:276-278`). */
function removeTrailingSlash(dir: string): string {
  return dir === "/" ? dir : dir.endsWith("/") ? dir.slice(0, -1) : dir;
}

/** `fu_list` (`vendor/ruby/lib/fileutils.rb:2461-2463`). */
function fuList(arg: string | string[]): string[] {
  return Array.isArray(arg) ? [...arg] : [arg];
}

/**
 * `fu_mkdir` (`vendor/ruby/lib/fileutils.rb:396-404`). Ruby's `Dir.mkdir path,
 * mode` takes the mode in the create call; the backend contract's `mkdirSync`
 * does not, so the mode arrives through the `File.chmod` half alone.
 */
function fuMkdir(path: string, mode: number | undefined): void {
  path = removeTrailingSlash(path);
  if (mode != null) {
    getFs().mkdirSync(path);
    getFs().chmodSync?.(path, mode);
  } else {
    getFs().mkdirSync(path);
  }
}

/** `fu_same?` (`vendor/ruby/lib/fileutils.rb:2491-2493`) — `File.identical?`. */
function fuSame(a: string, b: string): boolean {
  const realpathSync = getFs().realpathSync;
  if (!realpathSync) return a === b;
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
}

/** `fu_each_src_dest0` (`vendor/ruby/lib/fileutils.rb:2474-2489`). */
function fuEachSrcDest0(
  src: string | string[],
  dest: string,
  yieldFn: (s: string, d: string) => void,
  targetDirectory = true,
): void {
  if (Array.isArray(src)) {
    for (const s of src) {
      yieldFn(s, targetDirectory ? getPath().join(dest, getPath().basename(s)) : dest);
    }
  } else {
    if (targetDirectory && isDirectory(dest)) {
      yieldFn(src, getPath().join(dest, getPath().basename(src)));
    } else {
      yieldFn(src, dest);
    }
  }
}

/** `fu_each_src_dest` (`vendor/ruby/lib/fileutils.rb:2466-2472`). */
function fuEachSrcDest(
  src: string | string[],
  dest: string,
  yieldFn: (s: string, d: string) => void,
): void {
  fuEachSrcDest0(src, dest, (s, d) => {
    if (fuSame(s, d)) throw new ArgumentError(`same file: ${s} and ${d}`);
    yieldFn(s, d);
  });
}

/**
 * `Entry_#copy_metadata` (`vendor/ruby/lib/fileutils.rb:2285-2312`). The backend
 * contract has no `lstatSync`, so the symlink arms — `File.lchown`,
 * `File.lchmod` — cannot be reached and the regular-file arms stand alone; and
 * `FsStatResult` carries `mtime` alone, so it stands in for Ruby's `st.atime`
 * as well.
 */
function copyMetadata(src: string, path: string): void {
  const st = getFs().statSync(src);
  getFs().utimesSync?.(path, st.mtime, st.mtime);
  let mode = st.mode ?? 0o644;
  try {
    if (st.uid != null && st.gid != null) getFs().chownSync?.(path, st.uid, st.gid);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== "EPERM" && code !== "EACCES") throw error;
    mode &= 0o1777;
  }
  getFs().chmodSync?.(path, mode);
}

/** `copy_file` (`vendor/ruby/lib/fileutils.rb:1076-1080`), whose `Entry_#copy_file`
 * (`fileutils.rb:2277-2283`) copies the bytes and `copy_metadata`
 * (`fileutils.rb:2285-2312`) the timestamps, ownership and mode. */
function copyFile(src: string, dest: string, preserve = false): void {
  getFs().copyFileSync(src, dest);
  if (preserve) copyMetadata(src, dest);
}

/**
 * `copy_entry` (`vendor/ruby/lib/fileutils.rb:1040-1053`), whose `wrap_traverse`
 * walks a directory tree and copies each entry, then its `copy_metadata` under
 * `preserve`.
 */
function copyEntry(src: string, dest: string, preserve = false): void {
  const ent = getFs().statSync(src);
  if (ent.isDirectory()) {
    FileUtils.mkdirP(dest);
    for (const name of getFs().readdirSync(src)) {
      copyEntry(getPath().join(src, name), getPath().join(dest, name), preserve);
    }
    if (preserve) copyMetadata(src, dest);
  } else {
    copyFile(src, dest, preserve);
  }
}

/**
 * `File.utime` (`vendor/ruby/file.c:2983`). `utimesSync` is optional on the
 * backend contract, and an adapter without one still has to raise `ENOENT` for
 * a missing path — which is the branch `touch` reads — so the fallback stats
 * the path for exactly that, and no-ops the timestamp update itself: against
 * such an adapter `touch` creates a missing file but does not move an existing
 * one's mtime.
 */
function fileUtime(atime: Date, mtime: Date, path: string): void {
  const utimesSync = getFs().utimesSync;
  if (utimesSync) {
    utimesSync(path, atime, mtime);
    return;
  }
  getFs().statSync(path);
}

/**
 * Ruby's `FileUtils` (stdlib, `vendor/ruby/lib/fileutils.rb:1`), the file
 * operations Rails sends from ported bodies — `mkdir_p` when a schema dump or a
 * cache root has to exist, `rm`/`rm_f`/`rm_r` when one is torn down, `cp`, `mv`
 * and `touch`. Only the members Ruby code in this repo sends are ported.
 *
 * Every member runs against the filesystem backend `fs-adapter.ts` resolves, so
 * `FileUtils` is synchronous exactly as Ruby's is, and a caller reads the same
 * `FileUtils.mkdir_p(dir)` a Rails dev reads.
 *
 * The `verbose:` kwarg is accepted where Ruby accepts it — Rails passes
 * `verbose: false` (`activerecord/lib/active_record/tasks/database_tasks.rb:509`)
 * — but `fu_output_message` (`fileutils.rb:2496`) has no `$stdout` to write to
 * here, so nothing is printed.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `FileUtils` ships with
 * the interpreter, so no Rails file defines it and no port can remove the need
 * for it while Rails bodies send `FileUtils.mkdir_p` and friends.
 */
export class FileUtils {
  /** `FileUtils.mkdir_p` (`vendor/ruby/lib/fileutils.rb:365-388`).
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static mkdirP(
    list: string | string[],
    { mode, noop }: { mode?: number; noop?: boolean; verbose?: boolean } = {},
  ): string[] {
    list = fuList(list);
    if (noop === true) return list;

    for (const item of list) {
      let path = removeTrailingSlash(item);

      const stack: string[] = [];
      while (!isDirectory(path) && getPath().dirname(path) !== path) {
        stack.push(path);
        path = getPath().dirname(path);
      }
      for (const dir of stack.reverse()) {
        try {
          fuMkdir(dir, mode);
        } catch (error) {
          if (!isSystemCallError(error) || !isDirectory(dir)) throw error;
        }
      }
    }

    return list;
  }

  /** `FileUtils.makedirs` (`vendor/ruby/lib/fileutils.rb:392-394`), an alias of `mkdir_p`.
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static makedirs = FileUtils.mkdirP;

  /** `FileUtils.cp` (`vendor/ruby/lib/fileutils.rb:873-879`).
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static cp(
    src: string | string[],
    dest: string,
    { preserve, noop }: { preserve?: boolean; noop?: boolean; verbose?: boolean } = {},
  ): void {
    if (noop === true) return;
    fuEachSrcDest(src, dest, (s, d) => {
      copyFile(s, d, preserve);
    });
  }

  /** `FileUtils.mv` (`vendor/ruby/lib/fileutils.rb:1157-1183`). Ruby's `secure:`
   * kwarg routes the cross-device fallback's teardown through
   * `remove_entry_secure` (`fileutils.rb:1351-1447`), which is built on
   * `Process.euid`; `process.*` is unavailable here, so the kwarg has no arm to
   * select and is not accepted.
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static mv(
    src: string | string[],
    dest: string,
    { force, noop }: { force?: boolean; noop?: boolean; verbose?: boolean } = {},
  ): void {
    if (noop === true) return;
    fuEachSrcDest(src, dest, (s, d) => {
      try {
        const destent = statOrNull(d);
        if (destent) {
          if (destent.isDirectory()) throw errnoEexist(d);
        }
        try {
          getFs().renameSync(s, d);
        } catch (error) {
          const code = (error as { code?: string }).code;
          if (code !== "EXDEV" && code !== "EPERM") throw error;
          copyEntry(s, d, true);
          FileUtils.removeEntry(s, force);
        }
      } catch (error) {
        if (!isSystemCallError(error) || force !== true) throw error;
      }
    });
  }

  /** `FileUtils.rm` (`vendor/ruby/lib/fileutils.rb:1216-1225`).
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static rm(
    list: string | string[],
    { force, noop }: { force?: boolean; noop?: boolean; verbose?: boolean } = {},
  ): string[] | undefined {
    list = fuList(list);
    if (noop === true) return;

    for (const path of list) {
      FileUtils.removeFile(path, force);
    }
    return list;
  }

  /** `FileUtils.rm_f` (`vendor/ruby/lib/fileutils.rb:1241-1243`).
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static rmF(
    list: string | string[],
    { noop, verbose }: { noop?: boolean; verbose?: boolean } = {},
  ): string[] | undefined {
    return FileUtils.rm(list, { force: true, noop, verbose });
  }

  /** `FileUtils.rm_r` (`vendor/ruby/lib/fileutils.rb:1299-1310`).
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static rmR(
    list: string | string[],
    { force, noop }: { force?: boolean; noop?: boolean; verbose?: boolean } = {},
  ): string[] | undefined {
    list = fuList(list);
    if (noop === true) return;
    for (const path of list) {
      FileUtils.removeEntry(path, force);
    }
    return list;
  }

  /** `FileUtils.remove_entry` (`vendor/ruby/lib/fileutils.rb:1449-1456`).
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static removeEntry(path: string, force = false): void {
    try {
      for (const ent of postorderTraverse(path)) {
        try {
          entryRemove(ent);
        } catch (error) {
          if (force !== true) throw error;
        }
      }
    } catch (error) {
      if (force !== true) throw error;
    }
  }

  /** `FileUtils.remove_file` (`vendor/ruby/lib/fileutils.rb:1473-1477`).
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static removeFile(path: string, force = false): void {
    try {
      getFs().unlinkSync(path);
    } catch (error) {
      if (force !== true) throw error;
    }
  }

  /** `FileUtils.touch` (`vendor/ruby/lib/fileutils.rb:2006-2026`).
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static touch(
    list: string | string[],
    {
      noop,
      mtime,
      nocreate,
    }: { noop?: boolean; verbose?: boolean; mtime?: Date; nocreate?: boolean } = {},
  ): void {
    list = fuList(list);
    const t = mtime;
    if (noop === true) return;
    for (const path of list) {
      let created = nocreate;
      for (;;) {
        try {
          fileUtime(t ?? new Date(), t ?? new Date(), path);
        } catch (error) {
          if ((error as { code?: string }).code !== "ENOENT") throw error;
          if (created === true) throw error;
          getFs().appendFileSync(path, "");
          created = true;
          if (t != null) continue;
        }
        break;
      }
    }
  }
}

import { ArgumentError } from "./argument-error.js";
import { File } from "./file.js";
import { getFs, getPath, type FsStatResult } from "./fs-adapter.js";
import { NotImplementedError } from "./not-implemented-error.js";
import { stdout } from "./process-adapter.js";

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
 * `SystemCallError` (`vendor/ruby/error.c:3899` `rb_eSystemCallError`), whose
 * subclass is picked by an errno — spelled here as the `code` the fs layer's
 * own errors already carry.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `SystemCallError`, which Rails
 * rescues without defining.
 */
interface SystemCallError extends Error {
  code?: string;
}

/**
 * `Errno::EEXIST` (`vendor/ruby/lib/fileutils.rb:1163`) — a `SystemCallError`,
 * whose `.code` the fs layer's own errors carry and callers branch on.
 */
function errnoEexist(path: string): SystemCallError {
  const error: SystemCallError = new Error(`File exists - ${path}`);
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
 * `Entry_#lstat` (`vendor/ruby/lib/fileutils.rb:2192-2198`) — `File.stat` under
 * `dereference?`, `File.lstat` otherwise. An adapter with no `lstatSync` cannot
 * draw the distinction and stats either way.
 */
function entryLstat(path: string, dereference: boolean): FsStatResult {
  const fs = getFs();
  if (dereference || !fs.lstatSync) return fs.statSync(path);
  return fs.lstatSync(path);
}

/**
 * `File.lchown` (`vendor/ruby/file.c:3567`), which raises `NotImplementedError`
 * on a platform whose C library has no `lchown` — spelled here as a backend
 * with no `lchownSync`.
 */
function fileLchown(uid: number, gid: number, path: string): void {
  const lchownSync = getFs().lchownSync;
  if (!lchownSync)
    throw new NotImplementedError("lchown() function is unimplemented on this machine");
  lchownSync(path, uid, gid);
}

/** `File.lchmod` (`vendor/ruby/file.c:3211`), `NotImplementedError` as above. */
function fileLchmod(mode: number, path: string): void {
  const lchmodSync = getFs().lchmodSync;
  if (!lchmodSync)
    throw new NotImplementedError("lchmod() function is unimplemented on this machine");
  lchmodSync(path, mode);
}

/** `File.readlink` (`vendor/ruby/file.c:3081`). */
function fileReadlink(path: string): string {
  const readlinkSync = getFs().readlinkSync;
  if (!readlinkSync)
    throw new NotImplementedError("readlink() function is unimplemented on this machine");
  return readlinkSync(path);
}

/** `File.symlink` (`vendor/ruby/file.c:3033`). */
function fileSymlink(old: string, newName: string): void {
  const symlinkSync = getFs().symlinkSync;
  if (!symlinkSync)
    throw new NotImplementedError("symlink() function is unimplemented on this machine");
  symlinkSync(old, newName);
}

/** `Entry_#copy_metadata` (`vendor/ruby/lib/fileutils.rb:2285-2312`). */
function copyMetadata(src: string, path: string, dereference: boolean): void {
  const st = entryLstat(src, dereference);
  const symlink = st.isSymbolicLink?.() === true;
  if (!symlink) {
    fileUtime(st.atime, st.mtime, path);
  }
  let mode = st.mode ?? 0o644;
  try {
    if (symlink) {
      try {
        fileLchown(st.uid, st.gid, path);
      } catch (error) {
        if (!(error instanceof NotImplementedError)) throw error;
      }
    } else {
      getFs().chownSync?.(path, st.uid, st.gid);
    }
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== "EPERM" && code !== "EACCES") throw error;
    mode &= 0o1777;
  }
  if (symlink) {
    try {
      fileLchmod(mode, path);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (!(error instanceof NotImplementedError) && code !== "EOPNOTSUPP") throw error;
    }
  } else {
    getFs().chmodSync?.(path, mode);
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
 * The `output.puts msg` receiver `fu_output_message`
 * (`vendor/ruby/lib/fileutils.rb:2496-2503`) writes to — `$stdout` by default,
 * or whatever `@fileutils_output` was set to.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `IO`, which Rails calls without
 * defining.
 */
export interface FileUtilsOutput {
  /** `IO#puts` (`vendor/ruby/io.c:8580`).
   * @noRailsEquivalent PERMANENT — Ruby core `IO`, which Rails calls without
   * defining.
   */
  puts(msg: string): void;
}

/** `$stdout` (`vendor/ruby/lib/fileutils.rb:2498`), reached through the process
 * backend so the leaf writes without importing one. */
const fuStdout: FileUtilsOutput = {
  puts: (msg) => {
    stdout.write(`${msg}\n`);
  },
};

/** `fu_output_message` (`vendor/ruby/lib/fileutils.rb:2496-2503`). */
function fuOutputMessage(msg: string): void {
  const output = FileUtils.fileutilsOutput ?? fuStdout;
  if (FileUtils.fileutilsLabel != null) {
    msg = FileUtils.fileutilsLabel + msg;
  }
  output.puts(msg);
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
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `FileUtils` ships with
 * the interpreter, so no Rails file defines it and no port can remove the need
 * for it while Rails bodies send `FileUtils.mkdir_p` and friends.
 */
export class FileUtils {
  /** `@fileutils_output` (`vendor/ruby/lib/fileutils.rb:2497`), the sink
   * `fu_output_message` writes to when a host has set one.
   * @noRailsEquivalent PERMANENT — the JS spelling of a Ruby module instance
   * variable, which has no member of its own to mirror.
   */
  static fileutilsOutput?: FileUtilsOutput;

  /** `@fileutils_label` (`vendor/ruby/lib/fileutils.rb:2500`), prefixed to
   * every message when a host has set one.
   * @noRailsEquivalent PERMANENT — the JS spelling of a Ruby module instance
   * variable, which has no member of its own to mirror.
   */
  static fileutilsLabel?: string;

  /** `FileUtils.mkdir_p` (`vendor/ruby/lib/fileutils.rb:365-388`).
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static mkdirP(
    list: string | string[],
    { mode, noop, verbose }: { mode?: number; noop?: boolean; verbose?: boolean } = {},
  ): string[] {
    list = fuList(list);
    if (verbose === true)
      fuOutputMessage(
        `mkdir -p ${mode != null ? `-m ${mode.toString(8).padStart(3, "0")} ` : ""}${list.join(" ")}`,
      );
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
    { preserve, noop, verbose }: { preserve?: boolean; noop?: boolean; verbose?: boolean } = {},
  ): void {
    if (verbose === true)
      fuOutputMessage(`cp${preserve === true ? " -p" : ""} ${[src, dest].flat().join(" ")}`);
    if (noop === true) return;
    fuEachSrcDest(src, dest, (s, d) => {
      FileUtils.copyFile(s, d, preserve);
    });
  }

  /**
   * `copy_entry` (`vendor/ruby/lib/fileutils.rb:1040-1053`), whose `wrap_traverse`
   * walks a directory tree and copies each entry with `Entry_#copy`
   * (`fileutils.rb:2239-2274`), then its `copy_metadata` under `preserve`.
   *
   * `Entry_#copy`'s `socket?` and `pipe?` arms each raise before their copy under
   * an interpreter that answers no `UNIXServer` (`fileutils.rb:2258-2263`) and no
   * `File.mkfifo` (`fileutils.rb:2267`); neither constant exists here, so those
   * are the arms taken. `door?` (`:2269`) is Solaris-only and no backend answers
   * a predicate for it, so a door reaches the true `else` (`:2273`).
   *
   * `dereference_root` rewrites the root through `File.realpath`
   * (`fileutils.rb:1041-1043`) so a symlinked root is copied as its target, and
   * `remove_destination` unlinks an existing destination entry before each copy
   * (`fileutils.rb:1047`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static copyEntry(
    src: string,
    dest: string,
    preserve = false,
    dereferenceRoot = false,
    removeDestination = false,
  ): void {
    if (dereferenceRoot) {
      src = File.realpath(src);
    }

    if (removeDestination && (File.isFile(dest) || File.isSymlink(dest))) File.delete(dest);

    const ent = entryLstat(src, false);
    if (ent.isFile()) {
      FileUtils.copyFile(src, dest, preserve, false);
    } else if (ent.isDirectory()) {
      FileUtils.mkdirP(dest);
      for (const name of getFs().readdirSync(src)) {
        FileUtils.copyEntry(
          getPath().join(src, name),
          getPath().join(dest, name),
          preserve,
          false,
          removeDestination,
        );
      }
      if (preserve) copyMetadata(src, dest, false);
    } else if (ent.isSymbolicLink?.() === true) {
      fileSymlink(fileReadlink(src), dest);
      if (preserve) copyMetadata(src, dest, false);
    } else if (ent.isCharacterDevice?.() === true || ent.isBlockDevice?.() === true) {
      throw new Error("cannot handle device file");
    } else if (ent.isSocket?.() === true) {
      throw new Error("cannot handle socket");
    } else if (ent.isFIFO?.() === true) {
      throw new Error("cannot handle FIFO");
    } else {
      throw new Error(`unknown file type: ${src}`);
    }
  }

  /** `FileUtils.copy_file` (`vendor/ruby/lib/fileutils.rb:1076-1080`), whose
   * `Entry_#copy_file` (`fileutils.rb:2277-2283`) copies the bytes and
   * `copy_metadata` (`fileutils.rb:2285-2312`) the timestamps, ownership and
   * mode. Ruby's `dereference` reaches only `Entry_#lstat`
   * (`fileutils.rb:2192-2198`), which `copy_metadata` calls, so it selects an
   * arm under `preserve` alone and only for a symlink source.
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static copyFile(src: string, dest: string, preserve = false, dereference = true): void {
    getFs().copyFileSync(src, dest);
    if (preserve) copyMetadata(src, dest, dereference);
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
    { force, noop, verbose }: { force?: boolean; noop?: boolean; verbose?: boolean } = {},
  ): void {
    if (verbose === true)
      fuOutputMessage(`mv${force === true ? " -f" : ""} ${[src, dest].flat().join(" ")}`);
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
          FileUtils.copyEntry(s, d, true);
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
    { force, noop, verbose }: { force?: boolean; noop?: boolean; verbose?: boolean } = {},
  ): string[] | undefined {
    list = fuList(list);
    if (verbose === true) fuOutputMessage(`rm${force === true ? " -f" : ""} ${list.join(" ")}`);
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
    { force, noop, verbose }: { force?: boolean; noop?: boolean; verbose?: boolean } = {},
  ): string[] | undefined {
    list = fuList(list);
    if (verbose === true) fuOutputMessage(`rm -r${force === true ? "f" : ""} ${list.join(" ")}`);
    if (noop === true) return;
    for (const path of list) {
      FileUtils.removeEntry(path, force);
    }
    return list;
  }

  /** `FileUtils.rm_rf` (`vendor/ruby/lib/fileutils.rb:1328-1330`). Ruby's
   * `secure:` kwarg routes `rm_r` through `remove_entry_secure`
   * (`fileutils.rb:1351-1447`), which is unported, so the kwarg has no arm to
   * select and is not accepted — as on `rm_r` itself.
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static rmRf(
    list: string | string[],
    { noop, verbose }: { noop?: boolean; verbose?: boolean } = {},
  ): string[] | undefined {
    return FileUtils.rmR(list, { force: true, noop, verbose });
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

  /** `FileUtils.touch` (`vendor/ruby/lib/fileutils.rb:2006-2026`). The verbose
   * line's `t.strftime('-t %Y%m%d%H%M.%S ')` is spelled out digit by digit:
   * `strftime` lives in `@blazetrails/activesupport`, which this leaf cannot
   * import.
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static touch(
    list: string | string[],
    {
      noop,
      mtime,
      nocreate,
      verbose,
    }: { noop?: boolean; verbose?: boolean; mtime?: Date; nocreate?: boolean } = {},
  ): void {
    list = fuList(list);
    const t = mtime;
    if (verbose === true) {
      const pad = (n: number): string => String(n).padStart(2, "0");
      const at =
        t != null
          ? `-t ${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}` +
            `${pad(t.getHours())}${pad(t.getMinutes())}.${pad(t.getSeconds())} `
          : "";
      fuOutputMessage(`touch ${nocreate === true ? "-c " : ""}${at}${list.join(" ")}`);
    }
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

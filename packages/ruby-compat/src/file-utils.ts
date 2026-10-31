import { ArgumentError } from "./argument-error.js";
import { Dir } from "./dir.js";
import { File, rbGetPath, type PathLike } from "./file.js";
import { getFs, getPath, type FsFileHandle, type FsStatResult } from "./fs-adapter.js";
import { IO } from "./io.js";
import { NotImplementedError } from "./not-implemented-error.js";
import { rbObjRespondTo, rtest } from "./object.js";
import { stdout } from "./process-adapter.js";
import { stringSplit } from "./string/split.js";

/** `File.directory?` (`vendor/ruby/v3.3.11/file.c:1615`). */
function isDirectory(path: string): boolean {
  try {
    return getFs().statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * `SystemCallError` (`vendor/ruby/v3.3.11/error.c:3380`), the parent of the `Errno`
 * classes — which is what the fs backend's own errors are: they carry a
 * `.code`. Anything else propagates, as it does past Ruby's
 * `rescue SystemCallError`.
 */
function isSystemCallError(error: unknown): boolean {
  return typeof (error as { code?: unknown } | null | undefined)?.code === "string";
}

/** `Entry_#exist?` / `#directory?` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2109,2123`). */
function statOrNull(path: string): FsStatResult | null {
  try {
    return getFs().statSync(path);
  } catch {
    return null;
  }
}

/**
 * `SystemCallError` (`vendor/ruby/v3.3.11/error.c:3899` `rb_eSystemCallError`), whose
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
 * `Errno::EEXIST` (`vendor/ruby/v3.3.11/lib/fileutils.rb:1163`) — a `SystemCallError`,
 * whose `.code` the fs layer's own errors carry and callers branch on.
 */
function errnoEexist(path: string): SystemCallError {
  const error: SystemCallError = new Error(`File exists - ${path}`);
  error.code = "EEXIST";
  return error;
}

/** `remove_trailing_slash` (`vendor/ruby/v3.3.11/lib/fileutils.rb:276-278`). */
function removeTrailingSlash(dir: string): string {
  return dir === "/" ? dir : dir.endsWith("/") ? dir.slice(0, -1) : dir;
}

/** `fu_list` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2461-2463`). */
function fuList(arg: string | string[]): string[] {
  return Array.isArray(arg) ? [...arg] : [arg];
}

/**
 * `fu_mkdir` (`vendor/ruby/v3.3.11/lib/fileutils.rb:396-404`). Ruby's `Dir.mkdir path,
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

/** `fu_same?` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2491-2493`) — `File.identical?`. */
function fuSame(a: string, b: string): boolean {
  const realpathSync = getFs().realpathSync;
  if (!realpathSync) return a === b;
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
}

/** `fu_each_src_dest0` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2474-2489`). */
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

/** `fu_each_src_dest` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2466-2472`). */
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
 * `File.lchown` (`vendor/ruby/v3.3.11/file.c:3567`), which raises `NotImplementedError`
 * on a platform whose C library has no `lchown` — spelled here as a backend
 * with no `lchownSync`.
 */
function fileLchown(uid: number, gid: number, path: string): void {
  const lchownSync = getFs().lchownSync;
  if (!lchownSync)
    throw new NotImplementedError("lchown() function is unimplemented on this machine");
  lchownSync(path, uid, gid);
}

/** `File.lchmod` (`vendor/ruby/v3.3.11/file.c:3211`), `NotImplementedError` as above. */
function fileLchmod(mode: number, path: string): void {
  const lchmodSync = getFs().lchmodSync;
  if (!lchmodSync)
    throw new NotImplementedError("lchmod() function is unimplemented on this machine");
  lchmodSync(path, mode);
}

/** `File.readlink` (`vendor/ruby/v3.3.11/file.c:3081`). */
function fileReadlink(path: string): string {
  const readlinkSync = getFs().readlinkSync;
  if (!readlinkSync)
    throw new NotImplementedError("readlink() function is unimplemented on this machine");
  return readlinkSync(path);
}

/** `File.symlink` (`vendor/ruby/v3.3.11/file.c:3033`). */
function fileSymlink(old: string, newName: string): void {
  const symlinkSync = getFs().symlinkSync;
  if (!symlinkSync)
    throw new NotImplementedError("symlink() function is unimplemented on this machine");
  symlinkSync(old, newName);
}

/**
 * `File.utime` (`vendor/ruby/v3.3.11/file.c:2983`). `utimesSync` is optional on the
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
 * `Entry_` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2069-2459`), the one directory-tree
 * walker every recursive `FileUtils` body is written against: `copy_entry`
 * (`fileutils.rb:1044-1052`) hands it two procs, `remove_entry`
 * (`fileutils.rb:1450`) traverses it in postorder.
 *
 * `stat` / `stat!` and `platform_support` are only reachable from
 * members no Rails body sends, and `fu_windows?` is false for every backend
 * here, so `platform_support`'s retry has no arm to select either. The
 * `chardev?`-through-`pipe?` predicates read the backend's own `FsStatResult`
 * predicates, which are optional on the contract and answer false when a
 * backend has none.
 */
class Entry_ {
  private readonly _prefix: string | null = null;
  private readonly _rel: string | null = null;
  private readonly _path: string | null = null;
  private readonly _deref: boolean;
  private _lstat: FsStatResult | null = null;

  /**
   * `Entry_::S_IF_DOOR` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2153`), the file-type
   * bits `door?` masks a mode against. `private` because `Entry_` itself is
   * Ruby's `internal use only` class and `door?` is its only reader: a public
   * constant in a file no Rails file maps onto is measured extra surface, and
   * a `@noRailsEquivalent` receipt cannot reach it — a literal constant is
   * collected by `extractFileConstants`, which carries no tag.
   */
  private static readonly S_IF_DOOR = 0xd000;

  /** `Entry_#initialize` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2072-2083`). */
  constructor(a: string, b: string | null = null, deref = false) {
    if (b != null) {
      this._prefix = a;
      this._rel = b;
    } else {
      this._path = a;
    }
    this._deref = deref;
  }

  /** `Entry_#path` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2089-2095`). */
  get path(): string {
    if (this._path != null) {
      return this._path;
    } else {
      return this.join(this.prefix, this.rel);
    }
  }

  /** `Entry_#prefix` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2097-2099`). */
  get prefix(): string | null {
    return this._prefix ?? this._path;
  }

  /** `Entry_#rel` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2101-2103`). */
  get rel(): string | null {
    return this._rel;
  }

  /** `Entry_#dereference?` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2105-2107`). */
  get isDereference(): boolean {
    return this._deref;
  }

  /** `Entry_#file?` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2118-2121`). */
  get isFile(): boolean {
    const s = this.lstatBang();
    return s != null && s.isFile();
  }

  /** `Entry_#directory?` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2123-2126`). */
  get isDirectory(): boolean {
    const s = this.lstatBang();
    return s != null && s.isDirectory();
  }

  /** `Entry_#symlink?` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2128-2131`). */
  get isSymlink(): boolean {
    const s = this.lstatBang();
    return s != null && s.isSymbolicLink?.() === true;
  }

  /** `Entry_#chardev?` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2133-2136`). */
  get isChardev(): boolean {
    const s = this.lstatBang();
    return s != null && s.isCharacterDevice?.() === true;
  }

  /** `Entry_#blockdev?` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2138-2141`). */
  get isBlockdev(): boolean {
    const s = this.lstatBang();
    return s != null && s.isBlockDevice?.() === true;
  }

  /** `Entry_#socket?` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2143-2146`). */
  get isSocket(): boolean {
    const s = this.lstatBang();
    return s != null && s.isSocket?.() === true;
  }

  /** `Entry_#pipe?` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2148-2151`). */
  get isPipe(): boolean {
    const s = this.lstatBang();
    return s != null && s.isFIFO?.() === true;
  }

  /** `Entry_#door?` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2155-2158`). */
  get isDoor(): boolean {
    const s = this.lstatBang();
    return s != null && (s.mode & 0xf000) === Entry_.S_IF_DOOR;
  }

  /** `Entry_#entries` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2159-2167`). */
  entries(): Entry_[] {
    const files = Dir.children(this.path);

    return files.map((n) => new Entry_(this.prefix as string, this.join(this.rel, n)));
  }

  /** `Entry_#lstat` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2192-2198`). */
  lstat(): FsStatResult {
    if (this.isDereference) {
      return (this._lstat ??= getFs().statSync(this.path));
    } else {
      return (this._lstat ??= getFs().lstatSync(this.path));
    }
  }

  /** `Entry_#lstat!` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2200-2204`). */
  lstatBang(): FsStatResult | null {
    try {
      return this.lstat();
    } catch (error) {
      if (!isSystemCallError(error)) throw error;
      return null;
    }
  }

  /**
   * `Entry_#copy` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2239-2274`).
   *
   * The `socket?` and `pipe?` arms each raise before their copy under an
   * interpreter that answers no `UNIXServer` (`fileutils.rb:2258-2263`) and no
   * `File.mkfifo` (`fileutils.rb:2267`); neither constant exists here, so those
   * are the arms taken.
   */
  copy(dest: string): void {
    this.lstat();
    if (this.isFile) {
      this.copyFile(dest);
    } else if (this.isDirectory) {
      if (!File.isExist(dest) && this.isDescendantDirectory(dest, this.path)) {
        throw new ArgumentError(`cannot copy directory ${this.path} to itself ${dest}`);
      }
      try {
        Dir.mkdir(dest);
      } catch (error) {
        if (!File.isDirectory(dest)) throw error;
      }
    } else if (this.isSymlink) {
      fileSymlink(fileReadlink(this.path), dest);
    } else if (this.isChardev || this.isBlockdev) {
      throw new Error("cannot handle device file");
    } else if (this.isSocket) {
      throw new Error("cannot handle socket");
    } else if (this.isPipe) {
      throw new Error("cannot handle FIFO");
    } else if (this.isDoor) {
      throw new Error(`cannot handle door: ${this.path}`);
    } else {
      throw new Error(`unknown file type: ${this.path}`);
    }
  }

  /** `Entry_#copy_file` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2277-2283`). */
  copyFile(dest: string): void {
    File.open(this.path, "r", (s) => {
      File.open(dest, "wb", { perm: s.stat().mode }, (f) => {
        IO.copyStream(s, f);
      });
    });
  }

  /** `Entry_#copy_metadata` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2285-2312`). */
  copyMetadata(path: string): void {
    const st = this.lstat();
    const symlink = st.isSymbolicLink?.() === true;
    if (!symlink) {
      fileUtime(st.atime, st.mtime, path);
    }
    let mode = st.mode;
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

  /** `Entry_#remove` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2314-2320`). */
  remove(): void {
    if (this.isDirectory) {
      this.removeDir1();
    } else {
      this.removeFile();
    }
  }

  /** `Entry_#remove_dir1` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2322-2326`). */
  removeDir1(): void {
    getFs().rmdirSync(removeTrailingSlash(this.path));
  }

  /** `Entry_#remove_file` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2328-2332`). */
  removeFile(): void {
    getFs().unlinkSync(this.path);
  }

  /** `Entry_#preorder_traverse` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2354-2360`). */
  preorderTraverse(yieldFn: (ent: Entry_) => void): void {
    const stack: Entry_[] = [this];
    let ent: Entry_ | undefined;
    while ((ent = stack.pop()) != null) {
      yieldFn(ent);
      if (ent.isDirectory) stack.push(...ent.entries().reverse());
    }
  }

  /** `Entry_#postorder_traverse` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2364-2382`). */
  postorderTraverse(yieldFn: (ent: Entry_) => void): void {
    if (this.isDirectory) {
      let children: Entry_[];
      try {
        children = this.entries();
      } catch (error) {
        if ((error as { code?: string }).code !== "EACCES") throw error;
        yieldFn(this);
        return;
      }

      for (const ent of children) {
        ent.postorderTraverse((e) => {
          yieldFn(e);
        });
      }
    }
    yieldFn(this);
  }

  async isDirectoryAsync(): Promise<boolean> {
    const s = await this.lstatBangAsync();
    return s != null && s.isDirectory();
  }

  async isSymlinkAsync(): Promise<boolean> {
    const s = await this.lstatBangAsync();
    return s != null && s.isSymbolicLink?.() === true;
  }

  async isFileAsync(): Promise<boolean> {
    const s = await this.lstatBangAsync();
    return s != null && s.isFile();
  }

  async entriesAsync(): Promise<Entry_[]> {
    const files = await Dir.childrenAsync(this.path);

    return files.map((n) => new Entry_(this.prefix as string, this.join(this.rel, n)));
  }

  async lstatAsync(): Promise<FsStatResult> {
    const fs = getFs();
    if (this.isDereference) {
      return (this._lstat ??= fs.stat ? await fs.stat(this.path) : fs.statSync(this.path));
    } else {
      return (this._lstat ??= fs.lstat ? await fs.lstat(this.path) : fs.lstatSync(this.path));
    }
  }

  async lstatBangAsync(): Promise<FsStatResult | null> {
    try {
      return await this.lstatAsync();
    } catch (error) {
      if (!isSystemCallError(error)) throw error;
      return null;
    }
  }

  async chmodAsync(mode: number): Promise<void> {
    try {
      if (await this.isSymlinkAsync()) {
        if (getFs().lchmodSync != null) fileLchmod(mode, this.path);
      } else {
        await File.chmodAsync(mode, this.path);
      }
    } catch (error) {
      if ((error as { code?: string }).code !== "EOPNOTSUPP") throw error;
    }
  }

  /** `Entry_#chown` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2215-2221`). */
  async chownAsync(uid: number | null, gid: number | null): Promise<void> {
    if (await this.isSymlinkAsync()) {
      if (getFs().lchown != null) await getFs().lchown!(this.path, uid ?? -1, gid ?? -1);
    } else {
      await File.chownAsync(uid, gid, this.path);
    }
  }

  /** `Entry_#link` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2223-2237`). */
  async linkAsync(dest: string): Promise<void> {
    if (await this.isDirectoryAsync()) {
      if (!(await File.isExistAsync(dest)) && this.isDescendantDirectory(dest, this.path)) {
        throw new ArgumentError(`cannot link directory ${this.path} to itself ${dest}`);
      }
      try {
        await getFs().mkdir!(dest);
      } catch (error) {
        if (!(await File.isDirectoryAsync(dest))) throw error;
      }
    } else {
      await File.linkAsync(this.path, dest);
    }
  }

  async copyAsync(dest: string): Promise<void> {
    await this.lstatAsync();
    if (this.isFile) {
      await this.copyFileAsync(dest);
    } else if (this.isDirectory) {
      if (!(await File.isExistAsync(dest)) && this.isDescendantDirectory(dest, this.path)) {
        throw new ArgumentError(`cannot copy directory ${this.path} to itself ${dest}`);
      }
      try {
        await getFs().mkdir!(dest);
      } catch (error) {
        if (!(await File.isDirectoryAsync(dest))) throw error;
      }
    } else if (this.isSymlink) {
      await File.symlinkAsync(await getFs().readlink!(this.path), dest);
    } else if (this.isChardev || this.isBlockdev) {
      throw new Error("cannot handle device file");
    } else if (this.isSocket) {
      throw new Error("cannot handle socket");
    } else if (this.isPipe) {
      throw new Error("cannot handle FIFO");
    } else if (this.isDoor) {
      throw new Error(`cannot handle door: ${this.path}`);
    } else {
      throw new Error(`unknown file type: ${this.path}`);
    }
  }

  async copyFileAsync(dest: string): Promise<void> {
    const fs = getFs();
    await fs.writeFile!(dest, await fs.readFile(this.path), {
      mode: (await fs.stat!(this.path)).mode,
    });
  }

  async copyMetadataAsync(path: string): Promise<void> {
    const st = await this.lstatAsync();
    const symlink = st.isSymbolicLink?.() === true;
    if (!symlink) {
      await File.utimeAsync(st.atime, st.mtime, path);
    }
    let mode = st.mode;
    try {
      if (symlink) {
        try {
          if (getFs().lchown) await getFs().lchown!(path, st.uid, st.gid);
          else fileLchown(st.uid, st.gid, path);
        } catch (error) {
          if (!(error instanceof NotImplementedError)) throw error;
        }
      } else {
        await File.chownAsync(st.uid, st.gid, path);
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
      await File.chmodAsync(mode, path);
    }
  }

  async removeAsync(): Promise<void> {
    if (await this.isDirectoryAsync()) {
      await this.removeDir1Async();
    } else {
      await this.removeFileAsync();
    }
  }

  async removeDir1Async(): Promise<void> {
    const fs = getFs();
    const path = removeTrailingSlash(this.path);
    if (fs.rmdir) await fs.rmdir(path);
    else fs.rmdirSync(path);
  }

  async removeFileAsync(): Promise<void> {
    const fs = getFs();
    if (fs.unlink) await fs.unlink(this.path);
    else fs.unlinkSync(this.path);
  }

  async preorderTraverseAsync(yieldFn: (ent: Entry_) => Promise<void>): Promise<void> {
    const stack: Entry_[] = [this];
    let ent: Entry_ | undefined;
    while ((ent = stack.pop()) != null) {
      await yieldFn(ent);
      if (await ent.isDirectoryAsync()) stack.push(...(await ent.entriesAsync()).reverse());
    }
  }

  async postorderTraverseAsync(yieldFn: (ent: Entry_) => Promise<void>): Promise<void> {
    if (await this.isDirectoryAsync()) {
      let children: Entry_[];
      try {
        children = await this.entriesAsync();
      } catch (error) {
        if ((error as { code?: string }).code !== "EACCES") throw error;
        await yieldFn(this);
        return;
      }

      for (const ent of children) {
        await ent.postorderTraverseAsync(async (e) => {
          await yieldFn(e);
        });
      }
    }
    await yieldFn(this);
  }

  async wrapTraverseAsync(
    pre: (ent: Entry_) => Promise<void>,
    post: (ent: Entry_) => Promise<void>,
  ): Promise<void> {
    await pre(this);
    if (await this.isDirectoryAsync()) {
      for (const ent of await this.entriesAsync()) {
        await ent.wrapTraverseAsync(pre, post);
      }
    }
    await post(this);
  }

  /** `Entry_#wrap_traverse` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2386-2393`). */
  wrapTraverse(pre: (ent: Entry_) => void, post: (ent: Entry_) => void): void {
    pre(this);
    if (this.isDirectory) {
      for (const ent of this.entries()) {
        ent.wrapTraverse(pre, post);
      }
    }
    post(this);
  }

  /** `Entry_#join` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2432-2446`). */
  private join(dir: string | null, base: string | null): string {
    if (base == null || base === ".") return dir as string;
    if (dir == null || dir === ".") return base;
    return File.join(dir, base);
  }

  /**
   * `Entry_#descendant_directory?` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2452-2458`),
   * the guard `Entry_#copy`'s directory arm raises on (`fileutils.rb:2245-2247`).
   */
  private isDescendantDirectory(descendant: string, ascendant: string): boolean {
    if (File.FNM_SYSCASE !== 0) {
      return (
        File.expandPath(File.dirname(descendant)).toLowerCase() ===
        File.expandPath(ascendant).toLowerCase()
      );
    } else {
      return File.expandPath(File.dirname(descendant)) === File.expandPath(ascendant);
    }
  }
}

/**
 * The `output.puts msg` receiver `fu_output_message`
 * (`vendor/ruby/v3.3.11/lib/fileutils.rb:2496-2503`) writes to — `$stdout` by default,
 * or whatever `@fileutils_output` was set to.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `IO`, which Rails calls without
 * defining.
 */
export interface FileUtilsOutput {
  /** `IO#puts` (`vendor/ruby/v3.3.11/io.c:8580`).
   * @noRailsEquivalent PERMANENT — Ruby core `IO`, which Rails calls without
   * defining.
   */
  puts(msg: string): void;
}

/** `$stdout` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2498`), reached through the process
 * backend so the leaf writes without importing one. */
const fuStdout: FileUtilsOutput = {
  puts: (msg) => {
    stdout.write(`${msg}\n`);
  },
};

/** `fu_output_message` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2496-2503`). */
function fuOutputMessage(msg: string): void {
  const output = FileUtils.fileutilsOutput ?? fuStdout;
  if (FileUtils.fileutilsLabel != null) {
    msg = FileUtils.fileutilsLabel + msg;
  }
  output.puts(msg);
}

/**
 * Ruby's `FileUtils` (stdlib, `vendor/ruby/v3.3.11/lib/fileutils.rb:1`), the file
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
  /** `@fileutils_output` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2497`), the sink
   * `fu_output_message` writes to when a host has set one.
   * @noRailsEquivalent PERMANENT — the JS spelling of a Ruby module instance
   * variable, which has no member of its own to mirror.
   */
  static fileutilsOutput?: FileUtilsOutput;

  /** `@fileutils_label` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2500`), prefixed to
   * every message when a host has set one.
   * @noRailsEquivalent PERMANENT — the JS spelling of a Ruby module instance
   * variable, which has no member of its own to mirror.
   */
  static fileutilsLabel?: string;

  /** `fu_split_path` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2506-2515`).
   * @noRailsEquivalent PERMANENT
   */
  static fuSplitPath(path: string): string[] {
    const list: string[] = [];
    for (;;) {
      const [parent, base] = File.split(path);
      if (parent === path || parent === ".") break;
      list.push(base);
      path = parent;
    }
    list.push(path);
    return list.reverse();
  }

  /** `fu_relative_components_from` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2518-2524`).
   * @noRailsEquivalent PERMANENT
   */
  static fuRelativeComponentsFrom(target: string[], base: string[]): string[] {
    let i = 0;
    while (target[i] != null && target[i] === base[i]) {
      i += 1;
    }
    return new Array<string>(base.length - i).fill("..").concat(target.slice(i));
  }

  /**
   * `fu_clean_components` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2527-2542`). MRI's
   * `path.chomp!(regexp, "")` at `:2535` is an `ArgumentError`, since `chomp!`
   * takes one argument; this is the `sub!` that line means.
   *
   * @missingRailsCall chomp! — PERMANENT
   * @noRailsEquivalent PERMANENT
   */
  static async fuCleanComponentsAsync(...comp: string[]): Promise<string[]> {
    while (comp[0] === ".") comp.shift();
    if (comp.length === 0) return comp;
    const clean = [comp.shift()!];
    let path = File.join(...clean, "");
    while (comp.length > 0) {
      const c = comp.shift()!;
      if (
        c === ".." &&
        clean.at(-1) !== ".." &&
        !(getFs().symlink != null && (await File.isSymlinkAsync(path)))
      ) {
        clean.pop();
        path = path.replace(/(?<=^|\/)[^/]+\/$/, "");
      } else {
        clean.push(c);
        path += `${c}/`;
      }
    }
    return clean;
  }

  /** `fu_starting_path?` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2550-2552`).
   * @noRailsEquivalent PERMANENT
   */
  static isFuStartingPath(path: string | undefined): boolean {
    return path != null && path.startsWith("/");
  }

  /** `user_mask` (`vendor/ruby/v3.3.11/lib/fileutils.rb:1642-1657`).
   * @noRailsEquivalent PERMANENT
   */
  static userMask(target: string): number {
    return [...target].reduce((mask, chr) => {
      switch (chr) {
        case "u":
          return mask | 0o4700;
        case "g":
          return mask | 0o2070;
        case "o":
          return mask | 0o1007;
        case "a":
          return mask | 0o7777;
        default:
          throw new ArgumentError(`invalid \`who' symbol in file mode: ${chr}`);
      }
    }, 0);
  }

  /** `apply_mask` (`vendor/ruby/v3.3.11/lib/fileutils.rb:1660-1669`).
   * @noRailsEquivalent PERMANENT
   */
  static applyMask(mode: number, userMask: number, op: string, modeMask: number): number {
    switch (op) {
      case "=":
        return (mode & ~userMask) | (userMask & modeMask);
      case "+":
        return mode | (userMask & modeMask);
      default:
        return mode & ~(userMask & modeMask);
    }
  }

  /** `symbolic_modes_to_i` (`vendor/ruby/v3.3.11/lib/fileutils.rb:1672-1718`).
   * @noRailsEquivalent PERMANENT
   */
  static async symbolicModesToIAsync(
    modeSym: string,
    path: string | FsStatResult,
  ): Promise<number> {
    const st = typeof path === "string" ? await getFs().stat!(path) : path;
    let currentMode = st.mode & 0o7777;
    for (const clause of stringSplit(modeSym, ",")) {
      const [target, ...actions] = clause.split(/([=+-])/);
      if (actions.length === 0) throw new ArgumentError(`invalid file mode: ${modeSym}`);
      const mask = FileUtils.userMask(target === "" ? "a" : target);
      for (let i = 0; i < actions.length; i += 2) {
        const op = actions[i];
        const perm = actions[i + 1] ?? "";
        let needApply = op === "=";
        let modeMask = 0;
        for (const chr of perm) {
          switch (chr) {
            case "r":
              modeMask |= 0o444;
              break;
            case "w":
              modeMask |= 0o222;
              break;
            case "x":
              modeMask |= 0o111;
              break;
            case "X":
              if (st.isDirectory()) modeMask |= 0o111;
              break;
            case "s":
              modeMask |= 0o6000;
              break;
            case "t":
              modeMask |= 0o1000;
              break;
            case "u":
            case "g":
            case "o": {
              if (modeMask !== 0)
                currentMode = FileUtils.applyMask(currentMode, mask, op, modeMask);
              needApply = false;
              const copyMask = FileUtils.userMask(chr);
              modeMask = Math.floor((currentMode & copyMask) / (copyMask & 0o111)) * (mask & 0o111);
              break;
            }
            default:
              throw new ArgumentError(`invalid \`perm' symbol in file mode: ${chr}`);
          }
        }

        if (modeMask !== 0 || needApply) {
          currentMode = FileUtils.applyMask(currentMode, mask, op, modeMask);
        }
      }
    }
    return currentMode;
  }

  /** `fu_mode` (`vendor/ruby/v3.3.11/lib/fileutils.rb:1721-1723`).
   * @noRailsEquivalent PERMANENT
   */
  static async fuModeAsync(mode: number | string, path: string | FsStatResult): Promise<number> {
    return typeof mode === "string" ? FileUtils.symbolicModesToIAsync(mode, path) : mode;
  }

  /** `mode_to_s` (`vendor/ruby/v3.3.11/lib/fileutils.rb:1726-1728`).
   * @noRailsEquivalent PERMANENT
   */
  static modeToS(mode: number | string): string {
    return typeof mode === "string" ? mode : mode.toString(8);
  }

  /** @noRailsEquivalent PERMANENT */
  static async etcIdAsync(file: string, name: string, label: string): Promise<number> {
    const rows = await getFs().readFile(file, "utf-8");
    for (const row of rows.split("\n")) {
      const fields = row.split(":");
      if (fields[0] === name && /^\d+$/.test(fields[2] ?? "")) return Number(fields[2]);
    }
    throw new ArgumentError(`can't find ${label} for ${name}`);
  }

  /** `fu_get_uid` (`vendor/ruby/v3.3.11/lib/fileutils.rb:1933-1944`).
   * @noRailsEquivalent PERMANENT
   */
  static async fuGetUidAsync(user: string | number | null | undefined): Promise<number | null> {
    if (user == null) return null;
    if (typeof user === "number") return user;
    if (/^\d+$/.test(user)) return Number(user);
    return FileUtils.etcIdAsync("/etc/passwd", user, "user");
  }

  /** `fu_get_gid` (`vendor/ruby/v3.3.11/lib/fileutils.rb:1947-1958`).
   * @noRailsEquivalent PERMANENT
   */
  static async fuGetGidAsync(group: string | number | null | undefined): Promise<number | null> {
    if (group == null) return null;
    if (typeof group === "number") return group;
    if (/^\d+$/.test(group)) return Number(group);
    return FileUtils.etcIdAsync("/etc/group", group, "group");
  }

  /** `FileUtils.cd` (`vendor/ruby/v3.3.11/lib/fileutils.rb:238-243`), through
   * `Dir.chdir`, which restores the previous directory once an async block
   * settles; `cd -` is printed at that point too.
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static cd(dir: string, options?: { verbose?: boolean | null }): number;
  static cd<T>(dir: string, block: (dir: string) => T): T;
  static cd<T>(dir: string, options: { verbose?: boolean | null }, block: (dir: string) => T): T;
  static cd<T>(
    dir: string,
    options: { verbose?: boolean | null } | ((dir: string) => T) = {},
    block?: (dir: string) => T,
  ): number | T {
    if (typeof options === "function") [options, block] = [{}, options];
    const { verbose } = options;
    if (verbose != null && verbose !== false) fuOutputMessage(`cd ${dir}`);
    const result = block != null ? Dir.chdir(dir, block) : Dir.chdir(dir);
    if (verbose != null && verbose !== false && block != null) {
      if (result != null && typeof (result as { then?: unknown }).then === "function") {
        return Promise.resolve(result).then((value) => {
          fuOutputMessage("cd -");
          return value;
        }) as T;
      }
      fuOutputMessage("cd -");
    }
    return result;
  }

  /** `FileUtils.chdir` (`vendor/ruby/v3.3.11/lib/fileutils.rb:246`), an alias of `cd`.
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static chdir = FileUtils.cd;

  /** `FileUtils.mkdir_p` (`vendor/ruby/v3.3.11/lib/fileutils.rb:365-388`).
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

  /** {@link FileUtils.mkdirP} over the backend's async verbs
   * (`vendor/ruby/v3.3.11/lib/fileutils.rb:365-388`).
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static async mkdirPAsync(
    list: string | string[],
    { mode, noop, verbose }: { mode?: number; noop?: boolean; verbose?: boolean } = {},
  ): Promise<string[]> {
    list = fuList(list);
    if (rtest(verbose))
      fuOutputMessage(
        `mkdir -p ${mode != null ? `-m ${mode.toString(8).padStart(3, "0")} ` : ""}${list.join(" ")}`,
      );
    if (rtest(noop)) return list;

    const isDirectoryAsync = (path: string): Promise<boolean> =>
      getFs().stat!(path).then(
        (stat) => stat.isDirectory(),
        () => false,
      );

    for (const item of list) {
      let path = removeTrailingSlash(item);

      const stack: string[] = [];
      while (!(await isDirectoryAsync(path)) && getPath().dirname(path) !== path) {
        stack.push(path);
        path = getPath().dirname(path);
      }
      for (const dir of stack.reverse()) {
        try {
          await FileUtils.fuMkdirAsync(dir, mode);
        } catch (error) {
          if (!isSystemCallError(error) || !(await isDirectoryAsync(dir))) throw error;
        }
      }
    }

    return list;
  }

  /** `FileUtils.mkdir` (`vendor/ruby/v3.3.11/lib/fileutils.rb:316-324`), over async `mkdir`.
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static async mkdirAsync(
    list: string | string[],
    { mode, noop, verbose }: { mode?: number; noop?: boolean; verbose?: boolean } = {},
  ): Promise<string[] | undefined> {
    list = fuList(list);
    if (rtest(verbose))
      fuOutputMessage(
        `mkdir ${mode != null ? `-m ${mode.toString(8).padStart(3, "0")} ` : ""}${list.join(" ")}`,
      );
    if (rtest(noop)) return;

    for (const dir of list) {
      await FileUtils.fuMkdirAsync(dir, mode);
    }
    return list;
  }

  /** @noRailsEquivalent PERMANENT */
  static mkpathAsync = FileUtils.mkdirPAsync;

  /** @noRailsEquivalent PERMANENT */
  static makedirsAsync = FileUtils.mkdirPAsync;

  /** `FileUtils.rmdir` (`vendor/ruby/v3.3.11/lib/fileutils.rb:442-458`), over async `rmdir`.
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static async rmdirAsync(
    list: string | string[],
    { parents, noop, verbose }: { parents?: boolean; noop?: boolean; verbose?: boolean } = {},
  ): Promise<string[] | undefined> {
    list = fuList(list);
    if (rtest(verbose)) fuOutputMessage(`rmdir ${parents ? "-p " : ""}${list.join(" ")}`);
    if (rtest(noop)) return;
    for (let dir of list) {
      await getFs().rmdir!((dir = removeTrailingSlash(dir)));
      if (parents) {
        try {
          let parent: string;
          while ((parent = File.dirname(dir)) !== "." && parent !== dir) {
            dir = parent;
            await getFs().rmdir!(dir);
          }
        } catch (error) {
          const code = (error as { code?: string }).code;
          if (code !== "ENOTEMPTY" && code !== "EEXIST" && code !== "ENOENT") throw error;
        }
      }
    }
    return list;
  }

  /** `FileUtils.makedirs` (`vendor/ruby/v3.3.11/lib/fileutils.rb:392-394`), an alias of `mkdir_p`.
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static makedirs = FileUtils.mkdirP;

  /** `FileUtils.cp` (`vendor/ruby/v3.3.11/lib/fileutils.rb:873-879`).
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
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  static async fuMkdirAsync(path: string, mode: number | undefined): Promise<void> {
    path = removeTrailingSlash(path);
    if (mode != null) {
      await getFs().mkdir!(path, { mode });
      await File.chmodAsync(mode, path);
    } else {
      await getFs().mkdir!(path);
    }
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  static async fuEachSrcDest0Async(
    src: string | string[],
    dest: string,
    yieldFn: (s: string, d: string) => Promise<void>,
    targetDirectory = true,
  ): Promise<void> {
    if (Array.isArray(src)) {
      for (const s of src) {
        await yieldFn(s, targetDirectory ? getPath().join(dest, getPath().basename(s)) : dest);
      }
    } else {
      if (targetDirectory && (await File.isDirectoryAsync(dest))) {
        await yieldFn(src, getPath().join(dest, getPath().basename(src)));
      } else {
        await yieldFn(src, dest);
      }
    }
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  static async fuEachSrcDestAsync(
    src: string | string[],
    dest: string,
    yieldFn: (s: string, d: string) => Promise<void>,
  ): Promise<void> {
    await FileUtils.fuEachSrcDest0Async(src, dest, async (s, d) => {
      if (await File.isIdenticalAsync(s, d)) throw new ArgumentError(`same file: ${s} and ${d}`);
      await yieldFn(s, d);
    });
  }

  /** @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils.ln` (`vendor/ruby/v3.3.11/lib/fileutils.rb:516-523`), over the backend's async `link`. */
  static async lnAsync(
    src: string | string[],
    dest: string,
    { force, noop, verbose }: { force?: unknown; noop?: boolean; verbose?: boolean } = {},
  ): Promise<void> {
    if (rtest(verbose))
      fuOutputMessage(`ln${rtest(force) ? " -f" : ""} ${[src, dest].flat().join(" ")}`);
    if (rtest(noop)) return;
    await FileUtils.fuEachSrcDest0Async(src, dest, async (s, d) => {
      if (rtest(force)) await FileUtils.removeFileAsync(d, true);
      await File.linkAsync(s, d);
    });
  }

  /** @noRailsEquivalent PERMANENT */
  static linkAsync = FileUtils.lnAsync;

  /** `FileUtils.ln_s` (`vendor/ruby/v3.3.11/lib/fileutils.rb:706-716`).
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static async lnSAsync(
    src: string | string[],
    dest: string,
    {
      force,
      relative = false,
      noop,
      verbose,
    }: { force?: unknown; relative?: unknown; noop?: boolean; verbose?: boolean } = {},
  ): Promise<void> {
    if (rtest(relative)) {
      return FileUtils.lnSrAsync(src, dest, { force, noop, verbose });
    }
    if (rtest(verbose))
      fuOutputMessage(`ln -s${rtest(force) ? "f" : ""} ${[src, dest].flat().join(" ")}`);
    if (rtest(noop)) return;
    await FileUtils.fuEachSrcDest0Async(src, dest, async (s, d) => {
      if (rtest(force)) await FileUtils.removeFileAsync(d, true);
      await File.symlinkAsync(s, d);
    });
  }

  /** @noRailsEquivalent PERMANENT */
  static symlinkAsync = FileUtils.lnSAsync;

  /** `FileUtils.ln_sf` (`vendor/ruby/v3.3.11/lib/fileutils.rb:724-726`).
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static async lnSfAsync(
    src: string | string[],
    dest: string,
    { noop, verbose }: { noop?: boolean; verbose?: boolean } = {},
  ): Promise<void> {
    return FileUtils.lnSAsync(src, dest, { force: true, noop, verbose });
  }

  /** `FileUtils.ln_sr` (`vendor/ruby/v3.3.11/lib/fileutils.rb:731-768`).
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static async lnSrAsync(
    src: string | string[],
    dest: string,
    {
      targetDirectory = true,
      force,
      noop,
      verbose,
    }: { targetDirectory?: unknown; force?: unknown; noop?: boolean; verbose?: boolean } = {},
  ): Promise<void> {
    const options = `${rtest(force) ? "f" : ""}${rtest(targetDirectory) ? "" : "T"}`;
    const srcs = fuList(src);
    const link = async (s: string, targetDirP: unknown = true): Promise<void> => {
      const d = rtest(targetDirP) ? File.join(dest, File.basename(s)) : dest;
      const destdirs = FileUtils.fuSplitPath(
        await getFs().realpath!(rtest(targetDirP) ? dest : File.dirname(dest)),
      );
      if (FileUtils.isFuStartingPath(s)) {
        const srcdirs = FileUtils.fuSplitPath(
          await File.realdirpathAsync(s).catch(() => File.expandPath(s)),
        );
        const base = FileUtils.fuRelativeComponentsFrom(srcdirs, destdirs);
        s = File.join(...base);
      } else {
        const srcdirs = await FileUtils.fuCleanComponentsAsync(...FileUtils.fuSplitPath(s));
        const base = FileUtils.fuRelativeComponentsFrom(FileUtils.fuSplitPath(Dir.pwd()), destdirs);
        while (
          srcdirs[0] === ".." &&
          base.length > 0 &&
          base.at(-1) !== ".." &&
          !FileUtils.isFuStartingPath(base.at(-1))
        ) {
          srcdirs.shift();
          base.pop();
        }
        s = File.join(...base, ...srcdirs);
      }
      if (rtest(verbose)) fuOutputMessage(`ln -s${options} ${s} ${d}`);
      if (rtest(noop)) return;
      if (rtest(force)) await FileUtils.removeFileAsync(d, true);
      await File.symlinkAsync(s, d);
    };
    if (srcs.length === 1) {
      await link(srcs[0], rtest(targetDirectory) && (await File.isDirectoryAsync(dest)));
    } else {
      for (const s of srcs) await link(s);
    }
  }

  /** @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils.cp` (`vendor/ruby/v3.3.11/lib/fileutils.rb:873-879`), over async `readFile` / `writeFile`. */
  static async cpAsync(
    src: string | string[],
    dest: string,
    { preserve, noop, verbose }: { preserve?: unknown; noop?: boolean; verbose?: boolean } = {},
  ): Promise<void> {
    if (rtest(verbose))
      fuOutputMessage(`cp${rtest(preserve) ? " -p" : ""} ${[src, dest].flat().join(" ")}`);
    if (rtest(noop)) return;
    await FileUtils.fuEachSrcDestAsync(src, dest, (s, d) =>
      FileUtils.copyFileAsync(s, d, preserve),
    );
  }

  /** @noRailsEquivalent PERMANENT */
  static copyAsync = FileUtils.cpAsync;

  /** `FileUtils.cp_r` (`vendor/ruby/v3.3.11/lib/fileutils.rb:985-992`).
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static async cpRAsync(
    src: string | string[],
    dest: string,
    {
      preserve,
      noop,
      verbose,
      dereferenceRoot = true,
      removeDestination,
    }: {
      preserve?: unknown;
      noop?: boolean;
      verbose?: boolean;
      dereferenceRoot?: boolean;
      removeDestination?: boolean;
    } = {},
  ): Promise<void> {
    if (rtest(verbose))
      fuOutputMessage(
        `cp -r${rtest(preserve) ? "p" : ""}${removeDestination ? " --remove-destination" : ""} ${[src, dest].flat().join(" ")}`,
      );
    if (rtest(noop)) return;
    await FileUtils.fuEachSrcDestAsync(src, dest, (s, d) =>
      FileUtils.copyEntryAsync(s, d, preserve, dereferenceRoot, removeDestination),
    );
  }

  /** `FileUtils.cp_lr` (`vendor/ruby/v3.3.11/lib/fileutils.rb:627-634`).
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static async cpLrAsync(
    src: string | string[],
    dest: string,
    {
      noop,
      verbose,
      dereferenceRoot = true,
      removeDestination = false,
    }: {
      noop?: boolean;
      verbose?: boolean;
      dereferenceRoot?: boolean;
      removeDestination?: boolean;
    } = {},
  ): Promise<void> {
    if (rtest(verbose))
      fuOutputMessage(
        `cp -lr${removeDestination ? " --remove-destination" : ""} ${[src, dest].flat().join(" ")}`,
      );
    if (rtest(noop)) return;
    await FileUtils.fuEachSrcDestAsync(src, dest, (s, d) =>
      FileUtils.linkEntryAsync(s, d, dereferenceRoot, removeDestination),
    );
  }

  /** `FileUtils.link_entry` (`vendor/ruby/v3.3.11/lib/fileutils.rb:812-818`).
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static async linkEntryAsync(
    src: string,
    dest: string,
    dereferenceRoot = false,
    removeDestination = false,
  ): Promise<void> {
    await new Entry_(src, null, dereferenceRoot).preorderTraverseAsync(async (ent) => {
      const destent = new Entry_(dest, ent.rel, false);
      if (removeDestination && (await File.isFileAsync(destent.path))) {
        await File.deleteAsync(destent.path);
      }
      await ent.linkAsync(destent.path);
    });
  }

  /**
   * `copy_entry` (`vendor/ruby/v3.3.11/lib/fileutils.rb:1040-1053`), whose `wrap_traverse`
   * walks a directory tree and copies each entry with `Entry_#copy`
   * (`fileutils.rb:2239-2274`), then its `copy_metadata` under `preserve`.
   *
   * `Entry_#copy`'s `socket?` and `pipe?` arms each raise before their copy under
   * an interpreter that answers no `UNIXServer` (`fileutils.rb:2258-2263`) and no
   * `File.mkfifo` (`fileutils.rb:2267`); neither constant exists here, so those
   * are the arms taken.
   *
   * `dereference_root` rewrites the root through `File.realpath`
   * (`fileutils.rb:1041-1043`) so a symlinked root is copied as its target, and
   * `remove_destination` unlinks an existing destination entry before each copy
   * (`fileutils.rb:1047`), through `File.delete` — the name Ruby's `File.unlink`
   * is an alias of (`vendor/ruby/v3.3.11/file.c:3202`).
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

    new Entry_(src, null, false).wrapTraverse(
      (ent) => {
        const destent = new Entry_(dest, ent.rel, false);
        if (removeDestination && (File.isFile(destent.path) || File.isSymlink(destent.path)))
          File.delete(destent.path);
        ent.copy(destent.path);
      },
      (ent) => {
        const destent = new Entry_(dest, ent.rel, false);
        if (preserve) ent.copyMetadata(destent.path);
      },
    );
  }

  /** @noRailsEquivalent PERMANENT */
  static async copyEntryAsync(
    src: string,
    dest: string,
    preserve: unknown = false,
    dereferenceRoot = false,
    removeDestination = false,
  ): Promise<void> {
    if (dereferenceRoot) {
      src = await getFs().realpath!(src);
    }

    await new Entry_(src, null, false).wrapTraverseAsync(
      async (ent) => {
        const destent = new Entry_(dest, ent.rel, false);
        if (
          removeDestination &&
          ((await destent.isFileAsync()) || (await destent.isSymlinkAsync()))
        )
          await File.deleteAsync(destent.path);
        await ent.copyAsync(destent.path);
      },
      async (ent) => {
        const destent = new Entry_(dest, ent.rel, false);
        if (rtest(preserve)) await ent.copyMetadataAsync(destent.path);
      },
    );
  }

  /** `FileUtils.copy_file` (`vendor/ruby/v3.3.11/lib/fileutils.rb:1076-1080`), whose
   * `Entry_#copy_file` (`fileutils.rb:2277-2283`) copies the bytes and
   * `copy_metadata` (`fileutils.rb:2285-2312`) the timestamps, ownership and
   * mode. Ruby's `dereference` reaches only `Entry_#lstat`
   * (`fileutils.rb:2192-2198`), which `copy_metadata` calls, so it selects an
   * arm under `preserve` alone and only for a symlink source.
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static copyFile(
    src: string | PathLike,
    dest: string,
    preserve = false,
    dereference = true,
  ): void {
    const ent = new Entry_(rbGetPath(src), null, dereference);
    ent.copyFile(dest);
    if (preserve) ent.copyMetadata(dest);
  }

  /** @noRailsEquivalent PERMANENT */
  static async copyFileAsync(
    src: string,
    dest: string,
    preserve: unknown = false,
    dereference = true,
  ): Promise<void> {
    const ent = new Entry_(src, null, dereference);
    await ent.copyFileAsync(dest);
    if (rtest(preserve)) await ent.copyMetadataAsync(dest);
  }

  /** `FileUtils.mv` (`vendor/ruby/v3.3.11/lib/fileutils.rb:1157-1183`). Ruby's `secure:`
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

  /** @noRailsEquivalent PERMANENT */
  static async mvAsync(
    src: string | string[],
    dest: string,
    { force, noop, verbose }: { force?: unknown; noop?: boolean; verbose?: boolean } = {},
  ): Promise<void> {
    if (rtest(verbose))
      fuOutputMessage(`mv${rtest(force) ? " -f" : ""} ${[src, dest].flat().join(" ")}`);
    if (rtest(noop)) return;
    await FileUtils.fuEachSrcDestAsync(src, dest, async (s, d) => {
      const destent = new Entry_(d, null, true);
      try {
        if ((await destent.lstatBangAsync()) != null) {
          if (await destent.isDirectoryAsync()) throw errnoEexist(d);
        }
        try {
          await getFs().rename!(s, d);
        } catch (error) {
          const code = (error as { code?: string }).code;
          if (code !== "EXDEV" && code !== "EPERM") throw error;
          await FileUtils.copyEntryAsync(s, d, true);
          await FileUtils.removeEntryAsync(s, force);
        }
      } catch (error) {
        if (!isSystemCallError(error) || !rtest(force)) throw error;
      }
    });
  }

  /** @noRailsEquivalent PERMANENT */
  static moveAsync = FileUtils.mvAsync;

  /** `FileUtils.rm` (`vendor/ruby/v3.3.11/lib/fileutils.rb:1216-1225`).
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

  /** `FileUtils.rm_f` (`vendor/ruby/v3.3.11/lib/fileutils.rb:1241-1243`).
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static rmF(
    list: string | string[],
    { noop, verbose }: { noop?: boolean; verbose?: boolean } = {},
  ): string[] | undefined {
    return FileUtils.rm(list, { force: true, noop, verbose });
  }

  /** @noRailsEquivalent PERMANENT */
  static async rmAsync(
    list: string | string[],
    { force, noop, verbose }: { force?: unknown; noop?: boolean; verbose?: boolean } = {},
  ): Promise<string[] | undefined> {
    list = fuList(list);
    if (rtest(verbose)) fuOutputMessage(`rm${rtest(force) ? " -f" : ""} ${list.join(" ")}`);
    if (rtest(noop)) return;

    for (const path of list) {
      await FileUtils.removeFileAsync(path, force);
    }
    return list;
  }

  /** @noRailsEquivalent PERMANENT */
  static removeAsync = FileUtils.rmAsync;

  /** @noRailsEquivalent PERMANENT */
  static async rmFAsync(
    list: string | string[],
    { noop, verbose }: { noop?: boolean; verbose?: boolean } = {},
  ): Promise<string[] | undefined> {
    return FileUtils.rmAsync(list, { force: true, noop, verbose });
  }

  /** @noRailsEquivalent PERMANENT */
  static safeUnlinkAsync = FileUtils.rmFAsync;

  /** `FileUtils.rm_r` (`vendor/ruby/v3.3.11/lib/fileutils.rb:1299-1310`).
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

  /** `FileUtils.rm_rf` (`vendor/ruby/v3.3.11/lib/fileutils.rb:1328-1330`). Ruby's
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

  /** `FileUtils.remove_entry` (`vendor/ruby/v3.3.11/lib/fileutils.rb:1449-1456`).
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static removeEntry(path: string, force = false): void {
    try {
      new Entry_(path).postorderTraverse((ent) => {
        try {
          ent.remove();
        } catch (error) {
          if (force !== true) throw error;
        }
      });
    } catch (error) {
      if (force !== true) throw error;
    }
  }

  /** {@link FileUtils.rmR} over the backend's async verbs
   * (`vendor/ruby/v3.3.11/lib/fileutils.rb:1299-1310`).
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static async rmRAsync(
    list: string | string[],
    { force, noop, verbose }: { force?: unknown; noop?: boolean; verbose?: boolean } = {},
  ): Promise<string[] | undefined> {
    list = fuList(list);
    if (rtest(verbose)) fuOutputMessage(`rm -r${rtest(force) ? "f" : ""} ${list.join(" ")}`);
    if (rtest(noop)) return;
    for (const path of list) {
      await FileUtils.removeEntryAsync(path, force);
    }
    return list;
  }

  /** {@link FileUtils.rmRf} over the backend's async verbs
   * (`vendor/ruby/v3.3.11/lib/fileutils.rb:1328-1330`).
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static async rmRfAsync(
    list: string | string[],
    { noop, verbose }: { noop?: boolean; verbose?: boolean } = {},
  ): Promise<string[] | undefined> {
    return FileUtils.rmRAsync(list, { force: true, noop, verbose });
  }

  /** @noRailsEquivalent PERMANENT */
  static rmtreeAsync = FileUtils.rmRfAsync;

  /** {@link FileUtils.removeEntry} (`vendor/ruby/v3.3.11/lib/fileutils.rb:1449-1456`)
   * over `Entry_`'s async walk: `Entry_#postorder_traverse`
   * (`fileutils.rb:2364-2382`) yielding to `Entry_#remove` (`fileutils.rb:2314-2332`).
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static async removeEntryAsync(path: string, force: unknown = false): Promise<void> {
    try {
      await new Entry_(path).postorderTraverseAsync(async (ent) => {
        try {
          await ent.removeAsync();
        } catch (error) {
          if (!rtest(force)) throw error;
        }
      });
    } catch (error) {
      if (!rtest(force)) throw error;
    }
  }

  /** `FileUtils.compare_file` (`vendor/ruby/v3.3.11/lib/fileutils.rb:1507-1514`).
   * @noRailsEquivalent PERMANENT
   */
  static async compareFileAsync(a: string, b: string): Promise<boolean> {
    const fs = getFs();
    if ((await fs.stat!(a)).size !== (await fs.stat!(b)).size) return false;
    const fa = await fs.openHandle!(a, "r");
    try {
      const fb = await fs.openHandle!(b, "r");
      try {
        return await FileUtils.compareStreamAsync(fa, fb);
      } finally {
        await fb.close();
      }
    } finally {
      await fa.close();
    }
  }

  /** @noRailsEquivalent PERMANENT */
  static isIdenticalAsync = FileUtils.compareFileAsync;

  /** @noRailsEquivalent PERMANENT */
  static cmpAsync = FileUtils.compareFileAsync;

  /** `FileUtils.compare_stream` (`vendor/ruby/v3.3.11/lib/fileutils.rb:1530-1542`).
   * @noRailsEquivalent PERMANENT
   */
  static compareStream(
    a: { read(length: number): Uint8Array | null },
    b: { read(length: number): Uint8Array | null },
  ): boolean {
    const bsize = FileUtils.fuStreamBlksize(a, b);

    let sa: Uint8Array;
    let sb: Uint8Array;

    do {
      sa = a.read(bsize) ?? new Uint8Array(0);
      sb = b.read(bsize) ?? new Uint8Array(0);
      if (sa.length === 0 && sb.length === 0) return true;
    } while (sa.length === sb.length && sa.every((byte, i) => byte === sb[i]));
    return false;
  }

  /** `FileUtils.compare_stream` (`vendor/ruby/v3.3.11/lib/fileutils.rb:1530-1542`) over handles.
   * @noRailsEquivalent PERMANENT
   */
  static async compareStreamAsync(a: FsFileHandle, b: FsFileHandle): Promise<boolean> {
    const bsize =
      FileUtils.fuBlksize(await a.stat()) ??
      FileUtils.fuBlksize(await b.stat()) ??
      FileUtils.fuDefaultBlksize();
    const read = async (s: FsFileHandle): Promise<Uint8Array> => {
      const buffer = new Uint8Array(bsize);
      let size = 0;
      while (size < bsize) {
        const { bytesRead } = await s.read(buffer, size, bsize - size, null);
        if (bytesRead === 0) break;
        size += bytesRead;
      }
      return buffer.subarray(0, size);
    };

    let sa: Uint8Array;
    let sb: Uint8Array;

    do {
      sa = await read(a);
      sb = await read(b);
      if (sa.length === 0 && sb.length === 0) return true;
    } while (sa.length === sb.length && sa.every((byte, i) => byte === sb[i]));
    return false;
  }

  /** `fu_stream_blksize` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2045-2052`).
   * @noRailsEquivalent PERMANENT
   */
  static fuStreamBlksize(...streams: object[]): number {
    for (const s of streams) {
      if (!rbObjRespondTo(s, "stat")) continue;
      const size = FileUtils.fuBlksize((s as IO).stat());
      if (size != null) return size;
    }
    return FileUtils.fuDefaultBlksize();
  }

  /** `fu_blksize` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2054-2059`).
   * @noRailsEquivalent PERMANENT
   */
  static fuBlksize(st: FsStatResult): number | null {
    const s = st.blksize;
    if (s == null) return null;
    if (s === 0) return null;
    return s;
  }

  /** `fu_default_blksize` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2061-2063`).
   * @noRailsEquivalent PERMANENT
   */
  static fuDefaultBlksize(): number {
    return 1024;
  }

  /** `FileUtils.install` (`vendor/ruby/v3.3.11/lib/fileutils.rb:1609-1639`).
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static async installAsync(
    src: string | string[],
    dest: string,
    {
      mode,
      owner,
      group,
      preserve,
      noop,
      verbose,
    }: {
      mode?: number | string | null;
      owner?: string | number | null;
      group?: string | number | null;
      preserve?: unknown;
      noop?: boolean;
      verbose?: boolean;
    } = {},
  ): Promise<void> {
    if (rtest(verbose)) {
      let msg = "install -c";
      if (rtest(preserve)) msg += " -p";
      if (mode != null) msg += ` -m ${FileUtils.modeToS(mode)}`;
      if (owner != null) msg += ` -o ${owner}`;
      if (group != null) msg += ` -g ${group}`;
      msg += ` ${[src, dest].flat().join(" ")}`;
      fuOutputMessage(msg);
    }
    if (rtest(noop)) return;
    const uid = await FileUtils.fuGetUidAsync(owner);
    const gid = await FileUtils.fuGetGidAsync(group);
    await FileUtils.fuEachSrcDestAsync(src, dest, async (s, d) => {
      const st = await getFs().stat!(s);
      if (!((await File.isExistAsync(d)) && (await FileUtils.compareFileAsync(s, d)))) {
        await FileUtils.removeFileAsync(d, true);
        if (d.endsWith("/")) {
          await FileUtils.mkdirPAsync(d);
          await FileUtils.copyFileAsync(s, d + File.basename(s));
        } else {
          await FileUtils.mkdirPAsync(File.expandPath("..", d));
          await FileUtils.copyFileAsync(s, d);
        }
        if (rtest(preserve)) await File.utimeAsync(st.atime, st.mtime, d);
        if (mode != null) await File.chmodAsync(await FileUtils.fuModeAsync(mode, st), d);
        if (uid != null || gid != null) await File.chownAsync(uid, gid, d);
      }
    });
  }

  /** `FileUtils.chmod` (`vendor/ruby/v3.3.11/lib/fileutils.rb:1803-1810`).
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static async chmodAsync(
    mode: number | string,
    list: string | string[],
    { noop, verbose }: { noop?: boolean; verbose?: boolean } = {},
  ): Promise<string[] | undefined> {
    list = fuList(list);
    if (rtest(verbose)) fuOutputMessage(`chmod ${FileUtils.modeToS(mode)} ${list.join(" ")}`);
    if (rtest(noop)) return;
    for (const path of list) {
      await new Entry_(path).chmodAsync(await FileUtils.fuModeAsync(mode, path));
    }
    return list;
  }

  /** `FileUtils.chmod_R` (`vendor/ruby/v3.3.11/lib/fileutils.rb:1815-1830`) over
   * `Entry_`'s async walk: `Entry_#traverse` (`fileutils.rb:2354-2362`)
   * yielding to `Entry_#chmod` (`fileutils.rb:2206-2213`).
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static async chmodRAsync(
    mode: number | string,
    list: string | string[],
    { noop, verbose, force }: { noop?: boolean; verbose?: boolean; force?: unknown } = {},
  ): Promise<string[] | undefined> {
    list = fuList(list);
    if (rtest(verbose))
      fuOutputMessage(
        `chmod -R${rtest(force) ? "f" : ""} ${FileUtils.modeToS(mode)} ${list.join(" ")}`,
      );
    if (rtest(noop)) return;
    for (const root of list) {
      await new Entry_(root).preorderTraverseAsync(async (ent) => {
        try {
          await ent.chmodAsync(await FileUtils.fuModeAsync(mode, ent.path));
        } catch (error) {
          if (!rtest(force)) throw error;
        }
      });
    }
    return list;
  }

  /** `FileUtils.chown` (`vendor/ruby/v3.3.11/lib/fileutils.rb:1896-1907`).
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static async chownAsync(
    user: string | number | null,
    group: string | number | null,
    list: string | string[],
    { noop, verbose }: { noop?: boolean; verbose?: boolean } = {},
  ): Promise<string[] | undefined> {
    list = fuList(list);
    if (rtest(verbose))
      fuOutputMessage(
        `chown ${group != null ? `${user ?? ""}:${group}` : (user ?? ":")} ${list.join(" ")}`,
      );
    if (rtest(noop)) return;
    const uid = await FileUtils.fuGetUidAsync(user);
    const gid = await FileUtils.fuGetGidAsync(group);
    for (const path of list) {
      await new Entry_(path).chownAsync(uid, gid);
    }
    return list;
  }

  /** `FileUtils.chown_R` (`vendor/ruby/v3.3.11/lib/fileutils.rb:1912-1929`).
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static async chownRAsync(
    user: string | number | null,
    group: string | number | null,
    list: string | string[],
    { noop, verbose, force }: { noop?: boolean; verbose?: boolean; force?: unknown } = {},
  ): Promise<string[] | undefined> {
    list = fuList(list);
    if (rtest(verbose))
      fuOutputMessage(
        `chown -R${rtest(force) ? "f" : ""} ${group != null ? `${user ?? ""}:${group}` : (user ?? ":")} ${list.join(" ")}`,
      );
    if (rtest(noop)) return;
    const uid = await FileUtils.fuGetUidAsync(user);
    const gid = await FileUtils.fuGetGidAsync(group);
    for (const root of list) {
      await new Entry_(root).preorderTraverseAsync(async (ent) => {
        try {
          await ent.chownAsync(uid, gid);
        } catch (error) {
          if (!rtest(force)) throw error;
        }
      });
    }
    return list;
  }

  /** @noRailsEquivalent PERMANENT */
  static async removeFileAsync(path: string, force: unknown = false): Promise<void> {
    try {
      await new Entry_(path).removeFileAsync();
    } catch (error) {
      if (!rtest(force)) throw error;
    }
  }

  /** `FileUtils.remove_file` (`vendor/ruby/v3.3.11/lib/fileutils.rb:1473-1477`).
   * @noRailsEquivalent PERMANENT — Ruby stdlib `FileUtils` module function.
   */
  static removeFile(path: string, force = false): void {
    try {
      new Entry_(path).removeFile();
    } catch (error) {
      if (force !== true) throw error;
    }
  }

  /** `FileUtils.touch` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2006-2026`). The verbose
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

  /** @noRailsEquivalent PERMANENT */
  static async touchAsync(
    list: string | string[],
    {
      noop,
      mtime,
      nocreate,
      verbose,
    }: { noop?: boolean; verbose?: boolean; mtime?: Date; nocreate?: boolean } = {},
  ): Promise<void> {
    list = fuList(list);
    const t = mtime;
    if (rtest(verbose)) {
      const pad = (n: number): string => String(n).padStart(2, "0");
      const at =
        t != null
          ? `-t ${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}` +
            `${pad(t.getHours())}${pad(t.getMinutes())}.${pad(t.getSeconds())} `
          : "";
      fuOutputMessage(`touch ${nocreate === true ? "-c " : ""}${at}${list.join(" ")}`);
    }
    if (rtest(noop)) return;
    for (const path of list) {
      let created = nocreate;
      for (;;) {
        try {
          const now = t ?? new Date();
          await File.utimeAsync(now, now, path);
        } catch (error) {
          if ((error as { code?: string }).code !== "ENOENT") throw error;
          if (created === true) throw error;
          await getFs().writeFile!(path, "", { flag: "a" });
          created = true;
          if (t != null) continue;
        }
        break;
      }
    }
  }
}

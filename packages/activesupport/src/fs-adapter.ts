/**
 * Filesystem adapter — mirrors the Rails adapter pattern.
 */

export interface FsStatResult {
  isDirectory(): boolean;
  isFile(): boolean;
  /** Only populated by lstat results (adapters may always return false from stat). */
  isSymbolicLink?(): boolean;
  size: number;
  mtime: Date;
  /** File mode, including the type bits (e.g. 0o100644). Optional: not every adapter models permissions. */
  mode?: number;
  /** Owner user id. Optional: not every adapter models ownership. */
  uid?: number;
  /** Owner group id. Optional: not every adapter models ownership. */
  gid?: number;
}

export interface FsDirent {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

export interface FsAdapter {
  readFileSync(path: string, encoding: "utf-8" | "utf8" | "latin1"): string;
  readFileSync(path: string): Buffer;
  writeFileSync(
    path: string,
    content: string | Buffer | Uint8Array,
    options?: { mode?: number } | string,
  ): void;
  existsSync(path: string): boolean;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  appendFileSync(path: string, content: string): void;
  unlinkSync(path: string): void;
  /**
   * Ruby `FileUtils.rm` — removes each entry in the list, raising the
   * underlying ENOENT when one is missing.
   */
  rm(list: string | string[]): void;
  /** Ruby `FileUtils.rm_f` — {@link FsAdapter.rm} with missing entries ignored. */
  rmF(list: string | string[]): void;
  readdirSync(path: string): string[];
  readdirSync(path: string, options: { withFileTypes: true }): FsDirent[];
  rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  rmdirSync(path: string): void;
  /** Sync rename — used for the temp-file swap in `File.atomic_write`. */
  renameSync(src: string, dest: string): void;
  /**
   * Advisory file lock on an open descriptor, mirroring Ruby `File#flock` with
   * `File::LOCK_EX` / `File::LOCK_UN`. Optional: custom adapters need not
   * implement it, and callers (FileStore#lockFile) then run the block
   * unlocked. The Node adapter implements it with an O_EXCL lockfile.
   */
  flockSync?(fd: number, operation: "ex" | "un"): void;
  statSync(path: string): FsStatResult;
  /**
   * Sync chmod, mirroring Ruby `File.chmod`. Optional: adapters that model no
   * permissions (an in-memory VFS) may omit it, and callers skip the copy.
   */
  chmodSync?(path: string, mode: number): void;
  /**
   * Sync chown, mirroring Ruby `File.chown`. Optional for the same reason as
   * {@link FsAdapter.chmodSync}. Argument order follows the adapter's Node
   * shape (path first), not Ruby's.
   */
  chownSync?(path: string, uid: number, gid: number): void;
  /**
   * Sync realpath — resolves symlinks, mirroring Ruby File.realpath. Optional;
   * adapters without symlink support may omit it (callers fall back to a
   * lexical resolve). Used by FileStore's synchronous delete path.
   */
  realpathSync?(path: string): string;
  openSync(path: string, flags: string): number;
  readSync(
    fd: number,
    buffer: Buffer | Uint8Array,
    offset: number,
    length: number,
    position: number | null,
  ): number;
  closeSync(fd: number): void;
  copyFileSync(src: string, dest: string): void;
  /** Current working directory. */
  cwd(): string;
  /** Async existence check — avoids requiring existsSync in async code paths. */
  exists(path: string): Promise<boolean>;
  /**
   * Async stat — async-only callers use this instead of statSync. Optional
   * on the interface for backwards-compatibility, but async-only consumers
   * (e.g. trailties) require it and will error if absent.
   */
  stat?(path: string): Promise<FsStatResult>;
  /** Async lstat (no symlink follow). Optional; adapters without symlink support may omit. */
  lstat?(path: string): Promise<FsStatResult>;
  /**
   * Create a unique temp directory (optional — not all filesystems support
   * atomic uniqueness). Only used by server-side database tasks; custom
   * adapters may omit it.
   */
  mkdtempSync?(prefix: string): string;
  /** Async readFile (utf8). */
  readFile?(path: string, encoding: "utf-8" | "utf8"): Promise<string>;
  readFile?(path: string): Promise<Buffer>;
  /** Async writeFile. */
  writeFile?(
    path: string,
    content: string | Buffer | Uint8Array,
    options?: { mode?: number },
  ): Promise<void>;
  /** Async unlink. */
  unlink?(path: string): Promise<void>;
  /** Async rename (used for atomic move on EncryptedFile#write). */
  rename?(src: string, dest: string): Promise<void>;
  /** Async mkdtemp (used for EncryptedFile#change tempfile dir). */
  mkdtemp?(prefix: string): Promise<string>;
  /** Async realpath — resolves symlinks. Used by EncryptedFile to honor content_path symlinks. */
  realpath?(path: string): Promise<string>;
  /** Async rmdir (used to clean up mkdtemp directories). */
  rmdir?(path: string): Promise<void>;
  /** Async readdir — returns entry names in `path`. */
  readdir?(path: string): Promise<string[]>;
  /** Async mkdir (used by create-migration to ensure the destination directory exists). */
  mkdir?(path: string, options?: { recursive?: boolean }): Promise<void>;
}

export interface PathAdapter {
  join(...parts: string[]): string;
  dirname(p: string): string;
  basename(p: string): string;
  resolve(...parts: string[]): string;
  extname(p: string): string;
  /**
   * Optional — adapters that don't model absolute paths (e.g. in-memory
   * VFS) can omit this. When undefined, callers should treat any path as
   * absolute.
   */
  isAbsolute?(p: string): boolean;
  /** Optional — compute a relative path from `from` to `to`. */
  relative?(from: string, to: string): string;
  /**
   * Optional — convert an absolute filesystem path to a `file://` URL
   * (RFC 8089). Only used by server-side paths that call dynamic `import()`
   * on disk files.
   */
  pathToFileURL?(p: string): URL;
  sep: string;
}

interface FsRegistration {
  fs: FsAdapter;
  path: PathAdapter;
}

const registry = new Map<string, FsRegistration>();
let currentAdapterName: string | null = null;
let resolved: FsRegistration | null = null;

export function registerFsAdapter(name: string, fs: FsAdapter, path: PathAdapter): void {
  registry.set(name, { fs, path });
  if (name === currentAdapterName) resolved = null;
}

let nodeAttempted = false;
let nodeAsyncPromise: Promise<boolean> | null = null;

interface FlockableFs {
  openSync(path: string, flags: string): number;
  closeSync(fd: number): void;
  unlinkSync(path: string): void;
}

// Node exposes no flock(2), so the exclusive lock is an O_EXCL lockfile beside
// the locked file plus a blocking retry loop — the same "wait until the holder
// releases" shape Ruby's `File#flock File::LOCK_EX` gives us, and, being a real
// filesystem entry, it excludes other threads and other processes alike.
const LOCK_RETRY_MS = 5;
// Millisecond sleep with no event loop: `Atomics.wait` blocks the calling
// thread, which is what a synchronous lock needs. Both the buffer and the wait
// are guarded — SharedArrayBuffer is absent on cross-origin-unisolated pages and
// `Atomics.wait` is disallowed on some main threads — so a spin is the fallback.
let sleepBuffer: Int32Array | null = null;

function sleepSync(ms: number): void {
  try {
    sleepBuffer ??= new Int32Array(new SharedArrayBuffer(4));
    if (Atomics.wait(sleepBuffer, 0, 0, ms) !== "timed-out") return;
  } catch {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      /* spin */
    }
  }
}

// The `FsAdapter` flock takes a descriptor (Ruby locks a `File`), so the lock
// path has to be recovered from the descriptor the caller opened.
const flockPaths = new Map<number, string>();
const flockHeld = new Map<number, string>();

function withFlock<T extends FlockableFs>(nodeFs: T): Partial<FsAdapter> {
  const flockSync = (fd: number, operation: "ex" | "un"): void => {
    if (operation === "un") {
      const lockPath = flockHeld.get(fd);
      if (lockPath == null) return;
      flockHeld.delete(fd);
      try {
        nodeFs.unlinkSync(lockPath);
      } catch {
        // Already swept as stale by another locker.
      }
      return;
    }

    const path = flockPaths.get(fd);
    if (path == null) return;
    const lockPath = `${path}.lock`;
    for (;;) {
      try {
        nodeFs.closeSync(nodeFs.openSync(lockPath, "wx"));
        flockHeld.set(fd, lockPath);
        return;
      } catch (error) {
        if ((error as { code?: string }).code !== "EEXIST") throw error;
        // `File#flock File::LOCK_EX` blocks until the holder releases, with no
        // timeout (file_store.rb:150-154), so the retry loop never gives up or
        // breaks another locker's hold.
        sleepSync(LOCK_RETRY_MS);
      }
    }
  };

  return {
    openSync: (path: string, flags: string) => {
      const fd = nodeFs.openSync(path, flags);
      flockPaths.set(fd, path);
      return fd;
    },
    closeSync: (fd: number) => {
      if (flockHeld.has(fd)) flockSync(fd, "un");
      flockPaths.delete(fd);
      nodeFs.closeSync(fd);
    },
    flockSync,
  };
}

function syncBuiltinLoader(): ((id: string) => unknown) | null {
  const proc = globalThis.process as
    | (typeof globalThis.process & { getBuiltinModule?: (id: string) => unknown })
    | undefined;
  const getBuiltinModule = proc?.getBuiltinModule;
  if (typeof getBuiltinModule === "function") return (id) => getBuiltinModule.call(proc, id);
  if (typeof require === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeModule = require("node:module") as {
    createRequire(p: string): (id: string) => unknown;
  };
  // Only Node builtins are loaded through this require, so the base path is
  // never resolved against — a fixed sentinel keeps the file off `__filename`,
  // which ruby-compat's browser-safe-leaf lint bans outright.
  return nodeModule.createRequire("file:///activesupport");
}

function tryAutoRegisterNode(): boolean {
  if (registry.has("node")) return true;
  if (nodeAttempted) return false;
  nodeAttempted = true;
  try {
    if (typeof globalThis.process === "undefined" || !globalThis.process.versions?.node) {
      return false;
    }
    const req = syncBuiltinLoader();
    if (!req) return false;
    const nodeFs = req("node:fs") as Omit<FsAdapter, "cwd" | "exists" | "stat" | "lstat">;
    const fsPromises = req("node:fs/promises") as {
      access(p: string): Promise<void>;
      stat(p: string): Promise<FsStatResult>;
      lstat(p: string): Promise<FsStatResult>;
      readFile(p: string, enc?: string): Promise<Buffer | string>;
      writeFile(p: string, c: string | Buffer | Uint8Array, opts?: unknown): Promise<void>;
      unlink(p: string): Promise<void>;
      rename(src: string, dest: string): Promise<void>;
      mkdtemp(prefix: string): Promise<string>;
      realpath(path: string): Promise<string>;
      rmdir(path: string): Promise<void>;
      readdir(path: string): Promise<string[]>;
      mkdir(path: string, opts?: { recursive?: boolean }): Promise<string | undefined>;
    };
    const fs: FsAdapter = Object.assign({}, nodeFs, {
      rm: (list: string | string[]) => {
        for (const entry of Array.isArray(list) ? list : [list]) nodeFs.unlinkSync(entry);
      },
      rmF: (list: string | string[]) => {
        for (const entry of Array.isArray(list) ? list : [list]) {
          try {
            nodeFs.unlinkSync(entry);
          } catch {
            /* rm_f ignores a missing entry */
          }
        }
      },
      cwd: () => globalThis.process.cwd(),
      exists: (p: string) =>
        fsPromises.access(p).then(
          () => true,
          (error: unknown) => {
            const code = (error as { code?: string }).code;
            if (code === "ENOENT" || code === "ENOTDIR") return false;
            throw error;
          },
        ),
      stat: (p: string) => fsPromises.stat(p),
      lstat: (p: string) => fsPromises.lstat(p),
      readFile: (p: string, enc?: string) =>
        enc ? fsPromises.readFile(p, enc) : fsPromises.readFile(p),
      writeFile: (p: string, c: string | Buffer | Uint8Array, opts?: { mode?: number }) =>
        fsPromises.writeFile(p, c, opts),
      unlink: (p: string) => fsPromises.unlink(p),
      rename: (src: string, dest: string) => fsPromises.rename(src, dest),
      mkdtemp: (prefix: string) => fsPromises.mkdtemp(prefix),
      realpath: (p: string) => fsPromises.realpath(p),
      rmdir: (p: string) => fsPromises.rmdir(p),
      readdir: (p: string) => fsPromises.readdir(p),
      mkdir: (p: string, opts?: { recursive?: boolean }) =>
        fsPromises.mkdir(p, opts).then(() => undefined),
      ...withFlock(nodeFs as unknown as FlockableFs),
    }) as FsAdapter;
    const nodePath = req("node:path") as Required<Omit<PathAdapter, "pathToFileURL">>;
    const nodeUrl = req("node:url") as { pathToFileURL(p: string): URL };
    const path: PathAdapter = {
      join: (...parts) => nodePath.join(...parts),
      dirname: (p) => nodePath.dirname(p),
      basename: (p) => nodePath.basename(p),
      resolve: (...parts) => nodePath.resolve(...parts),
      extname: (p) => nodePath.extname(p),
      isAbsolute: (p) => nodePath.isAbsolute(p),
      relative: (from, to) => nodePath.relative(from, to),
      pathToFileURL: (p) => nodeUrl.pathToFileURL(p),
      sep: nodePath.sep,
    };
    registry.set("node", { fs, path });
    return true;
  } catch {
    return false;
  }
}

function tryAutoRegisterNodeAsync(): Promise<boolean> {
  if (registry.has("node")) return Promise.resolve(true);
  if (!nodeAsyncPromise) {
    nodeAsyncPromise = (async () => {
      try {
        if (typeof globalThis.process === "undefined" || !globalThis.process.versions?.node) {
          return false;
        }
        const nodeFs = (await import("node:fs")) as unknown as Omit<
          FsAdapter,
          "cwd" | "exists" | "stat" | "lstat"
        >;
        const fsPromises = (await import("node:fs/promises")) as unknown as {
          access(p: string): Promise<void>;
          stat(p: string): Promise<FsStatResult>;
          lstat(p: string): Promise<FsStatResult>;
          readFile(p: string, enc?: string): Promise<Buffer | string>;
          writeFile(p: string, c: string | Buffer | Uint8Array, opts?: unknown): Promise<void>;
          unlink(p: string): Promise<void>;
          rename(src: string, dest: string): Promise<void>;
          mkdtemp(prefix: string): Promise<string>;
          realpath(path: string): Promise<string>;
          readdir(path: string): Promise<string[]>;
          mkdir(path: string, opts?: { recursive?: boolean }): Promise<string | undefined>;
        };
        const fs: FsAdapter = Object.assign({}, nodeFs, {
          cwd: () => globalThis.process.cwd(),
          exists: (p: string) =>
            fsPromises.access(p).then(
              () => true,
              () => false,
            ),
          stat: (p: string) => fsPromises.stat(p),
          lstat: (p: string) => fsPromises.lstat(p),
          readFile: (p: string, enc?: string) =>
            enc ? fsPromises.readFile(p, enc) : fsPromises.readFile(p),
          writeFile: (p: string, c: string | Buffer | Uint8Array, opts?: { mode?: number }) =>
            fsPromises.writeFile(p, c, opts),
          unlink: (p: string) => fsPromises.unlink(p),
          rename: (src: string, dest: string) => fsPromises.rename(src, dest),
          mkdtemp: (prefix: string) => fsPromises.mkdtemp(prefix),
          realpath: (p: string) => fsPromises.realpath(p),
          readdir: (p: string) => fsPromises.readdir(p),
          mkdir: (p: string, opts?: { recursive?: boolean }) =>
            fsPromises.mkdir(p, opts).then(() => undefined),
          ...withFlock(nodeFs as unknown as FlockableFs),
        }) as FsAdapter;
        const nodePath = (await import("node:path")) as unknown as Required<
          Omit<PathAdapter, "pathToFileURL">
        >;
        const nodeUrl = (await import("node:url")) as { pathToFileURL(p: string): URL };
        const path: PathAdapter = {
          join: (...parts) => nodePath.join(...parts),
          dirname: (p) => nodePath.dirname(p),
          basename: (p) => nodePath.basename(p),
          resolve: (...parts) => nodePath.resolve(...parts),
          extname: (p) => nodePath.extname(p),
          isAbsolute: (p) => nodePath.isAbsolute(p),
          relative: (from, to) => nodePath.relative(from, to),
          pathToFileURL: (p) => nodeUrl.pathToFileURL(p),
          sep: nodePath.sep,
        };
        registry.set("node", { fs, path });
        return true;
      } catch {
        return false;
      }
    })();
  }
  return nodeAsyncPromise;
}

function resolve(): FsRegistration {
  if (resolved) return resolved;

  const name = currentAdapterName;
  if (name) {
    const reg = registry.get(name);
    if (!reg) throw new Error(`Filesystem adapter "${name}" is not registered.`);
    resolved = reg;
    return reg;
  }

  if (tryAutoRegisterNode()) {
    resolved = registry.get("node")!;
    return resolved;
  }

  throw new Error(
    "No filesystem adapter configured. Under ESM, import '@blazetrails/activesupport/node' from your entry point; otherwise set ActiveSupport.fsAdapter or register a custom adapter.",
  );
}

async function resolveAsync(): Promise<FsRegistration> {
  const name = currentAdapterName;
  try {
    return resolve();
  } catch (error) {
    if (name) {
      throw error;
    }
    if (await tryAutoRegisterNodeAsync()) {
      resolved = registry.get("node")!;
      return resolved;
    }
    throw error;
  }
}

export function getFs(): FsAdapter {
  return resolve().fs;
}

export function getPath(): PathAdapter {
  return resolve().path;
}

export async function getFsAsync(): Promise<FsAdapter> {
  return (await resolveAsync()).fs;
}

export async function getPathAsync(): Promise<PathAdapter> {
  return (await resolveAsync()).path;
}

export const fsAdapterConfig = {
  get adapter(): string | null {
    return currentAdapterName;
  },
  set adapter(name: string | null) {
    currentAdapterName = name;
    resolved = null;
  },
};

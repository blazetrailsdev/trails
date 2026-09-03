/**
 * The byte string a backend answers when no encoding is asked for — Ruby's
 * `File.binread` (`vendor/ruby/file.c:6222` `rb_io_s_binread`), which is an
 * ASCII-8BIT String. Node's `Buffer` is one such container and is what the
 * Node backend below hands over, but naming `Buffer` here would put an ambient
 * Node global in the leaf's type surface, so the contract names the structural
 * shape callers actually use: the bytes, and the `toString(encoding)` that
 * turns them back into a String.
 *
 * @noRailsEquivalent PERMANENT — the byte half of Ruby core `String`, which
 * Rails calls without defining.
 */
export type Bytes = Uint8Array & { toString(encoding?: string): string };

export interface FsStatResult {
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink?(): boolean;
  size: number;
  mtime: Date;
  mode?: number;
  uid?: number;
  gid?: number;
}

export interface FsDirent {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

export interface FsAdapter {
  readFileSync(path: string, encoding: "utf-8" | "utf8" | "latin1"): string;
  readFileSync(path: string): Bytes;
  writeFileSync(
    path: string,
    content: string | Uint8Array,
    options?: { mode?: number } | string,
  ): void;
  existsSync(path: string): boolean;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  appendFileSync(path: string, content: string): void;
  unlinkSync(path: string): void;
  readdirSync(path: string): string[];
  readdirSync(path: string, options: { withFileTypes: true }): FsDirent[];
  rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  rmdirSync(path: string): void;
  renameSync(src: string, dest: string): void;
  flockSync?(fd: number, operation: "ex" | "un"): void;
  statSync(path: string): FsStatResult;
  lstatSync?(path: string): FsStatResult;
  chmodSync?(path: string, mode: number): void;
  utimesSync?(path: string, atime: Date, mtime: Date): void;
  chownSync?(path: string, uid: number, gid: number): void;
  realpathSync?(path: string): string;
  openSync(path: string, flags: string): number;
  readSync(
    fd: number,
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number | null,
  ): number;
  closeSync(fd: number): void;
  copyFileSync(src: string, dest: string): void;
  cwd(): string;
  exists(path: string): Promise<boolean>;
  stat?(path: string): Promise<FsStatResult>;
  lstat?(path: string): Promise<FsStatResult>;
  mkdtempSync?(prefix: string): string;
  readFile?(path: string, encoding: "utf-8" | "utf8"): Promise<string>;
  readFile?(path: string): Promise<Bytes>;
  writeFile?(
    path: string,
    content: string | Uint8Array,
    options?: { mode?: number },
  ): Promise<void>;
  unlink?(path: string): Promise<void>;
  rename?(src: string, dest: string): Promise<void>;
  mkdtemp?(prefix: string): Promise<string>;
  realpath?(path: string): Promise<string>;
  rmdir?(path: string): Promise<void>;
  readdir?(path: string): Promise<string[]>;
  mkdir?(path: string, options?: { recursive?: boolean }): Promise<void>;
}

export interface PathAdapter {
  join(...parts: string[]): string;
  dirname(p: string): string;
  basename(p: string): string;
  resolve(...parts: string[]): string;
  extname(p: string): string;
  isAbsolute?(p: string): boolean;
  relative?(from: string, to: string): string;
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

/** @noRailsEquivalent PERMANENT */
export function registerFsAdapter(name: string, fs: FsAdapter, path: PathAdapter): void {
  registry.set(name, { fs, path });
  if (name === currentAdapterName) resolved = null;
}

let nodeAttempted = false;

interface FlockableFs {
  openSync(path: string, flags: string): number;
  closeSync(fd: number): void;
  unlinkSync(path: string): void;
}

const LOCK_RETRY_MS = 5;
let sleepBuffer: Int32Array | null = null;

function sleepSync(ms: number): void {
  try {
    sleepBuffer ??= new Int32Array(new SharedArrayBuffer(4));
    if (Atomics.wait(sleepBuffer, 0, 0, ms) !== "timed-out") return;
  } catch {
    const until = Date.now() + ms;
    while (Date.now() < until) continue;
  }
}

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
        return;
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

/** @noRailsEquivalent PERMANENT */
interface NodeProcess {
  versions?: { node?: string };
  cwd(): string;
  getBuiltinModule?(id: string): unknown;
}

function nodeProcess(): NodeProcess | undefined {
  return (globalThis as { process?: NodeProcess }).process;
}

/** @noRailsEquivalent PERMANENT */
declare const require: ((id: string) => unknown) | undefined;

function syncBuiltinLoader(): ((id: string) => unknown) | null {
  const proc = nodeProcess();
  const getBuiltinModule = proc?.getBuiltinModule;
  if (typeof getBuiltinModule === "function") return (id) => getBuiltinModule.call(proc, id);
  if (typeof require === "undefined") return null;
  const nodeModule = require("node:module") as {
    createRequire(p: string): (id: string) => unknown;
  };
  return nodeModule.createRequire("file:///ruby-compat");
}

function tryAutoRegisterNode(): boolean {
  if (registry.has("node")) return true;
  if (nodeAttempted) return false;
  nodeAttempted = true;
  try {
    const proc = nodeProcess();
    if (proc === undefined || !proc.versions?.node) {
      return false;
    }
    const req = syncBuiltinLoader();
    if (!req) return false;
    const nodeFs = req("node:fs") as Omit<FsAdapter, "cwd" | "exists" | "stat" | "lstat">;
    const fsPromises = req("node:fs/promises") as {
      access(p: string): Promise<void>;
      stat(p: string): Promise<FsStatResult>;
      lstat(p: string): Promise<FsStatResult>;
      readFile(p: string, enc?: string): Promise<Bytes | string>;
      writeFile(p: string, c: string | Uint8Array, opts?: unknown): Promise<void>;
      unlink(p: string): Promise<void>;
      rename(src: string, dest: string): Promise<void>;
      mkdtemp(prefix: string): Promise<string>;
      realpath(path: string): Promise<string>;
      rmdir(path: string): Promise<void>;
      readdir(path: string): Promise<string[]>;
      mkdir(path: string, opts?: { recursive?: boolean }): Promise<string | undefined>;
    };
    const fs: FsAdapter = Object.assign({}, nodeFs, {
      cwd: () => proc.cwd(),
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
      writeFile: (p: string, c: string | Uint8Array, opts?: { mode?: number }) =>
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

/** @noRailsEquivalent CONVERGEABLE unexempt-file-and-dir-from-core-class-receivers */
export function getFs(): FsAdapter {
  return resolve().fs;
}

/** @noRailsEquivalent CONVERGEABLE unexempt-file-and-dir-from-core-class-receivers */
export function getPath(): PathAdapter {
  return resolve().path;
}

/** @noRailsEquivalent CONVERGEABLE unexempt-file-and-dir-from-core-class-receivers */
export async function getFsAsync(): Promise<FsAdapter> {
  return resolve().fs;
}

/** @noRailsEquivalent CONVERGEABLE unexempt-file-and-dir-from-core-class-receivers */
export async function getPathAsync(): Promise<PathAdapter> {
  return resolve().path;
}

/** @noRailsEquivalent PERMANENT */
export const fsAdapterConfig = {
  /** @noRailsEquivalent PERMANENT */
  get adapter(): string | null {
    return currentAdapterName;
  },
  /** @noRailsEquivalent PERMANENT */
  set adapter(name: string | null) {
    currentAdapterName = name;
    resolved = null;
  },
};

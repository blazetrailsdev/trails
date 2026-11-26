import { latin1 } from "./latin1.ts";
import path from "path-browserify";
import type { Bytes, FsAdapter, FsDirent, FsStatResult } from "@blazetrails/ruby-compat";

type Entry =
  | { kind: "file"; data: string | Uint8Array; mtime: Date }
  | { kind: "dir"; mtime: Date };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function fsError(code: string, syscall: string, p: string): Error {
  const messages: Record<string, string> = {
    ENOENT: "no such file or directory",
    EEXIST: "file already exists",
    ENOTDIR: "not a directory",
    EISDIR: "illegal operation on a directory",
    ENOTEMPTY: "directory not empty",
    EBADF: "bad file descriptor",
  };
  const error = new Error(`${code}: ${messages[code] ?? code}, ${syscall} '${p}'`);
  return Object.assign(error, { code, syscall, path: p });
}

function asBytes(data: string | Uint8Array): Bytes {
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  const out = new Uint8Array(bytes) as Bytes;
  out.toString = (encoding?: string) =>
    encoding === "latin1" || encoding === "binary" ? latin1(out) : decoder.decode(out);
  return out;
}

/**
 * An in-memory filesystem rooted at `/`. Files hold strings or bytes;
 * directories are explicit entries, created for every file's parents.
 */
export class VirtualFs {
  readonly entries = new Map<string, Entry>([["/", { kind: "dir", mtime: new Date() }]]);
  private fds = new Map<number, { path: string; pos: number; append: boolean }>();
  private nextFd = 10;
  /** Called after every write, with the path written. */
  onWrite: ((p: string) => void) | null = null;

  constructor(files: Record<string, string | Uint8Array> = {}) {
    for (const [p, data] of Object.entries(files)) this.write(p, data);
  }

  /** The working directory a relative path resolves against; `Dir.chdir` moves it. */
  cwd = "/";

  norm(p: string): string {
    return path.resolve(this.cwd, p);
  }

  get(p: string): Entry | undefined {
    return this.entries.get(this.norm(p));
  }

  write(p: string, data: string | Uint8Array, notify = true): void {
    const full = this.norm(p);
    this.mkdirp(path.dirname(full));
    this.entries.set(full, { kind: "file", data, mtime: new Date() });
    if (notify) this.onWrite?.(full);
  }

  read(p: string): string | Uint8Array {
    const entry = this.get(p);
    if (!entry) throw fsError("ENOENT", "open", p);
    if (entry.kind === "dir") throw fsError("EISDIR", "read", p);
    return entry.data;
  }

  readText(p: string): string {
    const data = this.read(p);
    return typeof data === "string" ? data : decoder.decode(data);
  }

  mkdirp(p: string): void {
    const full = this.norm(p);
    if (this.entries.has(full)) return;
    this.mkdirp(path.dirname(full));
    this.entries.set(full, { kind: "dir", mtime: new Date() });
  }

  children(p: string): string[] {
    const full = this.norm(p);
    const entry = this.entries.get(full);
    if (!entry) throw fsError("ENOENT", "scandir", p);
    if (entry.kind !== "dir") throw fsError("ENOTDIR", "scandir", p);
    const prefix = full === "/" ? "/" : `${full}/`;
    const names: string[] = [];
    for (const key of this.entries.keys()) {
      if (key !== full && key.startsWith(prefix) && !key.slice(prefix.length).includes("/")) {
        names.push(key.slice(prefix.length));
      }
    }
    return names.sort();
  }

  remove(p: string, recursive = false): void {
    const full = this.norm(p);
    const entry = this.entries.get(full);
    if (!entry) throw fsError("ENOENT", "unlink", p);
    if (entry.kind === "dir") {
      const kids = this.children(full);
      if (kids.length && !recursive) throw fsError("ENOTEMPTY", "rmdir", p);
      for (const kid of kids) this.remove(path.join(full, kid), true);
    }
    this.entries.delete(full);
    this.onWrite?.(full);
  }

  /** Every file, keyed by absolute path. */
  files(): Record<string, string | Uint8Array> {
    const out: Record<string, string | Uint8Array> = {};
    for (const [p, entry] of this.entries) if (entry.kind === "file") out[p] = entry.data;
    return out;
  }

  stat(p: string): FsStatResult {
    const entry = this.get(p);
    if (!entry) throw fsError("ENOENT", "stat", p);
    const isDir = entry.kind === "dir";
    const size = entry.kind === "file" ? asBytes(entry.data).length : 0;
    return {
      isDirectory: () => isDir,
      isFile: () => !isDir,
      isSymbolicLink: () => false,
      isExecutable: () => isDir,
      size,
      atime: entry.mtime,
      mtime: entry.mtime,
      mode: isDir ? 0o40755 : 0o100644,
      uid: 0,
      gid: 0,
    };
  }

  adapter(): FsAdapter {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the adapter's methods are plain functions over this filesystem
    const vfs = this;
    const readFileSync = ((p: string, encoding?: string) => {
      const data = vfs.read(p);
      if (encoding) return typeof data === "string" ? data : asBytes(data).toString(encoding);
      return asBytes(data);
    }) as FsAdapter["readFileSync"];
    const readdirSync = ((p: string, options?: { withFileTypes?: boolean }) => {
      const names = vfs.children(p);
      if (!options?.withFileTypes) return names;
      return names.map((name): FsDirent => {
        const kind = vfs.get(path.join(vfs.norm(p), name))!.kind;
        return { name, isDirectory: () => kind === "dir", isFile: () => kind === "file" };
      });
    }) as FsAdapter["readdirSync"];
    const append = (p: string, content: string | Uint8Array) => {
      const prev = vfs.get(p);
      const before = prev?.kind === "file" ? asBytes(prev.data) : new Uint8Array();
      const add = typeof content === "string" ? encoder.encode(content) : content;
      const next = new Uint8Array(before.length + add.length);
      next.set(before);
      next.set(add, before.length);
      vfs.write(p, next);
    };
    const fs: FsAdapter = {
      readFileSync,
      writeFileSync(p, content, options) {
        const flag = typeof options === "object" ? options?.flag : undefined;
        if (flag?.startsWith("a")) append(p, content);
        else if (flag === "wx" && vfs.get(p)) throw fsError("EEXIST", "open", p);
        else vfs.write(p, content);
      },
      existsSync: (p) => vfs.get(p) !== undefined,
      mkdirSync(p, options) {
        if (vfs.get(p)) {
          if (options?.recursive) return;
          throw fsError("EEXIST", "mkdir", p);
        }
        if (!options?.recursive && !vfs.get(path.dirname(vfs.norm(p))))
          throw fsError("ENOENT", "mkdir", p);
        vfs.mkdirp(p);
      },
      appendFileSync: (p, content) => append(p, content),
      unlinkSync: (p) => vfs.remove(p),
      readdirSync,
      rmSync(p, options) {
        if (!vfs.get(p)) {
          if (options?.force) return;
          throw fsError("ENOENT", "rm", p);
        }
        vfs.remove(p, options?.recursive);
      },
      rmdirSync: (p) => vfs.remove(p),
      renameSync(src, dest) {
        vfs.write(dest, vfs.read(src));
        vfs.remove(src);
      },
      statSync: (p) => vfs.stat(p),
      lstatSync: (p) => vfs.stat(p),
      realpathSync: (p) => {
        vfs.stat(p);
        return vfs.norm(p);
      },
      accessSync: (p) => void vfs.stat(p),
      openSync(p, flags) {
        const exists = vfs.get(p) !== undefined;
        if (flags.includes("x") && exists) throw fsError("EEXIST", "open", p);
        if (flags.startsWith("r") && !exists) throw fsError("ENOENT", "open", p);
        if (flags.startsWith("w") || (!exists && flags.startsWith("a"))) vfs.write(p, "");
        const fd = vfs.nextFd++;
        vfs.fds.set(fd, { path: vfs.norm(p), pos: 0, append: flags.startsWith("a") });
        return fd;
      },
      async openAsync(p, flags, mode) {
        return fs.openSync(p, flags, mode);
      },
      readSync(fd, buffer, offset, length, position) {
        const handle = vfs.fds.get(fd);
        if (!handle) throw fsError("EBADF", "read", String(fd));
        const data = asBytes(vfs.read(handle.path));
        const start = position ?? handle.pos;
        const chunk = data.subarray(start, start + length);
        buffer.set(chunk, offset);
        if (position == null) handle.pos += chunk.length;
        return chunk.length;
      },
      async readAsync(fd, buffer, offset, length, position) {
        return fs.readSync(fd, buffer, offset, length, position);
      },
      writeSync(fd, buffer, offset, length, position) {
        const handle = vfs.fds.get(fd);
        if (!handle) throw fsError("EBADF", "write", String(fd));
        const chunk = buffer.subarray(offset, offset + length);
        if (handle.append) {
          append(handle.path, chunk);
          return chunk.length;
        }
        const data = asBytes(vfs.read(handle.path));
        const start = position ?? handle.pos;
        const next = new Uint8Array(Math.max(data.length, start + chunk.length));
        next.set(data);
        next.set(chunk, start);
        vfs.write(handle.path, next);
        if (position == null) handle.pos += chunk.length;
        return chunk.length;
      },
      async writeAsync(fd, buffer, offset, length, position) {
        return fs.writeSync(fd, buffer, offset, length, position);
      },
      closeSync: (fd) => void vfs.fds.delete(fd),
      fstatSync(fd) {
        const handle = vfs.fds.get(fd);
        if (!handle) throw fsError("EBADF", "fstat", String(fd));
        return vfs.stat(handle.path);
      },
      copyFileSync: (src, dest) => vfs.write(dest, vfs.read(src)),
      cwd: () => vfs.cwd,
      exists: async (p) => vfs.get(p) !== undefined,
      accessAsync: async (p) => void vfs.stat(p),
      stat: async (p) => vfs.stat(p),
      lstat: async (p) => vfs.stat(p),
      readFile: (async (p: string, encoding?: string) =>
        (readFileSync as (p: string, e?: string) => unknown)(p, encoding)) as FsAdapter["readFile"],
      writeFile: async (p, content, options) => fs.writeFileSync(p, content, options),
      unlink: async (p) => vfs.remove(p),
      rm: async (p, options) => fs.rmSync(p, options),
      rename: async (src, dest) => fs.renameSync(src, dest),
      realpath: async (p) => fs.realpathSync!(p),
      rmdir: async (p) => vfs.remove(p),
      readdir: async (p) => vfs.children(p),
      mkdir: async (p, options) => fs.mkdirSync(p, options),
      utimesSync: () => {},
      utimes: async () => {},
      chmodSync: () => {},
      chmod: async () => {},
      flockSync: () => true,
    };
    return fs;
  }
}

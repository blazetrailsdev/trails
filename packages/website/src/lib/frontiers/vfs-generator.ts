import {
  AppGenerator,
  ModelGenerator,
  MigrationGenerator,
} from "@blazetrails/trailties/generators";
import type { AppDatabase } from "@blazetrails/trailties/generators";
import { ActiveSupport } from "@blazetrails/activesupport";
import {
  registerFsAdapter,
  type Bytes,
  type FsAdapter,
  type PathAdapter,
} from "@blazetrails/ruby-compat";
import type { VirtualFS } from "./virtual-fs.js";

const posixPath: PathAdapter = {
  join(...parts: string[]): string {
    return parts.filter(Boolean).join("/").replace(/\/+/g, "/");
  },
  dirname(p: string): string {
    const idx = p.lastIndexOf("/");
    return idx <= 0 ? "/" : p.slice(0, idx);
  },
  basename(p: string): string {
    return p.split("/").pop() ?? p;
  },
  resolve(...parts: string[]): string {
    return parts.filter(Boolean).join("/").replace(/\/+/g, "/");
  },
  extname(p: string): string {
    const base = p.split("/").pop() ?? "";
    const idx = base.lastIndexOf(".");
    return idx <= 0 ? "" : base.slice(idx);
  },
};

/**
 * `Bytes` is a `Uint8Array` whose `toString(encoding)` decodes, the way Node's
 * `Buffer` does; a bare `Uint8Array` would stringify to comma-separated byte
 * numbers instead. There is no `Buffer` in the browser, so the decode is
 * attached here.
 */
function toBytes(content: string): Bytes {
  const bytes = new TextEncoder().encode(content);
  return Object.assign(bytes, {
    toString(encoding = "utf-8"): string {
      return new TextDecoder(encoding).decode(bytes);
    },
  });
}

function createVfsFsAdapter(vfs: VirtualFS): FsAdapter {
  // Required on FsAdapter, like its sync twin. Both overloads are carried: an
  // encoding yields the string, its absence the bytes, and a missing path
  // rejects the way the Node adapter's does rather than reading as empty.
  function readFile(path: string, encoding: "utf-8" | "utf8"): Promise<string>;
  function readFile(path: string): Promise<Bytes>;
  function readFile(path: string, encoding?: "utf-8" | "utf8"): Promise<string | Bytes> {
    const entry = vfs.read(path);
    if (entry === null) {
      return Promise.reject(
        Object.assign(new Error(`ENOENT: no such file or directory, open '${path}'`), {
          code: "ENOENT",
        }),
      );
    }
    return Promise.resolve(encoding === undefined ? toBytes(entry.content) : entry.content);
  }

  return {
    readFileSync(path: string): string {
      return vfs.read(path)?.content ?? "";
    },
    readFile,
    writeFileSync(path: string, content: string): void {
      vfs.write(path, content);
    },
    existsSync(path: string): boolean {
      return vfs.exists(path);
    },
    mkdirSync(): void {
      // VFS directories are virtual — no-op
    },
    appendFileSync(path: string, content: string): void {
      const existing = vfs.read(path);
      vfs.write(path, (existing?.content ?? "") + content);
    },
    unlinkSync(path: string): void {
      vfs.delete(path);
    },
    rm(list: string | string[]): void {
      for (const entry of Array.isArray(list) ? list : [list]) vfs.delete(entry);
    },
    rmF(list: string | string[]): void {
      for (const entry of Array.isArray(list) ? list : [list]) vfs.delete(entry);
    },
    readdirSync(): string[] {
      return [];
    },
    rmSync(): void {
      // no-op
    },
    statSync(path: string) {
      const entry = vfs.read(path);
      const content = entry?.content ?? "";
      return {
        isDirectory: () => false,
        isFile: () => entry !== undefined,
        size: content.length,
        // boundary: epoch-zero placeholder for in-memory VFS file mtime.
        atime: new Date(0),
        mtime: new Date(0),
        mode: 0o100644,
        uid: 0,
        gid: 0,
      };
    },
    cwd(): string {
      return "/";
    },
    exists(path: string): Promise<boolean> {
      return Promise.resolve(vfs.exists(path));
    },
  };
}

export interface VfsGeneratorOptions {
  vfs: VirtualFS;
  output: (msg: string) => void;
}

function ensureVfsAdapter(vfs: VirtualFS): void {
  registerFsAdapter("vfs", createVfsFsAdapter(vfs), posixPath);
  ActiveSupport.fsAdapter = "vfs";
}

function applyVfsOverrides(
  instance: MigrationGenerator | ModelGenerator | AppGenerator,
  vfs: VirtualFS,
): void {
  Object.defineProperties(instance, {
    isTypeScript: {
      value() {
        return true;
      },
    },
    createFile: {
      value(relativePath: string, content: string, _options?: { mode?: number }) {
        vfs.write(relativePath, content);
        this.createdFiles.push(relativePath);
        this.output(`      create  ${relativePath}`);
      },
    },
    fileExists: {
      value(relativePath: string) {
        return vfs.exists(relativePath);
      },
    },
  });
}

export class VfsMigrationGenerator extends MigrationGenerator {
  constructor(options: VfsGeneratorOptions) {
    ensureVfsAdapter(options.vfs);
    super({ cwd: "/", output: options.output });
    applyVfsOverrides(this, options.vfs);
  }
}

export class VfsModelGenerator extends ModelGenerator {
  private _vfs: VirtualFS;
  private _vfsOutput: (msg: string) => void;

  constructor(options: VfsGeneratorOptions) {
    ensureVfsAdapter(options.vfs);
    super({ cwd: "/", output: options.output });
    this._vfs = options.vfs;
    this._vfsOutput = options.output;
    applyVfsOverrides(this, options.vfs);
  }

  protected override createMigrationGenerator(): MigrationGenerator {
    return new VfsMigrationGenerator({ vfs: this._vfs, output: this._vfsOutput });
  }
}

export interface VfsAppGeneratorOptions extends VfsGeneratorOptions {
  appPath: string;
  database?: AppDatabase;
}

export class VfsAppGenerator extends AppGenerator {
  constructor(options: VfsAppGeneratorOptions) {
    ensureVfsAdapter(options.vfs);
    super({
      cwd: "/",
      output: options.output,
      appPath: options.appPath,
      database: options.database,
      skipDocker: true,
    });
    applyVfsOverrides(this, options.vfs);
  }
}

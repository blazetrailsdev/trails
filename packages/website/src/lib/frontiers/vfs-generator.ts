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
  type FsStatResult,
  type PathAdapter,
} from "@blazetrails/ruby-compat";
import type { VirtualFS } from "./virtual-fs.js";
import migrationTemplate from "../../../../trailties/src/generators/active-record/migration/templates/migration.ts.tt?raw";
import createTableMigrationTemplate from "../../../../trailties/src/generators/active-record/migration/templates/create_table_migration.ts.tt?raw";

const MIGRATION_SOURCE_ROOT = "/.trails/templates/active-record/migration";
const TEMPLATES: Record<string, string> = {
  [`${MIGRATION_SOURCE_ROOT}/migration.ts.tt`]: migrationTemplate,
  [`${MIGRATION_SOURCE_ROOT}/create_table_migration.ts.tt`]: createTableMigrationTemplate,
};

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
    const joined = parts.filter(Boolean).join("/");
    const segments: string[] = [];
    for (const segment of joined.split("/")) {
      if (segment === "" || segment === ".") continue;
      if (segment === "..") segments.pop();
      else segments.push(segment);
    }
    return (joined.startsWith("/") ? "/" : "") + segments.join("/");
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

const directories = new WeakMap<VirtualFS, Set<string>>();

function createVfsFsAdapter(vfs: VirtualFS): FsAdapter {
  // Required on FsAdapter, like its sync twin. Both overloads are carried: an
  // encoding yields the string, its absence the bytes, and a missing path
  // rejects the way the Node adapter's does rather than reading as empty.
  function readFile(path: string, encoding: "utf-8" | "utf8"): Promise<string>;
  function readFile(path: string): Promise<Bytes>;
  function readFile(path: string, encoding?: "utf-8" | "utf8"): Promise<string | Bytes> {
    const template = TEMPLATES[path];
    const entry = template !== undefined ? { content: template } : vfs.read(path);
    if (entry === null) {
      return Promise.reject(
        Object.assign(new Error(`ENOENT: no such file or directory, open '${path}'`), {
          code: "ENOENT",
        }),
      );
    }
    return Promise.resolve(encoding === undefined ? toBytes(entry.content) : entry.content);
  }

  function errno(code: string, syscall: string, path: string): Error {
    return Object.assign(new Error(`${code}: ${syscall} '${path}'`), { code });
  }

  const made = directories.get(vfs) ?? new Set<string>();
  directories.set(vfs, made);

  function trim(path: string): string {
    return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  }

  function beneath(path: string): string[] {
    const prefix = path.endsWith("/") ? path : `${path}/`;
    const files = vfs.list().map((file) => file.path);
    return [...files, ...Object.keys(TEMPLATES), ...made].filter((e) => e.startsWith(prefix));
  }

  function isDirectory(path: string): boolean {
    return made.has(trim(path)) || beneath(path).length > 0;
  }

  function content(path: string): string | null {
    return TEMPLATES[path] ?? vfs.read(path)?.content ?? null;
  }

  function existsSync(path: string): boolean {
    return content(path) !== null || isDirectory(path);
  }

  function statSync(path: string, syscall = "stat"): FsStatResult {
    const file = content(path);
    const directory = file === null && isDirectory(path);
    if (file === null && !directory) throw errno("ENOENT", syscall, path);
    return {
      isDirectory: () => directory,
      isFile: () => !directory,
      isSymbolicLink: () => false,
      isExecutable: () => directory,
      size: file?.length ?? 0,
      // boundary: epoch-zero placeholder for in-memory VFS file times.
      atime: new Date(0),
      mtime: new Date(0),
      mode: directory ? 0o040755 : 0o100644,
      uid: 0,
      gid: 0,
    };
  }

  function readdirSync(path: string): string[] {
    if (!isDirectory(path)) throw errno("ENOENT", "scandir", path);
    const prefix = path.endsWith("/") ? path : `${path}/`;
    return [...new Set(beneath(path).map((entry) => entry.slice(prefix.length).split("/")[0]))];
  }

  function mkdirSync(path: string): void {
    for (let dir = trim(path); dir !== "/"; dir = posixPath.dirname(dir)) made.add(dir);
  }

  function rmdirSync(path: string): void {
    if (!isDirectory(path)) throw errno("ENOENT", "rmdir", path);
    if (beneath(path).length > 0) throw errno("ENOTEMPTY", "rmdir", path);
    made.delete(trim(path));
  }

  function unlinkSync(path: string): void {
    if (!vfs.delete(path)) throw errno("ENOENT", "unlink", path);
    mkdirSync(posixPath.dirname(path));
  }

  function writeFileSync(path: string, data: string | Uint8Array): void {
    vfs.write(
      path,
      typeof data === "string" ? data : new TextDecoder("utf-8", { fatal: true }).decode(data),
    );
  }

  function settle<T>(block: () => T): Promise<T> {
    try {
      return Promise.resolve(block());
    } catch (error) {
      return Promise.reject(error);
    }
  }

  return {
    readFileSync(path: string): string {
      return vfs.read(path)?.content ?? "";
    },
    readFile,
    writeFileSync,
    writeFile: (path: string, data: string | Uint8Array) => settle(() => writeFileSync(path, data)),
    existsSync,
    exists: (path: string) => settle(() => existsSync(path)),
    mkdirSync,
    mkdir: (path: string) => settle(() => mkdirSync(path)),
    appendFileSync(path: string, data: string): void {
      const existing = vfs.read(path);
      vfs.write(path, (existing?.content ?? "") + data);
    },
    unlinkSync,
    unlink: (path: string) => settle(() => unlinkSync(path)),
    readdirSync,
    readdir: (path: string) => settle(() => readdirSync(path)),
    rmdirSync,
    rmdir: (path: string) => settle(() => rmdirSync(path)),
    rmSync(): void {
      // no-op
    },
    statSync: (path: string) => statSync(path),
    stat: (path: string) => settle(() => statSync(path)),
    lstatSync: (path: string) => statSync(path, "lstat"),
    lstat: (path: string) => settle(() => statSync(path, "lstat")),
    cwd(): string {
      return "/";
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
  static {
    void this.sourceRoot(MIGRATION_SOURCE_ROOT);
  }

  constructor(options: VfsGeneratorOptions) {
    ensureVfsAdapter(options.vfs);
    super({ cwd: "/", output: options.output });
    applyVfsOverrides(this, options.vfs);
  }
}

export class VfsModelGenerator extends ModelGenerator {
  private _vfs: VirtualFS;
  private _vfsOutput: (msg: string) => void;

  constructor(options: VfsGeneratorOptions & { name: string; attributes: string[] }) {
    ensureVfsAdapter(options.vfs);
    super({
      cwd: "/",
      output: options.output,
      name: options.name,
      attributes: options.attributes,
      migration: true,
      timestamps: true,
    });
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

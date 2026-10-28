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
  // Both overloads are carried: an encoding yields the string, its absence
  // the bytes, and a missing path throws (readFile rejects) the way the Node
  // adapter's does rather than reading as empty.
  function readFileSync(path: string, encoding: "utf-8" | "utf8" | "latin1"): string;
  function readFileSync(path: string): Bytes;
  function readFileSync(path: string, encoding?: "utf-8" | "utf8" | "latin1"): string | Bytes {
    const file = content(path);
    if (file === null) {
      if (isDirectory(path)) throw errno("EISDIR", "read", path);
      throw Object.assign(new Error(`ENOENT: no such file or directory, open '${path}'`), {
        code: "ENOENT",
      });
    }
    const bytes = toBytes(file);
    if (encoding === undefined) return bytes;
    return encoding === "latin1"
      ? Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")
      : file;
  }

  function readFile(path: string, encoding: "utf-8" | "utf8"): Promise<string>;
  function readFile(path: string): Promise<Bytes>;
  function readFile(path: string, encoding?: "utf-8" | "utf8"): Promise<string | Bytes> {
    return settle(() =>
      encoding === undefined ? readFileSync(path) : readFileSync(path, encoding),
    );
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
    return Object.hasOwn(TEMPLATES, path) ? TEMPLATES[path] : (vfs.read(path)?.content ?? null);
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

  function rm(path: string, options?: { recursive?: boolean; force?: boolean }): void {
    if (!existsSync(path)) {
      if (options?.force) return;
      throw errno("ENOENT", "rm", path);
    }
    if (Object.hasOwn(TEMPLATES, path)) throw errno("EROFS", "rm", path);
    if (content(path) === null) {
      if (!options?.recursive) throw errno("ERR_FS_EISDIR", "rm", path);
      const entries = beneath(path);
      const template = entries.find((entry) => Object.hasOwn(TEMPLATES, entry));
      if (template !== undefined) throw errno("EROFS", "rm", template);
      for (const entry of entries) if (!made.delete(entry)) vfs.delete(entry);
      made.delete(trim(path));
    } else {
      vfs.delete(path);
    }
    mkdirSync(posixPath.dirname(trim(path)));
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
    readFileSync,
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
    rm: (path: string, options?: { recursive?: boolean; force?: boolean }) =>
      settle(() => rm(path, options)),
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
}

function ensureVfsAdapter(vfs: VirtualFS): void {
  registerFsAdapter("vfs", createVfsFsAdapter(vfs), posixPath);
  ActiveSupport.fsAdapter = "vfs";
}

function applyVfsOverrides(instance: MigrationGenerator | ModelGenerator | AppGenerator): void {
  Object.defineProperties(instance, {
    isTypeScript: {
      value() {
        return true;
      },
    },
  });
}

export class VfsMigrationGenerator extends MigrationGenerator {
  static {
    void this.sourceRoot(MIGRATION_SOURCE_ROOT);
  }

  constructor(
    options: VfsGeneratorOptions &
      Pick<ConstructorParameters<typeof MigrationGenerator>[0], "shell">,
  ) {
    ensureVfsAdapter(options.vfs);
    super({ cwd: "/", shell: options.shell });
    applyVfsOverrides(this);
  }
}

export class VfsModelGenerator extends ModelGenerator {
  private _vfs: VirtualFS;

  constructor(options: VfsGeneratorOptions & { name: string; attributes: string[] }) {
    ensureVfsAdapter(options.vfs);
    super({
      cwd: "/",
      name: options.name,
      attributes: options.attributes,
      migration: true,
      timestamps: true,
    });
    this._vfs = options.vfs;
    applyVfsOverrides(this);
  }

  protected override createMigrationGenerator(): MigrationGenerator {
    return new VfsMigrationGenerator({ vfs: this._vfs, shell: this.shell });
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
      appPath: options.appPath,
      database: options.database,
      skipDocker: true,
    });
    applyVfsOverrides(this);
  }
}

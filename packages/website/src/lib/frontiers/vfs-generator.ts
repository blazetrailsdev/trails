import { AppGenerator, ModelGenerator, MigrationGenerator } from "@blazetrails/railties/generators";
import type { AppOptions } from "@blazetrails/railties/generators";
import {
  registerFsAdapter,
  ActiveSupport,
  type FsAdapter,
  type PathAdapter,
} from "@blazetrails/activesupport";
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

function createVfsFsAdapter(vfs: VirtualFS): FsAdapter {
  return {
    readFileSync(path: string): string {
      return vfs.read(path)?.content ?? "";
    },
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
    readdirSync(): string[] {
      return [];
    },
    rmSync(): void {
      // no-op
    },
    statSync(): { isDirectory(): boolean; isFile(): boolean } {
      return { isDirectory: () => false, isFile: () => true };
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

export class VfsAppGenerator extends AppGenerator {
  constructor(options: VfsGeneratorOptions) {
    ensureVfsAdapter(options.vfs);
    super({ cwd: "/", output: options.output });
    applyVfsOverrides(this, options.vfs);
  }

  override async run(name: string, options: AppOptions): Promise<string[]> {
    const originalCwd = this.cwd;
    try {
      return await super.run(name, {
        ...options,
        skipDocker: true,
      });
    } finally {
      this.cwd = originalCwd;
    }
  }
}

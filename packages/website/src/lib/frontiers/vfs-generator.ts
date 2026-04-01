import { AppGenerator, ModelGenerator, MigrationGenerator } from "@blazetrails/railties/generators";
import type { AppOptions } from "@blazetrails/railties/generators";
import type { VirtualFS } from "./virtual-fs.js";

export interface VfsGeneratorOptions {
  vfs: VirtualFS;
  output: (msg: string) => void;
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
    super({ cwd: "/", output: options.output });
    applyVfsOverrides(this, options.vfs);
  }
}

export class VfsModelGenerator extends ModelGenerator {
  private _vfs: VirtualFS;
  private _vfsOutput: (msg: string) => void;

  constructor(options: VfsGeneratorOptions) {
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
    super({ cwd: "/", output: options.output });
    applyVfsOverrides(this, options.vfs);
  }

  override async run(name: string, options: AppOptions): Promise<string[]> {
    const originalCwd = this.cwd;
    try {
      return await super.run(name, {
        ...options,
        skipGit: true,
        skipInstall: true,
        skipDocker: true,
      });
    } finally {
      this.cwd = originalCwd;
    }
  }
}

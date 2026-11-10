import { File, RuntimeError, block } from "@blazetrails/ruby-compat";
import type { main } from "./dsl-definition.js";
import { FileList } from "./file-list.js";
import type { FileUtils } from "./file-utils.js";
import { TaskLib } from "./tasklib.js";

type Dsl = typeof main & typeof FileUtils;

export class PackageTask extends TaskLib {
  name!: string | null;
  version!: string | null;
  packageDir!: string;
  needTar!: boolean;
  needTarGz!: boolean;
  needTarBz2!: boolean;
  needTarXz!: boolean;
  needZip!: boolean;
  packageFiles!: FileList;
  tarCommand!: string;
  zipCommand!: string;
  withoutParentDir!: boolean;

  constructor(
    name: string | null = null,
    version: string | null = null,
    blk: ((p: PackageTask) => unknown) | null = null,
  ) {
    super();
    this.init(name, version);
    if (blk != null) blk(this);
    if (name != null) this.define();
  }

  init(name: string | null, version: string | null): void {
    this.name = name;
    this.version = version;
    this.packageFiles = new FileList();
    this.packageDir = "pkg";
    this.needTar = false;
    this.needTarGz = false;
    this.needTarBz2 = false;
    this.needTarXz = false;
    this.needZip = false;
    this.tarCommand = "tar";
    this.zipCommand = "zip";
    this.withoutParentDir = false;
  }

  define(): this {
    const self = this as unknown as Dsl;
    if (this.version == null) throw new RuntimeError("Version required (or :noversion)");
    if (":noversion" === this.version) this.version = null;

    self.desc("Build all the packages");
    self.task("package");

    self.desc("Force a rebuild of the package files");
    self.task({ repackage: ["clobber_package", "package"] });

    self.desc("Remove package products");
    self.task(
      "clobber_package",
      block(async () => {
        try {
          await self.rmR(this.packageDir);
        } catch {
          return null;
        }
      }),
    );

    self.task({ clobber: ["clobber_package"] });

    for (const [need, file, flag] of [
      [this.needTar, this.tgzFile(), "z"],
      [this.needTarGz, this.tarGzFile(), "z"],
      [this.needTarBz2, this.tarBz2File(), "j"],
      [this.needTarXz, this.tarXzFile(), "J"],
    ] as const) {
      if (need) {
        self.task({ package: [`${this.packageDir}/${file}`] });
        self.file(
          { [`${this.packageDir}/${file}`]: [this.packageDirPath(), ...this.packageFiles.toAry()] },
          block(async () => {
            await self.chdir(this.workingDir(), () =>
              self.sh(this.tarCommand, `${flag}cvf`, file, this.targetDir()),
            );
            if (this.withoutParentDir) {
              await self.mv(`${this.packageDirPath()}/${this.targetDir()}`, this.packageDir);
            }
          }),
        );
      }
    }

    if (this.needZip) {
      self.task({ package: [`${this.packageDir}/${this.zipFile()}`] });
      self.file(
        {
          [`${this.packageDir}/${this.zipFile()}`]: [
            this.packageDirPath(),
            ...this.packageFiles.toAry(),
          ],
        },
        block(async () => {
          await self.chdir(this.workingDir(), () =>
            self.sh(this.zipCommand, "-r", this.zipFile(), this.targetDir()),
          );
          if (this.withoutParentDir) {
            await self.mv(`${this.packageDirPath()}/${this.zipFile()}`, this.packageDir);
          }
        }),
      );
    }

    void self.directory(
      { [this.packageDirPath()]: this.packageFiles.toAry() },
      block(async () => {
        for (const fn of this.packageFiles.toAry() as string[]) {
          const f = File.join(this.packageDirPath(), fn);
          const fdir = File.dirname(f);
          if (!(await File.isExistAsync(fdir))) await self.mkdirP(fdir);
          if (await File.isDirectoryAsync(fn)) {
            await self.mkdirP(f);
          } else {
            await self.rmF(f);
            await self.safeLn(fn, f);
          }
        }
      }),
    );
    return this;
  }

  packageName(): string | null {
    return this.version ? `${this.name}-${this.version}` : this.name;
  }

  packageDirPath(): string {
    return `${this.packageDir}/${this.packageName()}`;
  }

  tgzFile(): string {
    return `${this.packageName()}.tgz`;
  }

  tarGzFile(): string {
    return `${this.packageName()}.tar.gz`;
  }

  tarBz2File(): string {
    return `${this.packageName()}.tar.bz2`;
  }

  tarXzFile(): string {
    return `${this.packageName()}.tar.xz`;
  }

  zipFile(): string {
    return `${this.packageName()}.zip`;
  }

  workingDir(): string {
    return this.withoutParentDir ? this.packageDirPath() : this.packageDir;
  }

  targetDir(): string | null {
    return this.withoutParentDir ? "." : this.packageName();
  }
}

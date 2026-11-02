import { File, include, type Included, warn } from "@blazetrails/ruby-compat";
import { GemInflector } from "./gem-inflector.js";
import { Loader } from "./loader.js";
import { RealModName } from "./real-mod-name.js";
import { Registry } from "./registry.js";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface GemLoader extends Included<typeof RealModName> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class GemLoader extends Loader {
  private rootFile: string;
  private rootDir: string;
  private _warnOnExtraFiles: boolean;

  /** @inventedArm pushDir — PERMANENT */
  static async __new(
    rootFile: string,
    { namespace, warnOnExtraFiles }: { namespace: object; warnOnExtraFiles: boolean },
  ): Promise<GemLoader> {
    const loader = new GemLoader(rootFile, { namespace, warnOnExtraFiles });
    await loader.pushDir(loader.rootDir, { namespace });
    return loader;
  }

  /**
   * @missingRailsCall push_dir — PERMANENT
   * @missingRailsArgs basename — PERMANENT
   */
  private constructor(
    rootFile: string,
    { namespace, warnOnExtraFiles }: { namespace: object; warnOnExtraFiles: boolean },
  ) {
    super();

    this._tag = File.basename(rootFile, ".ts");
    if (namespace !== Object) this._tag = `${this.realModName(namespace)}-${this._tag}`;

    this.inflector = new GemInflector(rootFile);
    this.rootFile = File.expandPath(rootFile);
    this.rootDir = File.dirname(rootFile);
    this._warnOnExtraFiles = warnOnExtraFiles;
  }

  override async setup(): Promise<void> {
    if (this._warnOnExtraFiles) await this.warnOnExtraFiles();
    await super.setup();
  }

  /** @internal */
  private async warnOnExtraFiles(): Promise<void> {
    const expectedNamespaceDir = this.rootFile.replace(/\.ts$/, "");

    await this.ls(this.rootDir, (basename, abspath, ftype) => {
      if (abspath === this.rootFile) return;
      if (abspath === expectedNamespaceDir) return;

      const basenameWithoutExt = basename.replace(/\.ts$/, "");
      const cname = this.inflector.camelize(basenameWithoutExt, abspath);

      warn(`WARNING: Zeitwerk defines the constant ${cname} after the ${ftype}

    ${abspath}

To prevent that, please configure the loader to ignore it:

    loader.ignore(\`\${import.meta.dirname}/${basename}\`)

Otherwise, there is a flag to silence this warning:

    Zeitwerk::Loader.for_gem(warn_on_extra_files: false)
`);
    });
  }
}

include(GemLoader, RealModName);
Registry.GemLoader = GemLoader;

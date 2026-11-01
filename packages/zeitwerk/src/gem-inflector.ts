import { File } from "@blazetrails/ruby-compat";
import { Inflector } from "./inflector.js";

export class GemInflector extends Inflector {
  private _versionFile: string;

  constructor(rootFile: string) {
    super();
    const namespace = File.basename(rootFile, ".rb");
    const rootDir = File.dirname(rootFile);
    this._versionFile = File.join(rootDir, namespace, "version.rb");
  }

  override camelize(basename: string, abspath: string | null): string {
    return abspath === this._versionFile ? "VERSION" : super.camelize(basename, abspath);
  }
}

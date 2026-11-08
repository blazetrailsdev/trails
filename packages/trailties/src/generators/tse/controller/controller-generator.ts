import "../../../constants.tse-controller-controller-generator.generated.js";
import { File } from "@blazetrails/ruby-compat";
import { Base } from "../../tse.js";
import { dasherize } from "../../base.js";

export class ControllerGenerator extends Base {
  static {
    this.argument("actions", { type: "array", default: [], banner: "action action" });

    this.methodAdded("copyViewFiles");
  }

  declare actions: string[];
  /** @internal */
  _action?: string;
  /** @internal */
  _path?: string;

  /**
   * @missingRailsArgs template — PERMANENT
   * @inventedArm dasherize — PERMANENT
   */
  async copyViewFiles(): Promise<void> {
    const basePath = File.join(
      "app/views",
      dasherize(File.join(...this.classPath(), this.fileName)),
    );
    await this.emptyDirectory(basePath);
    for (const action of this.actions) {
      this._action = action;
      for (const format of this.formats()) {
        this._path = File.join(basePath, this.filenameWithExtensions(action, format));
        await this.template(this.filenameWithExtensions("view", format), this._path);
      }
    }
  }
}

Object.defineProperty(ControllerGenerator, "name", {
  value: "Tse::Generators::ControllerGenerator",
});

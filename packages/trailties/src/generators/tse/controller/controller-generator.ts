import { File } from "@blazetrails/ruby-compat";
import { Base } from "../../tse.js";
import { controllerPathHelpers } from "../../rails/controller/controller-paths.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export class ControllerGenerator extends Base {
  static {
    void this.sourceRoot(File.expandPath("templates", __dir__));
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
   * @missingRailsArgs join — PERMANENT
   */
  async copyViewFiles(): Promise<void> {
    const basePath = File.join("app/views", controllerPathHelpers(this.name).viewBase);
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

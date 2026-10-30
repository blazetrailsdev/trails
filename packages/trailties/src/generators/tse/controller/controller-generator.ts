import { File } from "@blazetrails/ruby-compat";
import { Base } from "../../tse.js";
import { controllerPathHelpers } from "../../rails/controller/controller-paths.js";

export class ControllerGenerator extends Base {
  static {
    this.argument("actions", { type: "array", default: [], banner: "action action" });

    this.methodAdded("copyViewFiles");
  }

  declare actions: string[];

  /**
   * @missingRailsCall template — CONVERGEABLE converge-remaining-generators-onto-thor-template
   * @missingRailsArgs join — PERMANENT
   */
  async copyViewFiles(): Promise<void> {
    const basePath = File.join("app/views", controllerPathHelpers(this.name).viewBase);
    await this.emptyDirectory(basePath);
    for (const action of this.actions) {
      for (const format of this.formats()) {
        await this.createFile(File.join(basePath, this.filenameWithExtensions(action, format)), "");
      }
    }
  }
}

Object.defineProperty(ControllerGenerator, "name", {
  value: "Tse::Generators::ControllerGenerator",
});

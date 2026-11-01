import { File } from "@blazetrails/ruby-compat";
import { dasherize } from "../../base.js";
import { NamedBase } from "../../named-base.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export class ControllerGenerator extends NamedBase {
  static {
    void this.sourceRoot(File.expandPath("templates", __dir__));
    this.argument("actions", { type: "array", default: [], banner: "action action" });
    this.classOption("skipRoutes", { type: "boolean" });

    this.checkClassCollision({ suffix: "ControllerTest" });

    this.methodAdded("createTestFiles");
  }

  declare actions: string[];

  /** @missingRailsArgs template — PERMANENT */
  async createTestFiles(): Promise<void> {
    await this.template(
      "functional_test.ts",
      File.join(
        "test/controllers",
        ...this.classPathParts.map((p) => dasherize(p)),
        `${dasherize(this.fileName)}-controller.test${this.ext()}`,
      ),
    );
  }
}

Object.defineProperty(ControllerGenerator, "name", {
  value: "TestUnit::Generators::ControllerGenerator",
});

import { File } from "@blazetrails/ruby-compat";
import { NamedBase } from "../../named-base.js";
import { controllerPathHelpers } from "../../rails/controller/controller-paths.js";

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
      `test/controllers/${this.paths().controllerFile}.test${this.ext()}`,
    );
  }

  /** @noRailsEquivalent PERMANENT */
  private paths() {
    return controllerPathHelpers(this.name);
  }

  /** @noRailsEquivalent PERMANENT */
  private importPrefix(): string {
    const { namespaceParts } = this.paths();
    return "../".repeat((namespaceParts.length > 1 ? namespaceParts.length - 1 : 0) + 2);
  }
}

Object.defineProperty(ControllerGenerator, "name", {
  value: "TestUnit::Generators::ControllerGenerator",
});

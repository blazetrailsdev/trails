import { File } from "@blazetrails/ruby-compat";
import { dasherize } from "../../base.js";
import { NamedBase } from "../../named-base.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export class HelperGenerator extends NamedBase {
  static {
    void this.sourceRoot(File.expandPath("templates", __dir__));
  }

  /** @internal */
  private __fileName?: string;

  /**
   * @missingRailsArgs template — PERMANENT
   * @missingRailsArgs join — PERMANENT
   */
  async createHelperFiles(): Promise<void> {
    await this.template(
      "helper.ts",
      File.join(
        "app/helpers",
        ...this.classPathParts.map((p) => dasherize(p)),
        `${dasherize(this.fileName)}-helper${this.ext()}`,
      ),
    );
  }

  /** @internal */
  override get fileName(): string {
    return (this.__fileName ??= super.fileName.replace(/_helper$/i, ""));
  }
}

Object.defineProperty(HelperGenerator, "name", { value: "Rails::Generators::HelperGenerator" });
HelperGenerator.checkClassCollision({ suffix: "Helper" });
HelperGenerator.methodAdded("createHelperFiles");
HelperGenerator.hookFor("testFramework");

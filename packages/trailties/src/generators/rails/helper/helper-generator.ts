import { camelize } from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";
import { dasherize } from "../../base.js";
import { NamedBase } from "../../named-base.js";

export class HelperGenerator extends NamedBase {
  /** @internal */
  private __fileName?: string;

  /**
   * @missingRailsCall template — CONVERGEABLE converge-generator-base-create-file-onto-thor-actions
   * @missingRailsArgs join — PERMANENT
   */
  createHelperFiles(): void {
    const helperName = [...this.classPathParts, this.fileName].map((p) => camelize(p)).join("");
    this.createFile(
      File.join(
        "app/helpers",
        ...this.classPathParts.map((p) => dasherize(p)),
        `${dasherize(this.fileName)}-helper${this.ext()}`,
      ),
      `export const ${helperName}Helper = {\n};\n`,
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

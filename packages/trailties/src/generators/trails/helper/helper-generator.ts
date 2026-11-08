import "../../../constants.trails-helper-helper-generator.generated.js";
import { File } from "@blazetrails/ruby-compat";
import { dasherize } from "../../base.js";
import { NamedBase } from "../../named-base.js";

export class HelperGenerator extends NamedBase {
  /** @internal */
  private __fileName?: string;

  async createHelperFiles(): Promise<void> {
    await this.template(
      "helper.ts",
      File.join(
        "app/helpers",
        ...this.classPath(),
        `${dasherize(this.fileName)}-helper${this.ext()}`,
      ),
    );
  }

  /** @internal */
  override get fileName(): string {
    return (this.__fileName ??= super.fileName.replace(/_helper$/i, ""));
  }
}

Object.defineProperty(HelperGenerator, "name", { value: "Trails::Generators::HelperGenerator" });
HelperGenerator.checkClassCollision({ suffix: "Helper" });
HelperGenerator.methodAdded("createHelperFiles");
HelperGenerator.hookFor("testFramework");

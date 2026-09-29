import { ResourceGenerator } from "../resource/resource-generator.js";
import { ModelGenerator } from "../../model-generator.js";
import type { NamedBaseOptions } from "../../named-base.js";

export class ScaffoldGenerator extends ResourceGenerator {
  /** @noRailsEquivalent CONVERGEABLE wire-generators-onto-hook-for */
  override async run(): Promise<string[]> {
    const modelGen = new ModelGenerator({
      cwd: this.cwd,
      output: this.output,
      behavior: this.behavior,
      pretend: this.options.pretend,
      force: this.options.force,
      skip: this.options.skip,
    });
    this.createdFiles.push(
      ...(await modelGen.run(this.name, (this.options as NamedBaseOptions).attributes ?? [])),
    );
    return this.getCreatedFiles();
  }
}

Object.defineProperty(ScaffoldGenerator, "name", { value: "Rails::Generators::ScaffoldGenerator" });
ScaffoldGenerator.classOption("api", {
  type: "boolean",
  desc: "Generate API-only controller and tests, with no view templates",
});
ScaffoldGenerator.classOption("resourceRoute", { type: "boolean" });
ScaffoldGenerator.hookFor("scaffoldController", { required: true });

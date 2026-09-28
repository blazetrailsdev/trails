/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include ResourceHelpers` (`resource_generator.rb:9`, inherited by `scaffold_generator.rb:7`); the class/interface merge is how a mixin surfaces on the type side. */
import { include, type Included } from "@blazetrails/activesupport";
import { NamedBase, type NamedBaseOptions } from "../../named-base.js";
import type { ModelHelpersOptions } from "../../model-helpers.js";
import { ResourceHelpers } from "../../resource-helpers.js";
import { ModelGenerator } from "../../model-generator.js";
import { ScaffoldControllerGenerator } from "../scaffold-controller/scaffold-controller-generator.js";
import { ResourceRouteGenerator } from "../resource-route/resource-route-generator.js";
import * as Tse from "../../tse/scaffold/scaffold-generator.js";

export interface ScaffoldGeneratorOptions extends NamedBaseOptions, ModelHelpersOptions {
  modelName?: string;
}

export interface ScaffoldGenerator extends Included<typeof ResourceHelpers> {}

export class ScaffoldGenerator extends NamedBase {
  declare controllerName: string;
  declare controllerFileName: string;
  declare _controllerClassPath: string[];

  async run(): Promise<string[]> {
    const args = (this.options as ScaffoldGeneratorOptions).attributes ?? [];

    const modelGen = new ModelGenerator({
      cwd: this.cwd,
      output: this.output,
      behavior: this.behavior,
      pretend: this.options.pretend,
      force: this.options.force,
      skip: this.options.skip,
    });
    this.createdFiles.push(...(await modelGen.run(this.name, args)));

    this.createdFiles.push(
      ...(await new ScaffoldControllerGenerator({
        ...(this.options as ScaffoldGeneratorOptions),
        cwd: this.cwd,
        output: this.output,
        behavior: this.behavior,
        skipRoutes: true,
      }).run()),
    );

    this.createdFiles.push(
      ...new Tse.ScaffoldGenerator({
        ...(this.options as ScaffoldGeneratorOptions),
        behavior: this.behavior,
      }).run(),
    );

    const route = new ResourceRouteGenerator({
      cwd: this.cwd,
      output: this.output,
      behavior: this.behavior,
      pretend: this.options.pretend,
      name: this.name,
    });
    await route.addResourceRoute();
    return this.getCreatedFiles();
  }
}

include(ScaffoldGenerator, ResourceHelpers);

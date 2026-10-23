/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include ResourceHelpers` (`resource_generator.rb:9`); the class/interface merge is how a mixin surfaces on the type side. */
import { include, type Included, pluralize } from "@blazetrails/activesupport";
import { ModelGenerator, type ModelGeneratorOptions } from "../model/model-generator.js";
import { ResourceHelpers } from "../../resource-helpers.js";
import type { GeneratorBase } from "../../base.js";
import type { GeneratorClass } from "../../../generators.js";

export interface ResourceGeneratorOptions extends ModelGeneratorOptions {
  actions?: string[];
  modelName?: string;
}

export interface ResourceGenerator extends Included<typeof ResourceHelpers> {}

export class ResourceGenerator extends ModelGenerator {
  /** @internal */
  declare controllerName: string;
  /** @internal */
  declare controllerFileName: string;
  /** @internal */
  declare _controllerClassPath: string[];
  declare options: ResourceGeneratorOptions;

  /** @inlinedFrom Rails::Generators::ResourceHelpers#initialize rails/v8.0.2/railties/lib/rails/generators/resource_helpers.rb:17-26 */
  constructor(options: ResourceGeneratorOptions) {
    super(options);
    const controllerName = this.name;
    if (this.options.modelName != null) {
      this.name = this.options.modelName;
      this.assignNamesBang(this.name);
    }

    this.assignControllerNamesBang(pluralize(controllerName));
  }
}

Object.defineProperty(ResourceGenerator, "name", { value: "Rails::Generators::ResourceGenerator" });
include(ResourceGenerator, ResourceHelpers);
ResourceGenerator.hookFor(
  "resourceController",
  { required: true },
  function (this: GeneratorBase, controller: GeneratorClass) {
    return this.invoke(controller, [
      (this as ResourceGenerator).controllerName,
      (this.options as ResourceGeneratorOptions).actions,
    ]);
  },
);
ResourceGenerator.classOption("actions", {
  type: "array",
  banner: "ACTION ACTION",
  default: [],
  desc: "Actions for the resource controller",
});
ResourceGenerator.hookFor("resourceRoute", { required: true });

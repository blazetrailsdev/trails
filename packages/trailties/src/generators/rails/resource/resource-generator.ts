/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include ResourceHelpers` (`resource_generator.rb:9`); the class/interface merge is how a mixin surfaces on the type side. */
import { include, type Included } from "@blazetrails/activesupport";
import { ModelGenerator, type ModelGeneratorOptions } from "../model/model-generator.js";
import { ResourceRouteGenerator } from "../resource-route/resource-route-generator.js";
import { ResourceHelpers } from "../../resource-helpers.js";

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
  actions: string[];

  constructor(options: ResourceGeneratorOptions) {
    super(options);
    this.actions = options.actions ?? [];
  }

  run(): string[] {
    super.run();
    const route = new ResourceRouteGenerator({
      cwd: this.cwd,
      output: this.output,
      behavior: this.behavior,
      pretend: this.options.pretend,
      name: this.name,
    });
    route.addResourceRoute({ actions: this.actions });
    return this.getCreatedFiles();
  }
}

include(ResourceGenerator, ResourceHelpers);

import { ModelGenerator, type ModelGeneratorOptions } from "../model/model-generator.js";
import { ResourceRouteGenerator } from "../resource-route/resource-route-generator.js";
import { applyResourceHelpers, type ResourceHelpersInfo } from "../../resource-helpers.js";

export interface ResourceGeneratorOptions extends ModelGeneratorOptions {
  actions?: string[];
}

export class ResourceGenerator extends ModelGenerator {
  resource: ResourceHelpersInfo;
  actions: string[];

  constructor(options: ResourceGeneratorOptions) {
    super(options);
    this.resource = applyResourceHelpers(this.name, options, options.output);
    this.actions = options.actions ?? [];
  }

  run(): string[] {
    super.run();
    const route = new ResourceRouteGenerator({
      cwd: this.cwd,
      output: this.output,
      name: this.name,
    });
    route.addResourceRoute({ actions: this.actions });
    return this.getCreatedFiles();
  }
}

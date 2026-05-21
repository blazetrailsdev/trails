import { ModelGenerator, type ModelGeneratorOptions } from "../model/model-generator.js";
import { ResourceRouteGenerator } from "../resource-route/resource-route-generator.js";
import { applyResourceHelpers, type ResourceHelpersInfo } from "../../resource-helpers.js";

// Mirrors railties/lib/rails/generators/rails/resource/resource_generator.rb.
// Rails' `hook_for :resource_controller` / `:resource_route` chain is folded
// here into direct delegation; controller scaffolding ships in scaffold-
// controller-generator (deferred to a follow-up PR).
export interface ResourceGeneratorOptions extends ModelGeneratorOptions {
  actions?: string[];
}

export class ResourceGenerator extends ModelGenerator {
  resource: ResourceHelpersInfo;
  actions: string[];

  constructor(options: ResourceGeneratorOptions) {
    super(options);
    this.resource = applyResourceHelpers(options.name, options, options.output);
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
    for (const f of route.getCreatedFiles()) this.createdFiles.push(f);
    return this.getCreatedFiles();
  }
}

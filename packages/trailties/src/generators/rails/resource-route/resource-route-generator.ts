import { pluralize } from "@blazetrails/activesupport";
import { NamedBase } from "../../named-base.js";
import type { GeneratorOptions } from "../../base.js";

export interface ResourceRouteOptions {
  actions?: string[];
}

export class ResourceRouteGenerator extends NamedBase {
  static override async start(args: string[], config: GeneratorOptions): Promise<string[]> {
    const generator = new ResourceRouteGenerator({ ...config, name: args[0] ?? "" });
    await generator.addResourceRoute();
    return generator.getCreatedFiles();
  }

  async addResourceRoute(options: ResourceRouteOptions = {}): Promise<void> {
    if (options.actions && options.actions.length > 0) return;
    await this.route(`mapper.resources(${JSON.stringify(pluralize(this.fileName))});`, {
      namespace: this.regularClassPath(),
    });
  }
}

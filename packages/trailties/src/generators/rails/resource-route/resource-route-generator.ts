import { pluralize } from "@blazetrails/activesupport";
import { NamedBase, type NamedBaseOptions } from "../../named-base.js";

// Mirrors railties/lib/rails/generators/rails/resource_route/resource_route_generator.rb.
// Properly nests namespaces passed into a generator:
//   resource admin/users/products → namespace :admin { namespace :users { resources :products } }
export interface ResourceRouteOptions {
  actions?: string[];
}

export class ResourceRouteGenerator extends NamedBase {
  constructor(options: NamedBaseOptions) {
    super(options);
  }

  addResourceRoute(options: ResourceRouteOptions = {}): void {
    if (options.actions && options.actions.length > 0) return;
    const line = `resources :${pluralize(this.fileName)}`;
    const block = this.classPathParts.reduceRight(
      (inner, ns) => `namespace :${ns} do\n  ${inner.replace(/\n/g, "\n  ")}\nend`,
      line,
    );
    const routesFile = "config/routes.ts";
    if (this.fileExists(routesFile)) {
      this.appendToFile(routesFile, `${block}\n`);
    } else {
      this.createFile(routesFile, `${block}\n`);
    }
  }
}

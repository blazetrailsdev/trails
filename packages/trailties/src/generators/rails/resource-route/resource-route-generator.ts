import { pluralize } from "@blazetrails/activesupport";
import { NamedBase } from "../../named-base.js";

// Mirrors railties/lib/rails/generators/rails/resource_route/resource_route_generator.rb.
// Inserts router.resources() at the `// routes` marker in src/config/routes.{ts,js}
// (trails uses TS routes, not Ruby DSL); see generators/actions.ts.
export interface ResourceRouteOptions {
  actions?: string[];
}

export class ResourceRouteGenerator extends NamedBase {
  addResourceRoute(options: ResourceRouteOptions = {}): void {
    if (options.actions && options.actions.length > 0) return;
    const routesFile = ["src/config/routes.ts", "src/config/routes.js"].find((f) =>
      this.fileExists(f),
    );
    if (!routesFile) return;
    const ns = this.classPathParts;
    const lines: string[] = [];
    ns.forEach((n, i) => lines.push(`${"  ".repeat(i + 1)}router.namespace("${n}", (router) => {`));
    lines.push(`${"  ".repeat(ns.length + 1)}router.resources("${pluralize(this.fileName)}");`);
    for (let i = ns.length; i > 0; i--) lines.push(`${"  ".repeat(i)}});`);
    this.insertIntoFile(routesFile, "// routes", lines.join("\n") + "\n");
  }
}

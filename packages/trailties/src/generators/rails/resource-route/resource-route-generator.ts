import { pluralize } from "@blazetrails/activesupport";
import { NamedBase } from "../../named-base.js";

// Mirrors railties/lib/rails/generators/rails/resource_route/resource_route_generator.rb.
// Inserts router.resources() at the `// routes` marker in src/config/routes.{ts,js}
// (trails uses TS routes, not Ruby DSL); see generators/actions.ts. Unlike sibling
// generators, this one does not emit a full TS module (insertIntoFile only), so
// it does not flow through the template-builder.
export interface ResourceRouteOptions {
  actions?: string[];
}

export function emitResourceRouteSnippet(namespaces: string[], resource: string): string {
  const lines: string[] = [];
  namespaces.forEach((n, i) =>
    lines.push(`${"  ".repeat(i + 1)}router.namespace("${n}", (router) => {`),
  );
  lines.push(`${"  ".repeat(namespaces.length + 1)}router.resources("${resource}");`);
  for (let i = namespaces.length; i > 0; i--) lines.push(`${"  ".repeat(i)}});`);
  return lines.join("\n") + "\n";
}

export class ResourceRouteGenerator extends NamedBase {
  addResourceRoute(options: ResourceRouteOptions = {}): void {
    if (options.actions && options.actions.length > 0) return;
    const routesFile = ["src/config/routes.ts", "src/config/routes.js"].find((f) =>
      this.fileExists(f),
    );
    if (!routesFile) return;
    this.insertIntoFile(
      routesFile,
      "// routes",
      emitResourceRouteSnippet(this.classPathParts, pluralize(this.fileName)),
    );
  }
}

import { pluralize } from "@blazetrails/activesupport";
import { NamedBase } from "../../named-base.js";
import type { GeneratorOptions } from "../../base.js";

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
  static override async start(args: string[], config: GeneratorOptions): Promise<string[]> {
    const generator = new ResourceRouteGenerator({ ...config, name: args[0] ?? "" });
    generator.addResourceRoute();
    return generator.getCreatedFiles();
  }

  addResourceRoute(options: ResourceRouteOptions = {}): void {
    if (options.actions && options.actions.length > 0) return;
    const routesFile = ["config/routes.ts", "config/routes.js"].find((f) => this.fileExists(f));
    if (!routesFile) return;
    this.insertIntoFile(
      routesFile,
      "// routes",
      emitResourceRouteSnippet(this.classPathParts, pluralize(this.fileName)),
    );
  }
}

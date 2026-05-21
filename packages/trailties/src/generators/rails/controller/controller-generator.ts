import { GeneratorBase, type GeneratorOptions, dasherize, underscore } from "../../base.js";
import {
  actionMethod,
  controllerPathHelpers,
  emitControllerClass,
  parentRefForRelative,
} from "./controller-paths.js";

export interface ControllerRunOptions {
  skipHelper?: boolean;
  skipRoutes?: boolean;
  test?: boolean;
  parent?: string;
}

// Mirrors railties/lib/rails/generators/rails/controller/controller_generator.rb.
export class ControllerGenerator extends GeneratorBase {
  constructor(options: GeneratorOptions) {
    super(options);
  }

  run(name: string, actions: string[], options: ControllerRunOptions = {}): string[] {
    const { skipHelper = false, skipRoutes = false, test = true, parent } = options;
    const paths = controllerPathHelpers(name);
    const ts = this.isTypeScript();
    const ext = this.ext();
    const depth = paths.namespaceParts.length > 1 ? paths.namespaceParts.length - 1 : 0;

    const source = emitControllerClass({
      className: paths.className,
      parent: parent ? parentRefForRelative(parent, depth) : undefined,
      methods: actions.map((a) => actionMethod(a, ts)),
    });
    this.createFile(`src/app/controllers/${paths.controllerFile}${ext}`, source);

    if (test) {
      const importPrefix = "../".repeat(depth + 2);
      const cases = actions
        .map((a) => `  it("${a}", () => {\n    // TODO: test ${a} action\n  });`)
        .join("\n\n");
      this.createFile(
        `test/controllers/${paths.controllerFile}.test${ext}`,
        `import { describe, it, expect } from "vitest";
import { ${paths.className} } from "${importPrefix}src/app/controllers/${paths.controllerFile}.js";

describe("${paths.displayName}", () => {
${cases}
});
`,
      );
    }

    if (!skipHelper) {
      this.createFile(
        `src/app/helpers/${paths.helperFile}${ext}`,
        `export const ${paths.helperName} = {\n};\n`,
      );
    }

    for (const action of actions) {
      this.createFile(`src/app/views/${paths.viewBase}/${action}.html.tse`, "");
    }
    if (actions.length === 0) {
      // Touch the directory by emitting a placeholder .keep so all fs work
      // stays in createFile (no node:fs / sync mkdir paths needed).
      this.createFile(`src/app/views/${paths.viewBase}/.keep`, "");
    }

    if (!skipRoutes && actions.length > 0) {
      this.addRoutes(paths.namespaceParts, actions);
    }
    return this.getCreatedFiles();
  }

  private addRoutes(namespaceParts: string[], actions: string[]): void {
    const routesFile = this.fileExists("src/config/routes.ts")
      ? "src/config/routes.ts"
      : this.fileExists("src/config/routes.js")
        ? "src/config/routes.js"
        : null;
    if (!routesFile) return;
    const controllerSegment = dasherize(underscore(namespaceParts[namespaceParts.length - 1]!));

    if (namespaceParts.length > 1) {
      const namespaces = namespaceParts.slice(0, -1).map((p) => underscore(p));
      const lines: string[] = [];
      let indent = 1;
      for (const ns of namespaces) {
        lines.push(`${"  ".repeat(indent)}router.namespace("${ns}", (router) => {`);
        indent += 1;
      }
      const inner = "  ".repeat(indent);
      for (const a of actions) {
        lines.push(
          `${inner}router.get("/${controllerSegment}/${a}", "${controllerSegment}#${a}");`,
        );
      }
      for (let i = namespaces.length; i > 0; i--) lines.push(`${"  ".repeat(i)}});`);
      this.insertIntoFile(routesFile, "// routes", lines.join("\n") + "\n");
    } else {
      const routeLines = actions
        .map((a) => `  router.get("/${controllerSegment}/${a}", "${controllerSegment}#${a}");`)
        .join("\n");
      this.insertIntoFile(routesFile, "// routes", routeLines + "\n");
    }
  }
}

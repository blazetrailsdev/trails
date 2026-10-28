import type { GeneratorOptions, GeneratorConfig } from "../../base.js";
import { NamedBase } from "../../named-base.js";
import {
  actionMethod,
  controllerPathHelpers,
  emitControllerClass,
  parentRefForRelative,
} from "./controller-paths.js";

export interface ControllerGeneratorOptions extends GeneratorOptions {
  skipRoutes?: boolean;
  helper?: boolean;
  parent?: string;
  skipHelper?: boolean;
  test?: boolean;
}

export class ControllerGenerator extends NamedBase {
  static {
    this.argument("actions", { type: "array", default: [], banner: "action action" });
    this.classOption("skipRoutes", {
      type: "boolean",
      desc: "Don't add routes to config/routes.rb.",
    });
    this.classOption("helper", { type: "boolean" });
    this.classOption("parent", {
      type: "string",
      default: "ApplicationController",
      desc: "The parent class for the generated controller",
    });

    this.checkClassCollision({ suffix: "Controller" });

    this.methodAdded("createControllerFiles");
    this.methodAdded("addRoutes");
  }

  declare options: ControllerGeneratorOptions;
  declare actions: string[];

  constructor(args: unknown[] = [], localOptions: unknown = {}, config: GeneratorConfig = {}) {
    super(args, localOptions, config);
    this.fileName = this.removePossibleSuffix(this.fileName);
  }

  /** @missingRailsCall template — CONVERGEABLE converge-generator-base-create-file-onto-thor-actions */
  createControllerFiles(): void {
    const { skipHelper = false, test = true } = this.options;
    const parent = this.parentClassName();
    const actions = this.actions;
    const paths = controllerPathHelpers(this.name);
    const ts = this.isTypeScript();
    const ext = this.ext();
    const depth = paths.namespaceParts.length > 1 ? paths.namespaceParts.length - 1 : 0;

    const source = emitControllerClass({
      className: paths.className,
      parent: parentRefForRelative(parent, depth, this.ext()),
      methods: actions.map((a) => actionMethod(a, ts)),
    });
    this.createFile(`app/controllers/${paths.controllerFile}${ext}`, source);

    if (test) {
      const importPrefix = "../".repeat(depth + 2);
      const cases = actions
        .map((a) => `  it("${a}", () => {\n    // TODO: test ${a} action\n  });`)
        .join("\n\n");
      this.createFile(
        `test/controllers/${paths.controllerFile}.test${ext}`,
        `import { describe, it, expect } from "vitest";
import { ${paths.className} } from "${importPrefix}app/controllers/${paths.controllerFile}.js";

describe("${paths.displayName}", () => {
${cases}
});
`,
      );
    }

    if (!skipHelper) {
      this.createFile(
        `app/helpers/${paths.helperFile}${ext}`,
        `export const ${paths.helperName} = {\n};\n`,
      );
    }

    for (const action of actions) {
      this.createFile(`app/views/${paths.viewBase}/${action}.html.tse`, "");
    }
    if (actions.length === 0) {
      this.createFile(`app/views/${paths.viewBase}/.keep`, "");
    }
  }

  async addRoutes(): Promise<void> {
    if (this.options.skipRoutes) return;
    if (this.actions.length === 0) return;
    const routingCode = this.actions
      .map((action) => `this.get(${JSON.stringify(`${this.fileName}/${action}`)});`)
      .join("\n");
    await this.route(routingCode, { namespace: this.regularClassPath() });
  }

  /** @internal */
  private parentClassName(): string {
    return this.options.parent!;
  }

  /** @internal */
  private removePossibleSuffix(name: string): string {
    return name.replace(/_?controller$/i, "");
  }
}

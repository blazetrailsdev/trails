import { NamedBase, type NamedBaseOptions } from "../../named-base.js";
import {
  actionMethod,
  controllerPathHelpers,
  emitControllerClass,
  parentRefForRelative,
} from "./controller-paths.js";

export interface ControllerGeneratorOptions extends NamedBaseOptions {
  actions?: string[];
  skipRoutes?: boolean;
  helper?: boolean;
  parent?: string;
  test?: boolean;
}

export class ControllerGenerator extends NamedBase {
  declare options: ControllerGeneratorOptions;
  actions: string[];
  /** @internal */
  private _memoFileName?: string;

  static {
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
  }

  constructor(options: ControllerGeneratorOptions) {
    super({ ...options, attributes: [] });
    this.actions = options.actions ?? options.attributes ?? [];
  }

  async run(): Promise<string[]> {
    const actions = this.actions;
    const test = this.options.test ?? true;
    const paths = controllerPathHelpers(this.name);
    const ext = this.ext();
    const depth = paths.namespaceParts.length > 1 ? paths.namespaceParts.length - 1 : 0;

    this.createControllerFiles();
    await this.addRoutes();

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

    if (this.options.helper !== false) {
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

    return this.getCreatedFiles();
  }

  /** @missingRailsCall template — CONVERGEABLE generators-have-no-thor-source-paths-or-template-files */
  createControllerFiles(): void {
    const paths = controllerPathHelpers(this.name);
    const depth = paths.namespaceParts.length > 1 ? paths.namespaceParts.length - 1 : 0;
    this.createFile(
      `app/controllers/${paths.controllerFile}${this.ext()}`,
      emitControllerClass({
        className: paths.className,
        parent: parentRefForRelative(this.parentClassName(), depth),
        methods: this.actions.map((a) => actionMethod(a, this.isTypeScript())),
      }),
    );
  }

  async addRoutes(): Promise<void> {
    if (this.options.skipRoutes) return;
    if (this.actions.length === 0) return;
    const routingCode = this.actions
      .map((action) => `mapper.get(${JSON.stringify(`${this.fileName}/${action}`)});`)
      .join("\n");
    await this.route(routingCode, { namespace: this.regularClassPath() });
  }

  /** @internal */
  private parentClassName(): string {
    return this.options.parent!;
  }

  /** @internal */
  override get fileName(): string {
    return (this._memoFileName ??= this.removePossibleSuffix(super.fileName));
  }

  /** @internal */
  private removePossibleSuffix(name: string): string {
    return name.replace(/_?controller$/i, "");
  }
}

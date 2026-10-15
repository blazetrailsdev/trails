import { GeneratorBase, type GeneratorOptions } from "../../base.js";
import { underscore } from "@blazetrails/activesupport";
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

export class ControllerGenerator extends GeneratorBase {
  private actions: string[] = [];
  private name = "";
  private _fileName?: string;

  constructor(options: GeneratorOptions) {
    super(options);
  }

  async run(
    name: string,
    actions: string[],
    options: ControllerRunOptions = {},
  ): Promise<string[]> {
    const {
      skipHelper = false,
      skipRoutes = false,
      test = true,
      parent = "ApplicationController",
    } = options;
    this.options = { ...this.options, skipRoutes } as GeneratorOptions;
    this.actions = actions;
    const paths = controllerPathHelpers(name);
    this.name = name;
    this._fileName = undefined;
    const ts = this.isTypeScript();
    const ext = this.ext();
    const depth = paths.namespaceParts.length > 1 ? paths.namespaceParts.length - 1 : 0;

    const source = emitControllerClass({
      className: paths.className,
      parent: parentRefForRelative(parent, depth),
      methods: actions.map((a) => actionMethod(a, ts)),
    });
    this.createFile(`app/controllers/${paths.controllerFile}${ext}`, source);

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

    return this.getCreatedFiles();
  }

  private async addRoutes(): Promise<void> {
    if ((this.options as ControllerRunOptions).skipRoutes) return;
    if (this.actions.length === 0) return;
    const routingCode = this.actions
      .map((action) => `this.get(${JSON.stringify(`${this.fileName()}/${action}`)});`)
      .join("\n");
    await this.route(routingCode, { namespace: this.regularClassPath() });
  }

  private regularClassPath(): string[] {
    return controllerPathHelpers(this.name)
      .namespaceParts.slice(0, -1)
      .map((p) => underscore(p));
  }

  private fileName(): string {
    return (this._fileName ??= underscore(controllerPathHelpers(this.name).namespaceParts.at(-1)!));
  }
}

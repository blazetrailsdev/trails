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
    const paths = controllerPathHelpers(name);
    const ts = this.isTypeScript();
    const ext = this.ext();
    const depth = paths.namespaceParts.length > 1 ? paths.namespaceParts.length - 1 : 0;

    const source = emitControllerClass({
      className: paths.className,
      parent: parentRefForRelative(parent, depth),
      methods: actions.map((a) => actionMethod(a, ts)),
    });
    this.createFile(`app/controllers/${paths.controllerFile}${ext}`, source);

    await this.addRoutes(paths.namespaceParts, actions, skipRoutes);

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

  private async addRoutes(
    namespaceParts: string[],
    actions: string[],
    skipRoutes: boolean,
  ): Promise<void> {
    if (skipRoutes) return;
    if (actions.length === 0) return;
    const fileName = underscore(namespaceParts[namespaceParts.length - 1]);
    const routingCode = actions
      .map((action) => `mapper.get(${JSON.stringify(`${fileName}/${action}`)});`)
      .join("\n");
    const regularClassPath = namespaceParts.slice(0, -1).map((p) => underscore(p));
    await this.route(routingCode, { namespace: regularClassPath });
  }
}

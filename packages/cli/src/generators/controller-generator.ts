import { GeneratorBase, GeneratorOptions, classify, dasherize } from "./base.js";

export class ControllerGenerator extends GeneratorBase {
  constructor(options: GeneratorOptions) {
    super(options);
  }

  run(name: string, actions: string[]): string[] {
    const className = classify(name) + (name.endsWith("Controller") ? "" : "Controller");
    const fileName = dasherize(name.replace(/Controller$/i, "")) + "-controller";

    // Controller file
    const actionMethods = actions
      .map((a) => `  async ${a}(): Promise<void> {\n    // TODO: implement\n  }`)
      .join("\n\n");

    this.createFile(
      `src/app/controllers/${fileName}.ts`,
      `import { ActionController } from "@rails-ts/actionpack";

export class ${className} extends ActionController.Base {
${actionMethods}
}
`,
    );

    // Test file
    const actionTests = actions
      .map((a) => `  it("${a}", () => {\n    // TODO: test ${a} action\n  });`)
      .join("\n\n");

    this.createFile(
      `test/controllers/${fileName}.test.ts`,
      `import { describe, it, expect } from "vitest";
import { ${className} } from "../../src/app/controllers/${fileName}.js";

describe("${className}", () => {
${actionTests}
});
`,
    );

    // Append routes
    if (actions.length > 0 && this.fileExists("src/config/routes.ts")) {
      const routeLines = actions
        .map((a) => {
          const resource = dasherize(name.replace(/Controller$/i, ""));
          return `  router.get("/${resource}/${a}", "${resource}#${a}");`;
        })
        .join("\n");
      this.insertIntoFile("src/config/routes.ts", "// routes", routeLines + "\n");
    }

    return this.getCreatedFiles();
  }
}

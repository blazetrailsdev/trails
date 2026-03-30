import * as fs from "node:fs";
import * as path from "node:path";
import { GeneratorBase, GeneratorOptions, classify, dasherize, underscore } from "./base.js";

interface ControllerRunOptions {
  skipHelper?: boolean;
  skipRoutes?: boolean;
  test?: boolean;
  parent?: string;
}

export class ControllerGenerator extends GeneratorBase {
  constructor(options: GeneratorOptions) {
    super(options);
  }

  run(name: string, actions: string[], options: ControllerRunOptions = {}): string[] {
    const { skipHelper = false, skipRoutes = false, test = true, parent } = options;

    const stripped = name.replace(/[_-]?[Cc]ontroller$/, "");
    const className = classify(stripped) + "Controller";
    const fileName = dasherize(underscore(stripped)) + "-controller";
    const viewDir = dasherize(underscore(stripped));
    const parentClass = parent
      ? classify(parent.replace(/::/g, "_").replace(/\//g, "_"))
      : "ActionController.Base";

    const ext = this.ext();
    const ts = this.isTypeScript();
    const returnType = ts ? ": Promise<void>" : "";

    const namespaceParts = stripped.split("/");
    const depth = namespaceParts.length > 1 ? namespaceParts.length - 1 : 0;
    const parentRelPrefix = depth > 0 ? "../".repeat(depth) : "./";
    const parentPath = parent
      ? dasherize(underscore(parent.replace(/::/g, "_").replace(/\//g, "_")))
      : null;
    const importLine = parent
      ? `import { ${parentClass} } from "${parentRelPrefix}${parentPath}.js";`
      : 'import { ActionController } from "@blazetrails/actionpack";';
    // For TS class names, join namespace parts without :: (AdminDashboardController)
    const tsClassName =
      namespaceParts.length > 1
        ? namespaceParts.map((p) => classify(p)).join("") + "Controller"
        : className;
    // For display/describe strings, use :: style (Admin::DashboardController)
    const displayName =
      namespaceParts.length > 1
        ? namespaceParts.map((p) => classify(p)).join("::") + "Controller"
        : className;
    const controllerFile =
      namespaceParts.length > 1
        ? namespaceParts.map((p) => dasherize(underscore(p))).join("/") + "-controller"
        : fileName;

    const actionMethods = actions
      .map((a) => `  async ${a}()${returnType} {\n    // TODO: implement\n  }`)
      .join("\n\n");

    this.createFile(
      `src/app/controllers/${controllerFile}${ext}`,
      `${importLine}

export class ${tsClassName} extends ${parentClass} {
${actionMethods}
}
`,
    );

    if (test) {
      const testImportPrefix = "../".repeat(depth + 2);
      this.createFile(
        `test/controllers/${controllerFile}.test${ext}`,
        `import { describe, it, expect } from "vitest";
import { ${tsClassName} } from "${testImportPrefix}src/app/controllers/${controllerFile}.js";

describe("${displayName}", () => {
${actions.map((a) => `  it("${a}", () => {\n    // TODO: test ${a} action\n  });`).join("\n\n")}
});
`,
      );
    }

    if (!skipHelper) {
      this.createFile(
        `src/app/helpers/${dasherize(underscore(namespaceParts[namespaceParts.length - 1]))}-helper${ext}`,
        `export const ${classify(namespaceParts[namespaceParts.length - 1])}Helper = {
};
`,
      );
    }

    // Create view templates for each action
    const viewBase =
      namespaceParts.length > 1
        ? namespaceParts.map((p) => dasherize(underscore(p))).join("/")
        : viewDir;
    for (const action of actions) {
      this.createFile(`src/app/views/${viewBase}/${action}.html.ejs`, "");
    }
    // Ensure view directory exists even with no actions
    if (actions.length === 0) {
      const viewDirPath = `src/app/views/${viewBase}`;
      const fullPath = path.join(this.cwd, viewDirPath);
      fs.mkdirSync(fullPath, { recursive: true });
    }

    if (!skipRoutes && actions.length > 0) {
      this.addRoutes(namespaceParts, actions);
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

    const controllerName = dasherize(underscore(namespaceParts[namespaceParts.length - 1]));

    if (namespaceParts.length > 1) {
      const namespace = underscore(namespaceParts[0]);
      const routeLines = actions
        .map((a) => `    router.get("/${controllerName}/${a}", "${controllerName}#${a}");`)
        .join("\n");
      const block = `  router.namespace("${namespace}", (router) => {\n${routeLines}\n  });`;
      this.insertIntoFile(routesFile, "// routes", block + "\n");
    } else {
      const routeLines = actions
        .map((a) => `  router.get("/${controllerName}/${a}", "${controllerName}#${a}");`)
        .join("\n");
      this.insertIntoFile(routesFile, "// routes", routeLines + "\n");
    }
  }
}

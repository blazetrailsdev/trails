import { GeneratorBase, GeneratorOptions, classify, dasherize, tableize } from "./base.js";
import { ModelGenerator } from "./model-generator.js";
import { ControllerGenerator } from "./controller-generator.js";

export class ScaffoldGenerator extends GeneratorBase {
  constructor(options: GeneratorOptions) {
    super(options);
  }

  run(name: string, args: string[]): string[] {
    const className = classify(name);
    const resourceName = dasherize(name);

    // Generate model + migration
    const modelGen = new ModelGenerator({ cwd: this.cwd, output: this.output });
    const modelFiles = modelGen.run(name, args);
    this.createdFiles.push(...modelFiles);

    // Generate controller with CRUD actions
    const controllerGen = new ControllerGenerator({ cwd: this.cwd, output: this.output });
    const controllerFiles = controllerGen.run(tableize(className), ["index", "show", "create", "update", "destroy"]);
    this.createdFiles.push(...controllerFiles);

    // Add RESTful routes
    if (this.fileExists("src/config/routes.ts")) {
      this.insertIntoFile(
        "src/config/routes.ts",
        "// routes",
        `  router.resources("${tableize(className)}");\n`,
      );
    }

    return this.getCreatedFiles();
  }
}

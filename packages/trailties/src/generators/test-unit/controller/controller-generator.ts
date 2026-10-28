import { NamedBase } from "../../named-base.js";
import { controllerPathHelpers } from "../../rails/controller/controller-paths.js";

export class ControllerGenerator extends NamedBase {
  static {
    this.argument("actions", { type: "array", default: [], banner: "action action" });
    this.classOption("skipRoutes", { type: "boolean" });

    this.checkClassCollision({ suffix: "ControllerTest" });

    this.methodAdded("createTestFiles");
  }

  declare actions: string[];

  /** @missingRailsCall template — CONVERGEABLE converge-generator-base-create-file-onto-thor-actions */
  createTestFiles(): void {
    const paths = controllerPathHelpers(this.name);
    const depth = paths.namespaceParts.length > 1 ? paths.namespaceParts.length - 1 : 0;
    const importPrefix = "../".repeat(depth + 2);
    const cases = this.actions
      .map((a) => `  it("${a}", () => {\n    // TODO: test ${a} action\n  });`)
      .join("\n\n");
    this.createFile(
      `test/controllers/${paths.controllerFile}.test${this.ext()}`,
      `import { describe, it, expect } from "vitest";
import { ${paths.className} } from "${importPrefix}app/controllers/${paths.controllerFile}.js";

describe("${paths.displayName}", () => {
${cases}
});
`,
    );
  }
}

Object.defineProperty(ControllerGenerator, "name", {
  value: "TestUnit::Generators::ControllerGenerator",
});

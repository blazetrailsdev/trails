import { File } from "@blazetrails/ruby-compat";
import { dasherize, type GeneratorOptions } from "../../base.js";
import { NamedBase } from "../../named-base.js";
import { TEMPLATES } from "./templates.js";

export interface ModelGeneratorOptions extends GeneratorOptions {
  fixture?: boolean;
  fixtureReplacement?: string | null;
}

export class ModelGenerator extends NamedBase {
  static readonly RESERVED_YAML_KEYWORDS = [
    "y",
    "yes",
    "n",
    "no",
    "true",
    "false",
    "on",
    "off",
    "null",
  ];

  static {
    this.argument("attributes", { type: "array", default: [], banner: "field:type field:type" });

    this.checkClassCollision({ suffix: "Test" });

    this.methodAdded("createTestFile");
  }

  /** @missingRailsCall template — CONVERGEABLE converge-generator-base-create-file-onto-thor-actions */
  createTestFile(): void {
    this.createFile(
      File.join(
        "test/models",
        ...this.classPathParts,
        `${dasherize(this.fileName)}.test${this.ext()}`,
      ),
      TEMPLATES.unit_test.call(this),
    );
  }

  /** @missingRailsCall template — CONVERGEABLE converge-generator-base-create-file-onto-thor-actions */
  createFixtureFile(): void {
    if (
      (this.options as ModelGeneratorOptions).fixture &&
      (this.options as ModelGeneratorOptions).fixtureReplacement == null
    ) {
      this.createFile(
        File.join("test/fixtures", ...this.classPathParts, `${this.fixtureFileName()}.yml`),
        TEMPLATES.fixtures.call(this),
      );
    }
  }

  /** @internal */
  yamlKeyValue(key: string, value: unknown): string {
    if (ModelGenerator.RESERVED_YAML_KEYWORDS.includes(key.toLowerCase())) {
      return `'${key}': ${value ?? ""}`;
    } else {
      return `${key}: ${value ?? ""}`;
    }
  }
}

Object.defineProperty(ModelGenerator, "name", { value: "TestUnit::Generators::ModelGenerator" });
ModelGenerator.classOption("fixture", { type: "boolean" });
ModelGenerator.hookFor("fixtureReplacement");
ModelGenerator.methodAdded("createFixtureFile");

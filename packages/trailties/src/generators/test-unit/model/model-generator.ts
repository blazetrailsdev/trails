import { File } from "@blazetrails/ruby-compat";
import { dasherize } from "../../base.js";
import { NamedBase, type NamedBaseOptions } from "../../named-base.js";
import { TEMPLATES } from "./templates.js";

export interface ModelGeneratorOptions extends NamedBaseOptions {
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
    this.checkClassCollision({ suffix: "Test" });
    this.commands().push("createTestFile", "createFixtureFile");
  }

  /** @missingRailsCall template — CONVERGEABLE thor-actions-template-is-unported */
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

  /** @missingRailsCall template — CONVERGEABLE thor-actions-template-is-unported */
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

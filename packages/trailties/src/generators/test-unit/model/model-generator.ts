import { File } from "@blazetrails/ruby-compat";
import { dasherize, type GeneratorOptions } from "../../base.js";
import { NamedBase } from "../../named-base.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

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
    void this.sourceRoot(File.expandPath("templates", __dir__));
    this.argument("attributes", { type: "array", default: [], banner: "field:type field:type" });

    this.checkClassCollision({ suffix: "Test" });

    this.methodAdded("createTestFile");
  }

  /** @missingRailsArgs template — PERMANENT */
  async createTestFile(): Promise<void> {
    await this.template(
      "unit_test.ts",
      File.join(
        "test/models",
        ...this.classPathParts,
        `${dasherize(this.fileName)}.test${this.ext()}`,
      ),
    );
  }

  async createFixtureFile(): Promise<void> {
    if (
      (this.options as ModelGeneratorOptions).fixture &&
      (this.options as ModelGeneratorOptions).fixtureReplacement == null
    ) {
      await this.template(
        "fixtures.yml",
        File.join("test/fixtures", ...this.classPathParts, `${this.fixtureFileName()}.yml`),
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

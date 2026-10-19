/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Rails::Generators::ResourceHelpers` (`test_unit/scaffold/scaffold_generator.rb:9`); the class/interface merge is how a mixin surfaces on the type side. */
import {
  include,
  type Included,
  pluralize,
  singularize,
  underscore,
} from "@blazetrails/activesupport";
import { GeneratorError } from "../../generated-attribute.js";
import { ModelHelpers, type ModelHelpersOptions } from "../../model-helpers.js";
import { format, File } from "@blazetrails/ruby-compat";
import { dasherize } from "../../base.js";
import { NamedBase, type NamedBaseOptions } from "../../named-base.js";
import { ResourceHelpers } from "../../resource-helpers.js";
import { TEMPLATES } from "./templates.js";

export interface ScaffoldGenerator
  extends Included<typeof ResourceHelpers>, Included<typeof ModelHelpers> {}

export class ScaffoldGenerator extends NamedBase {
  /** @internal */
  declare controllerName: string;
  /** @internal */
  declare controllerFileName: string;
  /** @internal */
  declare _controllerClassPath: string[];
  declare options: NamedBaseOptions & ModelHelpersOptions & { api?: boolean; modelName?: string };
  /** @internal */

  /** @inlinedFrom Rails::Generators::ResourceHelpers#initialize rails/v8.0.2/railties/lib/rails/generators/resource_helpers.rb:17-26 */
  constructor(options: NamedBaseOptions) {
    super(options);
    const controllerName = this.name;
    if (this.options.modelName != null) {
      this.name = this.options.modelName;
      this.assignNamesBang(this.name);
    }

    this.assignControllerNamesBang(pluralize(controllerName));

    if (this.isPluralModelName(this.name) && !this.options.forcePlural) {
      const singular = singularize(this.name);
      if (!ModelHelpers.skipWarn) {
        this.say(format(ModelHelpers.PLURAL_MODEL_NAME_WARN_MESSAGE, this.name, singular));
      }
      this.name = (this.options as { name?: string }).name = singular;
      this.assignNamesBang(this.name);
    }
    if (this.isInflectionImpossible(this.name)) {
      const option1 = underscore(singularize(this.name));
      const option2 = singularize(underscore(pluralize(this.name)));
      throw new GeneratorError(
        format(ModelHelpers.INFLECTION_IMPOSSIBLE_ERROR_MESSAGE, this.name, option1, option2),
      );
    }
    if (this.isIrregularModelName(this.name) && !ModelHelpers.skipWarn) {
      this.say(format(ModelHelpers.IRREGULAR_MODEL_NAME_WARN_MESSAGE, pluralize(this.name)));
    }
    ModelHelpers.skipWarn = true;
  }

  _fixtureName?: string;

  static {
    this.checkClassCollision({ suffix: "ControllerTest" });
    this.classOption("api", { type: "boolean", desc: "Generate API functional tests" });
    this.classOption("systemTests", { type: "string", desc: "Skip system test files" });
    this.commands().push("createTestFiles");
  }

  createTestFiles(): void {
    const templateFile = this.options.api ? "api_functional_test" : "functional_test";
    this.createFile(
      File.join(
        "test/controllers",
        ...this.controllerClassPath(),
        `${dasherize(this.controllerFileName)}-controller.test${this.ext()}`,
      ),
      TEMPLATES[templateFile].call(this),
    );
  }

  fixtureName(): string {
    return (this._fixtureName ??= this.tableName());
  }

  /** @internal */
  attributesString(): string {
    const attributesHash = this.attributesHash();
    if (Object.keys(attributesHash).length === 0) {
      return "{}";
    } else {
      return `{ ${Object.entries(attributesHash)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")} }`;
    }
  }

  /** @internal */
  attributesHash(): Record<string, string> {
    if (this.attributesNames().length === 0) return {};

    const pairs: [string, string][] = [];
    for (const name of this.attributesNames()) {
      if (
        ["password", "password_confirmation"].includes(name) &&
        this.attributes.some((a) => a.passwordDigest())
      ) {
        pairs.push([name, '"secret"']);
      } else if (!this.isVirtual(name)) {
        pairs.push([name, `t["@${this.singularTableName()}"].${name}`]);
      }
    }
    return Object.fromEntries(pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }

  /** @internal */
  isVirtual(name: string): boolean {
    const attribute = this.attributes.find((attr) => attr.name === name);
    return attribute?.virtual() ?? false;
  }
}

Object.defineProperty(ScaffoldGenerator, "name", {
  value: "TestUnit::Generators::ScaffoldGenerator",
});
include(ScaffoldGenerator, ResourceHelpers);

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include ResourceHelpers` (`scaffold_controller_generator.rb:8`); the class/interface merge is how a mixin surfaces on the type side. */
import {
  include,
  type Included,
  pluralize,
  singularize,
  underscore,
} from "@blazetrails/activesupport";
import { GeneratorError } from "../../generated-attribute.js";
import { ModelHelpers } from "../../model-helpers.js";
import { File, format, partition } from "@blazetrails/ruby-compat";
import {
  dasherize,
  type GeneratorBase,
  type GeneratorConfig,
  type GeneratorOptions,
} from "../../base.js";
import { NamedBase } from "../../named-base.js";
import type { ModelHelpersOptions } from "../../model-helpers.js";
import { ResourceHelpers } from "../../resource-helpers.js";
import type { GeneratorClass } from "../../../generators.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export interface ScaffoldControllerGeneratorOptions extends GeneratorOptions, ModelHelpersOptions {
  api?: boolean;
  skipRoutes?: boolean;
  test?: boolean;
  helper?: boolean;
  modelName?: string;
  orm?: string | false;
}

export interface ScaffoldControllerGenerator
  extends Included<typeof ResourceHelpers>, Included<typeof ModelHelpers> {}

export class ScaffoldControllerGenerator extends NamedBase {
  /** @internal */
  declare controllerName: string;
  /** @internal */
  declare controllerFileName: string;
  /** @internal */
  declare _controllerClassPath: string[];
  declare options: ScaffoldControllerGeneratorOptions;

  /**
   * @inlinedFrom Rails::Generators::ModelHelpers#initialize rails/v8.0.2/railties/lib/rails/generators/model_helpers.rb:26-45
   * @inlinedFrom Rails::Generators::ResourceHelpers#initialize rails/v8.0.2/railties/lib/rails/generators/resource_helpers.rb:17-26
   */
  constructor(args: unknown[] = [], localOptions: unknown = {}, config: GeneratorConfig = {}) {
    super(args, localOptions, config);
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
      this.name = args[0] = singular;
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

  async createControllerFiles(): Promise<void> {
    const templateFile = this.options.api ? "api_controller.ts" : "controller.ts";
    await this.template(
      templateFile,
      File.join(
        "app/controllers",
        ...this.controllerClassPath().map((p) => dasherize(p)),
        `${dasherize(this.controllerFileName)}-controller${this.ext()}`,
      ),
    );
  }

  /** @internal */
  private permittedParams(): string {
    const [attachments, others] = partition(this.attributesNames(), (name) =>
      this.isAttachments(name),
    );
    const params = others.map((name) => `"${name}"`);
    params.push(...attachments.map((name) => `{ ${name}: [] }`));
    return params.join(", ");
  }

  /** @internal */
  private isAttachments(name: string): boolean | undefined {
    const attribute = this.attributes.find((attr) => attr.name === name);
    return attribute?.attachments();
  }
}

Object.defineProperty(ScaffoldControllerGenerator, "name", {
  value: "Rails::Generators::ScaffoldControllerGenerator",
});
void ScaffoldControllerGenerator.sourceRoot(File.expandPath("templates", __dir__));
include(ScaffoldControllerGenerator, ResourceHelpers);
ScaffoldControllerGenerator.checkClassCollision({ suffix: "Controller" });
ScaffoldControllerGenerator.classOption("helper", { type: "boolean" });
ScaffoldControllerGenerator.classOption("orm", {
  banner: "NAME",
  type: "string",
  required: true,
  desc: "ORM to generate the controller for",
});
ScaffoldControllerGenerator.classOption("api", {
  type: "boolean",
  desc: "Generate API controller",
});
ScaffoldControllerGenerator.classOption("skipRoutes", {
  type: "boolean",
  desc: "Don't add routes to config/routes.rb.",
});
ScaffoldControllerGenerator.argument("attributes", {
  type: "array",
  default: [],
  banner: "field:type field:type",
});
ScaffoldControllerGenerator.methodAdded("createControllerFiles");
ScaffoldControllerGenerator.hookFor(
  "templateEngine",
  { as: "scaffold" },
  function (this: GeneratorBase, templateEngine: GeneratorClass) {
    if (!(this.options as ScaffoldControllerGeneratorOptions).api)
      return this.invoke(templateEngine);
  },
);
ScaffoldControllerGenerator.hookFor(
  "resourceRoute",
  { required: true },
  function (this: GeneratorBase, route: GeneratorClass) {
    if (!(this.options as ScaffoldControllerGeneratorOptions).skipRoutes) return this.invoke(route);
  },
);
ScaffoldControllerGenerator.hookFor("testFramework", { as: "scaffold" });
ScaffoldControllerGenerator.hookFor(
  "helper",
  { as: "scaffold" },
  function (this: GeneratorBase, invoked: GeneratorClass) {
    return this.invoke(invoked, [(this as ScaffoldControllerGenerator).controllerName]);
  },
);

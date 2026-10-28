import type { GeneratorConfig, GeneratorOptions } from "../../base.js";
/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include ModelHelpers` (`model_generator.rb:8`); the class/interface merge is how a mixin surfaces on the type side. */
import {
  include,
  type Included,
  pluralize,
  singularize,
  underscore,
} from "@blazetrails/activesupport";
import { format } from "@blazetrails/ruby-compat";
import { GeneratorError } from "../../generated-attribute.js";
import { NamedBase } from "../../named-base.js";
import { ModelHelpers, type ModelHelpersOptions } from "../../model-helpers.js";

export interface ModelGeneratorOptions extends GeneratorOptions, ModelHelpersOptions {}

export interface ModelGenerator extends Included<typeof ModelHelpers> {}

export class ModelGenerator extends NamedBase {
  declare options: ModelGeneratorOptions;

  /** @inlinedFrom Rails::Generators::ModelHelpers#initialize rails/v8.0.2/railties/lib/rails/generators/model_helpers.rb:26-45 */
  constructor(args: unknown[] = [], localOptions: unknown = {}, config: GeneratorConfig = {}) {
    super(args, localOptions, config);
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
}

Object.defineProperty(ModelGenerator, "name", { value: "Rails::Generators::ModelGenerator" });
include(ModelGenerator, ModelHelpers);
ModelGenerator.argument("attributes", {
  type: "array",
  default: [],
  banner: "field[:type][:index] field[:type][:index]",
});
ModelGenerator.hookFor("orm", { required: true, desc: "ORM to be invoked" });

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
import { NamedBase, type NamedBaseOptions } from "../../named-base.js";
import { ModelHelpers, type ModelHelpersOptions } from "../../model-helpers.js";

export interface ModelGeneratorOptions extends NamedBaseOptions, ModelHelpersOptions {}

export interface ModelGenerator extends Included<typeof ModelHelpers> {}

export class ModelGenerator extends NamedBase {
  declare options: ModelGeneratorOptions;

  /** @inlinedFrom Rails::Generators::ModelHelpers#initialize rails/v8.0.2/railties/lib/rails/generators/model_helpers.rb:26-45 */
  constructor(options: ModelGeneratorOptions) {
    super(options);
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
}

Object.defineProperty(ModelGenerator, "name", { value: "Rails::Generators::ModelGenerator" });
include(ModelGenerator, ModelHelpers);
ModelGenerator.hookFor("orm", { required: true, desc: "ORM to be invoked" });

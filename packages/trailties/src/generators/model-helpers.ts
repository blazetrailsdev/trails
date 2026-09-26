import {
  included,
  initialize,
  pluralize,
  singularize,
  underscore,
} from "@blazetrails/activesupport";
import { format } from "@blazetrails/ruby-compat";
import type { GeneratorBase } from "./base.js";
import { GeneratorError } from "./generated-attribute.js";
import type { NamedBase } from "./named-base.js";

// prettier-ignore
const PLURAL_MODEL_NAME_WARN_MESSAGE = "[WARNING] The model name '%s' was recognized as a plural, using the singular '%s' instead. Override with --force-plural or setup custom inflection rules for this noun before running the generator.";
// prettier-ignore
const IRREGULAR_MODEL_NAME_WARN_MESSAGE = "[WARNING] Rails cannot recover singular form from its plural form '%s'.\nPlease setup custom inflection rules for this noun before running the generator in config/initializers/inflections.rb.\n";
// prettier-ignore
const INFLECTION_IMPOSSIBLE_ERROR_MESSAGE = "Rails cannot recover the underscored form from its camelcase form '%s'.\nPlease use an underscored name instead, either '%s' or '%s'.\nOr setup custom inflection rules for this noun before running the generator in config/initializers/inflections.rb.\n";

export interface ModelHelpersOptions {
  forcePlural?: boolean;
}

interface ModelHelpersHost extends NamedBase {
  options: NamedBase["options"] & ModelHelpersOptions;
  isPluralModelName(name: string): boolean;
  isIrregularModelName(name: string): boolean;
  isInflectionImpossible(name: string): boolean;
}

/** @internal */
function isPluralModelName(this: ModelHelpersHost, name: string): boolean {
  return name === pluralize(name) && singularize(name) !== pluralize(name);
}

/** @internal */
function isIrregularModelName(this: ModelHelpersHost, name: string): boolean {
  return singularize(name) !== singularize(pluralize(name));
}

/** @internal */
function isInflectionImpossible(this: ModelHelpersHost, name: string): boolean {
  return (
    name !== underscore(name) &&
    underscore(singularize(name)) !== singularize(underscore(pluralize(name)))
  );
}

export const ModelHelpers = {
  PLURAL_MODEL_NAME_WARN_MESSAGE,
  IRREGULAR_MODEL_NAME_WARN_MESSAGE,
  INFLECTION_IMPOSSIBLE_ERROR_MESSAGE,
  skipWarn: false,

  isPluralModelName,
  isIrregularModelName,
  isInflectionImpossible,

  [included](base: unknown): void {
    (base as typeof GeneratorBase).classOption("forcePlural", {
      type: "boolean",
      default: false,
      desc: "Do not singularize the model name, even if it appears plural",
    });
  },

  [initialize](this: ModelHelpersHost): void {
    if (this.isPluralModelName(this.name) && !this.options.forcePlural) {
      const singular = singularize(this.name);
      if (!ModelHelpers.skipWarn) {
        this.say(format(PLURAL_MODEL_NAME_WARN_MESSAGE, this.name, singular));
      }
      this.name = singular;
      this.assignNamesBang(this.name);
    }
    if (this.isInflectionImpossible(this.name)) {
      const option1 = underscore(singularize(this.name));
      const option2 = singularize(underscore(pluralize(this.name)));
      throw new GeneratorError(
        format(INFLECTION_IMPOSSIBLE_ERROR_MESSAGE, this.name, option1, option2),
      );
    }
    if (this.isIrregularModelName(this.name) && !ModelHelpers.skipWarn) {
      this.say(format(IRREGULAR_MODEL_NAME_WARN_MESSAGE, pluralize(this.name)));
    }
    ModelHelpers.skipWarn = true;
  },
};

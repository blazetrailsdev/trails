import { pluralize, singularize, underscore } from "@blazetrails/activesupport";
import { GeneratorError } from "./generated-attribute.js";

// Mirrors railties/lib/rails/generators/model_helpers.rb. Trailties
// generators call normalizeModelName() from their constructor.
// prettier-ignore
export const PLURAL_MODEL_NAME_WARN_MESSAGE = "[WARNING] The model name '%s' was recognized as a plural, using the singular '%s' instead. Override with --force-plural or setup custom inflection rules for this noun before running the generator.";
// prettier-ignore
export const IRREGULAR_MODEL_NAME_WARN_MESSAGE = "[WARNING] Rails cannot recover singular form from its plural form '%s'.\nPlease setup custom inflection rules for this noun before running the generator in config/initializers/inflections.rb.\n";
// prettier-ignore
export const INFLECTION_IMPOSSIBLE_ERROR_MESSAGE = "Rails cannot recover the underscored form from its camelcase form '%s'.\nPlease use an underscored name instead, either '%s' or '%s'.\nOr setup custom inflection rules for this noun before running the generator in config/initializers/inflections.rb.\n";

export class ModelHelpers {
  static skipWarn = false;
}
export interface ModelHelpersOptions {
  forcePlural?: boolean;
}
export type SayFn = (message: string) => void;

export function normalizeModelName(
  name: string,
  options: ModelHelpersOptions = {},
  say: SayFn = () => {},
): string {
  let cur = name;
  if (isPlural(cur) && !options.forcePlural) {
    const s = singularize(cur);
    if (!ModelHelpers.skipWarn) say(fmt(PLURAL_MODEL_NAME_WARN_MESSAGE, cur, s));
    cur = s;
  }
  if (isInflectionImpossible(cur)) {
    const o1 = underscore(singularize(cur));
    const o2 = singularize(underscore(pluralize(cur)));
    throw new GeneratorError(fmt(INFLECTION_IMPOSSIBLE_ERROR_MESSAGE, cur, o1, o2));
  }
  if (isIrregular(cur) && !ModelHelpers.skipWarn) {
    say(fmt(IRREGULAR_MODEL_NAME_WARN_MESSAGE, pluralize(cur)));
  }
  ModelHelpers.skipWarn = true;
  return cur;
}

const isPlural = (n: string): boolean => n === pluralize(n) && singularize(n) !== pluralize(n);
const isIrregular = (n: string): boolean => singularize(n) !== singularize(pluralize(n));
const isInflectionImpossible = (n: string): boolean =>
  n !== underscore(n) && underscore(singularize(n)) !== singularize(underscore(pluralize(n)));
const fmt = (t: string, ...a: string[]): string => {
  let i = 0;
  return t.replace(/%s/g, () => a[i++] ?? "");
};

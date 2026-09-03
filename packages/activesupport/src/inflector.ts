import { inflections } from "./inflector/inflections.js";
import { NameError } from "./core-ext/name-error.js";
import { regexpEscape } from "@blazetrails/ruby-compat";
import { I18n } from "./i18n.js";

/** @internal */
function applyInflections(
  word: string,
  rules: { rule: RegExp; replacement: string }[],
  locale = "en",
): string {
  let result = word;

  if (word.length === 0 || inflections(locale).uncountables.isUncountable(result)) {
    return result;
  } else {
    for (const { rule, replacement } of rules) {
      if (rule.test(result)) {
        result = result.replace(rule, replacement);
        break;
      }
    }
    return result;
  }
}

export function pluralize(word: string, locale?: string): string;
export function pluralize(word: string, count: number | null, locale?: string): string;
export function pluralize(word: string, count?: number | string | null, locale = "en"): string {
  if (typeof count === "string") locale = count;
  if (count === 1) {
    return word;
  } else {
    return applyInflections(word, inflections(locale).plurals, locale);
  }
}

export function singularize(word: string, locale = "en"): string {
  return applyInflections(word, inflections(locale).singulars, locale);
}

export function camelize(
  term: string,
  uppercaseFirstLetter: boolean | "upper" | "lower" = true,
): string {
  if (uppercaseFirstLetter === "upper") uppercaseFirstLetter = true;
  else if (uppercaseFirstLetter === "lower") uppercaseFirstLetter = false;
  else if (typeof uppercaseFirstLetter === "string") {
    throw new Error("Invalid option, use either :upper or :lower.");
  }
  let result = term;

  if (uppercaseFirstLetter) {
    result = result.replace(/^[a-z\d]*/, (match) => {
      const acronym = inflections().acronyms.get(match);
      if (acronym) return acronym;
      return match.charAt(0).toUpperCase() + match.slice(1);
    });
  } else {
    result = result.replace(inflections().acronymsCamelizeRegex, (match) => match.toLowerCase());
  }

  result = result.replace(/(?:_|(\/))([a-z\d]*)/gi, (_match, slash, rest) => {
    const acronym = inflections().acronyms.get(rest);
    const replacement = acronym || rest.charAt(0).toUpperCase() + rest.slice(1);
    return (slash || "") + replacement;
  });

  result = result.replace(/\//g, "::");

  return result;
}

export function underscore(camelCasedWord: string): string {
  if (!/[A-Z-]|::/.test(camelCasedWord)) return camelCasedWord;

  let word = camelCasedWord;

  word = word.replace(/::/g, "/");

  if (inflections().acronyms.size > 0) {
    word = word.replace(inflections().acronymsUnderscoreRegex, (_match, pre, acronym) => {
      return (pre ? "_" : "") + acronym.toLowerCase();
    });
  }

  word = word.replace(/(?<=[A-Z])(?=[A-Z][a-z])|(?<=[a-z\d])(?=[A-Z])/g, "_");
  word = word.replace(/-/g, "_");
  word = word.toLowerCase();

  return word;
}

export function humanize(
  lowerCaseAndUnderscoredWord: string,
  options: { capitalize?: boolean; keepIdSuffix?: boolean } = {},
): string {
  const { capitalize: cap = true, keepIdSuffix = false } = options;
  let result = lowerCaseAndUnderscoredWord;

  for (const { rule, replacement } of inflections().humans) {
    if (typeof rule === "string") {
      if (result === rule) {
        result = replacement;
        break;
      }
    } else {
      if (rule.test(result)) {
        result = result.replace(rule, replacement);
        break;
      }
    }
  }

  if (!keepIdSuffix) {
    result = result.replace(/_id$/, "");
  }
  result = result.replace(/_/g, " ");

  result = result.replace(/([a-z\d]*)/gi, (match) => {
    const acronym = inflections().acronyms.get(match.toLowerCase());
    return acronym || match.toLowerCase();
  });

  if (cap) {
    result = result.replace(/^./u, (m) => m.toUpperCase());
  }

  return result;
}

export function upcaseFirst(string: string): string {
  return string.length > 0 ? string[0].toUpperCase().concat(string.slice(1)) : "";
}

export function downcaseFirst(string: string): string {
  return string.length > 0 ? string[0].toLowerCase().concat(string.slice(1)) : "";
}

export function titleize(word: string, options: { keepIdSuffix?: boolean } = {}): string {
  return humanize(underscore(word), { keepIdSuffix: options.keepIdSuffix }).replace(
    /\b(?<![''`])[a-z]/g,
    (match) => match.toUpperCase(),
  );
}

export const camelcase = camelize;

export const titlecase = titleize;

export function tableize(className: string): string {
  return pluralize(underscore(className));
}

export function classify(tableName: string): string {
  return camelize(singularize(String(tableName).replace(/.*\./, "")));
}

export function dasherize(underscoredWord: string): string {
  return underscoredWord.replace(/_/g, "-");
}

export function demodulize(path: string): string {
  const idx = path.lastIndexOf("::");
  if (idx >= 0) {
    return path.slice(idx + 2);
  }
  return path;
}

export function deconstantize(path: string): string {
  const idx = path.lastIndexOf("::");
  if (idx >= 0) {
    return path.slice(0, idx);
  }
  return "";
}

const _constants = new Map<string, unknown>();
const _privateConstants = new Set<string>();

/** @noRailsEquivalent PERMANENT */
export function registerConstant(name: string, value: unknown): void {
  _constants.set(name, value);
}

/** @noRailsEquivalent PERMANENT */
export function unregisterConstant(name: string, expected: unknown): void {
  if (_constants.get(name) !== expected) return;
  _constants.delete(name);
  _privateConstants.delete(name);
}

/** @noRailsEquivalent PERMANENT */
export function privateConstant(name: string): void {
  _privateConstants.add(name);
}

/** @noRailsEquivalent PERMANENT */
export function registeredConstantName(value: unknown): string | undefined {
  for (const [name, registered] of _constants) {
    if (registered === value) return name;
  }
  return undefined;
}

/** @internal */
export function _resetConstants(): void {
  _constants.clear();
  _privateConstants.clear();
}

/** @internal */
function missingSegment(path: string): string {
  const segments = path.split("::");
  for (let i = 1; i <= segments.length; i++) {
    if (!_constants.has(segments.slice(0, i).join("::"))) return segments[i - 1];
  }
  return segments[segments.length - 1];
}

function isValidConstantPath(path: string): boolean {
  if (path.length === 0) return false;
  return path.split("::").every((segment) => /^[A-Z]\w*$/.test(segment));
}

export function constantize(camelCasedWord: string): unknown {
  const path = camelCasedWord.startsWith("::") ? camelCasedWord.slice(2) : camelCasedWord;
  if (!isValidConstantPath(path)) {
    throw new NameError(`wrong constant name ${camelCasedWord}`);
  }
  if (_privateConstants.has(path)) {
    throw new NameError(`private constant ${path} referenced`, demodulize(path));
  }
  if (!_constants.has(path)) {
    throw new NameError(`uninitialized constant ${path}`, missingSegment(path));
  }
  return _constants.get(path);
}

/**
 * @missingRailsCall const_regexp — PERMANENT
 * @missingRailsCall match? — PERMANENT
 */
export function safeConstantize(camelCasedWord: string): unknown {
  try {
    return constantize(camelCasedWord);
  } catch (e) {
    if (!(e instanceof NameError)) throw e;
    const name = e.constantName;
    if (name && !(camelCasedWord.split("::").includes(name) || name === camelCasedWord)) {
      throw e;
    }
    return undefined;
  }
}

export function foreignKey(
  className: string,
  separateClassNameAndIdWithUnderscore: boolean = true,
): string {
  return underscore(demodulize(className)) + (separateClassNameAndIdWithUnderscore ? "_id" : "id");
}

export function constRegexp(camelCasedWord: string): string {
  const parts = camelCasedWord.split("::");
  while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();

  if (parts.length === 0) return regexpEscape(camelCasedWord);

  const last = parts.pop()!;

  return parts.reverse().reduce((acc, part) => (part === "" ? acc : `${part}(::${acc})?`), last);
}

export function ordinal(number: number): string {
  return String(I18n.translate("number.nth.ordinals", { number }));
}

export function ordinalize(number: number): string {
  return String(I18n.translate("number.nth.ordinalized", { number }));
}

export { parameterize } from "./transliterate.js";

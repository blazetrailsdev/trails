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
  let string = String(term);
  if (
    uppercaseFirstLetter == null ||
    uppercaseFirstLetter === false ||
    uppercaseFirstLetter === "lower"
  ) {
    string = string.replace(inflections().acronymsCamelizeRegex, (match) => match.toLowerCase());
  } else if (/^[a-z\d]*$/.test(string)) {
    return (
      inflections().acronyms.get(string) ??
      string.charAt(0).toUpperCase() + string.slice(1).toLowerCase()
    );
  } else {
    string = string.replace(
      /^[a-z\d]*/,
      (match) =>
        inflections().acronyms.get(match) ??
        match.charAt(0).toUpperCase() + match.slice(1).toLowerCase(),
    );
  }
  string = string.replace(/(?:_|(\/))([a-z\d]*)/gi, (_match, slash, word) => {
    const substituted =
      inflections().acronyms.get(word) ??
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    return slash ? `::${substituted}` : substituted;
  });
  return string;
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
  let result = String(lowerCaseAndUnderscoredWord ?? "");

  for (const { rule, replacement } of inflections().humans) {
    if (typeof rule === "string") {
      if (result.includes(rule)) {
        result = result.replace(rule, replacement);
        break;
      }
    } else {
      if (rule.test(result)) {
        result = result.replace(rule, replacement);
        break;
      }
    }
  }

  result = result.replaceAll("_", " ");
  result = result.replace(/^\s+/, "");
  if (!keepIdSuffix && lowerCaseAndUnderscoredWord?.endsWith("_id")) {
    if (result.endsWith(" id")) result = result.slice(0, -" id".length);
  }

  result = result.replace(/([a-z\d]+)/gi, (match) => {
    match = match.toLowerCase();
    return inflections().acronyms.get(match) ?? match;
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
    /\b(?<!\w['’`()])[a-z]/g,
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

/** @noRailsEquivalent PERMANENT */
export function registerConstant(name: string, value: unknown): void {
  _constants.set(name, value);
}

/** @noRailsEquivalent PERMANENT */
export function unregisterConstant(name: string, expected: unknown): void {
  if (_constants.get(name) !== expected) return;
  _constants.delete(name);
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
  if (_constants.has(path)) return _constants.get(path);
  const segments = path.split("::");
  let receiver: unknown = Object;
  for (let i = 1; i <= segments.length; i++) {
    const key = segments.slice(0, i).join("::");
    const value = _constants.has(key)
      ? _constants.get(key)
      : i > 1 &&
          receiver != null &&
          (typeof receiver === "object" || typeof receiver === "function")
        ? (receiver as Record<string, unknown>)[segments[i - 1]]
        : undefined;
    if (value === undefined) {
      throw new NameError(`uninitialized constant ${path}`, segments[i - 1], { receiver });
    }
    receiver = value;
  }
  return receiver;
}

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

/**
 * Inflector — transforms words between singular/plural, camelCase/underscore, etc.
 * Mirrors ActiveSupport::Inflector from Rails.
 */

import { Inflections } from "./inflector/inflections.js";

function applyInflections(word: string, rules: { rule: RegExp; replacement: string }[]): string {
  if (!word || word.length === 0) return word;

  const inflections = Inflections.instance("en");
  if (inflections.uncountables.has(word.toLowerCase())) {
    return word;
  }

  for (const { rule, replacement } of rules) {
    if (rule.test(word)) {
      return word.replace(rule, replacement);
    }
  }

  return word;
}

export function pluralize(word: string, count?: number): string {
  if (count === 1) return word;
  return applyInflections(word, Inflections.instance("en").plurals);
}

export function singularize(word: string): string {
  return applyInflections(word, Inflections.instance("en").singulars);
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
  const inflections = Inflections.instance("en");
  let result = term;

  if (uppercaseFirstLetter) {
    result = result.replace(/^[a-z\d]*/, (match) => {
      // Check if the match is an acronym
      const acronym = inflections.acronyms.get(match);
      if (acronym) return acronym;
      return match.charAt(0).toUpperCase() + match.slice(1);
    });
  } else {
    result = result.replace(inflections.acronymsCamelizeRegex, (match) => match.toLowerCase());
  }

  result = result.replace(/(?:_|(\/))([a-z\d]*)/gi, (_match, slash, rest) => {
    const acronym = inflections.acronyms.get(rest);
    const replacement = acronym || rest.charAt(0).toUpperCase() + rest.slice(1);
    return (slash || "") + replacement;
  });

  result = result.replace(/\//g, "::");

  return result;
}

export function underscore(camelCasedWord: string): string {
  if (!/[A-Z-]|::/.test(camelCasedWord)) return camelCasedWord;

  const inflections = Inflections.instance("en");
  let word = camelCasedWord;

  word = word.replace(/::/g, "/");

  if (inflections.acronyms.size > 0) {
    word = word.replace(inflections.acronymsUnderscoreRegex, (_match, pre, acronym) => {
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
  const inflections = Inflections.instance("en");
  let result = lowerCaseAndUnderscoredWord;

  for (const { rule, replacement } of inflections.humans) {
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
  // Replace underscores with spaces
  result = result.replace(/_/g, " ");

  // Handle acronyms
  result = result.replace(/([a-z\d]*)/gi, (match) => {
    const acronym = inflections.acronyms.get(match.toLowerCase());
    return acronym || match.toLowerCase();
  });

  if (cap) {
    result = result.replace(/^./u, (m) => m.toUpperCase());
  }

  return result;
}

export function titleize(word: string, options: { keepIdSuffix?: boolean } = {}): string {
  return humanize(underscore(word), { keepIdSuffix: options.keepIdSuffix }).replace(
    /\b(?<![''`])[a-z]/g,
    (match) => match.toUpperCase(),
  );
}

export function tableize(className: string): string {
  return pluralize(underscore(className));
}

export function classify(tableName: string): string {
  // Strip leading schema name: "schema.table" -> "table"
  const stripped = tableName.replace(/.*\./, "");
  return camelize(singularize(stripped));
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

export function foreignKey(className: string, separateWithUnderscore: boolean = true): string {
  return underscore(demodulize(className)) + (separateWithUnderscore ? "_id" : "id");
}

export function parameterize(
  str: string,
  options: { separator?: string; preserveCase?: boolean } = {},
): string {
  const { separator = "-", preserveCase = false } = options;

  // Transliterate (basic - strip non-ASCII)
  // eslint-disable-next-line no-control-regex
  let result = str.replace(/[^\x00-\x7F]/g, "");

  if (separator === "") {
    const words = result.split(/[^a-z0-9]+/gi).filter((w) => w.length > 0);
    if (words.length === 0) return "";
    result = words.join("");
    if (!preserveCase) result = result.toLowerCase();
    return result;
  }

  // Replace non-alphanumeric, non-dash, non-underscore with separator
  result = result.replace(/[^a-z0-9\-_]+/gi, separator);

  if (separator.length > 0) {
    const escaped = separator.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    // Remove leading/trailing separators and collapse duplicates
    result = result.replace(new RegExp(`${escaped}{2,}`, "g"), separator);
    result = result.replace(new RegExp(`^${escaped}|${escaped}$`, "g"), "");
  }

  if (!preserveCase) {
    result = result.toLowerCase();
  }

  return result;
}

export function ordinal(number: number): string {
  const abs = Math.abs(number);
  const mod100 = abs % 100;

  if (mod100 === 11 || mod100 === 12 || mod100 === 13) {
    return "th";
  }

  switch (abs % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

export function ordinalize(number: number): string {
  return `${number}${ordinal(number)}`;
}

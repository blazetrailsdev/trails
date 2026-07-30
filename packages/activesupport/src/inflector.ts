/**
 * Inflector — transforms words between singular/plural, camelCase/underscore, etc.
 * Mirrors ActiveSupport::Inflector from Rails.
 */

import { Inflections } from "./inflector/inflections.js";
import { NameError } from "./core-ext/name-error.js";

/** @internal */
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

const _constants = new Map<string, unknown>();
const _privateConstants = new Set<string>();

/**
 * @noRailsEquivalent PERMANENT
 *   (`vendor/rails/activesupport/lib/active_support/inflector/methods.rb:289` — `constantize` walks
 *   Ruby's constant namespace; ESM has neither a constant namespace nor an autoload hook, so
 *   application code must register what exists).
 * The registration half of Ruby's constant table. `class Foo`
 * writes Ruby's global constant namespace as a side effect of definition; ESM
 * classes are module-local bindings with no such namespace, so a JS host names
 * its classes explicitly. Only registration is invented — lookup goes through
 * {@link constantize}, which Rails has.
 */
export function registerConstant(name: string, value: unknown): void {
  _constants.set(name, value);
}

/**
 * @noRailsEquivalent PERMANENT
 *   (`vendor/rails/activesupport/lib/active_support/inflector/methods.rb:289` — the registry stands
 *   in for Ruby's constant namespace, which `remove_const` unwinds; ESM has no constant namespace).
 * The removal half of the invented constant table (see
 * {@link registerConstant}). Ruby constants are removed with
 * `Object.send(:remove_const, …)`, which has no ESM analogue; trails needs it so
 * a registry teardown cannot leave a name resolvable through
 * {@link constantize}. The removal is conditional on `expected`: the name is
 * dropped only when it currently resolves to that value, so a caller tearing
 * down its own binding cannot clobber a later rebinding by someone else.
 * Dropping the entry also drops its visibility, the way `remove_const` takes the
 * private mark with the constant — otherwise the name would keep raising
 * `private constant` where Ruby raises `uninitialized constant`.
 */
export function unregisterConstant(name: string, expected: unknown): void {
  if (_constants.get(name) !== expected) return;
  _constants.delete(name);
  _privateConstants.delete(name);
}

/**
 * @noRailsEquivalent PERMANENT
 *   (`vendor/rails/activesupport/lib/active_support/inflector/methods.rb:289` — `constantize`
 *   honours Ruby's `private_constant` visibility; ESM has no constant visibility to consult).
 * The visibility half of Ruby's constant table, mirroring
 * `Module#private_constant` (a language feature Rails calls, not one it
 * defines). Ruby's constant table carries per-constant visibility;
 * trails' invented table (see {@link registerConstant}) is flat, so the private
 * set lives alongside it and is global rather than per-owner: Ruby's visibility
 * is a property of the constant within its owning module, so `Country` still
 * resolves `HABTM_Treaties` lexically while `Object.const_get` raises. Here the
 * name is unresolvable from everywhere — wider than Ruby, and sufficient for
 * the only consumer (the habtm join key), which nothing resolves lexically.
 * The mark is also independent of registration order, so a caller can declare a
 * name private before whatever writes it does so.
 */
export function privateConstant(name: string): void {
  _privateConstants.add(name);
}

/** @internal — test use only: clear the registered constant table. */
export function _resetConstants(): void {
  _constants.clear();
  _privateConstants.clear();
}

/**
 * The segment `Object.const_get` would fail on: it resolves `A::B::C` one step
 * at a time, so the NameError names the first link that is missing, not the
 * whole path. Our table is keyed by full path, so walking prefixes is the
 * equivalent probe.
 *
 * This is exact only for paths whose enclosing modules are themselves
 * registered. Ruby walks real modules, so `A::B` with `A` a live module names
 * `:B`; here, if nothing registered `A`, the walk stops at `A` and names that
 * instead. Registering the enclosing names (as a namespaced model registration
 * does) makes the two agree.
 * @internal
 */
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

/** Mirrors: Inflector.constantize — `Object.const_get(camel_cased_word)`. */
export function constantize(camelCasedWord: string): unknown {
  const path = camelCasedWord.startsWith("::") ? camelCasedWord.slice(2) : camelCasedWord;
  if (!isValidConstantPath(path)) {
    throw new NameError(`wrong constant name ${camelCasedWord}`);
  }
  // Privacy is checked before existence, which Ruby cannot reach: there
  // `private_constant` on an undefined name is itself a NameError, so a name is
  // never private-and-absent. trails allows it because marking and binding are
  // two calls made by independent writers, and the mark must hold whichever runs
  // first.
  if (_privateConstants.has(path)) {
    // Ruby raises NameError here too, with `name` set to the constant itself —
    // which is why `safe_constantize` returns nil for a private constant rather
    // than propagating. Carrying the leaf keeps that guard satisfied.
    throw new NameError(`private constant ${path} referenced`, demodulize(path));
  }
  if (!_constants.has(path)) {
    throw new NameError(`uninitialized constant ${path}`, missingSegment(path));
  }
  return _constants.get(path);
}

/** Mirrors: Inflector.safe_constantize. */
export function safeConstantize(camelCasedWord: string): unknown {
  try {
    return constantize(camelCasedWord);
  } catch (e) {
    if (!(e instanceof NameError)) throw e;
    // Ruby: `raise if e.name && !(camel_cased_word.split("::").include?(e.name) ||
    // e.name == camel_cased_word)` — swallow only a miss on this path's own
    // segments, never one bubbling out of an unrelated constant.
    const name = e.constantName;
    if (name && !(camelCasedWord.split("::").includes(name) || name === camelCasedWord)) {
      throw e;
    }
    return undefined;
  }
}

export function foreignKey(className: string, separateWithUnderscore: boolean = true): string {
  return underscore(demodulize(className)) + (separateWithUnderscore ? "_id" : "id");
}

export function parameterize(
  str: string,
  options: { separator?: string; preserveCase?: boolean } = {},
): string {
  const { separator = "-", preserveCase = false } = options;

  // Mirrors Rails' transliterate: NFD-decompose to strip combining diacritical
  // marks (U+0300–U+036F), then drop any remaining non-ASCII characters.
  // This converts café→cafe, Müller→muller, matching Rails' default behavior.
  let result = str
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x00-\x7F]/g, "");

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

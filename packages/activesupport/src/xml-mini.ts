import { camelize } from "./inflector.js";

export interface RenameKeyOptions {
  /** Convert `snake_case` keys to `dashed-keys`. Defaults to `true`. */
  dasherize?: boolean;
  /** Camelize the key first: `true`/`"upper"` for UpperCamel, `"lower"` for lowerCamel. */
  camelize?: boolean | "lower" | "upper";
}

/**
 * Dasherize an `underscore_key`, preserving any leading/trailing underscores.
 *
 * Mirrors: ActiveSupport::XmlMini._dasherize — the `$2` (interior) capture is
 * non-greedy so surrounding runs of underscores are left untouched and only the
 * interior `_`/space characters become `-`.
 */
function underscoreToDash(key: string): string {
  const match = /^(_*)([\s\S]*?)(_*)$/.exec(key.trim());
  if (!match) return key;
  const [, left, middle, right] = match;
  return `${left}${middle.replace(/[_ ]/g, "-")}${right}`;
}

/**
 * Apply the `camelize`/`dasherize` key transforms to a single XML tag name.
 *
 * Mirrors: ActiveSupport::XmlMini.rename_key — camelize (when requested) runs
 * first, then dasherize (default `true`) runs on the result. Both transforms
 * compose exactly as in Rails, so `camelize: true` still passes through
 * `_dasherize` (a no-op on an already-camelized, underscore-free key).
 */
export function renameKey(key: string, options: RenameKeyOptions = {}): string {
  const { camelize: camelizeOpt } = options;
  const dasherize = options.dasherize === undefined || options.dasherize;
  let result = key;
  if (camelizeOpt) {
    result = camelizeOpt === true ? camelize(result) : camelize(result, camelizeOpt);
  }
  if (dasherize) {
    result = underscoreToDash(result);
  }
  return result;
}

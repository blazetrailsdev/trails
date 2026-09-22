import { strDelete } from "./tr.js";

/**
 * Returns a copy of `str` with every character in the intersection of the
 * given selectors removed. Each selector is a character SET, not a substring:
 * `c1-c2` denotes a range, a leading `^` negates, and a backslash escapes the
 * next character. Multiple selectors intersect. At least one selector is
 * required, as MRI's `rb_check_arity(argc, 1, UNLIMITED_ARGUMENTS)`
 * (`vendor/ruby/string.c:8341`) demands.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `String#delete`
 * (`vendor/ruby/string.c:8407` `rb_str_delete`), which Rails inherits rather
 * than defines.
 */
export function stringDelete(str: string, selector: string, ...selectors: string[]): string {
  return strDelete(str, [selector, ...selectors]);
}

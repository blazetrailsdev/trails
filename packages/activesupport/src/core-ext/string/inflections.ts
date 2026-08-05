import { pluralize as inflectorPluralize } from "../../inflector.js";

/**
 * Rails `String#pluralize(count = nil, locale = :en)`
 * (activesupport/lib/active_support/core_ext/string/inflections.rb:35-43). JS
 * has no open classes, so the receiver is the first argument; the count arm —
 * the one `Inflector.pluralize` does not have — is why the method exists next
 * to it. Ruby's `locale = count if count.is_a?(Symbol)` arm is the second
 * parameter's own default here, since a JS caller can pass an absent count.
 */
export function pluralize(str: string, count?: number, locale = "en"): string {
  if (count === 1) {
    return str;
  } else {
    return inflectorPluralize(str, locale);
  }
}

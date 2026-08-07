/**
 * Mirrors: i18n/lib/i18n/locale/tag.rb
 *
 * Ruby's `@@implementation` is class-level state on a module; the module-level
 * binding below is that store.
 */

import { Simple } from "./tag/simple.js";
import type { Parents } from "./tag/parents.js";

export { Simple } from "./tag/simple.js";
export { Rfc4646 } from "./tag/rfc4646.js";

let implementationStore: TagImplementation | undefined;

/**
 * The surface a tag implementation exposes: a factory, and the tag it makes.
 * `Rfc4646.tag` answers nil for a tag that is not valid RFC 4646
 * (rfc4646.rb:20), so the factory is nilable — `Simple.tag` (simple.rb:8-10)
 * never is.
 */
export interface TagImplementation {
  tag(...tag: string[]): Parents | null;
}

/**
 * Returns the current locale tag implementation. Defaults to
 * +I18n::Locale::Tag::Simple+.
 */
export function implementation(): TagImplementation {
  implementationStore ??= Simple;
  return implementationStore;
}

/**
 * Sets the current locale tag implementation. Use this to set a different
 * locale tag implementation.
 */
export function setImplementation(value: TagImplementation): void {
  implementationStore = value;
}

/**
 * Factory method for locale tags. Delegates to the current locale tag
 * implementation.
 */
export function tag(tag: string): Parents | null {
  return implementation().tag(tag);
}

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

/** The surface a tag implementation exposes: a factory, and the tag it makes. */
export interface TagImplementation {
  tag(...tag: string[]): Parents;
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
export function tag(tag: string): Parents {
  return implementation().tag(tag);
}

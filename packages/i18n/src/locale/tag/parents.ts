/**
 * Mirrors: i18n/lib/i18n/locale/tag/parents.rb
 *
 * Ruby `include Parents` (tag/simple.rb:13); the trails idiom for a mixed-in
 * module is a `this`-typed function assigned to the class, so the code stays in
 * the file that matches the gem's layout.
 *
 * The gem memoizes each of the three through `@parent ||=` / `@parents ||=`;
 * a `this`-typed function has no ivar to write, and the cache is not
 * observable — every tag is immutable, so a recomputed parent is `==` to the
 * memoized one.
 */

import type { Locale } from "../../i18n.js";

/** The tag surface `Parents` calls on its host — `I18n::Locale::Tag::Simple`. */
export interface Parents {
  toA(): string[];
  toSym(): Locale;
  parent(): Parents | null;
  parents(): Parents[];
  selfAndParents(): Parents[];
}

/** @internal Ruby's `self.class`, narrowed to the tag factory `parent` calls. */
interface TagClass {
  tag(...tag: string[]): Parents;
}

export function parent(this: Parents): Parents | null {
  const segs = this.toA().filter((seg) => seg != null);
  return segs.length > 1
    ? (this.constructor as unknown as TagClass).tag(segs.slice(0, segs.length - 1).join("-"))
    : null;
}

export function selfAndParents(this: Parents): Parents[] {
  return [this].concat(this.parents());
}

export function parents(this: Parents): Parents[] {
  const parent = this.parent();
  return parent ? [parent].concat(parent.parents()) : [];
}

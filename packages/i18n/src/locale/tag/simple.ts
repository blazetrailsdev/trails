/**
 * Mirrors: i18n/lib/i18n/locale/tag/simple.rb
 *
 * Simple Locale tag implementation that computes subtags by simply splitting
 * the locale tag at '-' occurrences.
 */

import type { Locale } from "../../i18n.js";
import { parent, parents, selfAndParents, type Parents } from "./parents.js";

export class Simple implements Parents {
  static tag(...tag: string[]): Simple {
    return new Simple(...tag);
  }

  /**
   * Ruby's `attr_reader :tag`. A Ruby Symbol is a JS string, so `to_sym` and
   * `to_s` below both hand back this same value.
   */
  readonly tag: Locale;

  constructor(...tag: string[]) {
    this.tag = tag.join("-");
  }

  /** Mirrors: `include Parents` (simple.rb:13). */
  parent = parent;
  parents = parents;
  selfAndParents = selfAndParents;

  subtags(): string[] {
    return this.tag.split("-");
  }

  toSym(): Locale {
    return this.tag;
  }

  toString(): string {
    return this.tag;
  }

  toA(): string[] {
    return this.subtags();
  }
}

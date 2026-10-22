import type { Locale } from "../../i18n.js";
import { parent, parents, selfAndParents } from "./parents.js";

export class Simple {
  static tag(...tag: string[]): Simple {
    return new Simple(...tag);
  }

  readonly tag: Locale;

  constructor(...tag: string[]) {
    this.tag = tag.join("-");
  }

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

import type { Locale } from "../../i18n.js";

export interface Parents {
  toA(): string[];
  toSym(): Locale;
  parent(): Parents | null;
  parents(): Parents[];
  selfAndParents(): Parents[];
}

/** @internal */
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

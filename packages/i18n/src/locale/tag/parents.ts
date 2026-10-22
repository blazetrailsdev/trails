import type { Rfc4646 } from "./rfc4646.js";
import type { Simple } from "./simple.js";

export type Parents = Simple | Rfc4646;

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

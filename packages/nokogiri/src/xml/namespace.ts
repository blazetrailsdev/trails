import { rbModConstSet } from "@blazetrails/ruby-compat";

import { XML } from "../namespaces.js";

export class Namespace {
  constructor(
    /**
     * @internal
     * @noRailsEquivalent PERMANENT
     */
    readonly _node: { readonly prefix: string | null; readonly href: string },
    readonly document: unknown = null,
  ) {}

  get prefix(): string | null {
    return this._node.prefix;
  }

  get href(): string {
    return this._node.href;
  }

  deconstructKeys(_keys: string[] | null): { prefix: string | null; href: string } {
    return { prefix: this.prefix, href: this.href };
  }
}

rbModConstSet(XML, "Namespace", Namespace);

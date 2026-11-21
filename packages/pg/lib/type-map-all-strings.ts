import { PG } from "./namespaces.js";

/** @noRailsEquivalent PERMANENT */
export class TypeMapAllStrings {
  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  _lookupOid(_format: number, _oid: number): null {
    return null;
  }
}

PG.TypeMapAllStrings = TypeMapAllStrings;

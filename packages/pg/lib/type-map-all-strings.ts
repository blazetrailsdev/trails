import { PG } from "./namespaces.js";
import { TypeMap } from "./type-map.js";

export class TypeMapAllStrings extends TypeMap {}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export const _pgTypemapAllStrings: TypeMapAllStrings = Object.freeze(new TypeMapAllStrings());

PG.TypeMapAllStrings = TypeMapAllStrings;

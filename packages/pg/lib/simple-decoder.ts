import { Coder } from "./coder.js";
import { PG } from "./namespaces.js";

/** @noRailsEquivalent PERMANENT */
export abstract class SimpleDecoder extends Coder {
  /** @noRailsEquivalent PERMANENT */
  abstract decode(string: string, tuple?: number | null, field?: number | null): unknown;
}

PG.SimpleDecoder = SimpleDecoder;

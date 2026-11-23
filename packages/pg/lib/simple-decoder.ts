import { SimpleCoder } from "./simple-coder.js";
import { PG } from "./namespaces.js";

export abstract class SimpleDecoder extends SimpleCoder {
  /** @noRailsEquivalent PERMANENT */
  abstract decode(string: string, tuple?: number | null, field?: number | null): unknown;
}

PG.SimpleDecoder = SimpleDecoder;

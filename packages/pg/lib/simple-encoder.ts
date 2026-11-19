import { Coder } from "./coder.js";
import { PG } from "./namespaces.js";

/** @noRailsEquivalent PERMANENT */
export class SimpleEncoder extends Coder {}

PG.SimpleEncoder = SimpleEncoder;

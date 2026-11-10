import * as yaml from "yaml";
import { registerPsychAdapter, type PsychAdapter } from "./psych-adapter.js";

/** @noRailsEquivalent PERMANENT */
registerPsychAdapter("yaml", yaml as unknown as PsychAdapter);

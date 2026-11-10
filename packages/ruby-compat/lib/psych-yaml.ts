import * as yaml from "yaml";
import { registerPsychAdapter } from "./psych-adapter.js";

/** @noRailsEquivalent PERMANENT */
registerPsychAdapter("yaml", yaml);

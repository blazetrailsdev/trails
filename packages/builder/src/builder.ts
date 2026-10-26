import { TopLevel } from "@blazetrails/activesupport";
import * as Builder from "./builder.js";

export { VERSION } from "./version.js";
export { XChar, checkForNameCollision } from "./xchar.js";
export { IllegalBlockError, XmlBase } from "./xmlbase.js";
export { XmlMarkup } from "./xmlmarkup.js";
export { XmlEvents } from "./xmlevents.js";

(TopLevel as { Builder?: typeof Builder }).Builder = Builder;

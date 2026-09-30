import * as I18n from "@blazetrails/i18n";
import { en } from "./locale/en.js";
import { TopLevel } from "./namespaces.js";

const enPath = new URL("./locale/en.js", import.meta.url).pathname;
I18n.registerLocaleModule(enPath, { en });
I18n.loadPath().push(enPath);

TopLevel.I18n = I18n;

export { I18n };

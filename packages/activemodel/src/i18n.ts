import { I18n } from "@blazetrails/activesupport";
import { en } from "./locale/en.js";

const enPath = new URL("./locale/en.js", import.meta.url).pathname;
I18n.registerLocaleModule(enPath, { en });
I18n.loadPath().push(enPath);

export { I18n };

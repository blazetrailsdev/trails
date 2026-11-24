export const ENCODING_FLAG = "#.*coding[:=]\\s*(\\S+)[ \\t]*";

import { I18n } from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";
import { en } from "./locale/en.js";

const enPath = File.expandPath(
  "action-view/locale/en.js",
  File.dirname(decodeURIComponent(new URL(import.meta.url).pathname)),
);
I18n.registerLocaleModule(enPath, { en });
I18n.loadPath().push(enPath);

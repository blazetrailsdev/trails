/**
 * Mirrors: active_support/i18n.rb — requires the i18n gem and registers Active
 * Support's own `en` locale with it.
 *
 * Rails appends `locale/en.yml` and `locale/en.rb` to `I18n.load_path`
 * (active_support/i18n.rb:16-17) and `Simple#init_translations` reads the path
 * back on first use and after every `I18n.reload!`
 * (i18n/lib/i18n/backend/simple.rb:83-86). The two locale files are one module
 * here, so there is one entry rather than two, and it is handed to
 * `registerLocaleModule` first because evaluating a JS module is async where
 * Ruby's `eval` in `load_rb` is not.
 *
 * `run_load_hooks(:i18n)` and `i18n/backend/fallbacks` have no port yet.
 */

import * as I18n from "@blazetrails/i18n";
import { en } from "./locale/en.js";

const enPath = new URL("./locale/en.js", import.meta.url).pathname;
I18n.registerLocaleModule(enPath, { en });
I18n.loadPath().push(enPath);

export { I18n };

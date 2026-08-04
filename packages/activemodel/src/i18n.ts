/**
 * Mirrors: the `ActiveSupport.on_load(:i18n)` hook at the bottom of
 * `activemodel/lib/active_model.rb`, which appends Active Model's own `en`
 * locale to `I18n.load_path`.
 *
 * The locale is one module rather than an `en.yml`, so it is registered with
 * `registerLocaleModule` before its path is appended — the shape
 * `activesupport/src/i18n.ts` settled on, and for the reasons its header gives.
 *
 * Importing `@blazetrails/activesupport`'s `I18n` (rather than
 * `@blazetrails/i18n` directly) mirrors `require "active_support/i18n"`: it
 * registers Active Support's locale before ours.
 */

import { I18n } from "@blazetrails/activesupport";
import { en } from "./locale/en.js";

const enPath = new URL("./locale/en.js", import.meta.url).pathname;
I18n.registerLocaleModule(enPath, { en });
I18n.loadPath().push(enPath);

export { I18n };

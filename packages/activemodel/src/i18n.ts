/**
 * Mirrors: the `ActiveSupport.on_load(:i18n)` hook at the bottom of
 * `activemodel/lib/active_model.rb`, which appends Active Model's own `en`
 * locale to `I18n.load_path`.
 *
 * The load path is not used for it. `Simple#initTranslations` reads the path
 * through the `FileReader` a host registers, and that read is async
 * (`backend/simple.ts:116`), while these translations have to be in the backend
 * by the time this module finishes importing — nothing awaits an import for a
 * side effect. So the locale is a module and is stored directly, the shape
 * `activesupport/src/i18n.ts` already uses.
 *
 * Importing `@blazetrails/activesupport`'s `I18n` (rather than
 * `@blazetrails/i18n` directly) mirrors `require "active_support/i18n"`: it
 * registers Active Support's locale before ours.
 */

import { I18n } from "@blazetrails/activesupport";
import { en } from "./locale/en.js";

I18n.backend().storeTranslations("en", en);

export { I18n };

/**
 * Mirrors: the `ActiveSupport.on_load(:i18n)` hook at the bottom of
 * `activemodel/lib/active_model.rb`, which appends Active Model's own `en`
 * locale to `I18n.load_path`.
 *
 * `load_path` is not read back yet — `Simple#initTranslations` only flips its
 * flag until the file loader lands (story
 * `i18n-backend-file-loading-localize`) — so the data goes into the backend
 * directly, exactly as `activesupport/src/i18n.ts` does. Move this to
 * `I18n.setLoadPath` when the loader lands.
 *
 * Importing `@blazetrails/activesupport`'s `I18n` (rather than
 * `@blazetrails/i18n` directly) mirrors `require "active_support/i18n"`: it
 * registers Active Support's locale before ours.
 */

import { I18n } from "@blazetrails/activesupport";
import { en } from "./locale/en.js";

I18n.backend().storeTranslations("en", en);

export { I18n };

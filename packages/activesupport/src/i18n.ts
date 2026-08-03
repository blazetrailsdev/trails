/**
 * Mirrors: active_support/i18n.rb — requires the i18n gem and registers Active
 * Support's own `en` locale with it.
 *
 * Rails appends `locale/en.yml` and `locale/en.rb` to `I18n.load_path`
 * (active_support/i18n.rb:16-17) and `Simple#init_translations` reads the path
 * back on first use and after every `I18n.reload!`
 * (i18n/lib/i18n/backend/simple.rb:83-86). Neither `load_path` end is ported:
 * `Backend::Base#load_translations` / `load_file` / `load_rb` need async fs and
 * a YAML reader, and `Simple#initTranslations` only flips its flag until they
 * land (story `i18n-backend-file-loading-localize`). Registering a path here
 * would therefore store nothing at all, so the data goes into the backend
 * directly — with the one behavioural difference that `I18n.reloadBang()` drops
 * it instead of re-reading it. Move this to `I18n.setLoadPath` when the loader
 * lands; nothing else about this file changes.
 *
 * `run_load_hooks(:i18n)` and `i18n/backend/fallbacks` have no port yet.
 */

import * as I18n from "@blazetrails/i18n";
import { en } from "./locale/en.js";

I18n.backend().storeTranslations("en", en);

export { I18n };

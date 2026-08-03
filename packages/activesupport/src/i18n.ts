/**
 * Mirrors: active_support/i18n.rb — requires the i18n gem and registers Active
 * Support's own `en` locale with it.
 *
 * Rails appends `locale/en.yml` and `locale/en.rb` to `I18n.load_path` and the
 * backend reads them on first use. Translation-file loading is not ported yet
 * (story `i18n-backend-file-loading-localize`), so the data goes straight into
 * the backend here; a `reloadBang()` therefore drops it, where Rails would
 * re-read the files.
 *
 * `run_load_hooks(:i18n)` and `i18n/backend/fallbacks` have no port yet.
 */

import * as I18n from "@blazetrails/i18n";
import { en } from "./locale/en.js";

I18n.backend().storeTranslations("en", en);

export { I18n };

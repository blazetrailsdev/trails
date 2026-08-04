/**
 * Mirrors: active_support/i18n.rb — requires the i18n gem and registers Active
 * Support's own `en` locale with it.
 *
 * Rails appends `locale/en.yml` and `locale/en.rb` to `I18n.load_path`
 * (active_support/i18n.rb:16-17) and `Simple#init_translations` reads the path
 * back on first use and after every `I18n.reload!`
 * (i18n/lib/i18n/backend/simple.rb:83-86). The two locale files are one module
 * here, so there is one entry rather than two.
 *
 * Rails' two lines are bare appends because `load_rb` reads and evaluates the
 * named file itself (base.rb:254). Its port cannot: `load_file` and
 * `load_translations` are synchronous (base.rb:240, :14 — and so is every
 * `init_translations` call site above them, simple.rb:83-86), while the only
 * way JS evaluates a module is `import()`, which is a Promise. Awaiting it here
 * is not open either — a top-level await in this file cannot be transformed to
 * CJS, which breaks every `tsx`-run script that imports Active Support. So the
 * module this file has already imported is handed over first, the same way the
 * host already registers a reader and preloads the bytes for the `.yml` and
 * `.json` arms of the same dispatch.
 *
 * `run_load_hooks(:i18n)` and `i18n/backend/fallbacks` have no port yet.
 *
 * Locale payloads keep Ruby's snake_case keys (that is what the `.yml` files
 * and `storeTranslations` callers carry), while the option hashes Rails merges
 * them into are camelCase here. Where a Rails body merges a translation
 * straight into options — `Array#to_sentence`, `to_sentence` in
 * `output_safety_helper.rb`, `NumberConverter#i18n_format_options` — camelize
 * the keys at the lookup boundary with `camelize(key, "lower")` from
 * `inflector.ts`. Do not introduce a per-file snake_case→camelCase key map.
 */

import * as I18n from "@blazetrails/i18n";
import { en } from "./locale/en.js";

const enPath = new URL("./locale/en.js", import.meta.url).pathname;
I18n.registerLocaleModule(enPath, { en });
I18n.loadPath().push(enPath);

export { I18n };

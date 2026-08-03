/**
 * Mirrors: the `ActiveSupport.on_load(:i18n)` hook at the bottom of
 * `activerecord/lib/active_record.rb`, which appends Active Record's own `en`
 * locale to `I18n.load_path`.
 *
 * The hook lives in a file of its own — rather than in `index.ts`, which is
 * where the rest of `active_record.rb` lands — because `base.ts` has to import
 * it for its side effect: a model file that never loads the package index still
 * has to be able to translate its error messages. `load_path` itself is not
 * read back yet; see the note in `activemodel/src/i18n.ts`.
 */

import { I18n } from "@blazetrails/activemodel";
import { en } from "./locale/en.js";

I18n.backend().storeTranslations("en", en);

/**
 * Mirrors: activerecord/lib/active_record/locale/en.yml.
 *
 * Rails appends this file to `I18n.load_path` from the `on_load(:i18n)` hook at
 * the bottom of `activerecord/lib/active_record.rb`. The data lives here as a
 * module instead, which `i18n.ts` registers before appending its path to
 * `I18n.load_path`.
 */

import type { TranslationData } from "@blazetrails/i18n";

export const en: TranslationData = {
  // Default error messages
  errors: {
    messages: {
      required: "must exist",
      taken: "has already been taken",
    },
  },

  // Active Record models configuration
  activerecord: {
    errors: {
      messages: {
        record_invalid: "Validation failed: %{errors}",
        restrict_dependent_destroy: {
          has_one: "Cannot delete record because a dependent %{record} exists",
          has_many: "Cannot delete record because dependent %{record} exist",
        },
      },
    },
  },
};

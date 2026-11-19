import { defineConstants } from "@blazetrails/ruby-compat";
import "./index.js";
import * as m0 from "./backend/base.js";
import * as m1 from "./backend/cascade.js";
import * as m2 from "./backend/chain.js";
import * as m3 from "./backend/fallbacks.js";
import * as m4 from "./backend/flatten.js";
import * as m5 from "./backend/key-value.js";
import * as m6 from "./backend/lazy-loadable.js";
import * as m7 from "./backend/memoize.js";
import * as m8 from "./backend/pluralization.js";
import * as m9 from "./backend/simple.js";
import * as m10 from "./backend/transliterator.js";
import * as m11 from "./config.js";
import * as m12 from "./exceptions.js";
import * as m13 from "./gettext.js";
import * as m14 from "./gettext/helpers.js";
import * as m15 from "./locale.js";
import * as m16 from "./locale/fallbacks.js";
import * as m17 from "./locale/tag/parents.js";
import * as m18 from "./locale/tag/rfc4646.js";
import * as m19 from "./locale/tag/simple.js";
import * as m20 from "./middleware.js";
import * as m21 from "./utils.js";

defineConstants([
  [m12, "ArgumentError", "I18n::ArgumentError"],
  [m0, "Base", "I18n::Backend::Base"],
  [m1, "Cascade", "I18n::Backend::Cascade"],
  [m2, "Chain", "I18n::Backend::Chain"],
  [m3, "Fallbacks", "I18n::Backend::Fallbacks"],
  [m4, "Flatten", "I18n::Backend::Flatten"],
  [m5, "KeyValue", "I18n::Backend::KeyValue"],
  [m5, "SubtreeProxy", "I18n::Backend::KeyValue::SubtreeProxy"],
  [m6, "LazyLoadable", "I18n::Backend::LazyLoadable"],
  [m6, "LocaleExtractor", "I18n::Backend::LocaleExtractor"],
  [m7, "Memoize", "I18n::Backend::Memoize"],
  [m8, "Pluralization", "I18n::Backend::Pluralization"],
  [m9, "Simple", "I18n::Backend::Simple"],
  [m10, "Transliterator", "I18n::Backend::Transliterator"],
  [m10, "HashTransliterator", "I18n::Backend::Transliterator::HashTransliterator"],
  [m10, "ProcTransliterator", "I18n::Backend::Transliterator::ProcTransliterator"],
  [m11, "Config", "I18n::Config"],
  [m12, "Disabled", "I18n::Disabled"],
  [m12, "ExceptionHandler", "I18n::ExceptionHandler"],
  [m13, "Gettext", "I18n::Gettext"],
  [m14, "Helpers", "I18n::Gettext::Helpers"],
  [m12, "InvalidFilenames", "I18n::InvalidFilenames"],
  [m12, "InvalidLocale", "I18n::InvalidLocale"],
  [m12, "InvalidLocaleData", "I18n::InvalidLocaleData"],
  [m12, "InvalidPluralizationData", "I18n::InvalidPluralizationData"],
  [m15, "Locale", "I18n::Locale"],
  [m16, "Fallbacks", "I18n::Locale::Fallbacks"],
  [m17, "Parents", "I18n::Locale::Tag::Parents"],
  [m18, "Rfc4646", "I18n::Locale::Tag::Rfc4646"],
  [m18, "Parser", "I18n::Locale::Tag::Rfc4646::Parser"],
  [m19, "Simple", "I18n::Locale::Tag::Simple"],
  [m20, "Middleware", "I18n::Middleware"],
  [m12, "MissingInterpolationArgument", "I18n::MissingInterpolationArgument"],
  [m12, "MissingTranslation", "I18n::MissingTranslation"],
  [m12, "Base", "I18n::MissingTranslation::Base"],
  [m12, "MissingTranslationData", "I18n::MissingTranslationData"],
  [m12, "ReservedInterpolationKey", "I18n::ReservedInterpolationKey"],
  [m12, "UnknownFileType", "I18n::UnknownFileType"],
  [m12, "UnsupportedMethod", "I18n::UnsupportedMethod"],
  [m21, null, "I18n::Utils"],
]);

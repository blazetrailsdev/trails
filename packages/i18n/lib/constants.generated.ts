import { defineConstants } from "@blazetrails/ruby-compat";
import "./index.js";
import * as m0 from "./backend/base.js";
import * as m1 from "./backend/cascade.js";
import * as m2 from "./backend/chain.js";
import * as m3 from "./backend/flatten.js";
import * as m4 from "./backend/key-value.js";
import * as m5 from "./backend/lazy-loadable.js";
import * as m6 from "./backend/memoize.js";
import * as m7 from "./backend/pluralization.js";
import * as m8 from "./backend/simple.js";
import * as m9 from "./backend/transliterator.js";
import * as m10 from "./config.js";
import * as m11 from "./exceptions.js";
import * as m12 from "./gettext.js";
import * as m13 from "./gettext/helpers.js";
import * as m14 from "./locale.js";
import * as m15 from "./locale/fallbacks.js";
import * as m16 from "./locale/tag/parents.js";
import * as m17 from "./locale/tag/rfc4646.js";
import * as m18 from "./locale/tag/simple.js";
import * as m19 from "./middleware.js";
import * as m20 from "./utils.js";

defineConstants([
  [() => m11.ArgumentError, "I18n::ArgumentError"],
  [() => m0.Base, "I18n::Backend::Base"],
  [() => m1.Cascade, "I18n::Backend::Cascade"],
  [() => m2.Chain, "I18n::Backend::Chain"],
  [() => m3.Flatten, "I18n::Backend::Flatten"],
  [() => m4.KeyValue, "I18n::Backend::KeyValue"],
  [() => m4.SubtreeProxy, "I18n::Backend::KeyValue::SubtreeProxy"],
  [() => m5.LazyLoadable, "I18n::Backend::LazyLoadable"],
  [() => m5.LocaleExtractor, "I18n::Backend::LocaleExtractor"],
  [() => m6.Memoize, "I18n::Backend::Memoize"],
  [() => m7.Pluralization, "I18n::Backend::Pluralization"],
  [() => m8.Simple, "I18n::Backend::Simple"],
  [() => m9.Transliterator, "I18n::Backend::Transliterator"],
  [() => m9.HashTransliterator, "I18n::Backend::Transliterator::HashTransliterator"],
  [() => m9.ProcTransliterator, "I18n::Backend::Transliterator::ProcTransliterator"],
  [() => m10.Config, "I18n::Config"],
  [() => m11.Disabled, "I18n::Disabled"],
  [() => m11.ExceptionHandler, "I18n::ExceptionHandler"],
  [() => m12.Gettext, "I18n::Gettext"],
  [() => m13.Helpers, "I18n::Gettext::Helpers"],
  [() => m11.InvalidFilenames, "I18n::InvalidFilenames"],
  [() => m11.InvalidLocale, "I18n::InvalidLocale"],
  [() => m11.InvalidLocaleData, "I18n::InvalidLocaleData"],
  [() => m11.InvalidPluralizationData, "I18n::InvalidPluralizationData"],
  [() => m14.Locale, "I18n::Locale"],
  [() => m15.Fallbacks, "I18n::Locale::Fallbacks"],
  [() => m16.Parents, "I18n::Locale::Tag::Parents"],
  [() => m17.Rfc4646, "I18n::Locale::Tag::Rfc4646"],
  [() => m17.Parser, "I18n::Locale::Tag::Rfc4646::Parser"],
  [() => m18.Simple, "I18n::Locale::Tag::Simple"],
  [() => m19.Middleware, "I18n::Middleware"],
  [() => m11.MissingInterpolationArgument, "I18n::MissingInterpolationArgument"],
  [() => m11.MissingTranslation, "I18n::MissingTranslation"],
  [() => m11.Base, "I18n::MissingTranslation::Base"],
  [() => m11.MissingTranslationData, "I18n::MissingTranslationData"],
  [() => m11.ReservedInterpolationKey, "I18n::ReservedInterpolationKey"],
  [() => m11.UnknownFileType, "I18n::UnknownFileType"],
  [() => m11.UnsupportedMethod, "I18n::UnsupportedMethod"],
  [() => m20, "I18n::Utils"],
]);

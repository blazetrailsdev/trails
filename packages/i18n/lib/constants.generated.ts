import { defineConstants } from "@blazetrails/ruby-compat";
import "./index.js";
import * as m0 from "./backend/base.js";
import * as m1 from "./backend/chain.js";
import * as m2 from "./backend/flatten.js";
import * as m3 from "./backend/key-value.js";
import * as m4 from "./backend/lazy-loadable.js";
import * as m5 from "./backend/pluralization.js";
import * as m6 from "./backend/simple.js";
import * as m7 from "./backend/transliterator.js";
import * as m8 from "./config.js";
import * as m9 from "./exceptions.js";
import * as m10 from "./locale.js";
import * as m11 from "./locale/fallbacks.js";
import * as m12 from "./locale/tag/parents.js";
import * as m13 from "./locale/tag/rfc4646.js";
import * as m14 from "./locale/tag/simple.js";
import * as m15 from "./utils.js";

defineConstants([
  [() => m9.ArgumentError, "I18n::ArgumentError"],
  [() => m0.Base, "I18n::Backend::Base"],
  [() => m1.Chain, "I18n::Backend::Chain"],
  [() => m2.Flatten, "I18n::Backend::Flatten"],
  [() => m3.KeyValue, "I18n::Backend::KeyValue"],
  [() => m3.SubtreeProxy, "I18n::Backend::KeyValue::SubtreeProxy"],
  [() => m4.LazyLoadable, "I18n::Backend::LazyLoadable"],
  [() => m4.LocaleExtractor, "I18n::Backend::LocaleExtractor"],
  [() => m5.Pluralization, "I18n::Backend::Pluralization"],
  [() => m6.Simple, "I18n::Backend::Simple"],
  [() => m7.Transliterator, "I18n::Backend::Transliterator"],
  [() => m7.HashTransliterator, "I18n::Backend::Transliterator::HashTransliterator"],
  [() => m7.ProcTransliterator, "I18n::Backend::Transliterator::ProcTransliterator"],
  [() => m8.Config, "I18n::Config"],
  [() => m9.Disabled, "I18n::Disabled"],
  [() => m9.ExceptionHandler, "I18n::ExceptionHandler"],
  [() => m9.InvalidFilenames, "I18n::InvalidFilenames"],
  [() => m9.InvalidLocale, "I18n::InvalidLocale"],
  [() => m9.InvalidLocaleData, "I18n::InvalidLocaleData"],
  [() => m9.InvalidPluralizationData, "I18n::InvalidPluralizationData"],
  [() => m10.Locale, "I18n::Locale"],
  [() => m11.Fallbacks, "I18n::Locale::Fallbacks"],
  [() => m12.Parents, "I18n::Locale::Tag::Parents"],
  [() => m13.Rfc4646, "I18n::Locale::Tag::Rfc4646"],
  [() => m13.Parser, "I18n::Locale::Tag::Rfc4646::Parser"],
  [() => m14.Simple, "I18n::Locale::Tag::Simple"],
  [() => m9.MissingInterpolationArgument, "I18n::MissingInterpolationArgument"],
  [() => m9.MissingTranslation, "I18n::MissingTranslation"],
  [() => m9.Base, "I18n::MissingTranslation::Base"],
  [() => m9.MissingTranslationData, "I18n::MissingTranslationData"],
  [() => m9.ReservedInterpolationKey, "I18n::ReservedInterpolationKey"],
  [() => m9.UnknownFileType, "I18n::UnknownFileType"],
  [() => m9.UnsupportedMethod, "I18n::UnsupportedMethod"],
  [() => m15, "I18n::Utils"],
]);

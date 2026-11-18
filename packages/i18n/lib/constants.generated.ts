import { defineConstants } from "@blazetrails/ruby-compat";
import "./index.js";
import * as m0 from "./backend/base.js";
import * as m1 from "./backend/chain.js";
import * as m2 from "./backend/flatten.js";
import * as m3 from "./backend/key-value.js";
import * as m4 from "./backend/lazy-loadable.js";
import * as m5 from "./backend/simple.js";
import * as m6 from "./backend/transliterator.js";
import * as m7 from "./config.js";
import * as m8 from "./exceptions.js";
import * as m9 from "./locale.js";
import * as m10 from "./locale/fallbacks.js";
import * as m11 from "./locale/tag/parents.js";
import * as m12 from "./locale/tag/rfc4646.js";
import * as m13 from "./locale/tag/simple.js";
import * as m14 from "./utils.js";

defineConstants([
  [() => m8.ArgumentError, "I18n::ArgumentError"],
  [() => m0.Base, "I18n::Backend::Base"],
  [() => m1.Chain, "I18n::Backend::Chain"],
  [() => m2.Flatten, "I18n::Backend::Flatten"],
  [() => m3.KeyValue, "I18n::Backend::KeyValue"],
  [() => m3.SubtreeProxy, "I18n::Backend::KeyValue::SubtreeProxy"],
  [() => m4.LazyLoadable, "I18n::Backend::LazyLoadable"],
  [() => m4.LocaleExtractor, "I18n::Backend::LocaleExtractor"],
  [() => m5.Simple, "I18n::Backend::Simple"],
  [() => m6.Transliterator, "I18n::Backend::Transliterator"],
  [() => m6.HashTransliterator, "I18n::Backend::Transliterator::HashTransliterator"],
  [() => m6.ProcTransliterator, "I18n::Backend::Transliterator::ProcTransliterator"],
  [() => m7.Config, "I18n::Config"],
  [() => m8.Disabled, "I18n::Disabled"],
  [() => m8.ExceptionHandler, "I18n::ExceptionHandler"],
  [() => m8.InvalidFilenames, "I18n::InvalidFilenames"],
  [() => m8.InvalidLocale, "I18n::InvalidLocale"],
  [() => m8.InvalidLocaleData, "I18n::InvalidLocaleData"],
  [() => m8.InvalidPluralizationData, "I18n::InvalidPluralizationData"],
  [() => m9.Locale, "I18n::Locale"],
  [() => m10.Fallbacks, "I18n::Locale::Fallbacks"],
  [() => m11.Parents, "I18n::Locale::Tag::Parents"],
  [() => m12.Rfc4646, "I18n::Locale::Tag::Rfc4646"],
  [() => m12.Parser, "I18n::Locale::Tag::Rfc4646::Parser"],
  [() => m13.Simple, "I18n::Locale::Tag::Simple"],
  [() => m8.MissingInterpolationArgument, "I18n::MissingInterpolationArgument"],
  [() => m8.MissingTranslation, "I18n::MissingTranslation"],
  [() => m8.Base, "I18n::MissingTranslation::Base"],
  [() => m8.MissingTranslationData, "I18n::MissingTranslationData"],
  [() => m8.ReservedInterpolationKey, "I18n::ReservedInterpolationKey"],
  [() => m8.UnknownFileType, "I18n::UnknownFileType"],
  [() => m8.UnsupportedMethod, "I18n::UnsupportedMethod"],
  [() => m14, "I18n::Utils"],
]);

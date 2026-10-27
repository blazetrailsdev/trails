import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./backend/chain.js";
import * as m1 from "./backend/key-value.js";
import * as m2 from "./backend/simple.js";
import * as m3 from "./backend/transliterator.js";
import * as m4 from "./config.js";
import * as m5 from "./exceptions.js";
import * as m6 from "./locale/fallbacks.js";
import * as m7 from "./locale/tag/rfc4646.js";
import * as m8 from "./locale/tag/simple.js";

registerClassPaths([
  [() => m5.ArgumentError, "I18n::ArgumentError"],
  [() => m0.Chain, "I18n::Backend::Chain"],
  [() => m1.KeyValue, "I18n::Backend::KeyValue"],
  [() => m1.SubtreeProxy, "I18n::Backend::KeyValue::SubtreeProxy"],
  [() => m2.Simple, "I18n::Backend::Simple"],
  [() => m3.HashTransliterator, "I18n::Backend::Transliterator::HashTransliterator"],
  [() => m3.ProcTransliterator, "I18n::Backend::Transliterator::ProcTransliterator"],
  [() => m4.Config, "I18n::Config"],
  [() => m5.Disabled, "I18n::Disabled"],
  [() => m5.ExceptionHandler, "I18n::ExceptionHandler"],
  [() => m5.InvalidLocale, "I18n::InvalidLocale"],
  [() => m5.InvalidLocaleData, "I18n::InvalidLocaleData"],
  [() => m5.InvalidPluralizationData, "I18n::InvalidPluralizationData"],
  [() => m6.Fallbacks, "I18n::Locale::Fallbacks"],
  [() => m7.Rfc4646, "I18n::Locale::Tag::Rfc4646"],
  [() => m8.Simple, "I18n::Locale::Tag::Simple"],
  [() => m5.MissingInterpolationArgument, "I18n::MissingInterpolationArgument"],
  [() => m5.MissingTranslation, "I18n::MissingTranslation"],
  [() => m5.MissingTranslationData, "I18n::MissingTranslationData"],
  [() => m5.ReservedInterpolationKey, "I18n::ReservedInterpolationKey"],
  [() => m5.UnknownFileType, "I18n::UnknownFileType"],
  [() => m5.UnsupportedMethod, "I18n::UnsupportedMethod"],
]);

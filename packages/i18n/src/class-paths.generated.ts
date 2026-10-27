import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./backend/base.js";
import * as m1 from "./backend/chain.js";
import * as m2 from "./backend/flatten.js";
import * as m3 from "./backend/key-value.js";
import * as m4 from "./backend/simple.js";
import * as m5 from "./backend/transliterator.js";
import * as m6 from "./config.js";
import * as m7 from "./exceptions.js";
import * as m8 from "./locale/fallbacks.js";
import * as m9 from "./locale/tag/rfc4646.js";
import * as m10 from "./locale/tag/simple.js";

registerClassPaths([
  [() => m7.ArgumentError, "I18n::ArgumentError"],
  [() => m0.Base, "I18n::Backend::Base"],
  [() => m1.Chain, "I18n::Backend::Chain"],
  [() => m2.Flatten, "I18n::Backend::Flatten"],
  [() => m3.KeyValue, "I18n::Backend::KeyValue"],
  [() => m3.SubtreeProxy, "I18n::Backend::KeyValue::SubtreeProxy"],
  [() => m4.Simple, "I18n::Backend::Simple"],
  [() => m5.HashTransliterator, "I18n::Backend::Transliterator::HashTransliterator"],
  [() => m5.ProcTransliterator, "I18n::Backend::Transliterator::ProcTransliterator"],
  [() => m6.Config, "I18n::Config"],
  [() => m7.Disabled, "I18n::Disabled"],
  [() => m7.ExceptionHandler, "I18n::ExceptionHandler"],
  [() => m7.InvalidLocale, "I18n::InvalidLocale"],
  [() => m7.InvalidLocaleData, "I18n::InvalidLocaleData"],
  [() => m7.InvalidPluralizationData, "I18n::InvalidPluralizationData"],
  [() => m8.Fallbacks, "I18n::Locale::Fallbacks"],
  [() => m9.Rfc4646, "I18n::Locale::Tag::Rfc4646"],
  [() => m9.Parser, "I18n::Locale::Tag::Rfc4646::Parser"],
  [() => m10.Simple, "I18n::Locale::Tag::Simple"],
  [() => m7.MissingInterpolationArgument, "I18n::MissingInterpolationArgument"],
  [() => m7.MissingTranslation, "I18n::MissingTranslation"],
  [() => m7.Base, "I18n::MissingTranslation::Base"],
  [() => m7.MissingTranslationData, "I18n::MissingTranslationData"],
  [() => m7.ReservedInterpolationKey, "I18n::ReservedInterpolationKey"],
  [() => m7.UnknownFileType, "I18n::UnknownFileType"],
  [() => m7.UnsupportedMethod, "I18n::UnsupportedMethod"],
]);

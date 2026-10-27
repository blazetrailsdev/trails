import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./attribute-methods.js";
import * as m1 from "./attribute-mutation-tracker.js";
import * as m2 from "./attribute-registration.js";
import * as m3 from "./attribute-set.js";
import * as m4 from "./attribute-set/builder.js";
import * as m5 from "./attribute-set/yaml-encoder.js";
import * as m6 from "./attribute.js";
import * as m7 from "./attribute/user-provided-default.js";
import * as m8 from "./error.js";
import * as m9 from "./errors.js";
import * as m10 from "./forbidden-attributes-protection.js";
import * as m11 from "./naming.js";
import * as m12 from "./nested-error.js";
import * as m13 from "./secure-password.js";
import * as m14 from "./type/big-integer.js";
import * as m15 from "./type/binary.js";
import * as m16 from "./type/boolean.js";
import * as m17 from "./type/date-time.js";
import * as m18 from "./type/date.js";
import * as m19 from "./type/decimal.js";
import * as m20 from "./type/float.js";
import * as m21 from "./type/helpers/accepts-multiparameter-time.js";
import * as m22 from "./type/immutable-string.js";
import * as m23 from "./type/integer.js";
import * as m24 from "./type/registry.js";
import * as m25 from "./type/string.js";
import * as m26 from "./type/time.js";
import * as m27 from "./type/value.js";
import * as m28 from "./validations.js";
import * as m29 from "./validations/absence.js";
import * as m30 from "./validations/acceptance.js";
import * as m31 from "./validations/comparison.js";
import * as m32 from "./validations/confirmation.js";
import * as m33 from "./validations/exclusion.js";
import * as m34 from "./validations/format.js";
import * as m35 from "./validations/inclusion.js";
import * as m36 from "./validations/length.js";
import * as m37 from "./validations/numericality.js";
import * as m38 from "./validations/presence.js";
import * as m39 from "./validations/with.js";
import * as m40 from "./validator.js";

registerClassPaths([
  [() => m6.Attribute, "ActiveModel::Attribute"],
  [() => m6.FromDatabase, "ActiveModel::Attribute::FromDatabase"],
  [() => m6.FromUser, "ActiveModel::Attribute::FromUser"],
  [() => m6.Null, "ActiveModel::Attribute::Null"],
  [() => m6.Uninitialized, "ActiveModel::Attribute::Uninitialized"],
  [() => m7.UserProvidedDefault, "ActiveModel::Attribute::UserProvidedDefault"],
  [() => m6.WithCastValue, "ActiveModel::Attribute::WithCastValue"],
  [
    () => m0.AttributeMethodPattern,
    "ActiveModel::AttributeMethods::ClassMethods::AttributeMethodPattern",
  ],
  [
    () => m0.AttributeMethod,
    "ActiveModel::AttributeMethods::ClassMethods::AttributeMethodPattern::AttributeMethod",
  ],
  [() => m1.AttributeMutationTracker, "ActiveModel::AttributeMutationTracker"],
  [() => m2.PendingDecorator, "ActiveModel::AttributeRegistration::ClassMethods::PendingDecorator"],
  [() => m2.PendingDefault, "ActiveModel::AttributeRegistration::ClassMethods::PendingDefault"],
  [() => m2.PendingType, "ActiveModel::AttributeRegistration::ClassMethods::PendingType"],
  [() => m3.AttributeSet, "ActiveModel::AttributeSet"],
  [() => m4.Builder, "ActiveModel::AttributeSet::Builder"],
  [() => m5.YAMLEncoder, "ActiveModel::AttributeSet::YAMLEncoder"],
  [() => m40.BlockValidator, "ActiveModel::BlockValidator"],
  [() => m40.EachValidator, "ActiveModel::EachValidator"],
  [() => m8.Error, "ActiveModel::Error"],
  [() => m9.Errors, "ActiveModel::Errors"],
  [() => m10.ForbiddenAttributesError, "ActiveModel::ForbiddenAttributesError"],
  [() => m1.ForcedMutationTracker, "ActiveModel::ForcedMutationTracker"],
  [() => m4.LazyAttributeHash, "ActiveModel::LazyAttributeHash"],
  [() => m4.LazyAttributeSet, "ActiveModel::LazyAttributeSet"],
  [() => m0.MissingAttributeError, "ActiveModel::MissingAttributeError"],
  [() => m11.ModelName, "ActiveModel::Name"],
  [() => m12.NestedError, "ActiveModel::NestedError"],
  [() => m1.NullMutationTracker, "ActiveModel::NullMutationTracker"],
  [() => m9.RangeError, "ActiveModel::RangeError"],
  [
    () => m13.InstanceMethodsOnActivation,
    "ActiveModel::SecurePassword::InstanceMethodsOnActivation",
  ],
  [() => m9.StrictValidationFailed, "ActiveModel::StrictValidationFailed"],
  [() => m14.BigIntegerType, "ActiveModel::Type::BigInteger"],
  [() => m15.BinaryType, "ActiveModel::Type::Binary"],
  [() => m15.Data, "ActiveModel::Type::Binary::Data"],
  [() => m16.BooleanType, "ActiveModel::Type::Boolean"],
  [() => m18.DateType, "ActiveModel::Type::Date"],
  [() => m17.DateTimeType, "ActiveModel::Type::DateTime"],
  [() => m19.DecimalType, "ActiveModel::Type::Decimal"],
  [() => m20.FloatType, "ActiveModel::Type::Float"],
  [() => m21.AcceptsMultiparameterTime, "ActiveModel::Type::Helpers::AcceptsMultiparameterTime"],
  [() => m22.ImmutableStringType, "ActiveModel::Type::ImmutableString"],
  [() => m23.IntegerType, "ActiveModel::Type::Integer"],
  [() => m24.TypeRegistry, "ActiveModel::Type::Registry"],
  [() => m25.StringType, "ActiveModel::Type::String"],
  [() => m26.TimeType, "ActiveModel::Type::Time"],
  [() => m27.ValueType, "ActiveModel::Type::Value"],
  [() => m9.UnknownAttributeError, "ActiveModel::UnknownAttributeError"],
  [() => m28.ValidationContext, "ActiveModel::ValidationContext"],
  [() => m28.ValidationError, "ActiveModel::ValidationError"],
  [() => m29.AbsenceValidator, "ActiveModel::Validations::AbsenceValidator"],
  [() => m30.AcceptanceValidator, "ActiveModel::Validations::AcceptanceValidator"],
  [
    () => m30.LazilyDefineAttributes,
    "ActiveModel::Validations::AcceptanceValidator::LazilyDefineAttributes",
  ],
  [() => m31.ComparisonValidator, "ActiveModel::Validations::ComparisonValidator"],
  [() => m32.ConfirmationValidator, "ActiveModel::Validations::ConfirmationValidator"],
  [() => m33.ExclusionValidator, "ActiveModel::Validations::ExclusionValidator"],
  [() => m34.FormatValidator, "ActiveModel::Validations::FormatValidator"],
  [() => m35.InclusionValidator, "ActiveModel::Validations::InclusionValidator"],
  [() => m36.LengthValidator, "ActiveModel::Validations::LengthValidator"],
  [() => m37.NumericalityValidator, "ActiveModel::Validations::NumericalityValidator"],
  [() => m38.PresenceValidator, "ActiveModel::Validations::PresenceValidator"],
  [() => m39.WithValidator, "ActiveModel::Validations::WithValidator"],
  [() => m40.Validator, "ActiveModel::Validator"],
]);

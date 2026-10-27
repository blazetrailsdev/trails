import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./api.js";
import * as m1 from "./attribute-methods.js";
import * as m2 from "./attribute-mutation-tracker.js";
import * as m3 from "./attribute-registration.js";
import * as m4 from "./attribute-set.js";
import * as m5 from "./attribute-set/builder.js";
import * as m6 from "./attribute-set/yaml-encoder.js";
import * as m7 from "./attribute.js";
import * as m8 from "./attribute/user-provided-default.js";
import * as m9 from "./attributes.js";
import * as m10 from "./conversion.js";
import * as m11 from "./error.js";
import * as m12 from "./errors.js";
import * as m13 from "./forbidden-attributes-protection.js";
import * as m14 from "./gem-version.js";
import * as m15 from "./model.js";
import * as m16 from "./naming.js";
import * as m17 from "./nested-error.js";
import * as m18 from "./secure-password.js";
import * as m19 from "./serializers/json.js";
import * as m20 from "./type/big-integer.js";
import * as m21 from "./type/binary.js";
import * as m22 from "./type/boolean.js";
import * as m23 from "./type/date-time.js";
import * as m24 from "./type/date.js";
import * as m25 from "./type/decimal.js";
import * as m26 from "./type/float.js";
import * as m27 from "./type/helpers/accepts-multiparameter-time.js";
import * as m28 from "./type/helpers/mutable.js";
import * as m29 from "./type/helpers/time-value.js";
import * as m30 from "./type/immutable-string.js";
import * as m31 from "./type/integer.js";
import * as m32 from "./type/registry.js";
import * as m33 from "./type/serialize-cast-value.js";
import * as m34 from "./type/string.js";
import * as m35 from "./type/time.js";
import * as m36 from "./type/value.js";
import * as m37 from "./validations.js";
import * as m38 from "./validations/absence.js";
import * as m39 from "./validations/acceptance.js";
import * as m40 from "./validations/callbacks.js";
import * as m41 from "./validations/comparison.js";
import * as m42 from "./validations/confirmation.js";
import * as m43 from "./validations/exclusion.js";
import * as m44 from "./validations/format.js";
import * as m45 from "./validations/inclusion.js";
import * as m46 from "./validations/length.js";
import * as m47 from "./validations/numericality.js";
import * as m48 from "./validations/presence.js";
import * as m49 from "./validations/with.js";
import * as m50 from "./validator.js";

registerClassPaths([
  [() => m0.API, "ActiveModel::API"],
  [() => m7.Attribute, "ActiveModel::Attribute"],
  [() => m7.FromDatabase, "ActiveModel::Attribute::FromDatabase"],
  [() => m7.FromUser, "ActiveModel::Attribute::FromUser"],
  [() => m7.Null, "ActiveModel::Attribute::Null"],
  [() => m7.Uninitialized, "ActiveModel::Attribute::Uninitialized"],
  [() => m8.UserProvidedDefault, "ActiveModel::Attribute::UserProvidedDefault"],
  [() => m7.WithCastValue, "ActiveModel::Attribute::WithCastValue"],
  [() => m1.AttributeMethods, "ActiveModel::AttributeMethods"],
  [() => m1.ClassMethods, "ActiveModel::AttributeMethods::ClassMethods"],
  [
    () => m1.AttributeMethodPattern,
    "ActiveModel::AttributeMethods::ClassMethods::AttributeMethodPattern",
  ],
  [
    () => m1.AttributeMethod,
    "ActiveModel::AttributeMethods::ClassMethods::AttributeMethodPattern::AttributeMethod",
  ],
  [() => m2.AttributeMutationTracker, "ActiveModel::AttributeMutationTracker"],
  [() => m3.AttributeRegistration, "ActiveModel::AttributeRegistration"],
  [() => m3.ClassMethods, "ActiveModel::AttributeRegistration::ClassMethods"],
  [() => m3.PendingDecorator, "ActiveModel::AttributeRegistration::ClassMethods::PendingDecorator"],
  [() => m3.PendingDefault, "ActiveModel::AttributeRegistration::ClassMethods::PendingDefault"],
  [() => m3.PendingType, "ActiveModel::AttributeRegistration::ClassMethods::PendingType"],
  [() => m9.Attributes, "ActiveModel::Attributes"],
  [() => m9.ClassMethods, "ActiveModel::Attributes::ClassMethods"],
  [() => m4.AttributeSet, "ActiveModel::AttributeSet"],
  [() => m5.Builder, "ActiveModel::AttributeSet::Builder"],
  [() => m6.YAMLEncoder, "ActiveModel::AttributeSet::YAMLEncoder"],
  [() => m50.BlockValidator, "ActiveModel::BlockValidator"],
  [() => m10.Conversion, "ActiveModel::Conversion"],
  [() => m10.ClassMethods, "ActiveModel::Conversion::ClassMethods"],
  [() => m50.EachValidator, "ActiveModel::EachValidator"],
  [() => m11.Error, "ActiveModel::Error"],
  [() => m12.Errors, "ActiveModel::Errors"],
  [() => m13.ForbiddenAttributesError, "ActiveModel::ForbiddenAttributesError"],
  [() => m13.ForbiddenAttributesProtection, "ActiveModel::ForbiddenAttributesProtection"],
  [() => m2.ForcedMutationTracker, "ActiveModel::ForcedMutationTracker"],
  [() => m5.LazyAttributeHash, "ActiveModel::LazyAttributeHash"],
  [() => m5.LazyAttributeSet, "ActiveModel::LazyAttributeSet"],
  [() => m1.MissingAttributeError, "ActiveModel::MissingAttributeError"],
  [() => m15.Model, "ActiveModel::Model"],
  [() => m16.ModelName, "ActiveModel::Name"],
  [() => m17.NestedError, "ActiveModel::NestedError"],
  [() => m2.NullMutationTracker, "ActiveModel::NullMutationTracker"],
  [() => m12.RangeError, "ActiveModel::RangeError"],
  [() => m18.SecurePassword, "ActiveModel::SecurePassword"],
  [
    () => m18.InstanceMethodsOnActivation,
    "ActiveModel::SecurePassword::InstanceMethodsOnActivation",
  ],
  [() => m19.JSON, "ActiveModel::Serializers::JSON"],
  [() => m12.StrictValidationFailed, "ActiveModel::StrictValidationFailed"],
  [() => m20.BigIntegerType, "ActiveModel::Type::BigInteger"],
  [() => m21.BinaryType, "ActiveModel::Type::Binary"],
  [() => m21.Data, "ActiveModel::Type::Binary::Data"],
  [() => m22.BooleanType, "ActiveModel::Type::Boolean"],
  [() => m24.DateType, "ActiveModel::Type::Date"],
  [() => m23.DateTimeType, "ActiveModel::Type::DateTime"],
  [() => m25.DecimalType, "ActiveModel::Type::Decimal"],
  [() => m26.FloatType, "ActiveModel::Type::Float"],
  [() => m27.AcceptsMultiparameterTime, "ActiveModel::Type::Helpers::AcceptsMultiparameterTime"],
  [
    () => m27.InstanceMethods,
    "ActiveModel::Type::Helpers::AcceptsMultiparameterTime::InstanceMethods",
  ],
  [() => m28.Mutable, "ActiveModel::Type::Helpers::Mutable"],
  [() => m29.TimeValue, "ActiveModel::Type::Helpers::TimeValue"],
  [() => m30.ImmutableStringType, "ActiveModel::Type::ImmutableString"],
  [() => m31.IntegerType, "ActiveModel::Type::Integer"],
  [() => m32.TypeRegistry, "ActiveModel::Type::Registry"],
  [() => m33.ClassMethods, "ActiveModel::Type::SerializeCastValue::ClassMethods"],
  [() => m33.DefaultImplementation, "ActiveModel::Type::SerializeCastValue::DefaultImplementation"],
  [() => m34.StringType, "ActiveModel::Type::String"],
  [() => m35.TimeType, "ActiveModel::Type::Time"],
  [() => m36.ValueType, "ActiveModel::Type::Value"],
  [() => m12.UnknownAttributeError, "ActiveModel::UnknownAttributeError"],
  [() => m37.ValidationContext, "ActiveModel::ValidationContext"],
  [() => m37.ValidationError, "ActiveModel::ValidationError"],
  [() => m38.AbsenceValidator, "ActiveModel::Validations::AbsenceValidator"],
  [() => m39.AcceptanceValidator, "ActiveModel::Validations::AcceptanceValidator"],
  [
    () => m39.LazilyDefineAttributes,
    "ActiveModel::Validations::AcceptanceValidator::LazilyDefineAttributes",
  ],
  [() => m40.Callbacks, "ActiveModel::Validations::Callbacks"],
  [() => m40.ClassMethods, "ActiveModel::Validations::Callbacks::ClassMethods"],
  [() => m37.ClassMethods, "ActiveModel::Validations::ClassMethods"],
  [() => m41.ComparisonValidator, "ActiveModel::Validations::ComparisonValidator"],
  [() => m42.ConfirmationValidator, "ActiveModel::Validations::ConfirmationValidator"],
  [() => m43.ExclusionValidator, "ActiveModel::Validations::ExclusionValidator"],
  [() => m44.FormatValidator, "ActiveModel::Validations::FormatValidator"],
  [() => m38.HelperMethods, "ActiveModel::Validations::HelperMethods"],
  [() => m45.InclusionValidator, "ActiveModel::Validations::InclusionValidator"],
  [() => m46.LengthValidator, "ActiveModel::Validations::LengthValidator"],
  [() => m47.NumericalityValidator, "ActiveModel::Validations::NumericalityValidator"],
  [() => m48.PresenceValidator, "ActiveModel::Validations::PresenceValidator"],
  [() => m49.WithValidator, "ActiveModel::Validations::WithValidator"],
  [() => m50.Validator, "ActiveModel::Validator"],
  [() => m14.VERSION, "ActiveModel::VERSION"],
]);

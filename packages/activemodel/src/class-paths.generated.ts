import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./access.js";
import * as m1 from "./api.js";
import * as m2 from "./attribute-methods.js";
import * as m3 from "./attribute-mutation-tracker.js";
import * as m4 from "./attribute-registration.js";
import * as m5 from "./attribute-set.js";
import * as m6 from "./attribute-set/builder.js";
import * as m7 from "./attribute-set/yaml-encoder.js";
import * as m8 from "./attribute.js";
import * as m9 from "./attribute/user-provided-default.js";
import * as m10 from "./attributes.js";
import * as m11 from "./callbacks.js";
import * as m12 from "./conversion.js";
import * as m13 from "./dirty.js";
import * as m14 from "./error.js";
import * as m15 from "./errors.js";
import * as m16 from "./forbidden-attributes-protection.js";
import * as m17 from "./gem-version.js";
import * as m18 from "./lint.js";
import * as m19 from "./model.js";
import * as m20 from "./naming.js";
import * as m21 from "./nested-error.js";
import * as m22 from "./secure-password.js";
import * as m23 from "./serialization.js";
import * as m24 from "./serializers/json.js";
import * as m25 from "./translation.js";
import * as m26 from "./type/big-integer.js";
import * as m27 from "./type/binary.js";
import * as m28 from "./type/boolean.js";
import * as m29 from "./type/date-time.js";
import * as m30 from "./type/date.js";
import * as m31 from "./type/decimal.js";
import * as m32 from "./type/float.js";
import * as m33 from "./type/helpers/accepts-multiparameter-time.js";
import * as m34 from "./type/helpers/mutable.js";
import * as m35 from "./type/helpers/time-value.js";
import * as m36 from "./type/helpers/timezone.js";
import * as m37 from "./type/immutable-string.js";
import * as m38 from "./type/integer.js";
import * as m39 from "./type/registry.js";
import * as m40 from "./type/serialize-cast-value.js";
import * as m41 from "./type/string.js";
import * as m42 from "./type/time.js";
import * as m43 from "./type/value.js";
import * as m44 from "./validations.js";
import * as m45 from "./validations/absence.js";
import * as m46 from "./validations/acceptance.js";
import * as m47 from "./validations/callbacks.js";
import * as m48 from "./validations/comparison.js";
import * as m49 from "./validations/confirmation.js";
import * as m50 from "./validations/exclusion.js";
import * as m51 from "./validations/format.js";
import * as m52 from "./validations/inclusion.js";
import * as m53 from "./validations/length.js";
import * as m54 from "./validations/numericality.js";
import * as m55 from "./validations/presence.js";
import * as m56 from "./validations/with.js";
import * as m57 from "./validator.js";

registerClassPaths([
  [() => m0.Access, "ActiveModel::Access"],
  [() => m1.API, "ActiveModel::API"],
  [() => m8.Attribute, "ActiveModel::Attribute"],
  [() => m8.FromDatabase, "ActiveModel::Attribute::FromDatabase"],
  [() => m8.FromUser, "ActiveModel::Attribute::FromUser"],
  [() => m8.Null, "ActiveModel::Attribute::Null"],
  [() => m8.Uninitialized, "ActiveModel::Attribute::Uninitialized"],
  [() => m9.UserProvidedDefault, "ActiveModel::Attribute::UserProvidedDefault"],
  [() => m8.WithCastValue, "ActiveModel::Attribute::WithCastValue"],
  [() => m2.AttributeMethods, "ActiveModel::AttributeMethods"],
  [() => m2.AttrNames, "ActiveModel::AttributeMethods::AttrNames"],
  [() => m2.ClassMethods, "ActiveModel::AttributeMethods::ClassMethods"],
  [
    () => m2.AttributeMethodPattern,
    "ActiveModel::AttributeMethods::ClassMethods::AttributeMethodPattern",
  ],
  [
    () => m2.AttributeMethod,
    "ActiveModel::AttributeMethods::ClassMethods::AttributeMethodPattern::AttributeMethod",
  ],
  [() => m3.AttributeMutationTracker, "ActiveModel::AttributeMutationTracker"],
  [() => m4.AttributeRegistration, "ActiveModel::AttributeRegistration"],
  [() => m4.ClassMethods, "ActiveModel::AttributeRegistration::ClassMethods"],
  [() => m4.PendingDecorator, "ActiveModel::AttributeRegistration::ClassMethods::PendingDecorator"],
  [() => m4.PendingDefault, "ActiveModel::AttributeRegistration::ClassMethods::PendingDefault"],
  [() => m4.PendingType, "ActiveModel::AttributeRegistration::ClassMethods::PendingType"],
  [() => m10.Attributes, "ActiveModel::Attributes"],
  [() => m10.ClassMethods, "ActiveModel::Attributes::ClassMethods"],
  [() => m5.AttributeSet, "ActiveModel::AttributeSet"],
  [() => m6.Builder, "ActiveModel::AttributeSet::Builder"],
  [() => m7.YAMLEncoder, "ActiveModel::AttributeSet::YAMLEncoder"],
  [() => m57.BlockValidator, "ActiveModel::BlockValidator"],
  [() => m11.Callbacks, "ActiveModel::Callbacks"],
  [() => m12.Conversion, "ActiveModel::Conversion"],
  [() => m12.ClassMethods, "ActiveModel::Conversion::ClassMethods"],
  [() => m13.Dirty, "ActiveModel::Dirty"],
  [() => m57.EachValidator, "ActiveModel::EachValidator"],
  [() => m14.Error, "ActiveModel::Error"],
  [() => m15.Errors, "ActiveModel::Errors"],
  [() => m16.ForbiddenAttributesError, "ActiveModel::ForbiddenAttributesError"],
  [() => m16.ForbiddenAttributesProtection, "ActiveModel::ForbiddenAttributesProtection"],
  [() => m3.ForcedMutationTracker, "ActiveModel::ForcedMutationTracker"],
  [() => m6.LazyAttributeHash, "ActiveModel::LazyAttributeHash"],
  [() => m6.LazyAttributeSet, "ActiveModel::LazyAttributeSet"],
  [() => m18.Tests, "ActiveModel::Lint::Tests"],
  [() => m2.MissingAttributeError, "ActiveModel::MissingAttributeError"],
  [() => m19.Model, "ActiveModel::Model"],
  [() => m20.ModelName, "ActiveModel::Name"],
  [() => m20.Naming, "ActiveModel::Naming"],
  [() => m21.NestedError, "ActiveModel::NestedError"],
  [() => m3.NullMutationTracker, "ActiveModel::NullMutationTracker"],
  [() => m15.RangeError, "ActiveModel::RangeError"],
  [() => m22.SecurePassword, "ActiveModel::SecurePassword"],
  [
    () => m22.InstanceMethodsOnActivation,
    "ActiveModel::SecurePassword::InstanceMethodsOnActivation",
  ],
  [() => m23.Serialization, "ActiveModel::Serialization"],
  [() => m24.JSON, "ActiveModel::Serializers::JSON"],
  [() => m15.StrictValidationFailed, "ActiveModel::StrictValidationFailed"],
  [() => m25.Translation, "ActiveModel::Translation"],
  [() => m26.BigIntegerType, "ActiveModel::Type::BigInteger"],
  [() => m27.BinaryType, "ActiveModel::Type::Binary"],
  [() => m27.Data, "ActiveModel::Type::Binary::Data"],
  [() => m28.BooleanType, "ActiveModel::Type::Boolean"],
  [() => m30.DateType, "ActiveModel::Type::Date"],
  [() => m29.DateTimeType, "ActiveModel::Type::DateTime"],
  [() => m31.DecimalType, "ActiveModel::Type::Decimal"],
  [() => m32.FloatType, "ActiveModel::Type::Float"],
  [() => m33.AcceptsMultiparameterTime, "ActiveModel::Type::Helpers::AcceptsMultiparameterTime"],
  [
    () => m33.InstanceMethods,
    "ActiveModel::Type::Helpers::AcceptsMultiparameterTime::InstanceMethods",
  ],
  [() => m34.Mutable, "ActiveModel::Type::Helpers::Mutable"],
  [() => m35.TimeValue, "ActiveModel::Type::Helpers::TimeValue"],
  [() => m36.Timezone, "ActiveModel::Type::Helpers::Timezone"],
  [() => m37.ImmutableStringType, "ActiveModel::Type::ImmutableString"],
  [() => m38.IntegerType, "ActiveModel::Type::Integer"],
  [() => m39.TypeRegistry, "ActiveModel::Type::Registry"],
  [() => m40.SerializeCastValue, "ActiveModel::Type::SerializeCastValue"],
  [() => m40.ClassMethods, "ActiveModel::Type::SerializeCastValue::ClassMethods"],
  [() => m40.DefaultImplementation, "ActiveModel::Type::SerializeCastValue::DefaultImplementation"],
  [() => m41.StringType, "ActiveModel::Type::String"],
  [() => m42.TimeType, "ActiveModel::Type::Time"],
  [() => m43.ValueType, "ActiveModel::Type::Value"],
  [() => m15.UnknownAttributeError, "ActiveModel::UnknownAttributeError"],
  [() => m44.ValidationContext, "ActiveModel::ValidationContext"],
  [() => m44.ValidationError, "ActiveModel::ValidationError"],
  [() => m44.Validations, "ActiveModel::Validations"],
  [() => m45.AbsenceValidator, "ActiveModel::Validations::AbsenceValidator"],
  [() => m46.AcceptanceValidator, "ActiveModel::Validations::AcceptanceValidator"],
  [
    () => m46.LazilyDefineAttributes,
    "ActiveModel::Validations::AcceptanceValidator::LazilyDefineAttributes",
  ],
  [() => m47.Callbacks, "ActiveModel::Validations::Callbacks"],
  [() => m47.ClassMethods, "ActiveModel::Validations::Callbacks::ClassMethods"],
  [() => m44.ClassMethods, "ActiveModel::Validations::ClassMethods"],
  [() => m48.ComparisonValidator, "ActiveModel::Validations::ComparisonValidator"],
  [() => m49.ConfirmationValidator, "ActiveModel::Validations::ConfirmationValidator"],
  [() => m50.ExclusionValidator, "ActiveModel::Validations::ExclusionValidator"],
  [() => m51.FormatValidator, "ActiveModel::Validations::FormatValidator"],
  [() => m45.HelperMethods, "ActiveModel::Validations::HelperMethods"],
  [() => m52.InclusionValidator, "ActiveModel::Validations::InclusionValidator"],
  [() => m53.LengthValidator, "ActiveModel::Validations::LengthValidator"],
  [() => m54.NumericalityValidator, "ActiveModel::Validations::NumericalityValidator"],
  [() => m55.PresenceValidator, "ActiveModel::Validations::PresenceValidator"],
  [() => m56.WithValidator, "ActiveModel::Validations::WithValidator"],
  [() => m57.Validator, "ActiveModel::Validator"],
  [() => m17.VERSION, "ActiveModel::VERSION"],
]);

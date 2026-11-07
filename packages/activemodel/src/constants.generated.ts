import { defineConstants } from "@blazetrails/ruby-compat";
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
import * as m26 from "./type.js";
import * as m27 from "./type/big-integer.js";
import * as m28 from "./type/binary.js";
import * as m29 from "./type/boolean.js";
import * as m30 from "./type/date-time.js";
import * as m31 from "./type/date.js";
import * as m32 from "./type/decimal.js";
import * as m33 from "./type/float.js";
import * as m34 from "./type/helpers/accepts-multiparameter-time.js";
import * as m35 from "./type/helpers/mutable.js";
import * as m36 from "./type/helpers/time-value.js";
import * as m37 from "./type/helpers/timezone.js";
import * as m38 from "./type/immutable-string.js";
import * as m39 from "./type/integer.js";
import * as m40 from "./type/registry.js";
import * as m41 from "./type/serialize-cast-value.js";
import * as m42 from "./type/string.js";
import * as m43 from "./type/time.js";
import * as m44 from "./type/value.js";
import * as m45 from "./validations.js";
import * as m46 from "./validations/absence.js";
import * as m47 from "./validations/acceptance.js";
import * as m48 from "./validations/callbacks.js";
import * as m49 from "./validations/comparison.js";
import * as m50 from "./validations/confirmation.js";
import * as m51 from "./validations/exclusion.js";
import * as m52 from "./validations/format.js";
import * as m53 from "./validations/helper-methods.js";
import * as m54 from "./validations/inclusion.js";
import * as m55 from "./validations/length.js";
import * as m56 from "./validations/numericality.js";
import * as m57 from "./validations/presence.js";
import * as m58 from "./validations/with.js";
import * as m59 from "./validator.js";

defineConstants([
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
  [() => m59.BlockValidator, "ActiveModel::BlockValidator"],
  [() => m11.Callbacks, "ActiveModel::Callbacks"],
  [() => m12.Conversion, "ActiveModel::Conversion"],
  [() => m12.ClassMethods, "ActiveModel::Conversion::ClassMethods"],
  [() => m13.Dirty, "ActiveModel::Dirty"],
  [() => m59.EachValidator, "ActiveModel::EachValidator"],
  [() => m14.Error, "ActiveModel::Error"],
  [() => m15.Errors, "ActiveModel::Errors"],
  [() => m16.ForbiddenAttributesError, "ActiveModel::ForbiddenAttributesError"],
  [() => m16.ForbiddenAttributesProtection, "ActiveModel::ForbiddenAttributesProtection"],
  [() => m3.ForcedMutationTracker, "ActiveModel::ForcedMutationTracker"],
  [() => m6.LazyAttributeHash, "ActiveModel::LazyAttributeHash"],
  [() => m6.LazyAttributeSet, "ActiveModel::LazyAttributeSet"],
  [() => m18, "ActiveModel::Lint"],
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
  [() => m26, "ActiveModel::Type"],
  [() => m27.BigIntegerType, "ActiveModel::Type::BigInteger"],
  [() => m28.BinaryType, "ActiveModel::Type::Binary"],
  [() => m28.Data, "ActiveModel::Type::Binary::Data"],
  [() => m29.BooleanType, "ActiveModel::Type::Boolean"],
  [() => m31.DateType, "ActiveModel::Type::Date"],
  [() => m30.DateTimeType, "ActiveModel::Type::DateTime"],
  [() => m32.DecimalType, "ActiveModel::Type::Decimal"],
  [() => m33.FloatType, "ActiveModel::Type::Float"],
  [() => m34.AcceptsMultiparameterTime, "ActiveModel::Type::Helpers::AcceptsMultiparameterTime"],
  [
    () => m34.InstanceMethods,
    "ActiveModel::Type::Helpers::AcceptsMultiparameterTime::InstanceMethods",
  ],
  [() => m35.Mutable, "ActiveModel::Type::Helpers::Mutable"],
  [() => m36.TimeValue, "ActiveModel::Type::Helpers::TimeValue"],
  [() => m37.Timezone, "ActiveModel::Type::Helpers::Timezone"],
  [() => m38.ImmutableStringType, "ActiveModel::Type::ImmutableString"],
  [() => m39.IntegerType, "ActiveModel::Type::Integer"],
  [() => m40.TypeRegistry, "ActiveModel::Type::Registry"],
  [() => m41.SerializeCastValue, "ActiveModel::Type::SerializeCastValue"],
  [() => m41.ClassMethods, "ActiveModel::Type::SerializeCastValue::ClassMethods"],
  [() => m41.DefaultImplementation, "ActiveModel::Type::SerializeCastValue::DefaultImplementation"],
  [() => m42.StringType, "ActiveModel::Type::String"],
  [() => m43.TimeType, "ActiveModel::Type::Time"],
  [() => m44.ValueType, "ActiveModel::Type::Value"],
  [() => m15.UnknownAttributeError, "ActiveModel::UnknownAttributeError"],
  [() => m45.ValidationContext, "ActiveModel::ValidationContext"],
  [() => m45.ValidationError, "ActiveModel::ValidationError"],
  [() => m45.Validations, "ActiveModel::Validations"],
  [() => m46.AbsenceValidator, "ActiveModel::Validations::AbsenceValidator"],
  [() => m47.AcceptanceValidator, "ActiveModel::Validations::AcceptanceValidator"],
  [
    () => m47.LazilyDefineAttributes,
    "ActiveModel::Validations::AcceptanceValidator::LazilyDefineAttributes",
  ],
  [() => m48.Callbacks, "ActiveModel::Validations::Callbacks"],
  [() => m48.ClassMethods, "ActiveModel::Validations::Callbacks::ClassMethods"],
  [() => m45.ClassMethods, "ActiveModel::Validations::ClassMethods"],
  [() => m49.ComparisonValidator, "ActiveModel::Validations::ComparisonValidator"],
  [() => m50.ConfirmationValidator, "ActiveModel::Validations::ConfirmationValidator"],
  [() => m51.ExclusionValidator, "ActiveModel::Validations::ExclusionValidator"],
  [() => m52.FormatValidator, "ActiveModel::Validations::FormatValidator"],
  [() => m53.HelperMethods, "ActiveModel::Validations::HelperMethods"],
  [() => m54.InclusionValidator, "ActiveModel::Validations::InclusionValidator"],
  [() => m55.LengthValidator, "ActiveModel::Validations::LengthValidator"],
  [() => m56.NumericalityValidator, "ActiveModel::Validations::NumericalityValidator"],
  [() => m57.PresenceValidator, "ActiveModel::Validations::PresenceValidator"],
  [() => m58.WithValidator, "ActiveModel::Validations::WithValidator"],
  [() => m59.Validator, "ActiveModel::Validator"],
  [() => m17.VERSION, "ActiveModel::VERSION"],
]);

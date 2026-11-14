import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./access.js";
import * as m1 from "./api.js";
import * as m2 from "./attribute-assignment.js";
import * as m3 from "./attribute-methods.js";
import * as m4 from "./attribute-mutation-tracker.js";
import * as m5 from "./attribute-registration.js";
import * as m6 from "./attribute-set.js";
import * as m7 from "./attribute-set/builder.js";
import * as m8 from "./attribute-set/yaml-encoder.js";
import * as m9 from "./attribute.js";
import * as m10 from "./attribute/user-provided-default.js";
import * as m11 from "./attributes.js";
import * as m12 from "./callbacks.js";
import * as m13 from "./conversion.js";
import * as m14 from "./dirty.js";
import * as m15 from "./error.js";
import * as m16 from "./errors.js";
import * as m17 from "./forbidden-attributes-protection.js";
import * as m18 from "./gem-version.js";
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
import * as m49 from "./validations/clusivity.js";
import * as m50 from "./validations/comparability.js";
import * as m51 from "./validations/comparison.js";
import * as m52 from "./validations/confirmation.js";
import * as m53 from "./validations/exclusion.js";
import * as m54 from "./validations/format.js";
import * as m55 from "./validations/helper-methods.js";
import * as m56 from "./validations/inclusion.js";
import * as m57 from "./validations/length.js";
import * as m58 from "./validations/numericality.js";
import * as m59 from "./validations/presence.js";
import * as m60 from "./validations/resolve-value.js";
import * as m61 from "./validations/with.js";
import * as m62 from "./validator.js";

defineConstants([
  [() => m0.Access, "ActiveModel::Access"],
  [() => m1.API, "ActiveModel::API"],
  [() => m9.Attribute, "ActiveModel::Attribute"],
  [() => m9.FromDatabase, "ActiveModel::Attribute::FromDatabase"],
  [() => m9.FromUser, "ActiveModel::Attribute::FromUser"],
  [() => m9.Null, "ActiveModel::Attribute::Null"],
  [() => m9.Uninitialized, "ActiveModel::Attribute::Uninitialized"],
  [() => m10.UserProvidedDefault, "ActiveModel::Attribute::UserProvidedDefault"],
  [() => m9.WithCastValue, "ActiveModel::Attribute::WithCastValue"],
  [() => m2.AttributeAssignment, "ActiveModel::AttributeAssignment"],
  [() => m3.AttributeMethods, "ActiveModel::AttributeMethods"],
  [() => m3.AttrNames, "ActiveModel::AttributeMethods::AttrNames"],
  [() => m3.ClassMethods, "ActiveModel::AttributeMethods::ClassMethods"],
  [
    () => m3.AttributeMethodPattern,
    "ActiveModel::AttributeMethods::ClassMethods::AttributeMethodPattern",
  ],
  [
    () => m3.AttributeMethod,
    "ActiveModel::AttributeMethods::ClassMethods::AttributeMethodPattern::AttributeMethod",
  ],
  [() => m4.AttributeMutationTracker, "ActiveModel::AttributeMutationTracker"],
  [() => m5.AttributeRegistration, "ActiveModel::AttributeRegistration"],
  [() => m5.ClassMethods, "ActiveModel::AttributeRegistration::ClassMethods"],
  [() => m5.PendingDecorator, "ActiveModel::AttributeRegistration::ClassMethods::PendingDecorator"],
  [() => m5.PendingDefault, "ActiveModel::AttributeRegistration::ClassMethods::PendingDefault"],
  [() => m5.PendingType, "ActiveModel::AttributeRegistration::ClassMethods::PendingType"],
  [() => m11.Attributes, "ActiveModel::Attributes"],
  [() => m11.ClassMethods, "ActiveModel::Attributes::ClassMethods"],
  [() => m6.AttributeSet, "ActiveModel::AttributeSet"],
  [() => m7.Builder, "ActiveModel::AttributeSet::Builder"],
  [() => m8.YAMLEncoder, "ActiveModel::AttributeSet::YAMLEncoder"],
  [() => m62.BlockValidator, "ActiveModel::BlockValidator"],
  [() => m12.Callbacks, "ActiveModel::Callbacks"],
  [() => m13.Conversion, "ActiveModel::Conversion"],
  [() => m13.ClassMethods, "ActiveModel::Conversion::ClassMethods"],
  [() => m14.Dirty, "ActiveModel::Dirty"],
  [() => m62.EachValidator, "ActiveModel::EachValidator"],
  [() => m15.Error, "ActiveModel::Error"],
  [() => m16.Errors, "ActiveModel::Errors"],
  [() => m17.ForbiddenAttributesError, "ActiveModel::ForbiddenAttributesError"],
  [() => m17.ForbiddenAttributesProtection, "ActiveModel::ForbiddenAttributesProtection"],
  [() => m4.ForcedMutationTracker, "ActiveModel::ForcedMutationTracker"],
  [() => m7.LazyAttributeHash, "ActiveModel::LazyAttributeHash"],
  [() => m7.LazyAttributeSet, "ActiveModel::LazyAttributeSet"],
  [() => m3.MissingAttributeError, "ActiveModel::MissingAttributeError"],
  [() => m19.Model, "ActiveModel::Model"],
  [() => m20.ModelName, "ActiveModel::Name"],
  [() => m20.Naming, "ActiveModel::Naming"],
  [() => m21.NestedError, "ActiveModel::NestedError"],
  [() => m4.NullMutationTracker, "ActiveModel::NullMutationTracker"],
  [() => m16.RangeError, "ActiveModel::RangeError"],
  [() => m22.SecurePassword, "ActiveModel::SecurePassword"],
  [
    () => m22.InstanceMethodsOnActivation,
    "ActiveModel::SecurePassword::InstanceMethodsOnActivation",
  ],
  [() => m23.Serialization, "ActiveModel::Serialization"],
  [() => m24.JSON, "ActiveModel::Serializers::JSON"],
  [() => m16.StrictValidationFailed, "ActiveModel::StrictValidationFailed"],
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
  [() => m16.UnknownAttributeError, "ActiveModel::UnknownAttributeError"],
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
  [() => m49.Clusivity, "ActiveModel::Validations::Clusivity"],
  [() => m50.Comparability, "ActiveModel::Validations::Comparability"],
  [() => m51.ComparisonValidator, "ActiveModel::Validations::ComparisonValidator"],
  [() => m52.ConfirmationValidator, "ActiveModel::Validations::ConfirmationValidator"],
  [() => m53.ExclusionValidator, "ActiveModel::Validations::ExclusionValidator"],
  [() => m54.FormatValidator, "ActiveModel::Validations::FormatValidator"],
  [() => m55.HelperMethods, "ActiveModel::Validations::HelperMethods"],
  [() => m56.InclusionValidator, "ActiveModel::Validations::InclusionValidator"],
  [() => m57.LengthValidator, "ActiveModel::Validations::LengthValidator"],
  [() => m58.NumericalityValidator, "ActiveModel::Validations::NumericalityValidator"],
  [() => m59.PresenceValidator, "ActiveModel::Validations::PresenceValidator"],
  [() => m60.ResolveValue, "ActiveModel::Validations::ResolveValue"],
  [() => m61.WithValidator, "ActiveModel::Validations::WithValidator"],
  [() => m62.Validator, "ActiveModel::Validator"],
  [() => m18.VERSION, "ActiveModel::VERSION"],
]);

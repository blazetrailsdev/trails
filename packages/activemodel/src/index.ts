export { Model } from "./model.js";
export { I18n } from "./i18n.js";
export { Error } from "./error.js";
export { deprecator, Deprecator } from "./deprecator.js";
export { Errors, StrictValidationFailed, UnknownAttributeError, RangeError } from "./errors.js";
export { NestedError } from "./nested-error.js";
export { ValidationError, ValidationContext } from "./validations.js";
export type { ModelWithErrors } from "./validations.js";
export { Validator, EachValidator, BlockValidator } from "./validator.js";
export { MissingAttributeError, AttributeMethodPattern, AttrNames } from "./attribute-methods.js";
export * as AttributeMethods from "./attribute-methods.js";
export type { InstanceHost } from "./attribute-methods.js";
export {
  ForbiddenAttributesError,
  sanitizeForMassAssignment,
} from "./forbidden-attributes-protection.js";
export {
  assignAttributes,
  assertAssignedSynchronously,
  attributeWriterMissing,
  isMassAssignmentEmpty,
  ArgumentError,
  NoMethodError,
  RuntimeError,
} from "./attribute-assignment.js";
export type { AttributeAssignment } from "./attribute-assignment.js";
export {
  AttributeMutationTracker,
  ForcedMutationTracker,
  NullMutationTracker,
} from "./attribute-mutation-tracker.js";
export { AttributeRegistration, PendingDefault, PendingType } from "./attribute-registration.js";
export { Attributes } from "./attributes.js";
export type {
  AttributeOptions,
  AttributesClassHalf,
  AttributeMethodsClassHalf,
  AttributeRegistrationClassHalf,
} from "./attributes.js";
export {
  Attribute,
  FromDatabase,
  FromUser,
  WithCastValue,
  UNINITIALIZED_ORIGINAL_VALUE,
} from "./attribute.js";
export { UserProvidedDefault } from "./attribute/user-provided-default.js";
export { AttributeSet } from "./attribute-set.js";
export { LazyAttributeSet, LazyAttributeHash } from "./attribute-set/builder.js";
export { YAMLEncoder } from "./attribute-set/yaml-encoder.js";
export { AttributeSetCodecError } from "./attribute-set/codecs/codec.js";
export type {
  AttributeSetCodec,
  AttributeSetCoder,
  AttributeSetEnvelope,
} from "./attribute-set/codecs/codec.js";
export { jsonCodec } from "./attribute-set/codecs/json.js";
export { WithValidator } from "./validations/with.js";
export { AbsenceValidator } from "./validations/absence.js";
export type { AttrNameArg } from "./validations/helper-methods.js";
export { Callbacks as ValidationsCallbacks } from "./validations/callbacks.js";
export { PresenceValidator } from "./validations/presence.js";
export { LengthValidator } from "./validations/length.js";
export { NumericalityValidator } from "./validations/numericality.js";
export { AcceptsMultiparameterTime } from "./type/helpers/accepts-multiparameter-time.js";
export { MutableModule } from "./type/helpers/mutable.js";
export type { Mutable } from "./type/helpers/mutable.js";
export { ModelName } from "./naming.js";
export type { ModelLike } from "./naming.js";
/** @noRailsEquivalent PERMANENT */
export { Dirty, initAttributes as dirtyInitAttributes } from "./dirty.js";
export type { DirtyOptions } from "./dirty.js";
export type {
  CallbackConditions,
  CallbackObject,
  TransactionalCallbackConditions,
} from "./callbacks.js";
export { serializableHash } from "./serialization.js";
export type { SerializeOptions, SerializableHash } from "./serialization.js";

export { JSON as JSONSerializer } from "./serializers/json.js";
export { Type } from "./type/value.js";
/** @noRailsEquivalent PERMANENT */
export { typeRegistry } from "./type/registry.js";

export { StringType } from "./type/string.js";
export { IntegerType } from "./type/integer.js";
export { FloatType } from "./type/float.js";
export { BooleanType } from "./type/boolean.js";
export { DateType } from "./type/date.js";
export type { DateCastResult } from "./type/date.js";
export { DateTimeType } from "./type/date-time.js";
export type { DateTimeCastResult } from "./type/date-time.js";
export { DecimalType } from "./type/decimal.js";
export { BigIntegerType } from "./type/big-integer.js";
export { ImmutableStringType } from "./type/immutable-string.js";
export { ValueType } from "./type/value.js";
export { BinaryType, Data as BinaryData } from "./type/binary.js";
export { TimeType } from "./type/time.js";
/** @noRailsEquivalent PERMANENT */
export {
  isUtc as isUtcTimezone,
  defaultTimezone as getDefaultTimezone,
} from "./type/helpers/timezone.js";

import { StringType } from "./type/string.js";
import { IntegerType } from "./type/integer.js";
import { FloatType } from "./type/float.js";
import { BooleanType } from "./type/boolean.js";
import { DateType } from "./type/date.js";
import { DateTimeType } from "./type/date-time.js";
import { DecimalType } from "./type/decimal.js";
import { BigIntegerType } from "./type/big-integer.js";
import { ImmutableStringType } from "./type/immutable-string.js";
import { Type as TypeBase, ValueType } from "./type/value.js";
import { BinaryType } from "./type/binary.js";
import { TimeType } from "./type/time.js";
import { typeRegistry } from "./type/registry.js";
export { defaultValue } from "./type.js";

export const Types = {
  Type: TypeBase,
  typeRegistry,
  StringType,
  IntegerType,
  FloatType,
  BooleanType,
  DateType,
  DateTimeType,
  DecimalType,
  BigIntegerType,
  ImmutableStringType,
  ValueType,
  BinaryType,
  TimeType,
};

export {
  hasSecurePassword,
  SecurePassword,
  InstanceMethodsOnActivation,
} from "./secure-password.js";
export { SerializeCastValue } from "./type/serialize-cast-value.js";
export { Builder as AttributeSetBuilder } from "./attribute-set/builder.js";
/** @noRailsEquivalent PERMANENT */
export {
  DateInfinity,
  DateNegativeInfinity,
  isDateInfinity,
  isDateNegativeInfinity,
} from "./type/internal/sentinels.js";
export type {
  DateInfinity as DateInfinityType,
  DateNegativeInfinity as DateNegativeInfinityType,
} from "./type/internal/sentinels.js";

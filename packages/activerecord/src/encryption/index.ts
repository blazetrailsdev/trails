export * from "./errors.js";
export { Message } from "./message.js";
export { Properties } from "./properties.js";
export { Key } from "./key.js";
export { KeyGenerator } from "./key-generator.js";
export { Cipher } from "./cipher/aes256-gcm.js";
export { MessageSerializer } from "./message-serializer.js";
export { Encryptor } from "./encryptor.js";
export type { EncryptorOptions, EncryptorLike, KeyProviderLike } from "./encryptor.js";
export { NullEncryptor } from "./null-encryptor.js";
export { ReadOnlyNullEncryptor } from "./read-only-null-encryptor.js";
export { EncryptingOnlyEncryptor } from "./encrypting-only-encryptor.js";
export { KeyProvider } from "./key-provider.js";
export { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";
export { DeterministicKeyProvider } from "./deterministic-key-provider.js";
export { EnvelopeEncryptionKeyProvider } from "./envelope-encryption-key-provider.js";
export { Scheme } from "./scheme.js";
export type { SchemeOptions } from "./scheme.js";
export { Config } from "./config.js";
export type { Compressor } from "./config.js";
export * from "./context.js";
export { Configurable } from "./configurable.js";
export { Contexts } from "./contexts.js";
export { EncryptedAttributeType } from "./encrypted-attribute-type.js";
export { EncryptableRecord } from "./encryptable-record.js";
export { AutoFilteredParameters } from "./auto-filtered-parameters.js";
export { MessagePackMessageSerializer } from "./message-pack-message-serializer.js";
export {
  ExtendedDeterministicQueries,
  EncryptedQuery,
  RelationQueries,
  CoreQueries,
  AdditionalValue,
  ExtendedEncryptableType,
} from "./extended-deterministic-queries.js";
export {
  ExtendedDeterministicUniquenessValidator,
  EncryptedUniquenessValidator,
} from "./extended-deterministic-uniqueness-validator.js";

// The wiring entry points used by `Base.encrypts` are re-exported here
// so the subpath is the canonical encryption surface.
export {
  encrypts,
  applyPendingEncryptions,
  isEncryptedAttribute,
  defaultEncryptor,
} from "../encryption.js";
export type { Encryptor as LegacyEncryptor, EncryptsOptions } from "../encryption.js";

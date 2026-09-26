import { Autoload, extend, registerConstant, type Extended } from "@blazetrails/activesupport";
import type { AssociationRelation as AssociationRelationClass } from "./association-relation.js";
import type { BelongsToAssociation } from "./associations/belongs-to-association.js";
import type { BelongsToPolymorphicAssociation } from "./associations/belongs-to-polymorphic-association.js";
import type { CollectionProxy } from "./associations/collection-proxy.js";
import type { DisableJoinsAssociationScope } from "./associations/disable-joins-association-scope.js";
import type { HasManyAssociation } from "./associations/has-many-association.js";
import type { HasManyThroughAssociation } from "./associations/has-many-through-association.js";
import type { HasOneAssociation } from "./associations/has-one-association.js";
import type { HasOneThroughAssociation } from "./associations/has-one-through-association.js";
import type { Base } from "./base.js";
import type { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import type { register, resolve } from "./connection-adapters.js";
import type * as ConnectionHandling from "./connection-handling.js";
import type { DisableJoinsAssociationRelation } from "./disable-joins-association-relation.js";
import type { Cipher } from "./encryption/cipher.js";
import type { Configurable } from "./encryption/configurable.js";
import type { Contexts } from "./encryption/contexts.js";
import type { AutoFilteredParameters } from "./encryption/auto-filtered-parameters.js";
import type { Config } from "./encryption/config.js";
import type { Context } from "./encryption/context.js";
import type { DerivedSecretKeyProvider } from "./encryption/derived-secret-key-provider.js";
import type { EncryptableRecord } from "./encryption/encryptable-record.js";
import type { EncryptedAttributeType } from "./encryption/encrypted-attribute-type.js";
import type { EncryptedFixtures } from "./encryption/encrypted-fixtures.js";
import type { EncryptingOnlyEncryptor } from "./encryption/encrypting-only-encryptor.js";
import type { DeterministicKeyProvider } from "./encryption/deterministic-key-provider.js";
import type { Encryptor } from "./encryption/encryptor.js";
import type { EnvelopeEncryptionKeyProvider } from "./encryption/envelope-encryption-key-provider.js";
import type * as Errors from "./encryption/errors.js";
import type { ExtendedDeterministicQueries } from "./encryption/extended-deterministic-queries.js";
import type { ExtendedDeterministicUniquenessValidator } from "./encryption/extended-deterministic-uniqueness-validator.js";
import type { Key } from "./encryption/key.js";
import type { KeyGenerator } from "./encryption/key-generator.js";
import type { KeyProvider } from "./encryption/key-provider.js";
import type { Message } from "./encryption/message.js";
import type { MessageSerializer } from "./encryption/message-serializer.js";
import type { NullEncryptor } from "./encryption/null-encryptor.js";
import type { Properties } from "./encryption/properties.js";
import type { ReadOnlyNullEncryptor } from "./encryption/read-only-null-encryptor.js";
import type { Scheme } from "./encryption/scheme.js";
import type { Fixture } from "./fixtures.js";
import type { IrreversibleMigration, Migration } from "./migration.js";
import type * as ModelSchema from "./model-schema.js";
import type { Relation } from "./relation.js";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

const loadPath: Record<string, () => Promise<unknown>> = {
  "active_record/base": () => import("./base.js"),
  "active_record/associations": () => import("./associations.js"),
  "active_record/connection_adapters": () => import("./connection-adapters.js"),
  "active_record/encryption": () => import("./encryption.js"),
  "active_record/connection_handling": () => import("./connection-handling.js"),
  "active_record/fixtures": () => import("./fixtures.js"),
  "active_record/model_schema": () => import("./model-schema.js"),
  "active_record/association_relation": () => import("./association-relation.js"),
  "active_record/disable_joins_association_relation": () =>
    import("./disable-joins-association-relation.js"),
  "active_record/relation": () => import("./relation.js"),
  "active_record/associations/collection_proxy": () => import("./associations/collection-proxy.js"),
  "active_record/associations/belongs_to_association": () =>
    import("./associations/belongs-to-association.js"),
  "active_record/associations/belongs_to_polymorphic_association": () =>
    import("./associations/belongs-to-polymorphic-association.js"),
  "active_record/associations/has_many_association": () =>
    import("./associations/has-many-association.js"),
  "active_record/associations/has_many_through_association": () =>
    import("./associations/has-many-through-association.js"),
  "active_record/associations/has_one_association": () =>
    import("./associations/has-one-association.js"),
  "active_record/associations/has_one_through_association": () =>
    import("./associations/has-one-through-association.js"),
  "active_record/associations/disable_joins_association_scope": () =>
    import("./associations/disable-joins-association-scope.js"),
  "active_record/encryption/auto_filtered_parameters": () =>
    import("./encryption/auto-filtered-parameters.js"),
  "active_record/encryption/cipher": () => import("./encryption/cipher.js"),
  "active_record/encryption/config": () => import("./encryption/config.js"),
  "active_record/encryption/configurable": () => import("./encryption/configurable.js"),
  "active_record/encryption/context": () => import("./encryption/context.js"),
  "active_record/encryption/contexts": () => import("./encryption/contexts.js"),
  "active_record/encryption/derived_secret_key_provider": () =>
    import("./encryption/derived-secret-key-provider.js"),
  "active_record/encryption/encryptable_record": () => import("./encryption/encryptable-record.js"),
  "active_record/encryption/encrypted_attribute_type": () =>
    import("./encryption/encrypted-attribute-type.js"),
  "active_record/encryption/encrypted_fixtures": () => import("./encryption/encrypted-fixtures.js"),
  "active_record/encryption/encrypting_only_encryptor": () =>
    import("./encryption/encrypting-only-encryptor.js"),
  "active_record/encryption/deterministic_key_provider": () =>
    import("./encryption/deterministic-key-provider.js"),
  "active_record/encryption/encryptor": () => import("./encryption/encryptor.js"),
  "active_record/encryption/envelope_encryption_key_provider": () =>
    import("./encryption/envelope-encryption-key-provider.js"),
  "active_record/encryption/errors": () => import("./encryption/errors.js"),
  "active_record/encryption/extended_deterministic_queries": () =>
    import("./encryption/extended-deterministic-queries.js"),
  "active_record/encryption/extended_deterministic_uniqueness_validator": () =>
    import("./encryption/extended-deterministic-uniqueness-validator.js"),
  "active_record/encryption/key": () => import("./encryption/key.js"),
  "active_record/encryption/key_generator": () => import("./encryption/key-generator.js"),
  "active_record/encryption/key_provider": () => import("./encryption/key-provider.js"),
  "active_record/encryption/message": () => import("./encryption/message.js"),
  "active_record/encryption/message_serializer": () => import("./encryption/message-serializer.js"),
  "active_record/encryption/null_encryptor": () => import("./encryption/null-encryptor.js"),
  "active_record/encryption/properties": () => import("./encryption/properties.js"),
  "active_record/encryption/read_only_null_encryptor": () =>
    import("./encryption/read-only-null-encryptor.js"),
  "active_record/encryption/scheme": () => import("./encryption/scheme.js"),
  "active_record/migration": () => import("./migration.js"),
  "active_record/connection_adapters/abstract/connection_pool": () =>
    import("./connection-adapters/abstract/connection-pool.js"),
};

export const ActiveRecord = { name: "ActiveRecord", loadPath } as AutoloadModule & {
  Base: typeof Base;
  ConnectionHandling: typeof ConnectionHandling;
  Encryption: typeof Encryption;
  Fixture: typeof Fixture;
  Migration: typeof Migration;
  IrreversibleMigration: typeof IrreversibleMigration;
  ModelSchema: typeof ModelSchema;
  AssociationRelation: typeof AssociationRelationClass;
  Associations: typeof Associations;
  ConnectionAdapters: typeof ConnectionAdapters;
  DisableJoinsAssociationRelation: typeof DisableJoinsAssociationRelation;
  Relation: typeof Relation;
  Point: new (x: number, y: number) => { x: number; y: number; equals(other: unknown): boolean };
};
registerConstant("ActiveRecord", ActiveRecord);
extend(ActiveRecord, Autoload);
ActiveRecord.autoload("Base");
ActiveRecord.autoload("ConnectionHandling");
ActiveRecord.autoload("Encryption");
ActiveRecord.autoload("Fixture", "active_record/fixtures");
ActiveRecord.autoload("Migration");
ActiveRecord.autoload("ModelSchema");
ActiveRecord.eagerAutoload(() => {
  ActiveRecord.autoload("AssociationRelation");
  ActiveRecord.autoload("Associations");
  ActiveRecord.autoload("ConnectionAdapters");
  ActiveRecord.autoload("DisableJoinsAssociationRelation");
  ActiveRecord.autoload("Relation");
});

export const Associations = { name: "ActiveRecord::Associations", loadPath } as AutoloadModule & {
  CollectionProxy: typeof CollectionProxy;
  BelongsToAssociation: typeof BelongsToAssociation;
  BelongsToPolymorphicAssociation: typeof BelongsToPolymorphicAssociation;
  HasManyAssociation: typeof HasManyAssociation;
  HasManyThroughAssociation: typeof HasManyThroughAssociation;
  HasOneAssociation: typeof HasOneAssociation;
  HasOneThroughAssociation: typeof HasOneThroughAssociation;
  DisableJoinsAssociationScope: typeof DisableJoinsAssociationScope;
};
extend(Associations, Autoload);
Associations.autoload("CollectionProxy");
Associations.eagerAutoload(() => {
  Associations.autoload("BelongsToAssociation");
  Associations.autoload("BelongsToPolymorphicAssociation");
  Associations.autoload("HasManyAssociation");
  Associations.autoload("HasManyThroughAssociation");
  Associations.autoload("HasOneAssociation");
  Associations.autoload("HasOneThroughAssociation");
  Associations.autoload("DisableJoinsAssociationScope");
});

export const ConnectionAdapters = {
  name: "ActiveRecord::ConnectionAdapters",
  loadPath,
} as AutoloadModule & {
  ConnectionPool: typeof ConnectionPool;
  register: typeof register;
  resolve: typeof resolve;
};
extend(ConnectionAdapters, Autoload);
ConnectionAdapters.autoloadAt("active_record/connection_adapters/abstract/connection_pool", () => {
  ConnectionAdapters.autoload("ConnectionPool");
});

export const Encryption = { name: "ActiveRecord::Encryption", loadPath } as AutoloadModule & {
  AutoFilteredParameters: typeof AutoFilteredParameters;
  Cipher: typeof Cipher;
  Config: typeof Config;
  Configurable: typeof Configurable;
  Context: typeof Context;
  Contexts: typeof Contexts;
  DerivedSecretKeyProvider: typeof DerivedSecretKeyProvider;
  EncryptableRecord: typeof EncryptableRecord;
  EncryptedAttributeType: typeof EncryptedAttributeType;
  EncryptedFixtures: typeof EncryptedFixtures;
  EncryptingOnlyEncryptor: typeof EncryptingOnlyEncryptor;
  DeterministicKeyProvider: typeof DeterministicKeyProvider;
  Encryptor: typeof Encryptor;
  EnvelopeEncryptionKeyProvider: typeof EnvelopeEncryptionKeyProvider;
  Errors: typeof Errors;
  ExtendedDeterministicQueries: typeof ExtendedDeterministicQueries;
  ExtendedDeterministicUniquenessValidator: typeof ExtendedDeterministicUniquenessValidator;
  Key: typeof Key;
  KeyGenerator: typeof KeyGenerator;
  KeyProvider: typeof KeyProvider;
  Message: typeof Message;
  MessageSerializer: typeof MessageSerializer;
  NullEncryptor: typeof NullEncryptor;
  Properties: typeof Properties;
  ReadOnlyNullEncryptor: typeof ReadOnlyNullEncryptor;
  Scheme: typeof Scheme;
} & Omit<typeof Configurable, "prototype"> &
  Omit<typeof Contexts, "prototype">;
extend(Encryption, Autoload);
Encryption.eagerAutoload(() => {
  Encryption.autoload("AutoFilteredParameters");
  Encryption.autoload("Cipher");
  Encryption.autoload("Config");
  Encryption.autoload("Configurable");
  Encryption.autoload("Context");
  Encryption.autoload("Contexts");
  Encryption.autoload("DerivedSecretKeyProvider");
  Encryption.autoload("EncryptableRecord");
  Encryption.autoload("EncryptedAttributeType");
  Encryption.autoload("EncryptedFixtures");
  Encryption.autoload("EncryptingOnlyEncryptor");
  Encryption.autoload("DeterministicKeyProvider");
  Encryption.autoload("Encryptor");
  Encryption.autoload("EnvelopeEncryptionKeyProvider");
  Encryption.autoload("Errors");
  Encryption.autoload("ExtendedDeterministicQueries");
  Encryption.autoload("ExtendedDeterministicUniquenessValidator");
  Encryption.autoload("Key");
  Encryption.autoload("KeyGenerator");
  Encryption.autoload("KeyProvider");
  Encryption.autoload("Message");
  Encryption.autoload("MessageSerializer");
  Encryption.autoload("NullEncryptor");
  Encryption.autoload("Properties");
  Encryption.autoload("ReadOnlyNullEncryptor");
  Encryption.autoload("Scheme");
});

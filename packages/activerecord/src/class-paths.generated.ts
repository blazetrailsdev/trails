import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./association-relation.js";
import * as m1 from "./associations/alias-tracker.js";
import * as m2 from "./associations/association-scope.js";
import * as m3 from "./associations/association.js";
import * as m4 from "./associations/belongs-to-association.js";
import * as m5 from "./associations/belongs-to-polymorphic-association.js";
import * as m6 from "./associations/builder/association.js";
import * as m7 from "./associations/builder/belongs-to.js";
import * as m8 from "./associations/builder/collection-association.js";
import * as m9 from "./associations/builder/has-and-belongs-to-many.js";
import * as m10 from "./associations/builder/has-many.js";
import * as m11 from "./associations/builder/has-one.js";
import * as m12 from "./associations/builder/singular-association.js";
import * as m13 from "./associations/collection-association.js";
import * as m14 from "./associations/collection-proxy.js";
import * as m15 from "./associations/disable-joins-association-scope.js";
import * as m16 from "./associations/errors.js";
import * as m17 from "./associations/has-many-association.js";
import * as m18 from "./associations/has-many-through-association.js";
import * as m19 from "./associations/has-one-association.js";
import * as m20 from "./associations/has-one-through-association.js";
import * as m21 from "./associations/join-dependency.js";
import * as m22 from "./associations/join-dependency/join-association.js";
import * as m23 from "./associations/join-dependency/join-base.js";
import * as m24 from "./associations/join-dependency/join-part.js";
import * as m25 from "./associations/nested-error.js";
import * as m26 from "./associations/preloader.js";
import * as m27 from "./associations/preloader/association.js";
import * as m28 from "./associations/preloader/batch.js";
import * as m29 from "./associations/preloader/branch.js";
import * as m30 from "./associations/preloader/through-association.js";
import * as m31 from "./associations/singular-association.js";
import * as m32 from "./asynchronous-queries-tracker.js";
import * as m33 from "./attribute-methods.js";
import * as m34 from "./attribute-methods/serialization.js";
import * as m35 from "./attribute-methods/time-zone-conversion.js";
import * as m36 from "./base.js";
import * as m37 from "./coders/column-serializer.js";
import * as m38 from "./coders/yaml-column.js";
import * as m39 from "./connection-adapters/abstract-adapter.js";
import * as m40 from "./connection-adapters/abstract/connection-handler.js";
import * as m41 from "./connection-adapters/abstract/connection-pool.js";
import * as m42 from "./connection-adapters/abstract/connection-pool/queue.js";
import * as m43 from "./connection-adapters/abstract/connection-pool/reaper.js";
import * as m44 from "./connection-adapters/abstract/query-cache.js";
import * as m45 from "./connection-adapters/abstract/schema-creation.js";
import * as m46 from "./connection-adapters/abstract/schema-definitions.js";
import * as m47 from "./connection-adapters/abstract/schema-dumper.js";
import * as m48 from "./connection-adapters/abstract/transaction.js";
import * as m49 from "./connection-adapters/column.js";
import * as m50 from "./connection-adapters/pool-config.js";
import * as m51 from "./connection-adapters/pool-manager.js";
import * as m52 from "./connection-adapters/postgresql/oid/range.js";
import * as m53 from "./connection-adapters/schema-cache.js";
import * as m54 from "./connection-adapters/sql-type-metadata.js";
import * as m55 from "./connection-adapters/statement-pool.js";
import * as m56 from "./core.js";
import * as m57 from "./database-configurations.js";
import * as m58 from "./database-configurations/connection-url-resolver.js";
import * as m59 from "./database-configurations/database-config.js";
import * as m60 from "./database-configurations/hash-config.js";
import * as m61 from "./database-configurations/url-config.js";
import * as m62 from "./disable-joins-association-relation.js";
import * as m63 from "./dynamic-matchers.js";
import * as m64 from "./encryption/auto-filtered-parameters.js";
import * as m65 from "./encryption/cipher.js";
import * as m66 from "./encryption/cipher/aes256-gcm.js";
import * as m67 from "./encryption/config.js";
import * as m68 from "./encryption/context.js";
import * as m69 from "./encryption/derived-secret-key-provider.js";
import * as m70 from "./encryption/deterministic-key-provider.js";
import * as m71 from "./encryption/encrypted-attribute-type.js";
import * as m72 from "./encryption/encrypting-only-encryptor.js";
import * as m73 from "./encryption/encryptor.js";
import * as m74 from "./encryption/errors.js";
import * as m75 from "./encryption/key-generator.js";
import * as m76 from "./encryption/key-provider.js";
import * as m77 from "./encryption/key.js";
import * as m78 from "./encryption/message-serializer.js";
import * as m79 from "./encryption/message.js";
import * as m80 from "./encryption/null-encryptor.js";
import * as m81 from "./encryption/properties.js";
import * as m82 from "./encryption/scheme.js";
import * as m83 from "./enum.js";
import * as m84 from "./errors.js";
import * as m85 from "./explain-registry.js";
import * as m86 from "./explain-subscriber.js";
import * as m87 from "./future-result.js";
import * as m88 from "./insert-all.js";
import * as m89 from "./internal-metadata.js";
import * as m90 from "./locking/optimistic.js";
import * as m91 from "./log-subscriber.js";
import * as m92 from "./middleware/database-selector.js";
import * as m93 from "./middleware/database-selector/resolver.js";
import * as m94 from "./middleware/database-selector/resolver/session.js";
import * as m95 from "./middleware/shard-selector.js";
import * as m96 from "./migration.js";
import * as m97 from "./migration/command-recorder.js";
import * as m98 from "./migration/compatibility.js";
import * as m99 from "./migration/default-strategy.js";
import * as m100 from "./migration/execution-strategy.js";
import * as m101 from "./migration/pending-migration-connection.js";
import * as m102 from "./nested-attributes.js";
import * as m103 from "./normalization.js";
import * as m104 from "./query-cache.js";
import * as m105 from "./query-logs-formatter.js";
import * as m106 from "./query-logs.js";
import * as m107 from "./readonly-attributes.js";
import * as m108 from "./reflection.js";
import * as m109 from "./relation.js";
import * as m110 from "./relation/batches/batch-enumerator.js";
import * as m111 from "./relation/calculations.js";
import * as m112 from "./relation/delegation.js";
import * as m113 from "./relation/from-clause.js";
import * as m114 from "./relation/merger.js";
import * as m115 from "./relation/predicate-builder.js";
import * as m116 from "./relation/predicate-builder/array-handler.js";
import * as m117 from "./relation/predicate-builder/association-query-value.js";
import * as m118 from "./relation/predicate-builder/basic-object-handler.js";
import * as m119 from "./relation/predicate-builder/polymorphic-array-value.js";
import * as m120 from "./relation/predicate-builder/range-handler.js";
import * as m121 from "./relation/predicate-builder/relation-handler.js";
import * as m122 from "./relation/query-attribute.js";
import * as m123 from "./relation/query-methods.js";
import * as m124 from "./relation/where-clause.js";
import * as m125 from "./result.js";
import * as m126 from "./schema-dumper.js";
import * as m127 from "./schema-migration.js";
import * as m128 from "./schema.js";
import * as m129 from "./scoping.js";
import * as m130 from "./scoping/default.js";
import * as m131 from "./secure-token.js";
import * as m132 from "./statement-cache.js";
import * as m133 from "./store.js";
import * as m134 from "./table-metadata.js";
import * as m135 from "./tasks/database-tasks.js";
import * as m136 from "./tasks/mysql-database-tasks.js";
import * as m137 from "./tasks/postgresql-database-tasks.js";
import * as m138 from "./tasks/sqlite-database-tasks.js";
import * as m139 from "./token-for.js";
import * as m140 from "./transaction.js";
import * as m141 from "./type-caster/connection.js";
import * as m142 from "./type-caster/map.js";
import * as m143 from "./type/adapter-specific-registry.js";
import * as m144 from "./type/date-time.js";
import * as m145 from "./type/date.js";
import * as m146 from "./type/decimal-without-scale.js";
import * as m147 from "./type/hash-lookup-type-map.js";
import * as m148 from "./type/json.js";
import * as m149 from "./type/serialized.js";
import * as m150 from "./type/text.js";
import * as m151 from "./type/time.js";
import * as m152 from "./type/type-map.js";
import * as m153 from "./type/unsigned-integer.js";
import * as m154 from "./validations.js";
import * as m155 from "./validations/absence.js";
import * as m156 from "./validations/associated.js";
import * as m157 from "./validations/length.js";
import * as m158 from "./validations/numericality.js";
import * as m159 from "./validations/presence.js";
import * as m160 from "./validations/uniqueness.js";

registerClassPaths([
  [() => m84.ActiveRecordError, "ActiveRecord::ActiveRecordError"],
  [() => m84.AdapterError, "ActiveRecord::AdapterError"],
  [() => m84.AdapterNotFound, "ActiveRecord::AdapterNotFound"],
  [() => m84.AdapterNotSpecified, "ActiveRecord::AdapterNotSpecified"],
  [() => m84.AdapterTimeout, "ActiveRecord::AdapterTimeout"],
  [
    () => m16.AmbiguousSourceReflectionForThroughAssociation,
    "ActiveRecord::AmbiguousSourceReflectionForThroughAssociation",
  ],
  [() => m16.AssociationNotFoundError, "ActiveRecord::AssociationNotFoundError"],
  [() => m0.AssociationRelation, "ActiveRecord::AssociationRelation"],
  [() => m1.AliasTracker, "ActiveRecord::Associations::AliasTracker"],
  [() => m3.Association, "ActiveRecord::Associations::Association"],
  [() => m2.AssociationScope, "ActiveRecord::Associations::AssociationScope"],
  [() => m2.ReflectionProxy, "ActiveRecord::Associations::AssociationScope::ReflectionProxy"],
  [() => m4.BelongsToAssociation, "ActiveRecord::Associations::BelongsToAssociation"],
  [
    () => m5.BelongsToPolymorphicAssociation,
    "ActiveRecord::Associations::BelongsToPolymorphicAssociation",
  ],
  [() => m6.Association, "ActiveRecord::Associations::Builder::Association"],
  [() => m7.BelongsTo, "ActiveRecord::Associations::Builder::BelongsTo"],
  [() => m8.CollectionAssociation, "ActiveRecord::Associations::Builder::CollectionAssociation"],
  [() => m9.HasAndBelongsToMany, "ActiveRecord::Associations::Builder::HasAndBelongsToMany"],
  [() => m10.HasMany, "ActiveRecord::Associations::Builder::HasMany"],
  [() => m11.HasOne, "ActiveRecord::Associations::Builder::HasOne"],
  [() => m12.SingularAssociation, "ActiveRecord::Associations::Builder::SingularAssociation"],
  [() => m13.CollectionAssociation, "ActiveRecord::Associations::CollectionAssociation"],
  [() => m14.CollectionProxy, "ActiveRecord::Associations::CollectionProxy"],
  [
    () => m15.DisableJoinsAssociationScope,
    "ActiveRecord::Associations::DisableJoinsAssociationScope",
  ],
  [() => m17.HasManyAssociation, "ActiveRecord::Associations::HasManyAssociation"],
  [() => m18.HasManyThroughAssociation, "ActiveRecord::Associations::HasManyThroughAssociation"],
  [() => m19.HasOneAssociation, "ActiveRecord::Associations::HasOneAssociation"],
  [() => m20.HasOneThroughAssociation, "ActiveRecord::Associations::HasOneThroughAssociation"],
  [() => m21.JoinDependency, "ActiveRecord::Associations::JoinDependency"],
  [() => m21.Aliases, "ActiveRecord::Associations::JoinDependency::Aliases"],
  [() => m22.JoinAssociation, "ActiveRecord::Associations::JoinDependency::JoinAssociation"],
  [() => m23.JoinBase, "ActiveRecord::Associations::JoinDependency::JoinBase"],
  [() => m24.JoinPart, "ActiveRecord::Associations::JoinDependency::JoinPart"],
  [() => m25.NestedError, "ActiveRecord::Associations::NestedError"],
  [() => m26.Preloader, "ActiveRecord::Associations::Preloader"],
  [() => m27.Association, "ActiveRecord::Associations::Preloader::Association"],
  [() => m27.LoaderQuery, "ActiveRecord::Associations::Preloader::Association::LoaderQuery"],
  [() => m27.LoaderRecords, "ActiveRecord::Associations::Preloader::Association::LoaderRecords"],
  [() => m28.Batch, "ActiveRecord::Associations::Preloader::Batch"],
  [() => m29.Branch, "ActiveRecord::Associations::Preloader::Branch"],
  [() => m30.ThroughAssociation, "ActiveRecord::Associations::Preloader::ThroughAssociation"],
  [() => m31.SingularAssociation, "ActiveRecord::Associations::SingularAssociation"],
  [() => m84.AssociationTypeMismatch, "ActiveRecord::AssociationTypeMismatch"],
  [() => m32.AsynchronousQueriesTracker, "ActiveRecord::AsynchronousQueriesTracker"],
  [() => m32.Session, "ActiveRecord::AsynchronousQueriesTracker::Session"],
  [
    () => m84.AsynchronousQueryInsideTransactionError,
    "ActiveRecord::AsynchronousQueryInsideTransactionError",
  ],
  [() => m84.AttributeAssignmentError, "ActiveRecord::AttributeAssignmentError"],
  [
    () => m33.GeneratedAttributeMethods,
    "ActiveRecord::AttributeMethods::GeneratedAttributeMethods",
  ],
  [
    () => m34.ColumnNotSerializableError,
    "ActiveRecord::AttributeMethods::Serialization::ColumnNotSerializableError",
  ],
  [
    () => m35.TimeZoneConverter,
    "ActiveRecord::AttributeMethods::TimeZoneConversion::TimeZoneConverter",
  ],
  [() => m36.Base, "ActiveRecord::Base"],
  [() => m110.BatchEnumerator, "ActiveRecord::Batches::BatchEnumerator"],
  [() => m111.ColumnAliasTracker, "ActiveRecord::Calculations::ColumnAliasTracker"],
  [() => m37.ColumnSerializer, "ActiveRecord::Coders::ColumnSerializer"],
  [() => m38.YAMLColumn, "ActiveRecord::Coders::YAMLColumn"],
  [() => m16.CompositePrimaryKeyMismatchError, "ActiveRecord::CompositePrimaryKeyMismatchError"],
  [() => m96.ConcurrentMigrationError, "ActiveRecord::ConcurrentMigrationError"],
  [() => m84.ConfigurationError, "ActiveRecord::ConfigurationError"],
  [() => m39.AbstractAdapter, "ActiveRecord::ConnectionAdapters::AbstractAdapter"],
  [() => m39.Version, "ActiveRecord::ConnectionAdapters::AbstractAdapter::Version"],
  [() => m46.AddColumnDefinition, "ActiveRecord::ConnectionAdapters::AddColumnDefinition"],
  [() => m46.AlterTable, "ActiveRecord::ConnectionAdapters::AlterTable"],
  [() => m53.BoundSchemaReflection, "ActiveRecord::ConnectionAdapters::BoundSchemaReflection"],
  [() => m53.FakePool, "ActiveRecord::ConnectionAdapters::BoundSchemaReflection::FakePool"],
  [
    () => m46.ChangeColumnDefaultDefinition,
    "ActiveRecord::ConnectionAdapters::ChangeColumnDefaultDefinition",
  ],
  [() => m46.ChangeColumnDefinition, "ActiveRecord::ConnectionAdapters::ChangeColumnDefinition"],
  [
    () => m46.CheckConstraintDefinition,
    "ActiveRecord::ConnectionAdapters::CheckConstraintDefinition",
  ],
  [() => m49.Column, "ActiveRecord::ConnectionAdapters::Column"],
  [() => m46.ColumnDefinition, "ActiveRecord::ConnectionAdapters::ColumnDefinition"],
  [() => m40.ConnectionHandler, "ActiveRecord::ConnectionAdapters::ConnectionHandler"],
  [
    () => m40.ConnectionDescriptor,
    "ActiveRecord::ConnectionAdapters::ConnectionHandler::ConnectionDescriptor",
  ],
  [() => m41.ConnectionPool, "ActiveRecord::ConnectionAdapters::ConnectionPool"],
  [
    () => m42.BiasedConditionVariable,
    "ActiveRecord::ConnectionAdapters::ConnectionPool::BiasableQueue::BiasedConditionVariable",
  ],
  [
    () => m42.ConnectionLeasingQueue,
    "ActiveRecord::ConnectionAdapters::ConnectionPool::ConnectionLeasingQueue",
  ],
  [() => m41.Lease, "ActiveRecord::ConnectionAdapters::ConnectionPool::Lease"],
  [() => m41.LeaseRegistry, "ActiveRecord::ConnectionAdapters::ConnectionPool::LeaseRegistry"],
  [() => m42.Queue, "ActiveRecord::ConnectionAdapters::ConnectionPool::Queue"],
  [() => m43.Reaper, "ActiveRecord::ConnectionAdapters::ConnectionPool::Reaper"],
  [
    () => m41.WeakThreadKeyMap,
    "ActiveRecord::ConnectionAdapters::ConnectionPool::WeakThreadKeyMap",
  ],
  [() => m46.CreateIndexDefinition, "ActiveRecord::ConnectionAdapters::CreateIndexDefinition"],
  [() => m46.ForeignKeyDefinition, "ActiveRecord::ConnectionAdapters::ForeignKeyDefinition"],
  [() => m46.IndexDefinition, "ActiveRecord::ConnectionAdapters::IndexDefinition"],
  [() => m49.NullColumn, "ActiveRecord::ConnectionAdapters::NullColumn"],
  [() => m41.NullPool, "ActiveRecord::ConnectionAdapters::NullPool"],
  [() => m41.NullConfig, "ActiveRecord::ConnectionAdapters::NullPool::NullConfig"],
  [() => m48.NullTransaction, "ActiveRecord::ConnectionAdapters::NullTransaction"],
  [() => m50.PoolConfig, "ActiveRecord::ConnectionAdapters::PoolConfig"],
  [() => m51.PoolManager, "ActiveRecord::ConnectionAdapters::PoolManager"],
  [() => m52.RangeType, "ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Range"],
  [() => m46.PrimaryKeyDefinition, "ActiveRecord::ConnectionAdapters::PrimaryKeyDefinition"],
  [
    () => m44.QueryCacheRegistry,
    "ActiveRecord::ConnectionAdapters::QueryCache::QueryCacheRegistry",
  ],
  [() => m44.Store, "ActiveRecord::ConnectionAdapters::QueryCache::Store"],
  [() => m48.RealTransaction, "ActiveRecord::ConnectionAdapters::RealTransaction"],
  [() => m46.ReferenceDefinition, "ActiveRecord::ConnectionAdapters::ReferenceDefinition"],
  [
    () => m48.RestartParentTransaction,
    "ActiveRecord::ConnectionAdapters::RestartParentTransaction",
  ],
  [() => m48.SavepointTransaction, "ActiveRecord::ConnectionAdapters::SavepointTransaction"],
  [() => m53.SchemaCache, "ActiveRecord::ConnectionAdapters::SchemaCache"],
  [() => m45.SchemaCreation, "ActiveRecord::ConnectionAdapters::SchemaCreation"],
  [() => m47.SchemaDumper, "ActiveRecord::ConnectionAdapters::SchemaDumper"],
  [() => m53.SchemaReflection, "ActiveRecord::ConnectionAdapters::SchemaReflection"],
  [() => m54.SqlTypeMetadata, "ActiveRecord::ConnectionAdapters::SqlTypeMetadata"],
  [() => m55.StatementPool, "ActiveRecord::ConnectionAdapters::StatementPool"],
  [() => m46.Table, "ActiveRecord::ConnectionAdapters::Table"],
  [() => m46.TableDefinition, "ActiveRecord::ConnectionAdapters::TableDefinition"],
  [() => m48.Transaction, "ActiveRecord::ConnectionAdapters::Transaction"],
  [() => m48.Callback, "ActiveRecord::ConnectionAdapters::Transaction::Callback"],
  [() => m48.TransactionInstrumenter, "ActiveRecord::ConnectionAdapters::TransactionInstrumenter"],
  [
    () => m48.InstrumentationAlreadyStartedError,
    "ActiveRecord::ConnectionAdapters::TransactionInstrumenter::InstrumentationAlreadyStartedError",
  ],
  [
    () => m48.InstrumentationNotStartedError,
    "ActiveRecord::ConnectionAdapters::TransactionInstrumenter::InstrumentationNotStartedError",
  ],
  [() => m48.TransactionManager, "ActiveRecord::ConnectionAdapters::TransactionManager"],
  [() => m48.TransactionState, "ActiveRecord::ConnectionAdapters::TransactionState"],
  [() => m84.ConnectionFailed, "ActiveRecord::ConnectionFailed"],
  [() => m84.ConnectionNotDefined, "ActiveRecord::ConnectionNotDefined"],
  [() => m84.ConnectionNotEstablished, "ActiveRecord::ConnectionNotEstablished"],
  [() => m84.ConnectionTimeoutError, "ActiveRecord::ConnectionTimeoutError"],
  [() => m56.InspectionMask, "ActiveRecord::Core::InspectionMask"],
  [() => m84.DangerousAttributeError, "ActiveRecord::DangerousAttributeError"],
  [() => m84.DatabaseAlreadyExists, "ActiveRecord::DatabaseAlreadyExists"],
  [() => m57.DatabaseConfigurations, "ActiveRecord::DatabaseConfigurations"],
  [() => m58.ConnectionUrlResolver, "ActiveRecord::DatabaseConfigurations::ConnectionUrlResolver"],
  [() => m59.DatabaseConfig, "ActiveRecord::DatabaseConfigurations::DatabaseConfig"],
  [() => m60.HashConfig, "ActiveRecord::DatabaseConfigurations::HashConfig"],
  [
    () => m57.InvalidConfigurationError,
    "ActiveRecord::DatabaseConfigurations::InvalidConfigurationError",
  ],
  [() => m61.UrlConfig, "ActiveRecord::DatabaseConfigurations::UrlConfig"],
  [() => m84.DatabaseConnectionError, "ActiveRecord::DatabaseConnectionError"],
  [() => m84.DatabaseVersionError, "ActiveRecord::DatabaseVersionError"],
  [() => m84.Deadlocked, "ActiveRecord::Deadlocked"],
  [() => m112.GeneratedRelationMethods, "ActiveRecord::Delegation::GeneratedRelationMethods"],
  [() => m16.DeleteRestrictionError, "ActiveRecord::DeleteRestrictionError"],
  [() => m62.DisableJoinsAssociationRelation, "ActiveRecord::DisableJoinsAssociationRelation"],
  [() => m96.DuplicateMigrationNameError, "ActiveRecord::DuplicateMigrationNameError"],
  [() => m96.DuplicateMigrationVersionError, "ActiveRecord::DuplicateMigrationVersionError"],
  [() => m63.FindBy, "ActiveRecord::DynamicMatchers::FindBy"],
  [() => m63.FindByBang, "ActiveRecord::DynamicMatchers::FindByBang"],
  [() => m63.Method, "ActiveRecord::DynamicMatchers::Method"],
  [() => m16.EagerLoadPolymorphicError, "ActiveRecord::EagerLoadPolymorphicError"],
  [() => m64.AutoFilteredParameters, "ActiveRecord::Encryption::AutoFilteredParameters"],
  [() => m65.Cipher, "ActiveRecord::Encryption::Cipher"],
  [() => m66.Aes256Gcm, "ActiveRecord::Encryption::Cipher::Aes256Gcm"],
  [() => m67.Config, "ActiveRecord::Encryption::Config"],
  [() => m68.Context, "ActiveRecord::Encryption::Context"],
  [() => m69.DerivedSecretKeyProvider, "ActiveRecord::Encryption::DerivedSecretKeyProvider"],
  [() => m70.DeterministicKeyProvider, "ActiveRecord::Encryption::DeterministicKeyProvider"],
  [() => m71.EncryptedAttributeType, "ActiveRecord::Encryption::EncryptedAttributeType"],
  [() => m72.EncryptingOnlyEncryptor, "ActiveRecord::Encryption::EncryptingOnlyEncryptor"],
  [() => m73.Encryptor, "ActiveRecord::Encryption::Encryptor"],
  [() => m74.Base, "ActiveRecord::Encryption::Errors::Base"],
  [() => m74.Configuration, "ActiveRecord::Encryption::Errors::Configuration"],
  [() => m74.Decryption, "ActiveRecord::Encryption::Errors::Decryption"],
  [() => m74.Encoding, "ActiveRecord::Encryption::Errors::Encoding"],
  [
    () => m74.EncryptedContentIntegrity,
    "ActiveRecord::Encryption::Errors::EncryptedContentIntegrity",
  ],
  [() => m74.Encryption, "ActiveRecord::Encryption::Errors::Encryption"],
  [() => m74.ForbiddenClass, "ActiveRecord::Encryption::Errors::ForbiddenClass"],
  [() => m77.Key, "ActiveRecord::Encryption::Key"],
  [() => m75.KeyGenerator, "ActiveRecord::Encryption::KeyGenerator"],
  [() => m76.KeyProvider, "ActiveRecord::Encryption::KeyProvider"],
  [() => m79.Message, "ActiveRecord::Encryption::Message"],
  [() => m78.MessageSerializer, "ActiveRecord::Encryption::MessageSerializer"],
  [() => m80.NullEncryptor, "ActiveRecord::Encryption::NullEncryptor"],
  [() => m81.Properties, "ActiveRecord::Encryption::Properties"],
  [() => m82.Scheme, "ActiveRecord::Encryption::Scheme"],
  [() => m83.EnumMethods, "ActiveRecord::Enum::EnumMethods"],
  [() => m83.EnumType, "ActiveRecord::Enum::EnumType"],
  [() => m96.EnvironmentMismatchError, "ActiveRecord::EnvironmentMismatchError"],
  [() => m96.EnvironmentStorageError, "ActiveRecord::EnvironmentStorageError"],
  [() => m84.ExclusiveConnectionTimeoutError, "ActiveRecord::ExclusiveConnectionTimeoutError"],
  [() => m85.ExplainRegistry, "ActiveRecord::ExplainRegistry"],
  [() => m86.ExplainSubscriber, "ActiveRecord::ExplainSubscriber"],
  [() => m87.FutureResult, "ActiveRecord::FutureResult"],
  [() => m87.Complete, "ActiveRecord::FutureResult::Complete"],
  [() => m87.EventBuffer, "ActiveRecord::FutureResult::EventBuffer"],
  [() => m87.SelectAll, "ActiveRecord::FutureResult::SelectAll"],
  [
    () => m16.HasManyThroughAssociationNotFoundError,
    "ActiveRecord::HasManyThroughAssociationNotFoundError",
  ],
  [
    () => m16.HasManyThroughAssociationPointlessSourceTypeError,
    "ActiveRecord::HasManyThroughAssociationPointlessSourceTypeError",
  ],
  [
    () => m16.HasManyThroughAssociationPolymorphicSourceError,
    "ActiveRecord::HasManyThroughAssociationPolymorphicSourceError",
  ],
  [
    () => m16.HasManyThroughAssociationPolymorphicThroughError,
    "ActiveRecord::HasManyThroughAssociationPolymorphicThroughError",
  ],
  [
    () => m16.HasManyThroughCantAssociateThroughHasOneOrManyReflection,
    "ActiveRecord::HasManyThroughCantAssociateThroughHasOneOrManyReflection",
  ],
  [
    () => m16.HasManyThroughNestedAssociationsAreReadonly,
    "ActiveRecord::HasManyThroughNestedAssociationsAreReadonly",
  ],
  [() => m16.HasManyThroughOrderError, "ActiveRecord::HasManyThroughOrderError"],
  [
    () => m16.HasManyThroughSourceAssociationNotFoundError,
    "ActiveRecord::HasManyThroughSourceAssociationNotFoundError",
  ],
  [
    () => m16.HasOneAssociationPolymorphicThroughError,
    "ActiveRecord::HasOneAssociationPolymorphicThroughError",
  ],
  [
    () => m16.HasOneThroughCantAssociateThroughCollection,
    "ActiveRecord::HasOneThroughCantAssociateThroughCollection",
  ],
  [
    () => m16.HasOneThroughCantAssociateThroughHasOneOrManyReflection,
    "ActiveRecord::HasOneThroughCantAssociateThroughHasOneOrManyReflection",
  ],
  [
    () => m16.HasOneThroughNestedAssociationsAreReadonly,
    "ActiveRecord::HasOneThroughNestedAssociationsAreReadonly",
  ],
  [() => m96.IllegalMigrationNameError, "ActiveRecord::IllegalMigrationNameError"],
  [() => m88.InsertAll, "ActiveRecord::InsertAll"],
  [() => m88.Builder, "ActiveRecord::InsertAll::Builder"],
  [() => m89.InternalMetadata, "ActiveRecord::InternalMetadata"],
  [() => m89.NullInternalMetadata, "ActiveRecord::InternalMetadata::NullInternalMetadata"],
  [() => m84.InvalidForeignKey, "ActiveRecord::InvalidForeignKey"],
  [() => m96.InvalidMigrationTimestampError, "ActiveRecord::InvalidMigrationTimestampError"],
  [() => m16.InverseOfAssociationNotFoundError, "ActiveRecord::InverseOfAssociationNotFoundError"],
  [
    () => m16.InverseOfAssociationRecursiveError,
    "ActiveRecord::InverseOfAssociationRecursiveError",
  ],
  [() => m96.IrreversibleMigration, "ActiveRecord::IrreversibleMigration"],
  [() => m84.IrreversibleOrderError, "ActiveRecord::IrreversibleOrderError"],
  [() => m90.LockingType, "ActiveRecord::Locking::LockingType"],
  [() => m84.LockWaitTimeout, "ActiveRecord::LockWaitTimeout"],
  [() => m91.LogSubscriber, "ActiveRecord::LogSubscriber"],
  [() => m92.DatabaseSelector, "ActiveRecord::Middleware::DatabaseSelector"],
  [() => m93.Resolver, "ActiveRecord::Middleware::DatabaseSelector::Resolver"],
  [() => m94.Session, "ActiveRecord::Middleware::DatabaseSelector::Resolver::Session"],
  [() => m95.ShardSelector, "ActiveRecord::Middleware::ShardSelector"],
  [() => m96.Migration, "ActiveRecord::Migration"],
  [() => m96.CheckPending, "ActiveRecord::Migration::CheckPending"],
  [() => m97.CommandRecorder, "ActiveRecord::Migration::CommandRecorder"],
  [() => m98.V4_2, "ActiveRecord::Migration::Compatibility::V4_2"],
  [() => m98.V5_0, "ActiveRecord::Migration::Compatibility::V5_0"],
  [() => m98.V5_1, "ActiveRecord::Migration::Compatibility::V5_1"],
  [() => m98.V5_2, "ActiveRecord::Migration::Compatibility::V5_2"],
  [() => m98.V6_0, "ActiveRecord::Migration::Compatibility::V6_0"],
  [() => m98.V6_1, "ActiveRecord::Migration::Compatibility::V6_1"],
  [() => m98.V7_0, "ActiveRecord::Migration::Compatibility::V7_0"],
  [() => m98.V7_1, "ActiveRecord::Migration::Compatibility::V7_1"],
  [() => m98.V7_2, "ActiveRecord::Migration::Compatibility::V7_2"],
  [() => m96.Current, "ActiveRecord::Migration::Current"],
  [() => m99.DefaultStrategy, "ActiveRecord::Migration::DefaultStrategy"],
  [() => m100.ExecutionStrategy, "ActiveRecord::Migration::ExecutionStrategy"],
  [() => m96.ReversibleBlockHelper, "ActiveRecord::Migration::ReversibleBlockHelper"],
  [() => m96.MigrationContext, "ActiveRecord::MigrationContext"],
  [() => m96.MigrationError, "ActiveRecord::MigrationError"],
  [() => m96.MigrationProxy, "ActiveRecord::MigrationProxy"],
  [() => m96.Migrator, "ActiveRecord::Migrator"],
  [() => m84.MismatchedForeignKey, "ActiveRecord::MismatchedForeignKey"],
  [() => m84.MultiparameterAssignmentErrors, "ActiveRecord::MultiparameterAssignmentErrors"],
  [() => m102.TooManyRecords, "ActiveRecord::NestedAttributes::TooManyRecords"],
  [() => m84.NoDatabaseError, "ActiveRecord::NoDatabaseError"],
  [() => m96.NoEnvironmentInSchemaError, "ActiveRecord::NoEnvironmentInSchemaError"],
  [() => m103.NormalizedValueType, "ActiveRecord::Normalization::NormalizedValueType"],
  [() => m84.NotNullViolation, "ActiveRecord::NotNullViolation"],
  [() => m101.PendingMigrationConnection, "ActiveRecord::PendingMigrationConnection"],
  [() => m96.PendingMigrationError, "ActiveRecord::PendingMigrationError"],
  [() => m115.PredicateBuilder, "ActiveRecord::PredicateBuilder"],
  [() => m116.ArrayHandler, "ActiveRecord::PredicateBuilder::ArrayHandler"],
  [() => m117.AssociationQueryValue, "ActiveRecord::PredicateBuilder::AssociationQueryValue"],
  [() => m118.BasicObjectHandler, "ActiveRecord::PredicateBuilder::BasicObjectHandler"],
  [() => m119.PolymorphicArrayValue, "ActiveRecord::PredicateBuilder::PolymorphicArrayValue"],
  [() => m120.RangeHandler, "ActiveRecord::PredicateBuilder::RangeHandler"],
  [() => m120.RangeWithBinds, "ActiveRecord::PredicateBuilder::RangeHandler::RangeWithBinds"],
  [() => m121.RelationHandler, "ActiveRecord::PredicateBuilder::RelationHandler"],
  [() => m84.PreparedStatementCacheExpired, "ActiveRecord::PreparedStatementCacheExpired"],
  [() => m84.PreparedStatementInvalid, "ActiveRecord::PreparedStatementInvalid"],
  [() => m96.ProtectedEnvironmentError, "ActiveRecord::ProtectedEnvironmentError"],
  [() => m84.QueryAborted, "ActiveRecord::QueryAborted"],
  [() => m104.QueryCache, "ActiveRecord::QueryCache"],
  [() => m84.QueryCanceled, "ActiveRecord::QueryCanceled"],
  [() => m106.GetKeyHandler, "ActiveRecord::QueryLogs::GetKeyHandler"],
  [() => m106.IdentityHandler, "ActiveRecord::QueryLogs::IdentityHandler"],
  [() => m105.SQLCommenter, "ActiveRecord::QueryLogs::SQLCommenter"],
  [() => m106.ZeroArityHandler, "ActiveRecord::QueryLogs::ZeroArityHandler"],
  [() => m123.CTEJoin, "ActiveRecord::QueryMethods::CTEJoin"],
  [() => m123.WhereChain, "ActiveRecord::QueryMethods::WhereChain"],
  [() => m84.RangeError, "ActiveRecord::RangeError"],
  [() => m107.ReadonlyAttributeError, "ActiveRecord::ReadonlyAttributeError"],
  [() => m84.ReadOnlyError, "ActiveRecord::ReadOnlyError"],
  [() => m84.ReadOnlyRecord, "ActiveRecord::ReadOnlyRecord"],
  [() => m154.RecordInvalid, "ActiveRecord::RecordInvalid"],
  [() => m84.RecordNotDestroyed, "ActiveRecord::RecordNotDestroyed"],
  [() => m84.RecordNotFound, "ActiveRecord::RecordNotFound"],
  [() => m84.RecordNotSaved, "ActiveRecord::RecordNotSaved"],
  [() => m84.RecordNotUnique, "ActiveRecord::RecordNotUnique"],
  [() => m108.AbstractReflection, "ActiveRecord::Reflection::AbstractReflection"],
  [() => m108.AggregateReflection, "ActiveRecord::Reflection::AggregateReflection"],
  [() => m108.AssociationReflection, "ActiveRecord::Reflection::AssociationReflection"],
  [() => m108.BelongsToReflection, "ActiveRecord::Reflection::BelongsToReflection"],
  [
    () => m108.HasAndBelongsToManyReflection,
    "ActiveRecord::Reflection::HasAndBelongsToManyReflection",
  ],
  [() => m108.HasManyReflection, "ActiveRecord::Reflection::HasManyReflection"],
  [() => m108.HasOneReflection, "ActiveRecord::Reflection::HasOneReflection"],
  [() => m108.MacroReflection, "ActiveRecord::Reflection::MacroReflection"],
  [() => m108.PolymorphicReflection, "ActiveRecord::Reflection::PolymorphicReflection"],
  [() => m108.RuntimeReflection, "ActiveRecord::Reflection::RuntimeReflection"],
  [() => m108.ThroughReflection, "ActiveRecord::Reflection::ThroughReflection"],
  [() => m109.Relation, "ActiveRecord::Relation"],
  [() => m109.ExplainProxy, "ActiveRecord::Relation::ExplainProxy"],
  [() => m113.FromClause, "ActiveRecord::Relation::FromClause"],
  [() => m114.HashMerger, "ActiveRecord::Relation::HashMerger"],
  [() => m114.Merger, "ActiveRecord::Relation::Merger"],
  [() => m122.QueryAttribute, "ActiveRecord::Relation::QueryAttribute"],
  [() => m124.WhereClause, "ActiveRecord::Relation::WhereClause"],
  [() => m125.Result, "ActiveRecord::Result"],
  [() => m125.IndexedRow, "ActiveRecord::Result::IndexedRow"],
  [() => m84.Rollback, "ActiveRecord::Rollback"],
  [() => m128.Schema, "ActiveRecord::Schema"],
  [() => m126.SchemaDumper, "ActiveRecord::SchemaDumper"],
  [() => m127.SchemaMigration, "ActiveRecord::SchemaMigration"],
  [() => m127.NullSchemaMigration, "ActiveRecord::SchemaMigration::NullSchemaMigration"],
  [() => m130.DefaultScope, "ActiveRecord::Scoping::DefaultScope"],
  [() => m129.ScopeRegistry, "ActiveRecord::Scoping::ScopeRegistry"],
  [() => m131.MinimumLengthError, "ActiveRecord::SecureToken::MinimumLengthError"],
  [() => m84.SerializationFailure, "ActiveRecord::SerializationFailure"],
  [() => m84.SerializationTypeMismatch, "ActiveRecord::SerializationTypeMismatch"],
  [() => m84.SoleRecordExceeded, "ActiveRecord::SoleRecordExceeded"],
  [() => m84.SQLWarning, "ActiveRecord::SQLWarning"],
  [() => m84.StaleObjectError, "ActiveRecord::StaleObjectError"],
  [() => m132.StatementCache, "ActiveRecord::StatementCache"],
  [() => m132.BindMap, "ActiveRecord::StatementCache::BindMap"],
  [() => m132.Params, "ActiveRecord::StatementCache::Params"],
  [() => m132.PartialQuery, "ActiveRecord::StatementCache::PartialQuery"],
  [() => m132.PartialQueryCollector, "ActiveRecord::StatementCache::PartialQueryCollector"],
  [() => m132.Query, "ActiveRecord::StatementCache::Query"],
  [() => m132.Substitute, "ActiveRecord::StatementCache::Substitute"],
  [() => m84.StatementInvalid, "ActiveRecord::StatementInvalid"],
  [() => m84.StatementTimeout, "ActiveRecord::StatementTimeout"],
  [() => m133.HashAccessor, "ActiveRecord::Store::HashAccessor"],
  [() => m133.IndifferentCoder, "ActiveRecord::Store::IndifferentCoder"],
  [() => m133.IndifferentHashAccessor, "ActiveRecord::Store::IndifferentHashAccessor"],
  [() => m133.StringKeyedHashAccessor, "ActiveRecord::Store::StringKeyedHashAccessor"],
  [() => m84.StrictLoadingViolationError, "ActiveRecord::StrictLoadingViolationError"],
  [() => m84.SubclassNotFound, "ActiveRecord::SubclassNotFound"],
  [() => m134.TableMetadata, "ActiveRecord::TableMetadata"],
  [() => m84.TableNotSpecified, "ActiveRecord::TableNotSpecified"],
  [() => m135.DatabaseNotSupported, "ActiveRecord::Tasks::DatabaseNotSupported"],
  [() => m136.MySQLDatabaseTasks, "ActiveRecord::Tasks::MySQLDatabaseTasks"],
  [() => m137.PostgreSQLDatabaseTasks, "ActiveRecord::Tasks::PostgreSQLDatabaseTasks"],
  [() => m138.SQLiteDatabaseTasks, "ActiveRecord::Tasks::SQLiteDatabaseTasks"],
  [
    () => m16.ThroughCantAssociateThroughHasOneOrManyReflection,
    "ActiveRecord::ThroughCantAssociateThroughHasOneOrManyReflection",
  ],
  [
    () => m16.ThroughNestedAssociationsAreReadonly,
    "ActiveRecord::ThroughNestedAssociationsAreReadonly",
  ],
  [() => m139.TokenDefinition, "ActiveRecord::TokenFor::TokenDefinition"],
  [() => m140.Transaction, "ActiveRecord::Transaction"],
  [() => m84.TransactionIsolationError, "ActiveRecord::TransactionIsolationError"],
  [() => m84.TransactionRollbackError, "ActiveRecord::TransactionRollbackError"],
  [() => m143.AdapterSpecificRegistry, "ActiveRecord::Type::AdapterSpecificRegistry"],
  [() => m145.Date, "ActiveRecord::Type::Date"],
  [() => m144.DateTime, "ActiveRecord::Type::DateTime"],
  [() => m146.DecimalWithoutScale, "ActiveRecord::Type::DecimalWithoutScale"],
  [() => m143.DecorationRegistration, "ActiveRecord::Type::DecorationRegistration"],
  [() => m147.HashLookupTypeMap, "ActiveRecord::Type::HashLookupTypeMap"],
  [() => m148.Json, "ActiveRecord::Type::Json"],
  [() => m143.Registration, "ActiveRecord::Type::Registration"],
  [() => m149.Serialized, "ActiveRecord::Type::Serialized"],
  [() => m150.Text, "ActiveRecord::Type::Text"],
  [() => m151.Time, "ActiveRecord::Type::Time"],
  [() => m151.Value, "ActiveRecord::Type::Time::Value"],
  [() => m152.TypeMap, "ActiveRecord::Type::TypeMap"],
  [() => m153.UnsignedInteger, "ActiveRecord::Type::UnsignedInteger"],
  [() => m141.Connection, "ActiveRecord::TypeCaster::Connection"],
  [() => m142.Map, "ActiveRecord::TypeCaster::Map"],
  [() => m143.TypeConflictError, "ActiveRecord::TypeConflictError"],
  [() => m84.UnknownAttributeReference, "ActiveRecord::UnknownAttributeReference"],
  [() => m96.UnknownMigrationVersionError, "ActiveRecord::UnknownMigrationVersionError"],
  [() => m84.UnknownPrimaryKey, "ActiveRecord::UnknownPrimaryKey"],
  [() => m84.UnmodifiableRelation, "ActiveRecord::UnmodifiableRelation"],
  [() => m155.AbsenceValidator, "ActiveRecord::Validations::AbsenceValidator"],
  [() => m156.AssociatedValidator, "ActiveRecord::Validations::AssociatedValidator"],
  [() => m157.LengthValidator, "ActiveRecord::Validations::LengthValidator"],
  [() => m158.NumericalityValidator, "ActiveRecord::Validations::NumericalityValidator"],
  [() => m159.PresenceValidator, "ActiveRecord::Validations::PresenceValidator"],
  [() => m160.UniquenessValidator, "ActiveRecord::Validations::UniquenessValidator"],
  [() => m84.ValueTooLong, "ActiveRecord::ValueTooLong"],
  [() => m84.WrappedDatabaseException, "ActiveRecord::WrappedDatabaseException"],
]);

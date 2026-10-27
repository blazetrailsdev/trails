import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./aggregations.js";
import * as m1 from "./association-relation.js";
import * as m2 from "./associations/alias-tracker.js";
import * as m3 from "./associations/association-scope.js";
import * as m4 from "./associations/association.js";
import * as m5 from "./associations/belongs-to-association.js";
import * as m6 from "./associations/belongs-to-polymorphic-association.js";
import * as m7 from "./associations/builder/association.js";
import * as m8 from "./associations/builder/belongs-to.js";
import * as m9 from "./associations/builder/collection-association.js";
import * as m10 from "./associations/builder/has-and-belongs-to-many.js";
import * as m11 from "./associations/builder/has-many.js";
import * as m12 from "./associations/builder/has-one.js";
import * as m13 from "./associations/builder/singular-association.js";
import * as m14 from "./associations/collection-association.js";
import * as m15 from "./associations/collection-proxy.js";
import * as m16 from "./associations/disable-joins-association-scope.js";
import * as m17 from "./associations/errors.js";
import * as m18 from "./associations/foreign-association.js";
import * as m19 from "./associations/has-many-association.js";
import * as m20 from "./associations/has-many-through-association.js";
import * as m21 from "./associations/has-one-association.js";
import * as m22 from "./associations/has-one-through-association.js";
import * as m23 from "./associations/join-dependency.js";
import * as m24 from "./associations/join-dependency/join-association.js";
import * as m25 from "./associations/join-dependency/join-base.js";
import * as m26 from "./associations/join-dependency/join-part.js";
import * as m27 from "./associations/nested-error.js";
import * as m28 from "./associations/preloader.js";
import * as m29 from "./associations/preloader/association.js";
import * as m30 from "./associations/preloader/batch.js";
import * as m31 from "./associations/preloader/branch.js";
import * as m32 from "./associations/preloader/through-association.js";
import * as m33 from "./associations/singular-association.js";
import * as m34 from "./associations/through-association.js";
import * as m35 from "./asynchronous-queries-tracker.js";
import * as m36 from "./attribute-assignment.js";
import * as m37 from "./attribute-methods.js";
import * as m38 from "./attribute-methods/before-type-cast.js";
import * as m39 from "./attribute-methods/dirty.js";
import * as m40 from "./attribute-methods/query.js";
import * as m41 from "./attribute-methods/read.js";
import * as m42 from "./attribute-methods/serialization.js";
import * as m43 from "./attribute-methods/time-zone-conversion.js";
import * as m44 from "./attribute-methods/write.js";
import * as m45 from "./autosave-association.js";
import * as m46 from "./base.js";
import * as m47 from "./coders/column-serializer.js";
import * as m48 from "./coders/yaml-column.js";
import * as m49 from "./connection-adapters/abstract-adapter.js";
import * as m50 from "./connection-adapters/abstract/connection-handler.js";
import * as m51 from "./connection-adapters/abstract/connection-pool.js";
import * as m52 from "./connection-adapters/abstract/connection-pool/queue.js";
import * as m53 from "./connection-adapters/abstract/connection-pool/reaper.js";
import * as m54 from "./connection-adapters/abstract/database-statements.js";
import * as m55 from "./connection-adapters/abstract/query-cache.js";
import * as m56 from "./connection-adapters/abstract/quoting.js";
import * as m57 from "./connection-adapters/abstract/savepoints.js";
import * as m58 from "./connection-adapters/abstract/schema-creation.js";
import * as m59 from "./connection-adapters/abstract/schema-definitions.js";
import * as m60 from "./connection-adapters/abstract/schema-dumper.js";
import * as m61 from "./connection-adapters/abstract/schema-statements.js";
import * as m62 from "./connection-adapters/abstract/transaction.js";
import * as m63 from "./connection-adapters/column.js";
import * as m64 from "./connection-adapters/deduplicable.js";
import * as m65 from "./connection-adapters/pool-config.js";
import * as m66 from "./connection-adapters/pool-manager.js";
import * as m67 from "./connection-adapters/postgresql/oid/range.js";
import * as m68 from "./connection-adapters/schema-cache.js";
import * as m69 from "./connection-adapters/sql-type-metadata.js";
import * as m70 from "./connection-adapters/statement-pool.js";
import * as m71 from "./connection-handling.js";
import * as m72 from "./core.js";
import * as m73 from "./counter-cache.js";
import * as m74 from "./database-configurations.js";
import * as m75 from "./database-configurations/connection-url-resolver.js";
import * as m76 from "./database-configurations/database-config.js";
import * as m77 from "./database-configurations/hash-config.js";
import * as m78 from "./database-configurations/url-config.js";
import * as m79 from "./disable-joins-association-relation.js";
import * as m80 from "./dynamic-matchers.js";
import * as m81 from "./encryption/auto-filtered-parameters.js";
import * as m82 from "./encryption/cipher.js";
import * as m83 from "./encryption/cipher/aes256-gcm.js";
import * as m84 from "./encryption/config.js";
import * as m85 from "./encryption/context.js";
import * as m86 from "./encryption/derived-secret-key-provider.js";
import * as m87 from "./encryption/deterministic-key-provider.js";
import * as m88 from "./encryption/encrypted-attribute-type.js";
import * as m89 from "./encryption/encrypting-only-encryptor.js";
import * as m90 from "./encryption/encryptor.js";
import * as m91 from "./encryption/errors.js";
import * as m92 from "./encryption/extended-deterministic-uniqueness-validator.js";
import * as m93 from "./encryption/key-generator.js";
import * as m94 from "./encryption/key-provider.js";
import * as m95 from "./encryption/key.js";
import * as m96 from "./encryption/message-serializer.js";
import * as m97 from "./encryption/message.js";
import * as m98 from "./encryption/null-encryptor.js";
import * as m99 from "./encryption/properties.js";
import * as m100 from "./encryption/scheme.js";
import * as m101 from "./enum.js";
import * as m102 from "./errors.js";
import * as m103 from "./explain-registry.js";
import * as m104 from "./explain-subscriber.js";
import * as m105 from "./future-result.js";
import * as m106 from "./gem-version.js";
import * as m107 from "./inheritance.js";
import * as m108 from "./insert-all.js";
import * as m109 from "./integration.js";
import * as m110 from "./internal-metadata.js";
import * as m111 from "./legacy-yaml-adapter.js";
import * as m112 from "./locking/optimistic.js";
import * as m113 from "./locking/pessimistic.js";
import * as m114 from "./log-subscriber.js";
import * as m115 from "./marshalling.js";
import * as m116 from "./middleware/database-selector.js";
import * as m117 from "./middleware/database-selector/resolver.js";
import * as m118 from "./middleware/database-selector/resolver/session.js";
import * as m119 from "./middleware/shard-selector.js";
import * as m120 from "./migration.js";
import * as m121 from "./migration/command-recorder.js";
import * as m122 from "./migration/compatibility.js";
import * as m123 from "./migration/default-strategy.js";
import * as m124 from "./migration/execution-strategy.js";
import * as m125 from "./migration/pending-migration-connection.js";
import * as m126 from "./model-schema.js";
import * as m127 from "./nested-attributes.js";
import * as m128 from "./no-touching.js";
import * as m129 from "./normalization.js";
import * as m130 from "./persistence.js";
import * as m131 from "./query-cache.js";
import * as m132 from "./query-logs-formatter.js";
import * as m133 from "./query-logs.js";
import * as m134 from "./readonly-attributes.js";
import * as m135 from "./reflection.js";
import * as m136 from "./relation.js";
import * as m137 from "./relation/batches.js";
import * as m138 from "./relation/batches/batch-enumerator.js";
import * as m139 from "./relation/calculations.js";
import * as m140 from "./relation/delegation.js";
import * as m141 from "./relation/finder-methods.js";
import * as m142 from "./relation/from-clause.js";
import * as m143 from "./relation/merger.js";
import * as m144 from "./relation/predicate-builder.js";
import * as m145 from "./relation/predicate-builder/array-handler.js";
import * as m146 from "./relation/predicate-builder/association-query-value.js";
import * as m147 from "./relation/predicate-builder/basic-object-handler.js";
import * as m148 from "./relation/predicate-builder/polymorphic-array-value.js";
import * as m149 from "./relation/predicate-builder/range-handler.js";
import * as m150 from "./relation/predicate-builder/relation-handler.js";
import * as m151 from "./relation/query-attribute.js";
import * as m152 from "./relation/query-methods.js";
import * as m153 from "./relation/spawn-methods.js";
import * as m154 from "./relation/where-clause.js";
import * as m155 from "./result.js";
import * as m156 from "./sanitization.js";
import * as m157 from "./schema-dumper.js";
import * as m158 from "./schema-migration.js";
import * as m159 from "./schema.js";
import * as m160 from "./scoping.js";
import * as m161 from "./scoping/default.js";
import * as m162 from "./scoping/named.js";
import * as m163 from "./secure-token.js";
import * as m164 from "./signed-id.js";
import * as m165 from "./statement-cache.js";
import * as m166 from "./store.js";
import * as m167 from "./table-metadata.js";
import * as m168 from "./tasks/database-tasks.js";
import * as m169 from "./tasks/mysql-database-tasks.js";
import * as m170 from "./tasks/postgresql-database-tasks.js";
import * as m171 from "./tasks/sqlite-database-tasks.js";
import * as m172 from "./timestamp.js";
import * as m173 from "./token-for.js";
import * as m174 from "./touch-later.js";
import * as m175 from "./transaction.js";
import * as m176 from "./transactions.js";
import * as m177 from "./translation.js";
import * as m178 from "./type-caster/connection.js";
import * as m179 from "./type-caster/map.js";
import * as m180 from "./type/adapter-specific-registry.js";
import * as m181 from "./type/date-time.js";
import * as m182 from "./type/date.js";
import * as m183 from "./type/decimal-without-scale.js";
import * as m184 from "./type/hash-lookup-type-map.js";
import * as m185 from "./type/json.js";
import * as m186 from "./type/serialized.js";
import * as m187 from "./type/text.js";
import * as m188 from "./type/time.js";
import * as m189 from "./type/type-map.js";
import * as m190 from "./type/unsigned-integer.js";
import * as m191 from "./validations.js";
import * as m192 from "./validations/absence.js";
import * as m193 from "./validations/associated.js";
import * as m194 from "./validations/length.js";
import * as m195 from "./validations/numericality.js";
import * as m196 from "./validations/presence.js";
import * as m197 from "./validations/uniqueness.js";

registerClassPaths([
  [() => m102.ActiveRecordError, "ActiveRecord::ActiveRecordError"],
  [() => m102.AdapterError, "ActiveRecord::AdapterError"],
  [() => m102.AdapterNotFound, "ActiveRecord::AdapterNotFound"],
  [() => m102.AdapterNotSpecified, "ActiveRecord::AdapterNotSpecified"],
  [() => m102.AdapterTimeout, "ActiveRecord::AdapterTimeout"],
  [() => m0.ClassMethods, "ActiveRecord::Aggregations::ClassMethods"],
  [
    () => m17.AmbiguousSourceReflectionForThroughAssociation,
    "ActiveRecord::AmbiguousSourceReflectionForThroughAssociation",
  ],
  [() => m17.AssociationNotFoundError, "ActiveRecord::AssociationNotFoundError"],
  [() => m1.AssociationRelation, "ActiveRecord::AssociationRelation"],
  [() => m2.AliasTracker, "ActiveRecord::Associations::AliasTracker"],
  [() => m4.Association, "ActiveRecord::Associations::Association"],
  [() => m3.AssociationScope, "ActiveRecord::Associations::AssociationScope"],
  [() => m3.ReflectionProxy, "ActiveRecord::Associations::AssociationScope::ReflectionProxy"],
  [() => m5.BelongsToAssociation, "ActiveRecord::Associations::BelongsToAssociation"],
  [
    () => m6.BelongsToPolymorphicAssociation,
    "ActiveRecord::Associations::BelongsToPolymorphicAssociation",
  ],
  [() => m7.Association, "ActiveRecord::Associations::Builder::Association"],
  [() => m8.BelongsTo, "ActiveRecord::Associations::Builder::BelongsTo"],
  [() => m9.CollectionAssociation, "ActiveRecord::Associations::Builder::CollectionAssociation"],
  [() => m10.HasAndBelongsToMany, "ActiveRecord::Associations::Builder::HasAndBelongsToMany"],
  [() => m11.HasMany, "ActiveRecord::Associations::Builder::HasMany"],
  [() => m12.HasOne, "ActiveRecord::Associations::Builder::HasOne"],
  [() => m13.SingularAssociation, "ActiveRecord::Associations::Builder::SingularAssociation"],
  [() => m14.CollectionAssociation, "ActiveRecord::Associations::CollectionAssociation"],
  [() => m15.CollectionProxy, "ActiveRecord::Associations::CollectionProxy"],
  [
    () => m16.DisableJoinsAssociationScope,
    "ActiveRecord::Associations::DisableJoinsAssociationScope",
  ],
  [() => m18.ForeignAssociation, "ActiveRecord::Associations::ForeignAssociation"],
  [() => m19.HasManyAssociation, "ActiveRecord::Associations::HasManyAssociation"],
  [() => m20.HasManyThroughAssociation, "ActiveRecord::Associations::HasManyThroughAssociation"],
  [() => m21.HasOneAssociation, "ActiveRecord::Associations::HasOneAssociation"],
  [() => m22.HasOneThroughAssociation, "ActiveRecord::Associations::HasOneThroughAssociation"],
  [() => m23.JoinDependency, "ActiveRecord::Associations::JoinDependency"],
  [() => m23.Aliases, "ActiveRecord::Associations::JoinDependency::Aliases"],
  [() => m24.JoinAssociation, "ActiveRecord::Associations::JoinDependency::JoinAssociation"],
  [() => m25.JoinBase, "ActiveRecord::Associations::JoinDependency::JoinBase"],
  [() => m26.JoinPart, "ActiveRecord::Associations::JoinDependency::JoinPart"],
  [() => m27.NestedError, "ActiveRecord::Associations::NestedError"],
  [() => m28.Preloader, "ActiveRecord::Associations::Preloader"],
  [() => m29.Association, "ActiveRecord::Associations::Preloader::Association"],
  [() => m29.LoaderQuery, "ActiveRecord::Associations::Preloader::Association::LoaderQuery"],
  [() => m29.LoaderRecords, "ActiveRecord::Associations::Preloader::Association::LoaderRecords"],
  [() => m30.Batch, "ActiveRecord::Associations::Preloader::Batch"],
  [() => m31.Branch, "ActiveRecord::Associations::Preloader::Branch"],
  [() => m32.ThroughAssociation, "ActiveRecord::Associations::Preloader::ThroughAssociation"],
  [() => m33.SingularAssociation, "ActiveRecord::Associations::SingularAssociation"],
  [() => m34.ThroughAssociation, "ActiveRecord::Associations::ThroughAssociation"],
  [() => m102.AssociationTypeMismatch, "ActiveRecord::AssociationTypeMismatch"],
  [() => m35.AsynchronousQueriesTracker, "ActiveRecord::AsynchronousQueriesTracker"],
  [() => m35.Session, "ActiveRecord::AsynchronousQueriesTracker::Session"],
  [
    () => m102.AsynchronousQueryInsideTransactionError,
    "ActiveRecord::AsynchronousQueryInsideTransactionError",
  ],
  [() => m36.AttributeAssignment, "ActiveRecord::AttributeAssignment"],
  [() => m102.AttributeAssignmentError, "ActiveRecord::AttributeAssignmentError"],
  [() => m38.BeforeTypeCast, "ActiveRecord::AttributeMethods::BeforeTypeCast"],
  [() => m37.ClassMethods, "ActiveRecord::AttributeMethods::ClassMethods"],
  [() => m39.Dirty, "ActiveRecord::AttributeMethods::Dirty"],
  [
    () => m37.GeneratedAttributeMethods,
    "ActiveRecord::AttributeMethods::GeneratedAttributeMethods",
  ],
  [() => m40.Query, "ActiveRecord::AttributeMethods::Query"],
  [() => m41.Read, "ActiveRecord::AttributeMethods::Read"],
  [() => m42.Serialization, "ActiveRecord::AttributeMethods::Serialization"],
  [() => m42.ClassMethods, "ActiveRecord::AttributeMethods::Serialization::ClassMethods"],
  [
    () => m42.ColumnNotSerializableError,
    "ActiveRecord::AttributeMethods::Serialization::ColumnNotSerializableError",
  ],
  [() => m43.TimeZoneConversion, "ActiveRecord::AttributeMethods::TimeZoneConversion"],
  [
    () => m43.TimeZoneConverter,
    "ActiveRecord::AttributeMethods::TimeZoneConversion::TimeZoneConverter",
  ],
  [() => m44.Write, "ActiveRecord::AttributeMethods::Write"],
  [() => m45.AutosaveAssociation, "ActiveRecord::AutosaveAssociation"],
  [() => m46.Base, "ActiveRecord::Base"],
  [() => m137.Batches, "ActiveRecord::Batches"],
  [() => m138.BatchEnumerator, "ActiveRecord::Batches::BatchEnumerator"],
  [() => m139.Calculations, "ActiveRecord::Calculations"],
  [() => m139.ColumnAliasTracker, "ActiveRecord::Calculations::ColumnAliasTracker"],
  [() => m47.ColumnSerializer, "ActiveRecord::Coders::ColumnSerializer"],
  [() => m48.YAMLColumn, "ActiveRecord::Coders::YAMLColumn"],
  [() => m17.CompositePrimaryKeyMismatchError, "ActiveRecord::CompositePrimaryKeyMismatchError"],
  [() => m120.ConcurrentMigrationError, "ActiveRecord::ConcurrentMigrationError"],
  [() => m102.ConfigurationError, "ActiveRecord::ConfigurationError"],
  [() => m49.AbstractAdapter, "ActiveRecord::ConnectionAdapters::AbstractAdapter"],
  [() => m49.Version, "ActiveRecord::ConnectionAdapters::AbstractAdapter::Version"],
  [() => m59.AddColumnDefinition, "ActiveRecord::ConnectionAdapters::AddColumnDefinition"],
  [() => m59.AlterTable, "ActiveRecord::ConnectionAdapters::AlterTable"],
  [() => m68.BoundSchemaReflection, "ActiveRecord::ConnectionAdapters::BoundSchemaReflection"],
  [() => m68.FakePool, "ActiveRecord::ConnectionAdapters::BoundSchemaReflection::FakePool"],
  [
    () => m59.ChangeColumnDefaultDefinition,
    "ActiveRecord::ConnectionAdapters::ChangeColumnDefaultDefinition",
  ],
  [() => m59.ChangeColumnDefinition, "ActiveRecord::ConnectionAdapters::ChangeColumnDefinition"],
  [
    () => m59.CheckConstraintDefinition,
    "ActiveRecord::ConnectionAdapters::CheckConstraintDefinition",
  ],
  [() => m63.Column, "ActiveRecord::ConnectionAdapters::Column"],
  [() => m59.ColumnDefinition, "ActiveRecord::ConnectionAdapters::ColumnDefinition"],
  [() => m59.ColumnMethods, "ActiveRecord::ConnectionAdapters::ColumnMethods"],
  [() => m50.ConnectionHandler, "ActiveRecord::ConnectionAdapters::ConnectionHandler"],
  [
    () => m50.ConnectionDescriptor,
    "ActiveRecord::ConnectionAdapters::ConnectionHandler::ConnectionDescriptor",
  ],
  [() => m51.ConnectionPool, "ActiveRecord::ConnectionAdapters::ConnectionPool"],
  [() => m52.BiasableQueue, "ActiveRecord::ConnectionAdapters::ConnectionPool::BiasableQueue"],
  [
    () => m52.BiasedConditionVariable,
    "ActiveRecord::ConnectionAdapters::ConnectionPool::BiasableQueue::BiasedConditionVariable",
  ],
  [
    () => m52.ConnectionLeasingQueue,
    "ActiveRecord::ConnectionAdapters::ConnectionPool::ConnectionLeasingQueue",
  ],
  [() => m51.Lease, "ActiveRecord::ConnectionAdapters::ConnectionPool::Lease"],
  [() => m51.LeaseRegistry, "ActiveRecord::ConnectionAdapters::ConnectionPool::LeaseRegistry"],
  [() => m52.Queue, "ActiveRecord::ConnectionAdapters::ConnectionPool::Queue"],
  [() => m53.Reaper, "ActiveRecord::ConnectionAdapters::ConnectionPool::Reaper"],
  [
    () => m51.WeakThreadKeyMap,
    "ActiveRecord::ConnectionAdapters::ConnectionPool::WeakThreadKeyMap",
  ],
  [() => m59.CreateIndexDefinition, "ActiveRecord::ConnectionAdapters::CreateIndexDefinition"],
  [() => m54.DatabaseStatements, "ActiveRecord::ConnectionAdapters::DatabaseStatements"],
  [() => m64.Deduplicable, "ActiveRecord::ConnectionAdapters::Deduplicable"],
  [() => m64.ClassMethods, "ActiveRecord::ConnectionAdapters::Deduplicable::ClassMethods"],
  [() => m59.ForeignKeyDefinition, "ActiveRecord::ConnectionAdapters::ForeignKeyDefinition"],
  [() => m59.IndexDefinition, "ActiveRecord::ConnectionAdapters::IndexDefinition"],
  [() => m63.NullColumn, "ActiveRecord::ConnectionAdapters::NullColumn"],
  [() => m51.NullPool, "ActiveRecord::ConnectionAdapters::NullPool"],
  [() => m51.NullConfig, "ActiveRecord::ConnectionAdapters::NullPool::NullConfig"],
  [() => m62.NullTransaction, "ActiveRecord::ConnectionAdapters::NullTransaction"],
  [() => m65.PoolConfig, "ActiveRecord::ConnectionAdapters::PoolConfig"],
  [() => m66.PoolManager, "ActiveRecord::ConnectionAdapters::PoolManager"],
  [() => m67.RangeType, "ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Range"],
  [() => m59.PrimaryKeyDefinition, "ActiveRecord::ConnectionAdapters::PrimaryKeyDefinition"],
  [() => m55.QueryCache, "ActiveRecord::ConnectionAdapters::QueryCache"],
  [
    () => m55.ConnectionPoolConfiguration,
    "ActiveRecord::ConnectionAdapters::QueryCache::ConnectionPoolConfiguration",
  ],
  [
    () => m55.QueryCacheRegistry,
    "ActiveRecord::ConnectionAdapters::QueryCache::QueryCacheRegistry",
  ],
  [() => m55.Store, "ActiveRecord::ConnectionAdapters::QueryCache::Store"],
  [() => m56.Quoting, "ActiveRecord::ConnectionAdapters::Quoting"],
  [() => m56.ClassMethods, "ActiveRecord::ConnectionAdapters::Quoting::ClassMethods"],
  [() => m62.RealTransaction, "ActiveRecord::ConnectionAdapters::RealTransaction"],
  [() => m59.ReferenceDefinition, "ActiveRecord::ConnectionAdapters::ReferenceDefinition"],
  [
    () => m62.RestartParentTransaction,
    "ActiveRecord::ConnectionAdapters::RestartParentTransaction",
  ],
  [() => m57.Savepoints, "ActiveRecord::ConnectionAdapters::Savepoints"],
  [() => m62.SavepointTransaction, "ActiveRecord::ConnectionAdapters::SavepointTransaction"],
  [() => m68.SchemaCache, "ActiveRecord::ConnectionAdapters::SchemaCache"],
  [() => m58.SchemaCreation, "ActiveRecord::ConnectionAdapters::SchemaCreation"],
  [() => m60.SchemaDumper, "ActiveRecord::ConnectionAdapters::SchemaDumper"],
  [() => m68.SchemaReflection, "ActiveRecord::ConnectionAdapters::SchemaReflection"],
  [() => m61.SchemaStatements, "ActiveRecord::ConnectionAdapters::SchemaStatements"],
  [() => m69.SqlTypeMetadata, "ActiveRecord::ConnectionAdapters::SqlTypeMetadata"],
  [() => m70.StatementPool, "ActiveRecord::ConnectionAdapters::StatementPool"],
  [() => m59.Table, "ActiveRecord::ConnectionAdapters::Table"],
  [() => m59.TableDefinition, "ActiveRecord::ConnectionAdapters::TableDefinition"],
  [() => m62.Transaction, "ActiveRecord::ConnectionAdapters::Transaction"],
  [() => m62.Callback, "ActiveRecord::ConnectionAdapters::Transaction::Callback"],
  [() => m62.TransactionInstrumenter, "ActiveRecord::ConnectionAdapters::TransactionInstrumenter"],
  [
    () => m62.InstrumentationAlreadyStartedError,
    "ActiveRecord::ConnectionAdapters::TransactionInstrumenter::InstrumentationAlreadyStartedError",
  ],
  [
    () => m62.InstrumentationNotStartedError,
    "ActiveRecord::ConnectionAdapters::TransactionInstrumenter::InstrumentationNotStartedError",
  ],
  [() => m62.TransactionManager, "ActiveRecord::ConnectionAdapters::TransactionManager"],
  [() => m62.TransactionState, "ActiveRecord::ConnectionAdapters::TransactionState"],
  [() => m102.ConnectionFailed, "ActiveRecord::ConnectionFailed"],
  [() => m71.ConnectionHandling, "ActiveRecord::ConnectionHandling"],
  [() => m102.ConnectionNotDefined, "ActiveRecord::ConnectionNotDefined"],
  [() => m102.ConnectionNotEstablished, "ActiveRecord::ConnectionNotEstablished"],
  [() => m102.ConnectionTimeoutError, "ActiveRecord::ConnectionTimeoutError"],
  [() => m72.Core, "ActiveRecord::Core"],
  [() => m72.InspectionMask, "ActiveRecord::Core::InspectionMask"],
  [() => m73.CounterCache, "ActiveRecord::CounterCache"],
  [() => m73.ClassMethods, "ActiveRecord::CounterCache::ClassMethods"],
  [() => m102.DangerousAttributeError, "ActiveRecord::DangerousAttributeError"],
  [() => m102.DatabaseAlreadyExists, "ActiveRecord::DatabaseAlreadyExists"],
  [() => m74.DatabaseConfigurations, "ActiveRecord::DatabaseConfigurations"],
  [() => m75.ConnectionUrlResolver, "ActiveRecord::DatabaseConfigurations::ConnectionUrlResolver"],
  [() => m76.DatabaseConfig, "ActiveRecord::DatabaseConfigurations::DatabaseConfig"],
  [() => m77.HashConfig, "ActiveRecord::DatabaseConfigurations::HashConfig"],
  [
    () => m74.InvalidConfigurationError,
    "ActiveRecord::DatabaseConfigurations::InvalidConfigurationError",
  ],
  [() => m78.UrlConfig, "ActiveRecord::DatabaseConfigurations::UrlConfig"],
  [() => m102.DatabaseConnectionError, "ActiveRecord::DatabaseConnectionError"],
  [() => m102.DatabaseVersionError, "ActiveRecord::DatabaseVersionError"],
  [() => m102.Deadlocked, "ActiveRecord::Deadlocked"],
  [() => m140.ClassSpecificRelation, "ActiveRecord::Delegation::ClassSpecificRelation"],
  [() => m140.GeneratedRelationMethods, "ActiveRecord::Delegation::GeneratedRelationMethods"],
  [() => m17.DeleteRestrictionError, "ActiveRecord::DeleteRestrictionError"],
  [() => m79.DisableJoinsAssociationRelation, "ActiveRecord::DisableJoinsAssociationRelation"],
  [() => m120.DuplicateMigrationNameError, "ActiveRecord::DuplicateMigrationNameError"],
  [() => m120.DuplicateMigrationVersionError, "ActiveRecord::DuplicateMigrationVersionError"],
  [() => m80.DynamicMatchers, "ActiveRecord::DynamicMatchers"],
  [() => m80.FindBy, "ActiveRecord::DynamicMatchers::FindBy"],
  [() => m80.FindByBang, "ActiveRecord::DynamicMatchers::FindByBang"],
  [() => m80.Method, "ActiveRecord::DynamicMatchers::Method"],
  [() => m17.EagerLoadPolymorphicError, "ActiveRecord::EagerLoadPolymorphicError"],
  [() => m81.AutoFilteredParameters, "ActiveRecord::Encryption::AutoFilteredParameters"],
  [() => m82.Cipher, "ActiveRecord::Encryption::Cipher"],
  [() => m83.Aes256Gcm, "ActiveRecord::Encryption::Cipher::Aes256Gcm"],
  [() => m84.Config, "ActiveRecord::Encryption::Config"],
  [() => m85.Context, "ActiveRecord::Encryption::Context"],
  [() => m86.DerivedSecretKeyProvider, "ActiveRecord::Encryption::DerivedSecretKeyProvider"],
  [() => m87.DeterministicKeyProvider, "ActiveRecord::Encryption::DeterministicKeyProvider"],
  [() => m88.EncryptedAttributeType, "ActiveRecord::Encryption::EncryptedAttributeType"],
  [() => m89.EncryptingOnlyEncryptor, "ActiveRecord::Encryption::EncryptingOnlyEncryptor"],
  [() => m90.Encryptor, "ActiveRecord::Encryption::Encryptor"],
  [() => m91.Base, "ActiveRecord::Encryption::Errors::Base"],
  [() => m91.Configuration, "ActiveRecord::Encryption::Errors::Configuration"],
  [() => m91.Decryption, "ActiveRecord::Encryption::Errors::Decryption"],
  [() => m91.Encoding, "ActiveRecord::Encryption::Errors::Encoding"],
  [
    () => m91.EncryptedContentIntegrity,
    "ActiveRecord::Encryption::Errors::EncryptedContentIntegrity",
  ],
  [() => m91.Encryption, "ActiveRecord::Encryption::Errors::Encryption"],
  [() => m91.ForbiddenClass, "ActiveRecord::Encryption::Errors::ForbiddenClass"],
  [
    () => m92.EncryptedUniquenessValidator,
    "ActiveRecord::Encryption::ExtendedDeterministicUniquenessValidator::EncryptedUniquenessValidator",
  ],
  [() => m95.Key, "ActiveRecord::Encryption::Key"],
  [() => m93.KeyGenerator, "ActiveRecord::Encryption::KeyGenerator"],
  [() => m94.KeyProvider, "ActiveRecord::Encryption::KeyProvider"],
  [() => m97.Message, "ActiveRecord::Encryption::Message"],
  [() => m96.MessageSerializer, "ActiveRecord::Encryption::MessageSerializer"],
  [() => m98.NullEncryptor, "ActiveRecord::Encryption::NullEncryptor"],
  [() => m99.Properties, "ActiveRecord::Encryption::Properties"],
  [() => m100.Scheme, "ActiveRecord::Encryption::Scheme"],
  [() => m101.Enum, "ActiveRecord::Enum"],
  [() => m101.EnumMethods, "ActiveRecord::Enum::EnumMethods"],
  [() => m101.EnumType, "ActiveRecord::Enum::EnumType"],
  [() => m120.EnvironmentMismatchError, "ActiveRecord::EnvironmentMismatchError"],
  [() => m120.EnvironmentStorageError, "ActiveRecord::EnvironmentStorageError"],
  [() => m102.ExclusiveConnectionTimeoutError, "ActiveRecord::ExclusiveConnectionTimeoutError"],
  [() => m103.ExplainRegistry, "ActiveRecord::ExplainRegistry"],
  [() => m104.ExplainSubscriber, "ActiveRecord::ExplainSubscriber"],
  [() => m141.FinderMethods, "ActiveRecord::FinderMethods"],
  [() => m105.FutureResult, "ActiveRecord::FutureResult"],
  [() => m105.Complete, "ActiveRecord::FutureResult::Complete"],
  [() => m105.EventBuffer, "ActiveRecord::FutureResult::EventBuffer"],
  [() => m105.SelectAll, "ActiveRecord::FutureResult::SelectAll"],
  [
    () => m17.HasManyThroughAssociationNotFoundError,
    "ActiveRecord::HasManyThroughAssociationNotFoundError",
  ],
  [
    () => m17.HasManyThroughAssociationPointlessSourceTypeError,
    "ActiveRecord::HasManyThroughAssociationPointlessSourceTypeError",
  ],
  [
    () => m17.HasManyThroughAssociationPolymorphicSourceError,
    "ActiveRecord::HasManyThroughAssociationPolymorphicSourceError",
  ],
  [
    () => m17.HasManyThroughAssociationPolymorphicThroughError,
    "ActiveRecord::HasManyThroughAssociationPolymorphicThroughError",
  ],
  [
    () => m17.HasManyThroughCantAssociateThroughHasOneOrManyReflection,
    "ActiveRecord::HasManyThroughCantAssociateThroughHasOneOrManyReflection",
  ],
  [
    () => m17.HasManyThroughNestedAssociationsAreReadonly,
    "ActiveRecord::HasManyThroughNestedAssociationsAreReadonly",
  ],
  [() => m17.HasManyThroughOrderError, "ActiveRecord::HasManyThroughOrderError"],
  [
    () => m17.HasManyThroughSourceAssociationNotFoundError,
    "ActiveRecord::HasManyThroughSourceAssociationNotFoundError",
  ],
  [
    () => m17.HasOneAssociationPolymorphicThroughError,
    "ActiveRecord::HasOneAssociationPolymorphicThroughError",
  ],
  [
    () => m17.HasOneThroughCantAssociateThroughCollection,
    "ActiveRecord::HasOneThroughCantAssociateThroughCollection",
  ],
  [
    () => m17.HasOneThroughCantAssociateThroughHasOneOrManyReflection,
    "ActiveRecord::HasOneThroughCantAssociateThroughHasOneOrManyReflection",
  ],
  [
    () => m17.HasOneThroughNestedAssociationsAreReadonly,
    "ActiveRecord::HasOneThroughNestedAssociationsAreReadonly",
  ],
  [() => m120.IllegalMigrationNameError, "ActiveRecord::IllegalMigrationNameError"],
  [() => m107.Inheritance, "ActiveRecord::Inheritance"],
  [() => m107.ClassMethods, "ActiveRecord::Inheritance::ClassMethods"],
  [() => m108.InsertAll, "ActiveRecord::InsertAll"],
  [() => m108.Builder, "ActiveRecord::InsertAll::Builder"],
  [() => m109.Integration, "ActiveRecord::Integration"],
  [() => m109.ClassMethods, "ActiveRecord::Integration::ClassMethods"],
  [() => m110.InternalMetadata, "ActiveRecord::InternalMetadata"],
  [() => m110.NullInternalMetadata, "ActiveRecord::InternalMetadata::NullInternalMetadata"],
  [() => m102.InvalidForeignKey, "ActiveRecord::InvalidForeignKey"],
  [() => m120.InvalidMigrationTimestampError, "ActiveRecord::InvalidMigrationTimestampError"],
  [() => m17.InverseOfAssociationNotFoundError, "ActiveRecord::InverseOfAssociationNotFoundError"],
  [
    () => m17.InverseOfAssociationRecursiveError,
    "ActiveRecord::InverseOfAssociationRecursiveError",
  ],
  [() => m120.IrreversibleMigration, "ActiveRecord::IrreversibleMigration"],
  [() => m102.IrreversibleOrderError, "ActiveRecord::IrreversibleOrderError"],
  [() => m111.LegacyYamlAdapter, "ActiveRecord::LegacyYamlAdapter"],
  [() => m112.LockingType, "ActiveRecord::Locking::LockingType"],
  [() => m112.Optimistic, "ActiveRecord::Locking::Optimistic"],
  [() => m113.Pessimistic, "ActiveRecord::Locking::Pessimistic"],
  [() => m102.LockWaitTimeout, "ActiveRecord::LockWaitTimeout"],
  [() => m114.LogSubscriber, "ActiveRecord::LogSubscriber"],
  [() => m115.Methods, "ActiveRecord::Marshalling::Methods"],
  [() => m116.DatabaseSelector, "ActiveRecord::Middleware::DatabaseSelector"],
  [() => m117.Resolver, "ActiveRecord::Middleware::DatabaseSelector::Resolver"],
  [() => m118.Session, "ActiveRecord::Middleware::DatabaseSelector::Resolver::Session"],
  [() => m119.ShardSelector, "ActiveRecord::Middleware::ShardSelector"],
  [() => m120.Migration, "ActiveRecord::Migration"],
  [() => m120.CheckPending, "ActiveRecord::Migration::CheckPending"],
  [() => m121.CommandRecorder, "ActiveRecord::Migration::CommandRecorder"],
  [() => m122.V4_2, "ActiveRecord::Migration::Compatibility::V4_2"],
  [() => m122.V5_0, "ActiveRecord::Migration::Compatibility::V5_0"],
  [() => m122.V5_1, "ActiveRecord::Migration::Compatibility::V5_1"],
  [() => m122.V5_2, "ActiveRecord::Migration::Compatibility::V5_2"],
  [() => m122.V6_0, "ActiveRecord::Migration::Compatibility::V6_0"],
  [() => m122.V6_1, "ActiveRecord::Migration::Compatibility::V6_1"],
  [() => m122.V7_0, "ActiveRecord::Migration::Compatibility::V7_0"],
  [() => m122.V7_1, "ActiveRecord::Migration::Compatibility::V7_1"],
  [() => m122.V7_2, "ActiveRecord::Migration::Compatibility::V7_2"],
  [() => m120.Current, "ActiveRecord::Migration::Current"],
  [() => m123.DefaultStrategy, "ActiveRecord::Migration::DefaultStrategy"],
  [() => m124.ExecutionStrategy, "ActiveRecord::Migration::ExecutionStrategy"],
  [() => m120.ReversibleBlockHelper, "ActiveRecord::Migration::ReversibleBlockHelper"],
  [() => m120.MigrationContext, "ActiveRecord::MigrationContext"],
  [() => m120.MigrationError, "ActiveRecord::MigrationError"],
  [() => m120.MigrationProxy, "ActiveRecord::MigrationProxy"],
  [() => m120.Migrator, "ActiveRecord::Migrator"],
  [() => m102.MismatchedForeignKey, "ActiveRecord::MismatchedForeignKey"],
  [() => m126.ModelSchema, "ActiveRecord::ModelSchema"],
  [() => m126.ClassMethods, "ActiveRecord::ModelSchema::ClassMethods"],
  [() => m102.MultiparameterAssignmentErrors, "ActiveRecord::MultiparameterAssignmentErrors"],
  [() => m127.NestedAttributes, "ActiveRecord::NestedAttributes"],
  [() => m127.TooManyRecords, "ActiveRecord::NestedAttributes::TooManyRecords"],
  [() => m102.NoDatabaseError, "ActiveRecord::NoDatabaseError"],
  [() => m120.NoEnvironmentInSchemaError, "ActiveRecord::NoEnvironmentInSchemaError"],
  [() => m129.Normalization, "ActiveRecord::Normalization"],
  [() => m129.ClassMethods, "ActiveRecord::Normalization::ClassMethods"],
  [() => m129.NormalizedValueType, "ActiveRecord::Normalization::NormalizedValueType"],
  [() => m102.NotNullViolation, "ActiveRecord::NotNullViolation"],
  [() => m128.NoTouching, "ActiveRecord::NoTouching"],
  [() => m125.PendingMigrationConnection, "ActiveRecord::PendingMigrationConnection"],
  [() => m120.PendingMigrationError, "ActiveRecord::PendingMigrationError"],
  [() => m130.Persistence, "ActiveRecord::Persistence"],
  [() => m144.PredicateBuilder, "ActiveRecord::PredicateBuilder"],
  [() => m145.ArrayHandler, "ActiveRecord::PredicateBuilder::ArrayHandler"],
  [() => m145.NullPredicate, "ActiveRecord::PredicateBuilder::ArrayHandler::NullPredicate"],
  [() => m146.AssociationQueryValue, "ActiveRecord::PredicateBuilder::AssociationQueryValue"],
  [() => m147.BasicObjectHandler, "ActiveRecord::PredicateBuilder::BasicObjectHandler"],
  [() => m148.PolymorphicArrayValue, "ActiveRecord::PredicateBuilder::PolymorphicArrayValue"],
  [() => m149.RangeHandler, "ActiveRecord::PredicateBuilder::RangeHandler"],
  [() => m149.RangeWithBinds, "ActiveRecord::PredicateBuilder::RangeHandler::RangeWithBinds"],
  [() => m150.RelationHandler, "ActiveRecord::PredicateBuilder::RelationHandler"],
  [() => m102.PreparedStatementCacheExpired, "ActiveRecord::PreparedStatementCacheExpired"],
  [() => m102.PreparedStatementInvalid, "ActiveRecord::PreparedStatementInvalid"],
  [() => m120.ProtectedEnvironmentError, "ActiveRecord::ProtectedEnvironmentError"],
  [() => m102.QueryAborted, "ActiveRecord::QueryAborted"],
  [() => m131.QueryCache, "ActiveRecord::QueryCache"],
  [() => m131.ClassMethods, "ActiveRecord::QueryCache::ClassMethods"],
  [() => m102.QueryCanceled, "ActiveRecord::QueryCanceled"],
  [() => m133.GetKeyHandler, "ActiveRecord::QueryLogs::GetKeyHandler"],
  [() => m133.IdentityHandler, "ActiveRecord::QueryLogs::IdentityHandler"],
  [() => m132.SQLCommenter, "ActiveRecord::QueryLogs::SQLCommenter"],
  [() => m133.ZeroArityHandler, "ActiveRecord::QueryLogs::ZeroArityHandler"],
  [() => m152.QueryMethods, "ActiveRecord::QueryMethods"],
  [() => m152.CTEJoin, "ActiveRecord::QueryMethods::CTEJoin"],
  [() => m152.WhereChain, "ActiveRecord::QueryMethods::WhereChain"],
  [() => m102.RangeError, "ActiveRecord::RangeError"],
  [() => m134.ReadonlyAttributeError, "ActiveRecord::ReadonlyAttributeError"],
  [() => m134.ReadonlyAttributes, "ActiveRecord::ReadonlyAttributes"],
  [() => m134.ClassMethods, "ActiveRecord::ReadonlyAttributes::ClassMethods"],
  [() => m134.HasReadonlyAttributes, "ActiveRecord::ReadonlyAttributes::HasReadonlyAttributes"],
  [() => m102.ReadOnlyError, "ActiveRecord::ReadOnlyError"],
  [() => m102.ReadOnlyRecord, "ActiveRecord::ReadOnlyRecord"],
  [() => m191.RecordInvalid, "ActiveRecord::RecordInvalid"],
  [() => m102.RecordNotDestroyed, "ActiveRecord::RecordNotDestroyed"],
  [() => m102.RecordNotFound, "ActiveRecord::RecordNotFound"],
  [() => m102.RecordNotSaved, "ActiveRecord::RecordNotSaved"],
  [() => m102.RecordNotUnique, "ActiveRecord::RecordNotUnique"],
  [() => m135.Reflection, "ActiveRecord::Reflection"],
  [() => m135.AbstractReflection, "ActiveRecord::Reflection::AbstractReflection"],
  [() => m135.AggregateReflection, "ActiveRecord::Reflection::AggregateReflection"],
  [() => m135.AssociationReflection, "ActiveRecord::Reflection::AssociationReflection"],
  [() => m135.BelongsToReflection, "ActiveRecord::Reflection::BelongsToReflection"],
  [() => m135.ClassMethods, "ActiveRecord::Reflection::ClassMethods"],
  [
    () => m135.HasAndBelongsToManyReflection,
    "ActiveRecord::Reflection::HasAndBelongsToManyReflection",
  ],
  [() => m135.HasManyReflection, "ActiveRecord::Reflection::HasManyReflection"],
  [() => m135.HasOneReflection, "ActiveRecord::Reflection::HasOneReflection"],
  [() => m135.MacroReflection, "ActiveRecord::Reflection::MacroReflection"],
  [() => m135.PolymorphicReflection, "ActiveRecord::Reflection::PolymorphicReflection"],
  [() => m135.RuntimeReflection, "ActiveRecord::Reflection::RuntimeReflection"],
  [() => m135.ThroughReflection, "ActiveRecord::Reflection::ThroughReflection"],
  [() => m136.Relation, "ActiveRecord::Relation"],
  [() => m136.ExplainProxy, "ActiveRecord::Relation::ExplainProxy"],
  [() => m142.FromClause, "ActiveRecord::Relation::FromClause"],
  [() => m143.HashMerger, "ActiveRecord::Relation::HashMerger"],
  [() => m143.Merger, "ActiveRecord::Relation::Merger"],
  [() => m151.QueryAttribute, "ActiveRecord::Relation::QueryAttribute"],
  [() => m154.WhereClause, "ActiveRecord::Relation::WhereClause"],
  [() => m155.Result, "ActiveRecord::Result"],
  [() => m155.IndexedRow, "ActiveRecord::Result::IndexedRow"],
  [() => m102.Rollback, "ActiveRecord::Rollback"],
  [() => m156.ClassMethods, "ActiveRecord::Sanitization::ClassMethods"],
  [() => m159.Schema, "ActiveRecord::Schema"],
  [() => m159.Definition, "ActiveRecord::Schema::Definition"],
  [() => m157.SchemaDumper, "ActiveRecord::SchemaDumper"],
  [() => m158.SchemaMigration, "ActiveRecord::SchemaMigration"],
  [() => m158.NullSchemaMigration, "ActiveRecord::SchemaMigration::NullSchemaMigration"],
  [() => m161.DefaultScope, "ActiveRecord::Scoping::DefaultScope"],
  [() => m162.ClassMethods, "ActiveRecord::Scoping::Named::ClassMethods"],
  [() => m160.ScopeRegistry, "ActiveRecord::Scoping::ScopeRegistry"],
  [() => m163.MinimumLengthError, "ActiveRecord::SecureToken::MinimumLengthError"],
  [() => m102.SerializationFailure, "ActiveRecord::SerializationFailure"],
  [() => m102.SerializationTypeMismatch, "ActiveRecord::SerializationTypeMismatch"],
  [() => m164.SignedId, "ActiveRecord::SignedId"],
  [() => m102.SoleRecordExceeded, "ActiveRecord::SoleRecordExceeded"],
  [() => m153.SpawnMethods, "ActiveRecord::SpawnMethods"],
  [() => m102.SQLWarning, "ActiveRecord::SQLWarning"],
  [() => m102.StaleObjectError, "ActiveRecord::StaleObjectError"],
  [() => m165.StatementCache, "ActiveRecord::StatementCache"],
  [() => m165.BindMap, "ActiveRecord::StatementCache::BindMap"],
  [() => m165.Params, "ActiveRecord::StatementCache::Params"],
  [() => m165.PartialQuery, "ActiveRecord::StatementCache::PartialQuery"],
  [() => m165.PartialQueryCollector, "ActiveRecord::StatementCache::PartialQueryCollector"],
  [() => m165.Query, "ActiveRecord::StatementCache::Query"],
  [() => m165.Substitute, "ActiveRecord::StatementCache::Substitute"],
  [() => m102.StatementInvalid, "ActiveRecord::StatementInvalid"],
  [() => m102.StatementTimeout, "ActiveRecord::StatementTimeout"],
  [() => m166.ClassMethods, "ActiveRecord::Store::ClassMethods"],
  [() => m166.HashAccessor, "ActiveRecord::Store::HashAccessor"],
  [() => m166.IndifferentCoder, "ActiveRecord::Store::IndifferentCoder"],
  [() => m166.IndifferentHashAccessor, "ActiveRecord::Store::IndifferentHashAccessor"],
  [() => m166.StringKeyedHashAccessor, "ActiveRecord::Store::StringKeyedHashAccessor"],
  [() => m102.StrictLoadingViolationError, "ActiveRecord::StrictLoadingViolationError"],
  [() => m102.SubclassNotFound, "ActiveRecord::SubclassNotFound"],
  [() => m167.TableMetadata, "ActiveRecord::TableMetadata"],
  [() => m102.TableNotSpecified, "ActiveRecord::TableNotSpecified"],
  [() => m168.DatabaseNotSupported, "ActiveRecord::Tasks::DatabaseNotSupported"],
  [() => m169.MySQLDatabaseTasks, "ActiveRecord::Tasks::MySQLDatabaseTasks"],
  [() => m170.PostgreSQLDatabaseTasks, "ActiveRecord::Tasks::PostgreSQLDatabaseTasks"],
  [() => m171.SQLiteDatabaseTasks, "ActiveRecord::Tasks::SQLiteDatabaseTasks"],
  [
    () => m17.ThroughCantAssociateThroughHasOneOrManyReflection,
    "ActiveRecord::ThroughCantAssociateThroughHasOneOrManyReflection",
  ],
  [
    () => m17.ThroughNestedAssociationsAreReadonly,
    "ActiveRecord::ThroughNestedAssociationsAreReadonly",
  ],
  [() => m172.Timestamp, "ActiveRecord::Timestamp"],
  [() => m173.TokenFor, "ActiveRecord::TokenFor"],
  [() => m173.TokenDefinition, "ActiveRecord::TokenFor::TokenDefinition"],
  [() => m174.TouchLater, "ActiveRecord::TouchLater"],
  [() => m175.Transaction, "ActiveRecord::Transaction"],
  [() => m102.TransactionIsolationError, "ActiveRecord::TransactionIsolationError"],
  [() => m102.TransactionRollbackError, "ActiveRecord::TransactionRollbackError"],
  [() => m176.Transactions, "ActiveRecord::Transactions"],
  [() => m177.Translation, "ActiveRecord::Translation"],
  [() => m180.AdapterSpecificRegistry, "ActiveRecord::Type::AdapterSpecificRegistry"],
  [() => m182.Date, "ActiveRecord::Type::Date"],
  [() => m181.DateTime, "ActiveRecord::Type::DateTime"],
  [() => m183.DecimalWithoutScale, "ActiveRecord::Type::DecimalWithoutScale"],
  [() => m180.DecorationRegistration, "ActiveRecord::Type::DecorationRegistration"],
  [() => m184.HashLookupTypeMap, "ActiveRecord::Type::HashLookupTypeMap"],
  [() => m185.Json, "ActiveRecord::Type::Json"],
  [() => m180.Registration, "ActiveRecord::Type::Registration"],
  [() => m186.Serialized, "ActiveRecord::Type::Serialized"],
  [() => m187.Text, "ActiveRecord::Type::Text"],
  [() => m188.Time, "ActiveRecord::Type::Time"],
  [() => m188.Value, "ActiveRecord::Type::Time::Value"],
  [() => m189.TypeMap, "ActiveRecord::Type::TypeMap"],
  [() => m190.UnsignedInteger, "ActiveRecord::Type::UnsignedInteger"],
  [() => m178.Connection, "ActiveRecord::TypeCaster::Connection"],
  [() => m179.Map, "ActiveRecord::TypeCaster::Map"],
  [() => m180.TypeConflictError, "ActiveRecord::TypeConflictError"],
  [() => m102.UnknownAttributeReference, "ActiveRecord::UnknownAttributeReference"],
  [() => m120.UnknownMigrationVersionError, "ActiveRecord::UnknownMigrationVersionError"],
  [() => m102.UnknownPrimaryKey, "ActiveRecord::UnknownPrimaryKey"],
  [() => m102.UnmodifiableRelation, "ActiveRecord::UnmodifiableRelation"],
  [() => m191.Validations, "ActiveRecord::Validations"],
  [() => m192.AbsenceValidator, "ActiveRecord::Validations::AbsenceValidator"],
  [() => m193.AssociatedValidator, "ActiveRecord::Validations::AssociatedValidator"],
  [() => m192.ClassMethods, "ActiveRecord::Validations::ClassMethods"],
  [() => m194.LengthValidator, "ActiveRecord::Validations::LengthValidator"],
  [() => m195.NumericalityValidator, "ActiveRecord::Validations::NumericalityValidator"],
  [() => m196.PresenceValidator, "ActiveRecord::Validations::PresenceValidator"],
  [() => m197.UniquenessValidator, "ActiveRecord::Validations::UniquenessValidator"],
  [() => m102.ValueTooLong, "ActiveRecord::ValueTooLong"],
  [() => m106.VERSION, "ActiveRecord::VERSION"],
  [() => m102.WrappedDatabaseException, "ActiveRecord::WrappedDatabaseException"],
]);

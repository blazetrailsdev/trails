import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./aggregations.js";
import * as m1 from "./association-relation.js";
import * as m2 from "./associations.js";
import * as m3 from "./associations/alias-tracker.js";
import * as m4 from "./associations/association-scope.js";
import * as m5 from "./associations/association.js";
import * as m6 from "./associations/belongs-to-association.js";
import * as m7 from "./associations/belongs-to-polymorphic-association.js";
import * as m8 from "./associations/builder/association.js";
import * as m9 from "./associations/builder/belongs-to.js";
import * as m10 from "./associations/builder/collection-association.js";
import * as m11 from "./associations/builder/has-and-belongs-to-many.js";
import * as m12 from "./associations/builder/has-many.js";
import * as m13 from "./associations/builder/has-one.js";
import * as m14 from "./associations/builder/singular-association.js";
import * as m15 from "./associations/collection-association.js";
import * as m16 from "./associations/collection-proxy.js";
import * as m17 from "./associations/disable-joins-association-scope.js";
import * as m18 from "./associations/errors.js";
import * as m19 from "./associations/foreign-association.js";
import * as m20 from "./associations/has-many-association.js";
import * as m21 from "./associations/has-many-through-association.js";
import * as m22 from "./associations/has-one-association.js";
import * as m23 from "./associations/has-one-through-association.js";
import * as m24 from "./associations/join-dependency.js";
import * as m25 from "./associations/join-dependency/join-association.js";
import * as m26 from "./associations/join-dependency/join-base.js";
import * as m27 from "./associations/join-dependency/join-part.js";
import * as m28 from "./associations/nested-error.js";
import * as m29 from "./associations/preloader.js";
import * as m30 from "./associations/preloader/association.js";
import * as m31 from "./associations/preloader/batch.js";
import * as m32 from "./associations/preloader/branch.js";
import * as m33 from "./associations/preloader/through-association.js";
import * as m34 from "./associations/singular-association.js";
import * as m35 from "./associations/through-association.js";
import * as m36 from "./asynchronous-queries-tracker.js";
import * as m37 from "./attribute-assignment.js";
import * as m38 from "./attribute-methods.js";
import * as m39 from "./attribute-methods/before-type-cast.js";
import * as m40 from "./attribute-methods/composite-primary-key.js";
import * as m41 from "./attribute-methods/dirty.js";
import * as m42 from "./attribute-methods/primary-key.js";
import * as m43 from "./attribute-methods/query.js";
import * as m44 from "./attribute-methods/read.js";
import * as m45 from "./attribute-methods/serialization.js";
import * as m46 from "./attribute-methods/time-zone-conversion.js";
import * as m47 from "./attribute-methods/write.js";
import * as m48 from "./autosave-association.js";
import * as m49 from "./base.js";
import * as m50 from "./callbacks.js";
import * as m51 from "./coders/column-serializer.js";
import * as m52 from "./coders/json.js";
import * as m53 from "./coders/yaml-column.js";
import * as m54 from "./connection-adapters/abstract-adapter.js";
import * as m55 from "./connection-adapters/abstract/connection-handler.js";
import * as m56 from "./connection-adapters/abstract/connection-pool.js";
import * as m57 from "./connection-adapters/abstract/connection-pool/queue.js";
import * as m58 from "./connection-adapters/abstract/connection-pool/reaper.js";
import * as m59 from "./connection-adapters/abstract/database-statements.js";
import * as m60 from "./connection-adapters/abstract/query-cache.js";
import * as m61 from "./connection-adapters/abstract/quoting.js";
import * as m62 from "./connection-adapters/abstract/savepoints.js";
import * as m63 from "./connection-adapters/abstract/schema-creation.js";
import * as m64 from "./connection-adapters/abstract/schema-definitions.js";
import * as m65 from "./connection-adapters/abstract/schema-dumper.js";
import * as m66 from "./connection-adapters/abstract/schema-statements.js";
import * as m67 from "./connection-adapters/abstract/transaction.js";
import * as m68 from "./connection-adapters/column.js";
import * as m69 from "./connection-adapters/deduplicable.js";
import * as m70 from "./connection-adapters/pool-config.js";
import * as m71 from "./connection-adapters/pool-manager.js";
import * as m72 from "./connection-adapters/postgresql/oid/range.js";
import * as m73 from "./connection-adapters/schema-cache.js";
import * as m74 from "./connection-adapters/sql-type-metadata.js";
import * as m75 from "./connection-adapters/statement-pool.js";
import * as m76 from "./connection-handling.js";
import * as m77 from "./core.js";
import * as m78 from "./counter-cache.js";
import * as m79 from "./database-configurations.js";
import * as m80 from "./database-configurations/connection-url-resolver.js";
import * as m81 from "./database-configurations/database-config.js";
import * as m82 from "./database-configurations/hash-config.js";
import * as m83 from "./database-configurations/url-config.js";
import * as m84 from "./disable-joins-association-relation.js";
import * as m85 from "./dynamic-matchers.js";
import * as m86 from "./encryption.js";
import * as m87 from "./encryption/auto-filtered-parameters.js";
import * as m88 from "./encryption/cipher.js";
import * as m89 from "./encryption/cipher/aes256-gcm.js";
import * as m90 from "./encryption/config.js";
import * as m91 from "./encryption/configurable.js";
import * as m92 from "./encryption/context.js";
import * as m93 from "./encryption/contexts.js";
import * as m94 from "./encryption/derived-secret-key-provider.js";
import * as m95 from "./encryption/deterministic-key-provider.js";
import * as m96 from "./encryption/encryptable-record.js";
import * as m97 from "./encryption/encrypted-attribute-type.js";
import * as m98 from "./encryption/encrypting-only-encryptor.js";
import * as m99 from "./encryption/encryptor.js";
import * as m100 from "./encryption/errors.js";
import * as m101 from "./encryption/extended-deterministic-uniqueness-validator.js";
import * as m102 from "./encryption/key-generator.js";
import * as m103 from "./encryption/key-provider.js";
import * as m104 from "./encryption/key.js";
import * as m105 from "./encryption/message-serializer.js";
import * as m106 from "./encryption/message.js";
import * as m107 from "./encryption/null-encryptor.js";
import * as m108 from "./encryption/properties.js";
import * as m109 from "./encryption/scheme.js";
import * as m110 from "./enum.js";
import * as m111 from "./errors.js";
import * as m112 from "./explain-registry.js";
import * as m113 from "./explain-subscriber.js";
import * as m114 from "./explain.js";
import * as m115 from "./future-result.js";
import * as m116 from "./gem-version.js";
import * as m117 from "./inheritance.js";
import * as m118 from "./insert-all.js";
import * as m119 from "./integration.js";
import * as m120 from "./internal-metadata.js";
import * as m121 from "./legacy-yaml-adapter.js";
import * as m122 from "./locking/optimistic.js";
import * as m123 from "./locking/pessimistic.js";
import * as m124 from "./log-subscriber.js";
import * as m125 from "./marshalling.js";
import * as m126 from "./middleware/database-selector.js";
import * as m127 from "./middleware/database-selector/resolver.js";
import * as m128 from "./middleware/database-selector/resolver/session.js";
import * as m129 from "./middleware/shard-selector.js";
import * as m130 from "./migration.js";
import * as m131 from "./migration/command-recorder.js";
import * as m132 from "./migration/compatibility.js";
import * as m133 from "./migration/default-strategy.js";
import * as m134 from "./migration/execution-strategy.js";
import * as m135 from "./migration/pending-migration-connection.js";
import * as m136 from "./model-schema.js";
import * as m137 from "./nested-attributes.js";
import * as m138 from "./no-touching.js";
import * as m139 from "./normalization.js";
import * as m140 from "./persistence.js";
import * as m141 from "./query-cache.js";
import * as m142 from "./query-logs-formatter.js";
import * as m143 from "./query-logs.js";
import * as m144 from "./readonly-attributes.js";
import * as m145 from "./reflection.js";
import * as m146 from "./relation.js";
import * as m147 from "./relation/batches.js";
import * as m148 from "./relation/batches/batch-enumerator.js";
import * as m149 from "./relation/calculations.js";
import * as m150 from "./relation/delegation.js";
import * as m151 from "./relation/finder-methods.js";
import * as m152 from "./relation/from-clause.js";
import * as m153 from "./relation/merger.js";
import * as m154 from "./relation/predicate-builder.js";
import * as m155 from "./relation/predicate-builder/array-handler.js";
import * as m156 from "./relation/predicate-builder/association-query-value.js";
import * as m157 from "./relation/predicate-builder/basic-object-handler.js";
import * as m158 from "./relation/predicate-builder/polymorphic-array-value.js";
import * as m159 from "./relation/predicate-builder/range-handler.js";
import * as m160 from "./relation/predicate-builder/relation-handler.js";
import * as m161 from "./relation/query-attribute.js";
import * as m162 from "./relation/query-methods.js";
import * as m163 from "./relation/spawn-methods.js";
import * as m164 from "./relation/where-clause.js";
import * as m165 from "./result.js";
import * as m166 from "./sanitization.js";
import * as m167 from "./schema-dumper.js";
import * as m168 from "./schema-migration.js";
import * as m169 from "./schema.js";
import * as m170 from "./scoping.js";
import * as m171 from "./scoping/default.js";
import * as m172 from "./scoping/named.js";
import * as m173 from "./secure-token.js";
import * as m174 from "./signed-id.js";
import * as m175 from "./statement-cache.js";
import * as m176 from "./store.js";
import * as m177 from "./table-metadata.js";
import * as m178 from "./tasks/database-tasks.js";
import * as m179 from "./tasks/mysql-database-tasks.js";
import * as m180 from "./tasks/postgresql-database-tasks.js";
import * as m181 from "./tasks/sqlite-database-tasks.js";
import * as m182 from "./timestamp.js";
import * as m183 from "./token-for.js";
import * as m184 from "./touch-later.js";
import * as m185 from "./transaction.js";
import * as m186 from "./transactions.js";
import * as m187 from "./translation.js";
import * as m188 from "./type-caster/connection.js";
import * as m189 from "./type-caster/map.js";
import * as m190 from "./type/adapter-specific-registry.js";
import * as m191 from "./type/date-time.js";
import * as m192 from "./type/date.js";
import * as m193 from "./type/decimal-without-scale.js";
import * as m194 from "./type/hash-lookup-type-map.js";
import * as m195 from "./type/internal/timezone.js";
import * as m196 from "./type/json.js";
import * as m197 from "./type/serialized.js";
import * as m198 from "./type/text.js";
import * as m199 from "./type/time.js";
import * as m200 from "./type/type-map.js";
import * as m201 from "./type/unsigned-integer.js";
import * as m202 from "./validations.js";
import * as m203 from "./validations/absence.js";
import * as m204 from "./validations/associated.js";
import * as m205 from "./validations/length.js";
import * as m206 from "./validations/numericality.js";
import * as m207 from "./validations/presence.js";
import * as m208 from "./validations/uniqueness.js";

registerClassPaths([
  [() => m111.ActiveRecordError, "ActiveRecord::ActiveRecordError"],
  [() => m111.AdapterError, "ActiveRecord::AdapterError"],
  [() => m111.AdapterNotFound, "ActiveRecord::AdapterNotFound"],
  [() => m111.AdapterNotSpecified, "ActiveRecord::AdapterNotSpecified"],
  [() => m111.AdapterTimeout, "ActiveRecord::AdapterTimeout"],
  [() => m0.Aggregations, "ActiveRecord::Aggregations"],
  [() => m0.ClassMethods, "ActiveRecord::Aggregations::ClassMethods"],
  [
    () => m18.AmbiguousSourceReflectionForThroughAssociation,
    "ActiveRecord::AmbiguousSourceReflectionForThroughAssociation",
  ],
  [() => m18.AssociationNotFoundError, "ActiveRecord::AssociationNotFoundError"],
  [() => m1.AssociationRelation, "ActiveRecord::AssociationRelation"],
  [() => m2.Associations, "ActiveRecord::Associations"],
  [() => m3.AliasTracker, "ActiveRecord::Associations::AliasTracker"],
  [() => m5.Association, "ActiveRecord::Associations::Association"],
  [() => m4.AssociationScope, "ActiveRecord::Associations::AssociationScope"],
  [() => m4.ReflectionProxy, "ActiveRecord::Associations::AssociationScope::ReflectionProxy"],
  [() => m6.BelongsToAssociation, "ActiveRecord::Associations::BelongsToAssociation"],
  [
    () => m7.BelongsToPolymorphicAssociation,
    "ActiveRecord::Associations::BelongsToPolymorphicAssociation",
  ],
  [() => m8.Association, "ActiveRecord::Associations::Builder::Association"],
  [() => m9.BelongsTo, "ActiveRecord::Associations::Builder::BelongsTo"],
  [() => m10.CollectionAssociation, "ActiveRecord::Associations::Builder::CollectionAssociation"],
  [() => m11.HasAndBelongsToMany, "ActiveRecord::Associations::Builder::HasAndBelongsToMany"],
  [() => m12.HasMany, "ActiveRecord::Associations::Builder::HasMany"],
  [() => m13.HasOne, "ActiveRecord::Associations::Builder::HasOne"],
  [() => m14.SingularAssociation, "ActiveRecord::Associations::Builder::SingularAssociation"],
  [() => m15.CollectionAssociation, "ActiveRecord::Associations::CollectionAssociation"],
  [() => m16.CollectionProxy, "ActiveRecord::Associations::CollectionProxy"],
  [
    () => m17.DisableJoinsAssociationScope,
    "ActiveRecord::Associations::DisableJoinsAssociationScope",
  ],
  [() => m19.ForeignAssociation, "ActiveRecord::Associations::ForeignAssociation"],
  [() => m20.HasManyAssociation, "ActiveRecord::Associations::HasManyAssociation"],
  [() => m21.HasManyThroughAssociation, "ActiveRecord::Associations::HasManyThroughAssociation"],
  [() => m22.HasOneAssociation, "ActiveRecord::Associations::HasOneAssociation"],
  [() => m23.HasOneThroughAssociation, "ActiveRecord::Associations::HasOneThroughAssociation"],
  [() => m24.JoinDependency, "ActiveRecord::Associations::JoinDependency"],
  [() => m24.Aliases, "ActiveRecord::Associations::JoinDependency::Aliases"],
  [() => m25.JoinAssociation, "ActiveRecord::Associations::JoinDependency::JoinAssociation"],
  [() => m26.JoinBase, "ActiveRecord::Associations::JoinDependency::JoinBase"],
  [() => m27.JoinPart, "ActiveRecord::Associations::JoinDependency::JoinPart"],
  [() => m28.NestedError, "ActiveRecord::Associations::NestedError"],
  [() => m29.Preloader, "ActiveRecord::Associations::Preloader"],
  [() => m30.Association, "ActiveRecord::Associations::Preloader::Association"],
  [() => m30.LoaderQuery, "ActiveRecord::Associations::Preloader::Association::LoaderQuery"],
  [() => m30.LoaderRecords, "ActiveRecord::Associations::Preloader::Association::LoaderRecords"],
  [() => m31.Batch, "ActiveRecord::Associations::Preloader::Batch"],
  [() => m32.Branch, "ActiveRecord::Associations::Preloader::Branch"],
  [() => m33.ThroughAssociation, "ActiveRecord::Associations::Preloader::ThroughAssociation"],
  [() => m34.SingularAssociation, "ActiveRecord::Associations::SingularAssociation"],
  [() => m35.ThroughAssociation, "ActiveRecord::Associations::ThroughAssociation"],
  [() => m111.AssociationTypeMismatch, "ActiveRecord::AssociationTypeMismatch"],
  [() => m36.AsynchronousQueriesTracker, "ActiveRecord::AsynchronousQueriesTracker"],
  [() => m36.Session, "ActiveRecord::AsynchronousQueriesTracker::Session"],
  [
    () => m111.AsynchronousQueryInsideTransactionError,
    "ActiveRecord::AsynchronousQueryInsideTransactionError",
  ],
  [() => m37.AttributeAssignment, "ActiveRecord::AttributeAssignment"],
  [() => m111.AttributeAssignmentError, "ActiveRecord::AttributeAssignmentError"],
  [() => m39.BeforeTypeCast, "ActiveRecord::AttributeMethods::BeforeTypeCast"],
  [() => m38.ClassMethods, "ActiveRecord::AttributeMethods::ClassMethods"],
  [() => m40.CompositePrimaryKey, "ActiveRecord::AttributeMethods::CompositePrimaryKey"],
  [() => m41.Dirty, "ActiveRecord::AttributeMethods::Dirty"],
  [
    () => m38.GeneratedAttributeMethods,
    "ActiveRecord::AttributeMethods::GeneratedAttributeMethods",
  ],
  [() => m42.PrimaryKey, "ActiveRecord::AttributeMethods::PrimaryKey"],
  [() => m43.Query, "ActiveRecord::AttributeMethods::Query"],
  [() => m44.Read, "ActiveRecord::AttributeMethods::Read"],
  [() => m45.Serialization, "ActiveRecord::AttributeMethods::Serialization"],
  [() => m45.ClassMethods, "ActiveRecord::AttributeMethods::Serialization::ClassMethods"],
  [
    () => m45.ColumnNotSerializableError,
    "ActiveRecord::AttributeMethods::Serialization::ColumnNotSerializableError",
  ],
  [() => m46.TimeZoneConversion, "ActiveRecord::AttributeMethods::TimeZoneConversion"],
  [
    () => m46.TimeZoneConverter,
    "ActiveRecord::AttributeMethods::TimeZoneConversion::TimeZoneConverter",
  ],
  [() => m47.Write, "ActiveRecord::AttributeMethods::Write"],
  [() => m48.AutosaveAssociation, "ActiveRecord::AutosaveAssociation"],
  [() => m49.Base, "ActiveRecord::Base"],
  [() => m147.Batches, "ActiveRecord::Batches"],
  [() => m148.BatchEnumerator, "ActiveRecord::Batches::BatchEnumerator"],
  [() => m149.Calculations, "ActiveRecord::Calculations"],
  [() => m149.ColumnAliasTracker, "ActiveRecord::Calculations::ColumnAliasTracker"],
  [() => m50.Callbacks, "ActiveRecord::Callbacks"],
  [() => m51.ColumnSerializer, "ActiveRecord::Coders::ColumnSerializer"],
  [() => m52.JSON, "ActiveRecord::Coders::JSON"],
  [() => m53.YAMLColumn, "ActiveRecord::Coders::YAMLColumn"],
  [() => m18.CompositePrimaryKeyMismatchError, "ActiveRecord::CompositePrimaryKeyMismatchError"],
  [() => m130.ConcurrentMigrationError, "ActiveRecord::ConcurrentMigrationError"],
  [() => m111.ConfigurationError, "ActiveRecord::ConfigurationError"],
  [() => m54.AbstractAdapter, "ActiveRecord::ConnectionAdapters::AbstractAdapter"],
  [() => m54.Version, "ActiveRecord::ConnectionAdapters::AbstractAdapter::Version"],
  [() => m64.AddColumnDefinition, "ActiveRecord::ConnectionAdapters::AddColumnDefinition"],
  [() => m64.AlterTable, "ActiveRecord::ConnectionAdapters::AlterTable"],
  [() => m73.BoundSchemaReflection, "ActiveRecord::ConnectionAdapters::BoundSchemaReflection"],
  [() => m73.FakePool, "ActiveRecord::ConnectionAdapters::BoundSchemaReflection::FakePool"],
  [
    () => m64.ChangeColumnDefaultDefinition,
    "ActiveRecord::ConnectionAdapters::ChangeColumnDefaultDefinition",
  ],
  [() => m64.ChangeColumnDefinition, "ActiveRecord::ConnectionAdapters::ChangeColumnDefinition"],
  [
    () => m64.CheckConstraintDefinition,
    "ActiveRecord::ConnectionAdapters::CheckConstraintDefinition",
  ],
  [() => m68.Column, "ActiveRecord::ConnectionAdapters::Column"],
  [() => m64.ColumnDefinition, "ActiveRecord::ConnectionAdapters::ColumnDefinition"],
  [() => m64.ColumnMethods, "ActiveRecord::ConnectionAdapters::ColumnMethods"],
  [() => m55.ConnectionHandler, "ActiveRecord::ConnectionAdapters::ConnectionHandler"],
  [
    () => m55.ConnectionDescriptor,
    "ActiveRecord::ConnectionAdapters::ConnectionHandler::ConnectionDescriptor",
  ],
  [() => m56.ConnectionPool, "ActiveRecord::ConnectionAdapters::ConnectionPool"],
  [() => m57.BiasableQueue, "ActiveRecord::ConnectionAdapters::ConnectionPool::BiasableQueue"],
  [
    () => m57.BiasedConditionVariable,
    "ActiveRecord::ConnectionAdapters::ConnectionPool::BiasableQueue::BiasedConditionVariable",
  ],
  [
    () => m57.ConnectionLeasingQueue,
    "ActiveRecord::ConnectionAdapters::ConnectionPool::ConnectionLeasingQueue",
  ],
  [() => m56.ExecutorHooks, "ActiveRecord::ConnectionAdapters::ConnectionPool::ExecutorHooks"],
  [() => m56.Lease, "ActiveRecord::ConnectionAdapters::ConnectionPool::Lease"],
  [() => m56.LeaseRegistry, "ActiveRecord::ConnectionAdapters::ConnectionPool::LeaseRegistry"],
  [() => m57.Queue, "ActiveRecord::ConnectionAdapters::ConnectionPool::Queue"],
  [() => m58.Reaper, "ActiveRecord::ConnectionAdapters::ConnectionPool::Reaper"],
  [
    () => m56.WeakThreadKeyMap,
    "ActiveRecord::ConnectionAdapters::ConnectionPool::WeakThreadKeyMap",
  ],
  [() => m64.CreateIndexDefinition, "ActiveRecord::ConnectionAdapters::CreateIndexDefinition"],
  [() => m59.DatabaseStatements, "ActiveRecord::ConnectionAdapters::DatabaseStatements"],
  [() => m69.Deduplicable, "ActiveRecord::ConnectionAdapters::Deduplicable"],
  [() => m69.ClassMethods, "ActiveRecord::ConnectionAdapters::Deduplicable::ClassMethods"],
  [() => m64.ForeignKeyDefinition, "ActiveRecord::ConnectionAdapters::ForeignKeyDefinition"],
  [() => m64.IndexDefinition, "ActiveRecord::ConnectionAdapters::IndexDefinition"],
  [() => m68.NullColumn, "ActiveRecord::ConnectionAdapters::NullColumn"],
  [() => m56.NullPool, "ActiveRecord::ConnectionAdapters::NullPool"],
  [() => m56.NullConfig, "ActiveRecord::ConnectionAdapters::NullPool::NullConfig"],
  [() => m67.NullTransaction, "ActiveRecord::ConnectionAdapters::NullTransaction"],
  [() => m70.PoolConfig, "ActiveRecord::ConnectionAdapters::PoolConfig"],
  [() => m71.PoolManager, "ActiveRecord::ConnectionAdapters::PoolManager"],
  [() => m72.RangeType, "ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Range"],
  [() => m64.PrimaryKeyDefinition, "ActiveRecord::ConnectionAdapters::PrimaryKeyDefinition"],
  [() => m60.QueryCache, "ActiveRecord::ConnectionAdapters::QueryCache"],
  [
    () => m60.ConnectionPoolConfiguration,
    "ActiveRecord::ConnectionAdapters::QueryCache::ConnectionPoolConfiguration",
  ],
  [
    () => m60.QueryCacheRegistry,
    "ActiveRecord::ConnectionAdapters::QueryCache::QueryCacheRegistry",
  ],
  [() => m60.Store, "ActiveRecord::ConnectionAdapters::QueryCache::Store"],
  [() => m61.Quoting, "ActiveRecord::ConnectionAdapters::Quoting"],
  [() => m61.ClassMethods, "ActiveRecord::ConnectionAdapters::Quoting::ClassMethods"],
  [() => m67.RealTransaction, "ActiveRecord::ConnectionAdapters::RealTransaction"],
  [() => m64.ReferenceDefinition, "ActiveRecord::ConnectionAdapters::ReferenceDefinition"],
  [
    () => m67.RestartParentTransaction,
    "ActiveRecord::ConnectionAdapters::RestartParentTransaction",
  ],
  [() => m62.Savepoints, "ActiveRecord::ConnectionAdapters::Savepoints"],
  [() => m67.SavepointTransaction, "ActiveRecord::ConnectionAdapters::SavepointTransaction"],
  [() => m73.SchemaCache, "ActiveRecord::ConnectionAdapters::SchemaCache"],
  [() => m63.SchemaCreation, "ActiveRecord::ConnectionAdapters::SchemaCreation"],
  [() => m65.SchemaDumper, "ActiveRecord::ConnectionAdapters::SchemaDumper"],
  [() => m73.SchemaReflection, "ActiveRecord::ConnectionAdapters::SchemaReflection"],
  [() => m66.SchemaStatements, "ActiveRecord::ConnectionAdapters::SchemaStatements"],
  [() => m74.SqlTypeMetadata, "ActiveRecord::ConnectionAdapters::SqlTypeMetadata"],
  [() => m75.StatementPool, "ActiveRecord::ConnectionAdapters::StatementPool"],
  [() => m64.Table, "ActiveRecord::ConnectionAdapters::Table"],
  [() => m64.TableDefinition, "ActiveRecord::ConnectionAdapters::TableDefinition"],
  [() => m67.Transaction, "ActiveRecord::ConnectionAdapters::Transaction"],
  [() => m67.Callback, "ActiveRecord::ConnectionAdapters::Transaction::Callback"],
  [() => m67.TransactionInstrumenter, "ActiveRecord::ConnectionAdapters::TransactionInstrumenter"],
  [
    () => m67.InstrumentationAlreadyStartedError,
    "ActiveRecord::ConnectionAdapters::TransactionInstrumenter::InstrumentationAlreadyStartedError",
  ],
  [
    () => m67.InstrumentationNotStartedError,
    "ActiveRecord::ConnectionAdapters::TransactionInstrumenter::InstrumentationNotStartedError",
  ],
  [() => m67.TransactionManager, "ActiveRecord::ConnectionAdapters::TransactionManager"],
  [() => m67.TransactionState, "ActiveRecord::ConnectionAdapters::TransactionState"],
  [() => m111.ConnectionFailed, "ActiveRecord::ConnectionFailed"],
  [() => m76.ConnectionHandling, "ActiveRecord::ConnectionHandling"],
  [() => m111.ConnectionNotDefined, "ActiveRecord::ConnectionNotDefined"],
  [() => m111.ConnectionNotEstablished, "ActiveRecord::ConnectionNotEstablished"],
  [() => m111.ConnectionTimeoutError, "ActiveRecord::ConnectionTimeoutError"],
  [() => m77.Core, "ActiveRecord::Core"],
  [() => m77.ClassMethods, "ActiveRecord::Core::ClassMethods"],
  [() => m77.InspectionMask, "ActiveRecord::Core::InspectionMask"],
  [() => m78.CounterCache, "ActiveRecord::CounterCache"],
  [() => m78.ClassMethods, "ActiveRecord::CounterCache::ClassMethods"],
  [() => m111.DangerousAttributeError, "ActiveRecord::DangerousAttributeError"],
  [() => m111.DatabaseAlreadyExists, "ActiveRecord::DatabaseAlreadyExists"],
  [() => m79.DatabaseConfigurations, "ActiveRecord::DatabaseConfigurations"],
  [() => m80.ConnectionUrlResolver, "ActiveRecord::DatabaseConfigurations::ConnectionUrlResolver"],
  [() => m81.DatabaseConfig, "ActiveRecord::DatabaseConfigurations::DatabaseConfig"],
  [() => m82.HashConfig, "ActiveRecord::DatabaseConfigurations::HashConfig"],
  [
    () => m79.InvalidConfigurationError,
    "ActiveRecord::DatabaseConfigurations::InvalidConfigurationError",
  ],
  [() => m83.UrlConfig, "ActiveRecord::DatabaseConfigurations::UrlConfig"],
  [() => m111.DatabaseConnectionError, "ActiveRecord::DatabaseConnectionError"],
  [() => m111.DatabaseVersionError, "ActiveRecord::DatabaseVersionError"],
  [() => m111.Deadlocked, "ActiveRecord::Deadlocked"],
  [() => m150.Delegation, "ActiveRecord::Delegation"],
  [() => m150.ClassSpecificRelation, "ActiveRecord::Delegation::ClassSpecificRelation"],
  [() => m150.DelegateCache, "ActiveRecord::Delegation::DelegateCache"],
  [() => m150.GeneratedRelationMethods, "ActiveRecord::Delegation::GeneratedRelationMethods"],
  [() => m18.DeleteRestrictionError, "ActiveRecord::DeleteRestrictionError"],
  [() => m84.DisableJoinsAssociationRelation, "ActiveRecord::DisableJoinsAssociationRelation"],
  [() => m130.DuplicateMigrationNameError, "ActiveRecord::DuplicateMigrationNameError"],
  [() => m130.DuplicateMigrationVersionError, "ActiveRecord::DuplicateMigrationVersionError"],
  [() => m85.DynamicMatchers, "ActiveRecord::DynamicMatchers"],
  [() => m85.FindBy, "ActiveRecord::DynamicMatchers::FindBy"],
  [() => m85.FindByBang, "ActiveRecord::DynamicMatchers::FindByBang"],
  [() => m85.Method, "ActiveRecord::DynamicMatchers::Method"],
  [() => m18.EagerLoadPolymorphicError, "ActiveRecord::EagerLoadPolymorphicError"],
  [() => m86.Encryption, "ActiveRecord::Encryption"],
  [() => m87.AutoFilteredParameters, "ActiveRecord::Encryption::AutoFilteredParameters"],
  [() => m88.Cipher, "ActiveRecord::Encryption::Cipher"],
  [() => m89.Aes256Gcm, "ActiveRecord::Encryption::Cipher::Aes256Gcm"],
  [() => m90.Config, "ActiveRecord::Encryption::Config"],
  [() => m91.Configurable, "ActiveRecord::Encryption::Configurable"],
  [() => m92.Context, "ActiveRecord::Encryption::Context"],
  [() => m93.Contexts, "ActiveRecord::Encryption::Contexts"],
  [() => m94.DerivedSecretKeyProvider, "ActiveRecord::Encryption::DerivedSecretKeyProvider"],
  [() => m95.DeterministicKeyProvider, "ActiveRecord::Encryption::DeterministicKeyProvider"],
  [() => m96.EncryptableRecord, "ActiveRecord::Encryption::EncryptableRecord"],
  [() => m97.EncryptedAttributeType, "ActiveRecord::Encryption::EncryptedAttributeType"],
  [() => m98.EncryptingOnlyEncryptor, "ActiveRecord::Encryption::EncryptingOnlyEncryptor"],
  [() => m99.Encryptor, "ActiveRecord::Encryption::Encryptor"],
  [() => m100.Base, "ActiveRecord::Encryption::Errors::Base"],
  [() => m100.Configuration, "ActiveRecord::Encryption::Errors::Configuration"],
  [() => m100.Decryption, "ActiveRecord::Encryption::Errors::Decryption"],
  [() => m100.Encoding, "ActiveRecord::Encryption::Errors::Encoding"],
  [
    () => m100.EncryptedContentIntegrity,
    "ActiveRecord::Encryption::Errors::EncryptedContentIntegrity",
  ],
  [() => m100.Encryption, "ActiveRecord::Encryption::Errors::Encryption"],
  [() => m100.ForbiddenClass, "ActiveRecord::Encryption::Errors::ForbiddenClass"],
  [
    () => m101.ExtendedDeterministicUniquenessValidator,
    "ActiveRecord::Encryption::ExtendedDeterministicUniquenessValidator",
  ],
  [
    () => m101.EncryptedUniquenessValidator,
    "ActiveRecord::Encryption::ExtendedDeterministicUniquenessValidator::EncryptedUniquenessValidator",
  ],
  [() => m104.Key, "ActiveRecord::Encryption::Key"],
  [() => m102.KeyGenerator, "ActiveRecord::Encryption::KeyGenerator"],
  [() => m103.KeyProvider, "ActiveRecord::Encryption::KeyProvider"],
  [() => m106.Message, "ActiveRecord::Encryption::Message"],
  [() => m105.MessageSerializer, "ActiveRecord::Encryption::MessageSerializer"],
  [() => m107.NullEncryptor, "ActiveRecord::Encryption::NullEncryptor"],
  [() => m108.Properties, "ActiveRecord::Encryption::Properties"],
  [() => m109.Scheme, "ActiveRecord::Encryption::Scheme"],
  [() => m110.EnumMethods, "ActiveRecord::Enum::EnumMethods"],
  [() => m110.EnumType, "ActiveRecord::Enum::EnumType"],
  [() => m130.EnvironmentMismatchError, "ActiveRecord::EnvironmentMismatchError"],
  [() => m130.EnvironmentStorageError, "ActiveRecord::EnvironmentStorageError"],
  [() => m111.ExclusiveConnectionTimeoutError, "ActiveRecord::ExclusiveConnectionTimeoutError"],
  [() => m114.Explain, "ActiveRecord::Explain"],
  [() => m112.ExplainRegistry, "ActiveRecord::ExplainRegistry"],
  [() => m113.ExplainSubscriber, "ActiveRecord::ExplainSubscriber"],
  [() => m151.FinderMethods, "ActiveRecord::FinderMethods"],
  [() => m115.FutureResult, "ActiveRecord::FutureResult"],
  [() => m115.Complete, "ActiveRecord::FutureResult::Complete"],
  [() => m115.EventBuffer, "ActiveRecord::FutureResult::EventBuffer"],
  [() => m115.SelectAll, "ActiveRecord::FutureResult::SelectAll"],
  [
    () => m18.HasManyThroughAssociationNotFoundError,
    "ActiveRecord::HasManyThroughAssociationNotFoundError",
  ],
  [
    () => m18.HasManyThroughAssociationPointlessSourceTypeError,
    "ActiveRecord::HasManyThroughAssociationPointlessSourceTypeError",
  ],
  [
    () => m18.HasManyThroughAssociationPolymorphicSourceError,
    "ActiveRecord::HasManyThroughAssociationPolymorphicSourceError",
  ],
  [
    () => m18.HasManyThroughAssociationPolymorphicThroughError,
    "ActiveRecord::HasManyThroughAssociationPolymorphicThroughError",
  ],
  [
    () => m18.HasManyThroughCantAssociateThroughHasOneOrManyReflection,
    "ActiveRecord::HasManyThroughCantAssociateThroughHasOneOrManyReflection",
  ],
  [
    () => m18.HasManyThroughNestedAssociationsAreReadonly,
    "ActiveRecord::HasManyThroughNestedAssociationsAreReadonly",
  ],
  [() => m18.HasManyThroughOrderError, "ActiveRecord::HasManyThroughOrderError"],
  [
    () => m18.HasManyThroughSourceAssociationNotFoundError,
    "ActiveRecord::HasManyThroughSourceAssociationNotFoundError",
  ],
  [
    () => m18.HasOneAssociationPolymorphicThroughError,
    "ActiveRecord::HasOneAssociationPolymorphicThroughError",
  ],
  [
    () => m18.HasOneThroughCantAssociateThroughCollection,
    "ActiveRecord::HasOneThroughCantAssociateThroughCollection",
  ],
  [
    () => m18.HasOneThroughCantAssociateThroughHasOneOrManyReflection,
    "ActiveRecord::HasOneThroughCantAssociateThroughHasOneOrManyReflection",
  ],
  [
    () => m18.HasOneThroughNestedAssociationsAreReadonly,
    "ActiveRecord::HasOneThroughNestedAssociationsAreReadonly",
  ],
  [() => m130.IllegalMigrationNameError, "ActiveRecord::IllegalMigrationNameError"],
  [() => m117.Inheritance, "ActiveRecord::Inheritance"],
  [() => m117.ClassMethods, "ActiveRecord::Inheritance::ClassMethods"],
  [() => m118.InsertAll, "ActiveRecord::InsertAll"],
  [() => m118.Builder, "ActiveRecord::InsertAll::Builder"],
  [() => m119.Integration, "ActiveRecord::Integration"],
  [() => m119.ClassMethods, "ActiveRecord::Integration::ClassMethods"],
  [() => m120.InternalMetadata, "ActiveRecord::InternalMetadata"],
  [() => m120.NullInternalMetadata, "ActiveRecord::InternalMetadata::NullInternalMetadata"],
  [() => m111.InvalidForeignKey, "ActiveRecord::InvalidForeignKey"],
  [() => m130.InvalidMigrationTimestampError, "ActiveRecord::InvalidMigrationTimestampError"],
  [() => m18.InverseOfAssociationNotFoundError, "ActiveRecord::InverseOfAssociationNotFoundError"],
  [
    () => m18.InverseOfAssociationRecursiveError,
    "ActiveRecord::InverseOfAssociationRecursiveError",
  ],
  [() => m130.IrreversibleMigration, "ActiveRecord::IrreversibleMigration"],
  [() => m111.IrreversibleOrderError, "ActiveRecord::IrreversibleOrderError"],
  [() => m121.LegacyYamlAdapter, "ActiveRecord::LegacyYamlAdapter"],
  [() => m122.LockingType, "ActiveRecord::Locking::LockingType"],
  [() => m122.Optimistic, "ActiveRecord::Locking::Optimistic"],
  [() => m122.ClassMethods, "ActiveRecord::Locking::Optimistic::ClassMethods"],
  [() => m123.Pessimistic, "ActiveRecord::Locking::Pessimistic"],
  [() => m111.LockWaitTimeout, "ActiveRecord::LockWaitTimeout"],
  [() => m124.LogSubscriber, "ActiveRecord::LogSubscriber"],
  [() => m125.Methods, "ActiveRecord::Marshalling::Methods"],
  [() => m126.DatabaseSelector, "ActiveRecord::Middleware::DatabaseSelector"],
  [() => m127.Resolver, "ActiveRecord::Middleware::DatabaseSelector::Resolver"],
  [() => m128.Session, "ActiveRecord::Middleware::DatabaseSelector::Resolver::Session"],
  [() => m129.ShardSelector, "ActiveRecord::Middleware::ShardSelector"],
  [() => m130.Migration, "ActiveRecord::Migration"],
  [() => m130.CheckPending, "ActiveRecord::Migration::CheckPending"],
  [() => m131.CommandRecorder, "ActiveRecord::Migration::CommandRecorder"],
  [() => m132.V4_2, "ActiveRecord::Migration::Compatibility::V4_2"],
  [() => m132.V5_0, "ActiveRecord::Migration::Compatibility::V5_0"],
  [() => m132.V5_1, "ActiveRecord::Migration::Compatibility::V5_1"],
  [() => m132.V5_2, "ActiveRecord::Migration::Compatibility::V5_2"],
  [() => m132.V6_0, "ActiveRecord::Migration::Compatibility::V6_0"],
  [() => m132.V6_1, "ActiveRecord::Migration::Compatibility::V6_1"],
  [() => m132.V7_0, "ActiveRecord::Migration::Compatibility::V7_0"],
  [() => m132.V7_1, "ActiveRecord::Migration::Compatibility::V7_1"],
  [() => m132.V7_2, "ActiveRecord::Migration::Compatibility::V7_2"],
  [() => m130.Current, "ActiveRecord::Migration::Current"],
  [() => m133.DefaultStrategy, "ActiveRecord::Migration::DefaultStrategy"],
  [() => m134.ExecutionStrategy, "ActiveRecord::Migration::ExecutionStrategy"],
  [() => m130.ReversibleBlockHelper, "ActiveRecord::Migration::ReversibleBlockHelper"],
  [() => m130.MigrationContext, "ActiveRecord::MigrationContext"],
  [() => m130.MigrationError, "ActiveRecord::MigrationError"],
  [() => m130.MigrationProxy, "ActiveRecord::MigrationProxy"],
  [() => m130.Migrator, "ActiveRecord::Migrator"],
  [() => m111.MismatchedForeignKey, "ActiveRecord::MismatchedForeignKey"],
  [() => m136.ModelSchema, "ActiveRecord::ModelSchema"],
  [() => m136.ClassMethods, "ActiveRecord::ModelSchema::ClassMethods"],
  [() => m111.MultiparameterAssignmentErrors, "ActiveRecord::MultiparameterAssignmentErrors"],
  [() => m137.NestedAttributes, "ActiveRecord::NestedAttributes"],
  [() => m137.TooManyRecords, "ActiveRecord::NestedAttributes::TooManyRecords"],
  [() => m111.NoDatabaseError, "ActiveRecord::NoDatabaseError"],
  [() => m130.NoEnvironmentInSchemaError, "ActiveRecord::NoEnvironmentInSchemaError"],
  [() => m139.Normalization, "ActiveRecord::Normalization"],
  [() => m139.ClassMethods, "ActiveRecord::Normalization::ClassMethods"],
  [() => m139.NormalizedValueType, "ActiveRecord::Normalization::NormalizedValueType"],
  [() => m111.NotNullViolation, "ActiveRecord::NotNullViolation"],
  [() => m138.NoTouching, "ActiveRecord::NoTouching"],
  [() => m135.PendingMigrationConnection, "ActiveRecord::PendingMigrationConnection"],
  [() => m130.PendingMigrationError, "ActiveRecord::PendingMigrationError"],
  [() => m140.Persistence, "ActiveRecord::Persistence"],
  [() => m140.ClassMethods, "ActiveRecord::Persistence::ClassMethods"],
  [() => m154.PredicateBuilder, "ActiveRecord::PredicateBuilder"],
  [() => m155.ArrayHandler, "ActiveRecord::PredicateBuilder::ArrayHandler"],
  [() => m155.NullPredicate, "ActiveRecord::PredicateBuilder::ArrayHandler::NullPredicate"],
  [() => m156.AssociationQueryValue, "ActiveRecord::PredicateBuilder::AssociationQueryValue"],
  [() => m157.BasicObjectHandler, "ActiveRecord::PredicateBuilder::BasicObjectHandler"],
  [() => m158.PolymorphicArrayValue, "ActiveRecord::PredicateBuilder::PolymorphicArrayValue"],
  [() => m159.RangeHandler, "ActiveRecord::PredicateBuilder::RangeHandler"],
  [() => m159.RangeWithBinds, "ActiveRecord::PredicateBuilder::RangeHandler::RangeWithBinds"],
  [() => m160.RelationHandler, "ActiveRecord::PredicateBuilder::RelationHandler"],
  [() => m111.PreparedStatementCacheExpired, "ActiveRecord::PreparedStatementCacheExpired"],
  [() => m111.PreparedStatementInvalid, "ActiveRecord::PreparedStatementInvalid"],
  [() => m130.ProtectedEnvironmentError, "ActiveRecord::ProtectedEnvironmentError"],
  [() => m111.QueryAborted, "ActiveRecord::QueryAborted"],
  [() => m141.QueryCache, "ActiveRecord::QueryCache"],
  [() => m141.ClassMethods, "ActiveRecord::QueryCache::ClassMethods"],
  [() => m111.QueryCanceled, "ActiveRecord::QueryCanceled"],
  [() => m143.QueryLogs, "ActiveRecord::QueryLogs"],
  [() => m143.GetKeyHandler, "ActiveRecord::QueryLogs::GetKeyHandler"],
  [() => m143.IdentityHandler, "ActiveRecord::QueryLogs::IdentityHandler"],
  [() => m142.LegacyFormatter, "ActiveRecord::QueryLogs::LegacyFormatter"],
  [() => m142.SQLCommenter, "ActiveRecord::QueryLogs::SQLCommenter"],
  [() => m143.ZeroArityHandler, "ActiveRecord::QueryLogs::ZeroArityHandler"],
  [() => m162.QueryMethods, "ActiveRecord::QueryMethods"],
  [() => m162.CTEJoin, "ActiveRecord::QueryMethods::CTEJoin"],
  [() => m162.WhereChain, "ActiveRecord::QueryMethods::WhereChain"],
  [() => m111.RangeError, "ActiveRecord::RangeError"],
  [() => m144.ReadonlyAttributeError, "ActiveRecord::ReadonlyAttributeError"],
  [() => m144.ReadonlyAttributes, "ActiveRecord::ReadonlyAttributes"],
  [() => m144.ClassMethods, "ActiveRecord::ReadonlyAttributes::ClassMethods"],
  [() => m144.HasReadonlyAttributes, "ActiveRecord::ReadonlyAttributes::HasReadonlyAttributes"],
  [() => m111.ReadOnlyError, "ActiveRecord::ReadOnlyError"],
  [() => m111.ReadOnlyRecord, "ActiveRecord::ReadOnlyRecord"],
  [() => m202.RecordInvalid, "ActiveRecord::RecordInvalid"],
  [() => m111.RecordNotDestroyed, "ActiveRecord::RecordNotDestroyed"],
  [() => m111.RecordNotFound, "ActiveRecord::RecordNotFound"],
  [() => m111.RecordNotSaved, "ActiveRecord::RecordNotSaved"],
  [() => m111.RecordNotUnique, "ActiveRecord::RecordNotUnique"],
  [() => m145.Reflection, "ActiveRecord::Reflection"],
  [() => m145.AbstractReflection, "ActiveRecord::Reflection::AbstractReflection"],
  [() => m145.AggregateReflection, "ActiveRecord::Reflection::AggregateReflection"],
  [() => m145.AssociationReflection, "ActiveRecord::Reflection::AssociationReflection"],
  [() => m145.BelongsToReflection, "ActiveRecord::Reflection::BelongsToReflection"],
  [() => m145.ClassMethods, "ActiveRecord::Reflection::ClassMethods"],
  [
    () => m145.HasAndBelongsToManyReflection,
    "ActiveRecord::Reflection::HasAndBelongsToManyReflection",
  ],
  [() => m145.HasManyReflection, "ActiveRecord::Reflection::HasManyReflection"],
  [() => m145.HasOneReflection, "ActiveRecord::Reflection::HasOneReflection"],
  [() => m145.MacroReflection, "ActiveRecord::Reflection::MacroReflection"],
  [() => m145.PolymorphicReflection, "ActiveRecord::Reflection::PolymorphicReflection"],
  [() => m145.RuntimeReflection, "ActiveRecord::Reflection::RuntimeReflection"],
  [() => m145.ThroughReflection, "ActiveRecord::Reflection::ThroughReflection"],
  [() => m146.Relation, "ActiveRecord::Relation"],
  [() => m146.ExplainProxy, "ActiveRecord::Relation::ExplainProxy"],
  [() => m152.FromClause, "ActiveRecord::Relation::FromClause"],
  [() => m153.HashMerger, "ActiveRecord::Relation::HashMerger"],
  [() => m153.Merger, "ActiveRecord::Relation::Merger"],
  [() => m161.QueryAttribute, "ActiveRecord::Relation::QueryAttribute"],
  [() => m164.WhereClause, "ActiveRecord::Relation::WhereClause"],
  [() => m165.Result, "ActiveRecord::Result"],
  [() => m165.IndexedRow, "ActiveRecord::Result::IndexedRow"],
  [() => m111.Rollback, "ActiveRecord::Rollback"],
  [() => m166.ClassMethods, "ActiveRecord::Sanitization::ClassMethods"],
  [() => m169.Schema, "ActiveRecord::Schema"],
  [() => m169.Definition, "ActiveRecord::Schema::Definition"],
  [() => m167.SchemaDumper, "ActiveRecord::SchemaDumper"],
  [() => m168.SchemaMigration, "ActiveRecord::SchemaMigration"],
  [() => m168.NullSchemaMigration, "ActiveRecord::SchemaMigration::NullSchemaMigration"],
  [() => m171.Default, "ActiveRecord::Scoping::Default"],
  [() => m171.DefaultScope, "ActiveRecord::Scoping::DefaultScope"],
  [() => m172.ClassMethods, "ActiveRecord::Scoping::Named::ClassMethods"],
  [() => m170.ScopeRegistry, "ActiveRecord::Scoping::ScopeRegistry"],
  [() => m173.MinimumLengthError, "ActiveRecord::SecureToken::MinimumLengthError"],
  [() => m111.SerializationFailure, "ActiveRecord::SerializationFailure"],
  [() => m111.SerializationTypeMismatch, "ActiveRecord::SerializationTypeMismatch"],
  [() => m174.SignedId, "ActiveRecord::SignedId"],
  [() => m174.ClassMethods, "ActiveRecord::SignedId::ClassMethods"],
  [() => m174.RelationMethods, "ActiveRecord::SignedId::RelationMethods"],
  [() => m111.SoleRecordExceeded, "ActiveRecord::SoleRecordExceeded"],
  [() => m163.SpawnMethods, "ActiveRecord::SpawnMethods"],
  [() => m111.SQLWarning, "ActiveRecord::SQLWarning"],
  [() => m111.StaleObjectError, "ActiveRecord::StaleObjectError"],
  [() => m175.StatementCache, "ActiveRecord::StatementCache"],
  [() => m175.BindMap, "ActiveRecord::StatementCache::BindMap"],
  [() => m175.Params, "ActiveRecord::StatementCache::Params"],
  [() => m175.PartialQuery, "ActiveRecord::StatementCache::PartialQuery"],
  [() => m175.PartialQueryCollector, "ActiveRecord::StatementCache::PartialQueryCollector"],
  [() => m175.Query, "ActiveRecord::StatementCache::Query"],
  [() => m175.Substitute, "ActiveRecord::StatementCache::Substitute"],
  [() => m111.StatementInvalid, "ActiveRecord::StatementInvalid"],
  [() => m111.StatementTimeout, "ActiveRecord::StatementTimeout"],
  [() => m176.ClassMethods, "ActiveRecord::Store::ClassMethods"],
  [() => m176.HashAccessor, "ActiveRecord::Store::HashAccessor"],
  [() => m176.IndifferentCoder, "ActiveRecord::Store::IndifferentCoder"],
  [() => m176.IndifferentHashAccessor, "ActiveRecord::Store::IndifferentHashAccessor"],
  [() => m176.StringKeyedHashAccessor, "ActiveRecord::Store::StringKeyedHashAccessor"],
  [() => m111.StrictLoadingViolationError, "ActiveRecord::StrictLoadingViolationError"],
  [() => m111.SubclassNotFound, "ActiveRecord::SubclassNotFound"],
  [() => m177.TableMetadata, "ActiveRecord::TableMetadata"],
  [() => m111.TableNotSpecified, "ActiveRecord::TableNotSpecified"],
  [() => m178.DatabaseNotSupported, "ActiveRecord::Tasks::DatabaseNotSupported"],
  [() => m178.DatabaseTasks, "ActiveRecord::Tasks::DatabaseTasks"],
  [() => m179.MySQLDatabaseTasks, "ActiveRecord::Tasks::MySQLDatabaseTasks"],
  [() => m180.PostgreSQLDatabaseTasks, "ActiveRecord::Tasks::PostgreSQLDatabaseTasks"],
  [() => m181.SQLiteDatabaseTasks, "ActiveRecord::Tasks::SQLiteDatabaseTasks"],
  [
    () => m18.ThroughCantAssociateThroughHasOneOrManyReflection,
    "ActiveRecord::ThroughCantAssociateThroughHasOneOrManyReflection",
  ],
  [
    () => m18.ThroughNestedAssociationsAreReadonly,
    "ActiveRecord::ThroughNestedAssociationsAreReadonly",
  ],
  [() => m182.Timestamp, "ActiveRecord::Timestamp"],
  [() => m183.TokenFor, "ActiveRecord::TokenFor"],
  [() => m183.RelationMethods, "ActiveRecord::TokenFor::RelationMethods"],
  [() => m183.TokenDefinition, "ActiveRecord::TokenFor::TokenDefinition"],
  [() => m184.TouchLater, "ActiveRecord::TouchLater"],
  [() => m185.Transaction, "ActiveRecord::Transaction"],
  [() => m111.TransactionIsolationError, "ActiveRecord::TransactionIsolationError"],
  [() => m111.TransactionRollbackError, "ActiveRecord::TransactionRollbackError"],
  [() => m186.Transactions, "ActiveRecord::Transactions"],
  [() => m187.Translation, "ActiveRecord::Translation"],
  [() => m190.AdapterSpecificRegistry, "ActiveRecord::Type::AdapterSpecificRegistry"],
  [() => m192.Date, "ActiveRecord::Type::Date"],
  [() => m191.DateTime, "ActiveRecord::Type::DateTime"],
  [() => m193.DecimalWithoutScale, "ActiveRecord::Type::DecimalWithoutScale"],
  [() => m190.DecorationRegistration, "ActiveRecord::Type::DecorationRegistration"],
  [() => m194.HashLookupTypeMap, "ActiveRecord::Type::HashLookupTypeMap"],
  [() => m195.Timezone, "ActiveRecord::Type::Internal::Timezone"],
  [() => m196.Json, "ActiveRecord::Type::Json"],
  [() => m190.Registration, "ActiveRecord::Type::Registration"],
  [() => m197.Serialized, "ActiveRecord::Type::Serialized"],
  [() => m198.Text, "ActiveRecord::Type::Text"],
  [() => m199.Time, "ActiveRecord::Type::Time"],
  [() => m199.Value, "ActiveRecord::Type::Time::Value"],
  [() => m200.TypeMap, "ActiveRecord::Type::TypeMap"],
  [() => m201.UnsignedInteger, "ActiveRecord::Type::UnsignedInteger"],
  [() => m188.Connection, "ActiveRecord::TypeCaster::Connection"],
  [() => m189.Map, "ActiveRecord::TypeCaster::Map"],
  [() => m190.TypeConflictError, "ActiveRecord::TypeConflictError"],
  [() => m111.UnknownAttributeReference, "ActiveRecord::UnknownAttributeReference"],
  [() => m130.UnknownMigrationVersionError, "ActiveRecord::UnknownMigrationVersionError"],
  [() => m111.UnknownPrimaryKey, "ActiveRecord::UnknownPrimaryKey"],
  [() => m111.UnmodifiableRelation, "ActiveRecord::UnmodifiableRelation"],
  [() => m202.Validations, "ActiveRecord::Validations"],
  [() => m203.AbsenceValidator, "ActiveRecord::Validations::AbsenceValidator"],
  [() => m204.AssociatedValidator, "ActiveRecord::Validations::AssociatedValidator"],
  [() => m203.ClassMethods, "ActiveRecord::Validations::ClassMethods"],
  [() => m205.LengthValidator, "ActiveRecord::Validations::LengthValidator"],
  [() => m206.NumericalityValidator, "ActiveRecord::Validations::NumericalityValidator"],
  [() => m207.PresenceValidator, "ActiveRecord::Validations::PresenceValidator"],
  [() => m208.UniquenessValidator, "ActiveRecord::Validations::UniquenessValidator"],
  [() => m111.ValueTooLong, "ActiveRecord::ValueTooLong"],
  [() => m116.VERSION, "ActiveRecord::VERSION"],
  [() => m111.WrappedDatabaseException, "ActiveRecord::WrappedDatabaseException"],
]);

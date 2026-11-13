import { defineConstants } from "@blazetrails/ruby-compat";
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
import * as m54 from "./connection-adapters.js";
import * as m55 from "./connection-adapters/abstract-adapter.js";
import * as m56 from "./connection-adapters/abstract/connection-handler.js";
import * as m57 from "./connection-adapters/abstract/connection-pool.js";
import * as m58 from "./connection-adapters/abstract/connection-pool/queue.js";
import * as m59 from "./connection-adapters/abstract/connection-pool/reaper.js";
import * as m60 from "./connection-adapters/abstract/database-statements.js";
import * as m61 from "./connection-adapters/abstract/query-cache.js";
import * as m62 from "./connection-adapters/abstract/quoting.js";
import * as m63 from "./connection-adapters/abstract/savepoints.js";
import * as m64 from "./connection-adapters/abstract/schema-creation.js";
import * as m65 from "./connection-adapters/abstract/schema-definitions.js";
import * as m66 from "./connection-adapters/abstract/schema-dumper.js";
import * as m67 from "./connection-adapters/abstract/schema-statements.js";
import * as m68 from "./connection-adapters/abstract/transaction.js";
import * as m69 from "./connection-adapters/column.js";
import * as m70 from "./connection-adapters/deduplicable.js";
import * as m71 from "./connection-adapters/pool-config.js";
import * as m72 from "./connection-adapters/pool-manager.js";
import * as m73 from "./connection-adapters/postgresql/oid/range.js";
import * as m74 from "./connection-adapters/schema-cache.js";
import * as m75 from "./connection-adapters/sql-type-metadata.js";
import * as m76 from "./connection-adapters/sqlite3/database-statements.js";
import * as m77 from "./connection-adapters/sqlite3/quoting.js";
import * as m78 from "./connection-adapters/sqlite3/schema-statements.js";
import * as m79 from "./connection-adapters/statement-pool.js";
import * as m80 from "./connection-handling.js";
import * as m81 from "./core.js";
import * as m82 from "./counter-cache.js";
import * as m83 from "./database-configurations.js";
import * as m84 from "./database-configurations/connection-url-resolver.js";
import * as m85 from "./database-configurations/database-config.js";
import * as m86 from "./database-configurations/hash-config.js";
import * as m87 from "./database-configurations/url-config.js";
import * as m88 from "./disable-joins-association-relation.js";
import * as m89 from "./dynamic-matchers.js";
import * as m90 from "./encryption.js";
import * as m91 from "./encryption/auto-filtered-parameters.js";
import * as m92 from "./encryption/cipher.js";
import * as m93 from "./encryption/cipher/aes256-gcm.js";
import * as m94 from "./encryption/config.js";
import * as m95 from "./encryption/configurable.js";
import * as m96 from "./encryption/context.js";
import * as m97 from "./encryption/contexts.js";
import * as m98 from "./encryption/derived-secret-key-provider.js";
import * as m99 from "./encryption/deterministic-key-provider.js";
import * as m100 from "./encryption/encryptable-record.js";
import * as m101 from "./encryption/encrypted-attribute-type.js";
import * as m102 from "./encryption/encrypting-only-encryptor.js";
import * as m103 from "./encryption/encryptor.js";
import * as m104 from "./encryption/errors.js";
import * as m105 from "./encryption/extended-deterministic-uniqueness-validator.js";
import * as m106 from "./encryption/key-generator.js";
import * as m107 from "./encryption/key-provider.js";
import * as m108 from "./encryption/key.js";
import * as m109 from "./encryption/message-serializer.js";
import * as m110 from "./encryption/message.js";
import * as m111 from "./encryption/null-encryptor.js";
import * as m112 from "./encryption/properties.js";
import * as m113 from "./encryption/scheme.js";
import * as m114 from "./enum.js";
import * as m115 from "./errors.js";
import * as m116 from "./explain-registry.js";
import * as m117 from "./explain-subscriber.js";
import * as m118 from "./explain.js";
import * as m119 from "./future-result.js";
import * as m120 from "./gem-version.js";
import * as m121 from "./inheritance.js";
import * as m122 from "./insert-all.js";
import * as m123 from "./integration.js";
import * as m124 from "./internal-metadata.js";
import * as m125 from "./legacy-yaml-adapter.js";
import * as m126 from "./locking/optimistic.js";
import * as m127 from "./locking/pessimistic.js";
import * as m128 from "./log-subscriber.js";
import * as m129 from "./marshalling.js";
import * as m130 from "./middleware/database-selector.js";
import * as m131 from "./middleware/database-selector/resolver.js";
import * as m132 from "./middleware/database-selector/resolver/session.js";
import * as m133 from "./middleware/shard-selector.js";
import * as m134 from "./migration.js";
import * as m135 from "./migration/command-recorder.js";
import * as m136 from "./migration/compatibility.js";
import * as m137 from "./migration/default-strategy.js";
import * as m138 from "./migration/execution-strategy.js";
import * as m139 from "./migration/pending-migration-connection.js";
import * as m140 from "./model-schema.js";
import * as m141 from "./nested-attributes.js";
import * as m142 from "./no-touching.js";
import * as m143 from "./normalization.js";
import * as m144 from "./persistence.js";
import * as m145 from "./query-cache.js";
import * as m146 from "./query-logs-formatter.js";
import * as m147 from "./query-logs.js";
import * as m148 from "./querying.js";
import * as m149 from "./readonly-attributes.js";
import * as m150 from "./reflection.js";
import * as m151 from "./relation.js";
import * as m152 from "./relation/batches.js";
import * as m153 from "./relation/batches/batch-enumerator.js";
import * as m154 from "./relation/calculations.js";
import * as m155 from "./relation/delegation.js";
import * as m156 from "./relation/finder-methods.js";
import * as m157 from "./relation/from-clause.js";
import * as m158 from "./relation/merger.js";
import * as m159 from "./relation/predicate-builder.js";
import * as m160 from "./relation/predicate-builder/array-handler.js";
import * as m161 from "./relation/predicate-builder/association-query-value.js";
import * as m162 from "./relation/predicate-builder/basic-object-handler.js";
import * as m163 from "./relation/predicate-builder/polymorphic-array-value.js";
import * as m164 from "./relation/predicate-builder/range-handler.js";
import * as m165 from "./relation/predicate-builder/relation-handler.js";
import * as m166 from "./relation/query-attribute.js";
import * as m167 from "./relation/query-methods.js";
import * as m168 from "./relation/spawn-methods.js";
import * as m169 from "./relation/where-clause.js";
import * as m170 from "./result.js";
import * as m171 from "./runtime-registry.js";
import * as m172 from "./sanitization.js";
import * as m173 from "./schema-dumper.js";
import * as m174 from "./schema-migration.js";
import * as m175 from "./schema.js";
import * as m176 from "./scoping.js";
import * as m177 from "./scoping/default.js";
import * as m178 from "./scoping/named.js";
import * as m179 from "./secure-password.js";
import * as m180 from "./secure-token.js";
import * as m181 from "./serialization.js";
import * as m182 from "./signed-id.js";
import * as m183 from "./statement-cache.js";
import * as m184 from "./store.js";
import * as m185 from "./suppressor.js";
import * as m186 from "./table-metadata.js";
import * as m187 from "./tasks/database-tasks.js";
import * as m188 from "./tasks/mysql-database-tasks.js";
import * as m189 from "./tasks/postgresql-database-tasks.js";
import * as m190 from "./tasks/sqlite-database-tasks.js";
import * as m191 from "./timestamp.js";
import * as m192 from "./token-for.js";
import * as m193 from "./touch-later.js";
import * as m194 from "./trailties/controller-runtime.js";
import * as m195 from "./trailties/job-runtime.js";
import * as m196 from "./transaction.js";
import * as m197 from "./transactions.js";
import * as m198 from "./translation.js";
import * as m199 from "./type-caster/connection.js";
import * as m200 from "./type-caster/map.js";
import * as m201 from "./type.js";
import * as m202 from "./type/adapter-specific-registry.js";
import * as m203 from "./type/date-time.js";
import * as m204 from "./type/date.js";
import * as m205 from "./type/decimal-without-scale.js";
import * as m206 from "./type/hash-lookup-type-map.js";
import * as m207 from "./type/internal/timezone.js";
import * as m208 from "./type/json.js";
import * as m209 from "./type/serialized.js";
import * as m210 from "./type/text.js";
import * as m211 from "./type/time.js";
import * as m212 from "./type/type-map.js";
import * as m213 from "./type/unsigned-integer.js";
import * as m214 from "./validations.js";
import * as m215 from "./validations/absence.js";
import * as m216 from "./validations/associated.js";
import * as m217 from "./validations/length.js";
import * as m218 from "./validations/numericality.js";
import * as m219 from "./validations/presence.js";
import * as m220 from "./validations/uniqueness.js";

defineConstants([
  [() => m115.ActiveRecordError, "ActiveRecord::ActiveRecordError"],
  [() => m115.AdapterError, "ActiveRecord::AdapterError"],
  [() => m115.AdapterNotFound, "ActiveRecord::AdapterNotFound"],
  [() => m115.AdapterNotSpecified, "ActiveRecord::AdapterNotSpecified"],
  [() => m115.AdapterTimeout, "ActiveRecord::AdapterTimeout"],
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
  [() => m24.Aliases.Column, "ActiveRecord::Associations::JoinDependency::Aliases::Column"],
  [() => m24.Aliases.Table, "ActiveRecord::Associations::JoinDependency::Aliases::Table"],
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
  [() => m115.AssociationTypeMismatch, "ActiveRecord::AssociationTypeMismatch"],
  [() => m36.AsynchronousQueriesTracker, "ActiveRecord::AsynchronousQueriesTracker"],
  [() => m36.Session, "ActiveRecord::AsynchronousQueriesTracker::Session"],
  [
    () => m115.AsynchronousQueryInsideTransactionError,
    "ActiveRecord::AsynchronousQueryInsideTransactionError",
  ],
  [() => m37.AttributeAssignment, "ActiveRecord::AttributeAssignment"],
  [() => m115.AttributeAssignmentError, "ActiveRecord::AttributeAssignmentError"],
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
  [() => m152.Batches, "ActiveRecord::Batches"],
  [() => m153.BatchEnumerator, "ActiveRecord::Batches::BatchEnumerator"],
  [() => m154.Calculations, "ActiveRecord::Calculations"],
  [() => m154.ColumnAliasTracker, "ActiveRecord::Calculations::ColumnAliasTracker"],
  [() => m50.Callbacks, "ActiveRecord::Callbacks"],
  [() => m51.ColumnSerializer, "ActiveRecord::Coders::ColumnSerializer"],
  [() => m52.JSON, "ActiveRecord::Coders::JSON"],
  [() => m53.YAMLColumn, "ActiveRecord::Coders::YAMLColumn"],
  [() => m18.CompositePrimaryKeyMismatchError, "ActiveRecord::CompositePrimaryKeyMismatchError"],
  [() => m134.ConcurrentMigrationError, "ActiveRecord::ConcurrentMigrationError"],
  [() => m115.ConfigurationError, "ActiveRecord::ConfigurationError"],
  [() => m54.ConnectionAdapters, "ActiveRecord::ConnectionAdapters"],
  [() => m55.AbstractAdapter, "ActiveRecord::ConnectionAdapters::AbstractAdapter"],
  [() => m55.Version, "ActiveRecord::ConnectionAdapters::AbstractAdapter::Version"],
  [() => m65.AddColumnDefinition, "ActiveRecord::ConnectionAdapters::AddColumnDefinition"],
  [() => m65.AlterTable, "ActiveRecord::ConnectionAdapters::AlterTable"],
  [() => m74.BoundSchemaReflection, "ActiveRecord::ConnectionAdapters::BoundSchemaReflection"],
  [() => m74.FakePool, "ActiveRecord::ConnectionAdapters::BoundSchemaReflection::FakePool"],
  [
    () => m65.ChangeColumnDefaultDefinition,
    "ActiveRecord::ConnectionAdapters::ChangeColumnDefaultDefinition",
  ],
  [() => m65.ChangeColumnDefinition, "ActiveRecord::ConnectionAdapters::ChangeColumnDefinition"],
  [
    () => m65.CheckConstraintDefinition,
    "ActiveRecord::ConnectionAdapters::CheckConstraintDefinition",
  ],
  [() => m69.Column, "ActiveRecord::ConnectionAdapters::Column"],
  [() => m65.ColumnDefinition, "ActiveRecord::ConnectionAdapters::ColumnDefinition"],
  [() => m65.ColumnMethods, "ActiveRecord::ConnectionAdapters::ColumnMethods"],
  [() => m56.ConnectionHandler, "ActiveRecord::ConnectionAdapters::ConnectionHandler"],
  [
    () => m56.ConnectionDescriptor,
    "ActiveRecord::ConnectionAdapters::ConnectionHandler::ConnectionDescriptor",
  ],
  [() => m57.ConnectionPool, "ActiveRecord::ConnectionAdapters::ConnectionPool"],
  [() => m58.BiasableQueue, "ActiveRecord::ConnectionAdapters::ConnectionPool::BiasableQueue"],
  [
    () => m58.BiasedConditionVariable,
    "ActiveRecord::ConnectionAdapters::ConnectionPool::BiasableQueue::BiasedConditionVariable",
  ],
  [
    () => m58.ConnectionLeasingQueue,
    "ActiveRecord::ConnectionAdapters::ConnectionPool::ConnectionLeasingQueue",
  ],
  [() => m57.ExecutorHooks, "ActiveRecord::ConnectionAdapters::ConnectionPool::ExecutorHooks"],
  [() => m57.Lease, "ActiveRecord::ConnectionAdapters::ConnectionPool::Lease"],
  [() => m57.LeaseRegistry, "ActiveRecord::ConnectionAdapters::ConnectionPool::LeaseRegistry"],
  [() => m58.Queue, "ActiveRecord::ConnectionAdapters::ConnectionPool::Queue"],
  [() => m59.Reaper, "ActiveRecord::ConnectionAdapters::ConnectionPool::Reaper"],
  [
    () => m57.WeakThreadKeyMap,
    "ActiveRecord::ConnectionAdapters::ConnectionPool::WeakThreadKeyMap",
  ],
  [() => m65.CreateIndexDefinition, "ActiveRecord::ConnectionAdapters::CreateIndexDefinition"],
  [() => m60.DatabaseStatements, "ActiveRecord::ConnectionAdapters::DatabaseStatements"],
  [() => m70.Deduplicable, "ActiveRecord::ConnectionAdapters::Deduplicable"],
  [() => m70.ClassMethods, "ActiveRecord::ConnectionAdapters::Deduplicable::ClassMethods"],
  [() => m65.ForeignKeyDefinition, "ActiveRecord::ConnectionAdapters::ForeignKeyDefinition"],
  [() => m65.IndexDefinition, "ActiveRecord::ConnectionAdapters::IndexDefinition"],
  [() => m69.NullColumn, "ActiveRecord::ConnectionAdapters::NullColumn"],
  [() => m57.NullPool, "ActiveRecord::ConnectionAdapters::NullPool"],
  [() => m57.NullConfig, "ActiveRecord::ConnectionAdapters::NullPool::NullConfig"],
  [() => m68.NullTransaction, "ActiveRecord::ConnectionAdapters::NullTransaction"],
  [() => m71.PoolConfig, "ActiveRecord::ConnectionAdapters::PoolConfig"],
  [() => m72.PoolManager, "ActiveRecord::ConnectionAdapters::PoolManager"],
  [() => m73.RangeType, "ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Range"],
  [() => m65.PrimaryKeyDefinition, "ActiveRecord::ConnectionAdapters::PrimaryKeyDefinition"],
  [() => m61.QueryCache, "ActiveRecord::ConnectionAdapters::QueryCache"],
  [
    () => m61.ConnectionPoolConfiguration,
    "ActiveRecord::ConnectionAdapters::QueryCache::ConnectionPoolConfiguration",
  ],
  [
    () => m61.QueryCacheRegistry,
    "ActiveRecord::ConnectionAdapters::QueryCache::QueryCacheRegistry",
  ],
  [() => m61.Store, "ActiveRecord::ConnectionAdapters::QueryCache::Store"],
  [() => m62.Quoting, "ActiveRecord::ConnectionAdapters::Quoting"],
  [() => m62.ClassMethods, "ActiveRecord::ConnectionAdapters::Quoting::ClassMethods"],
  [() => m68.RealTransaction, "ActiveRecord::ConnectionAdapters::RealTransaction"],
  [() => m65.ReferenceDefinition, "ActiveRecord::ConnectionAdapters::ReferenceDefinition"],
  [
    () => m68.RestartParentTransaction,
    "ActiveRecord::ConnectionAdapters::RestartParentTransaction",
  ],
  [() => m63.Savepoints, "ActiveRecord::ConnectionAdapters::Savepoints"],
  [() => m68.SavepointTransaction, "ActiveRecord::ConnectionAdapters::SavepointTransaction"],
  [() => m74.SchemaCache, "ActiveRecord::ConnectionAdapters::SchemaCache"],
  [() => m64.SchemaCreation, "ActiveRecord::ConnectionAdapters::SchemaCreation"],
  [() => m66.SchemaDumper, "ActiveRecord::ConnectionAdapters::SchemaDumper"],
  [() => m74.SchemaReflection, "ActiveRecord::ConnectionAdapters::SchemaReflection"],
  [() => m67.SchemaStatements, "ActiveRecord::ConnectionAdapters::SchemaStatements"],
  [() => m76, "ActiveRecord::ConnectionAdapters::SQLite3::DatabaseStatements"],
  [() => m77, "ActiveRecord::ConnectionAdapters::SQLite3::Quoting"],
  [() => m78, "ActiveRecord::ConnectionAdapters::SQLite3::SchemaStatements"],
  [() => m75.SqlTypeMetadata, "ActiveRecord::ConnectionAdapters::SqlTypeMetadata"],
  [() => m79.StatementPool, "ActiveRecord::ConnectionAdapters::StatementPool"],
  [() => m65.Table, "ActiveRecord::ConnectionAdapters::Table"],
  [() => m65.TableDefinition, "ActiveRecord::ConnectionAdapters::TableDefinition"],
  [() => m68.Transaction, "ActiveRecord::ConnectionAdapters::Transaction"],
  [() => m68.Callback, "ActiveRecord::ConnectionAdapters::Transaction::Callback"],
  [() => m68.TransactionInstrumenter, "ActiveRecord::ConnectionAdapters::TransactionInstrumenter"],
  [
    () => m68.InstrumentationAlreadyStartedError,
    "ActiveRecord::ConnectionAdapters::TransactionInstrumenter::InstrumentationAlreadyStartedError",
  ],
  [
    () => m68.InstrumentationNotStartedError,
    "ActiveRecord::ConnectionAdapters::TransactionInstrumenter::InstrumentationNotStartedError",
  ],
  [() => m68.TransactionManager, "ActiveRecord::ConnectionAdapters::TransactionManager"],
  [() => m68.TransactionState, "ActiveRecord::ConnectionAdapters::TransactionState"],
  [() => m115.ConnectionFailed, "ActiveRecord::ConnectionFailed"],
  [() => m80.ConnectionHandling, "ActiveRecord::ConnectionHandling"],
  [() => m115.ConnectionNotDefined, "ActiveRecord::ConnectionNotDefined"],
  [() => m115.ConnectionNotEstablished, "ActiveRecord::ConnectionNotEstablished"],
  [() => m115.ConnectionTimeoutError, "ActiveRecord::ConnectionTimeoutError"],
  [() => m81.Core, "ActiveRecord::Core"],
  [() => m81.ClassMethods, "ActiveRecord::Core::ClassMethods"],
  [() => m81.InspectionMask, "ActiveRecord::Core::InspectionMask"],
  [() => m82.CounterCache, "ActiveRecord::CounterCache"],
  [() => m82.ClassMethods, "ActiveRecord::CounterCache::ClassMethods"],
  [() => m115.DangerousAttributeError, "ActiveRecord::DangerousAttributeError"],
  [() => m115.DatabaseAlreadyExists, "ActiveRecord::DatabaseAlreadyExists"],
  [() => m83.DatabaseConfigurations, "ActiveRecord::DatabaseConfigurations"],
  [() => m84.ConnectionUrlResolver, "ActiveRecord::DatabaseConfigurations::ConnectionUrlResolver"],
  [() => m85.DatabaseConfig, "ActiveRecord::DatabaseConfigurations::DatabaseConfig"],
  [() => m86.HashConfig, "ActiveRecord::DatabaseConfigurations::HashConfig"],
  [
    () => m83.InvalidConfigurationError,
    "ActiveRecord::DatabaseConfigurations::InvalidConfigurationError",
  ],
  [() => m87.UrlConfig, "ActiveRecord::DatabaseConfigurations::UrlConfig"],
  [() => m115.DatabaseConnectionError, "ActiveRecord::DatabaseConnectionError"],
  [() => m115.DatabaseVersionError, "ActiveRecord::DatabaseVersionError"],
  [() => m115.Deadlocked, "ActiveRecord::Deadlocked"],
  [() => m155.Delegation, "ActiveRecord::Delegation"],
  [() => m155.ClassSpecificRelation, "ActiveRecord::Delegation::ClassSpecificRelation"],
  [() => m155.DelegateCache, "ActiveRecord::Delegation::DelegateCache"],
  [() => m155.GeneratedRelationMethods, "ActiveRecord::Delegation::GeneratedRelationMethods"],
  [() => m18.DeleteRestrictionError, "ActiveRecord::DeleteRestrictionError"],
  [() => m88.DisableJoinsAssociationRelation, "ActiveRecord::DisableJoinsAssociationRelation"],
  [() => m134.DuplicateMigrationNameError, "ActiveRecord::DuplicateMigrationNameError"],
  [() => m134.DuplicateMigrationVersionError, "ActiveRecord::DuplicateMigrationVersionError"],
  [() => m89.DynamicMatchers, "ActiveRecord::DynamicMatchers"],
  [() => m89.FindBy, "ActiveRecord::DynamicMatchers::FindBy"],
  [() => m89.FindByBang, "ActiveRecord::DynamicMatchers::FindByBang"],
  [() => m89.Method, "ActiveRecord::DynamicMatchers::Method"],
  [() => m18.EagerLoadPolymorphicError, "ActiveRecord::EagerLoadPolymorphicError"],
  [() => m90.Encryption, "ActiveRecord::Encryption"],
  [() => m91.AutoFilteredParameters, "ActiveRecord::Encryption::AutoFilteredParameters"],
  [() => m92.Cipher, "ActiveRecord::Encryption::Cipher"],
  [() => m93.Aes256Gcm, "ActiveRecord::Encryption::Cipher::Aes256Gcm"],
  [() => m94.Config, "ActiveRecord::Encryption::Config"],
  [() => m95.Configurable, "ActiveRecord::Encryption::Configurable"],
  [() => m96.Context, "ActiveRecord::Encryption::Context"],
  [() => m97.Contexts, "ActiveRecord::Encryption::Contexts"],
  [() => m98.DerivedSecretKeyProvider, "ActiveRecord::Encryption::DerivedSecretKeyProvider"],
  [() => m99.DeterministicKeyProvider, "ActiveRecord::Encryption::DeterministicKeyProvider"],
  [() => m100.EncryptableRecord, "ActiveRecord::Encryption::EncryptableRecord"],
  [() => m101.EncryptedAttributeType, "ActiveRecord::Encryption::EncryptedAttributeType"],
  [() => m102.EncryptingOnlyEncryptor, "ActiveRecord::Encryption::EncryptingOnlyEncryptor"],
  [() => m103.Encryptor, "ActiveRecord::Encryption::Encryptor"],
  [() => m104, "ActiveRecord::Encryption::Errors"],
  [() => m104.Base, "ActiveRecord::Encryption::Errors::Base"],
  [() => m104.Configuration, "ActiveRecord::Encryption::Errors::Configuration"],
  [() => m104.Decryption, "ActiveRecord::Encryption::Errors::Decryption"],
  [() => m104.Encoding, "ActiveRecord::Encryption::Errors::Encoding"],
  [
    () => m104.EncryptedContentIntegrity,
    "ActiveRecord::Encryption::Errors::EncryptedContentIntegrity",
  ],
  [() => m104.Encryption, "ActiveRecord::Encryption::Errors::Encryption"],
  [() => m104.ForbiddenClass, "ActiveRecord::Encryption::Errors::ForbiddenClass"],
  [
    () => m105.ExtendedDeterministicUniquenessValidator,
    "ActiveRecord::Encryption::ExtendedDeterministicUniquenessValidator",
  ],
  [
    () => m105.EncryptedUniquenessValidator,
    "ActiveRecord::Encryption::ExtendedDeterministicUniquenessValidator::EncryptedUniquenessValidator",
  ],
  [() => m108.Key, "ActiveRecord::Encryption::Key"],
  [() => m106.KeyGenerator, "ActiveRecord::Encryption::KeyGenerator"],
  [() => m107.KeyProvider, "ActiveRecord::Encryption::KeyProvider"],
  [() => m110.Message, "ActiveRecord::Encryption::Message"],
  [() => m109.MessageSerializer, "ActiveRecord::Encryption::MessageSerializer"],
  [() => m111.NullEncryptor, "ActiveRecord::Encryption::NullEncryptor"],
  [() => m112.Properties, "ActiveRecord::Encryption::Properties"],
  [() => m113.Scheme, "ActiveRecord::Encryption::Scheme"],
  [() => m114.EnumMethods, "ActiveRecord::Enum::EnumMethods"],
  [() => m114.EnumType, "ActiveRecord::Enum::EnumType"],
  [() => m134.EnvironmentMismatchError, "ActiveRecord::EnvironmentMismatchError"],
  [() => m134.EnvironmentStorageError, "ActiveRecord::EnvironmentStorageError"],
  [() => m115.ExclusiveConnectionTimeoutError, "ActiveRecord::ExclusiveConnectionTimeoutError"],
  [() => m118.Explain, "ActiveRecord::Explain"],
  [() => m116.ExplainRegistry, "ActiveRecord::ExplainRegistry"],
  [() => m117.ExplainSubscriber, "ActiveRecord::ExplainSubscriber"],
  [() => m156.FinderMethods, "ActiveRecord::FinderMethods"],
  [() => m119.FutureResult, "ActiveRecord::FutureResult"],
  [() => m119.Canceled, "ActiveRecord::FutureResult::Canceled"],
  [() => m119.Complete, "ActiveRecord::FutureResult::Complete"],
  [() => m119.EventBuffer, "ActiveRecord::FutureResult::EventBuffer"],
  [() => m119.SelectAll, "ActiveRecord::FutureResult::SelectAll"],
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
  [() => m134.IllegalMigrationNameError, "ActiveRecord::IllegalMigrationNameError"],
  [() => m121.Inheritance, "ActiveRecord::Inheritance"],
  [() => m121.ClassMethods, "ActiveRecord::Inheritance::ClassMethods"],
  [() => m122.InsertAll, "ActiveRecord::InsertAll"],
  [() => m122.Builder, "ActiveRecord::InsertAll::Builder"],
  [() => m123.Integration, "ActiveRecord::Integration"],
  [() => m123.ClassMethods, "ActiveRecord::Integration::ClassMethods"],
  [() => m124.InternalMetadata, "ActiveRecord::InternalMetadata"],
  [() => m124.NullInternalMetadata, "ActiveRecord::InternalMetadata::NullInternalMetadata"],
  [() => m115.InvalidForeignKey, "ActiveRecord::InvalidForeignKey"],
  [() => m134.InvalidMigrationTimestampError, "ActiveRecord::InvalidMigrationTimestampError"],
  [() => m18.InverseOfAssociationNotFoundError, "ActiveRecord::InverseOfAssociationNotFoundError"],
  [
    () => m18.InverseOfAssociationRecursiveError,
    "ActiveRecord::InverseOfAssociationRecursiveError",
  ],
  [() => m134.IrreversibleMigration, "ActiveRecord::IrreversibleMigration"],
  [() => m115.IrreversibleOrderError, "ActiveRecord::IrreversibleOrderError"],
  [() => m125.LegacyYamlAdapter, "ActiveRecord::LegacyYamlAdapter"],
  [() => m126.LockingType, "ActiveRecord::Locking::LockingType"],
  [() => m126.Optimistic, "ActiveRecord::Locking::Optimistic"],
  [() => m126.ClassMethods, "ActiveRecord::Locking::Optimistic::ClassMethods"],
  [() => m127.Pessimistic, "ActiveRecord::Locking::Pessimistic"],
  [() => m115.LockWaitTimeout, "ActiveRecord::LockWaitTimeout"],
  [() => m128.LogSubscriber, "ActiveRecord::LogSubscriber"],
  [() => m129, "ActiveRecord::Marshalling"],
  [() => m129.Methods, "ActiveRecord::Marshalling::Methods"],
  [() => m130.DatabaseSelector, "ActiveRecord::Middleware::DatabaseSelector"],
  [() => m131.Resolver, "ActiveRecord::Middleware::DatabaseSelector::Resolver"],
  [() => m132.Session, "ActiveRecord::Middleware::DatabaseSelector::Resolver::Session"],
  [() => m133.ShardSelector, "ActiveRecord::Middleware::ShardSelector"],
  [() => m134.Migration, "ActiveRecord::Migration"],
  [() => m134.CheckPending, "ActiveRecord::Migration::CheckPending"],
  [() => m135.CommandRecorder, "ActiveRecord::Migration::CommandRecorder"],
  [() => m136, "ActiveRecord::Migration::Compatibility"],
  [() => m136.V4_2, "ActiveRecord::Migration::Compatibility::V4_2"],
  [() => m136.V5_0, "ActiveRecord::Migration::Compatibility::V5_0"],
  [() => m136.V5_1, "ActiveRecord::Migration::Compatibility::V5_1"],
  [() => m136.V5_2, "ActiveRecord::Migration::Compatibility::V5_2"],
  [() => m136.V6_0, "ActiveRecord::Migration::Compatibility::V6_0"],
  [
    () => m136.V6_0.ReferenceDefinition,
    "ActiveRecord::Migration::Compatibility::V6_0::ReferenceDefinition",
  ],
  [() => m136.V6_1, "ActiveRecord::Migration::Compatibility::V6_1"],
  [
    () => m136.V6_1.PostgreSQLCompat,
    "ActiveRecord::Migration::Compatibility::V6_1::PostgreSQLCompat",
  ],
  [() => m136.V7_0, "ActiveRecord::Migration::Compatibility::V7_0"],
  [
    () => m136.V7_0.LegacyIndexName,
    "ActiveRecord::Migration::Compatibility::V7_0::LegacyIndexName",
  ],
  [() => m136.V7_1, "ActiveRecord::Migration::Compatibility::V7_1"],
  [() => m136.V7_2, "ActiveRecord::Migration::Compatibility::V7_2"],
  [() => m134.Current, "ActiveRecord::Migration::Current"],
  [() => m137.DefaultStrategy, "ActiveRecord::Migration::DefaultStrategy"],
  [() => m138.ExecutionStrategy, "ActiveRecord::Migration::ExecutionStrategy"],
  [() => m134.ReversibleBlockHelper, "ActiveRecord::Migration::ReversibleBlockHelper"],
  [() => m134.MigrationContext, "ActiveRecord::MigrationContext"],
  [() => m134.MigrationError, "ActiveRecord::MigrationError"],
  [() => m134.MigrationProxy, "ActiveRecord::MigrationProxy"],
  [() => m134.Migrator, "ActiveRecord::Migrator"],
  [() => m115.MismatchedForeignKey, "ActiveRecord::MismatchedForeignKey"],
  [() => m140.ModelSchema, "ActiveRecord::ModelSchema"],
  [() => m140.ClassMethods, "ActiveRecord::ModelSchema::ClassMethods"],
  [() => m115.MultiparameterAssignmentErrors, "ActiveRecord::MultiparameterAssignmentErrors"],
  [() => m141.NestedAttributes, "ActiveRecord::NestedAttributes"],
  [() => m141.TooManyRecords, "ActiveRecord::NestedAttributes::TooManyRecords"],
  [() => m115.NoDatabaseError, "ActiveRecord::NoDatabaseError"],
  [() => m134.NoEnvironmentInSchemaError, "ActiveRecord::NoEnvironmentInSchemaError"],
  [() => m143.Normalization, "ActiveRecord::Normalization"],
  [() => m143.ClassMethods, "ActiveRecord::Normalization::ClassMethods"],
  [() => m143.NormalizedValueType, "ActiveRecord::Normalization::NormalizedValueType"],
  [() => m115.NotNullViolation, "ActiveRecord::NotNullViolation"],
  [() => m142.NoTouching, "ActiveRecord::NoTouching"],
  [() => m139.PendingMigrationConnection, "ActiveRecord::PendingMigrationConnection"],
  [() => m134.PendingMigrationError, "ActiveRecord::PendingMigrationError"],
  [() => m144.Persistence, "ActiveRecord::Persistence"],
  [() => m144.ClassMethods, "ActiveRecord::Persistence::ClassMethods"],
  [() => m159.PredicateBuilder, "ActiveRecord::PredicateBuilder"],
  [() => m160.ArrayHandler, "ActiveRecord::PredicateBuilder::ArrayHandler"],
  [() => m160.NullPredicate, "ActiveRecord::PredicateBuilder::ArrayHandler::NullPredicate"],
  [() => m161.AssociationQueryValue, "ActiveRecord::PredicateBuilder::AssociationQueryValue"],
  [() => m162.BasicObjectHandler, "ActiveRecord::PredicateBuilder::BasicObjectHandler"],
  [() => m163.PolymorphicArrayValue, "ActiveRecord::PredicateBuilder::PolymorphicArrayValue"],
  [() => m164.RangeHandler, "ActiveRecord::PredicateBuilder::RangeHandler"],
  [() => m164.RangeWithBinds, "ActiveRecord::PredicateBuilder::RangeHandler::RangeWithBinds"],
  [() => m165.RelationHandler, "ActiveRecord::PredicateBuilder::RelationHandler"],
  [() => m115.PreparedStatementCacheExpired, "ActiveRecord::PreparedStatementCacheExpired"],
  [() => m115.PreparedStatementInvalid, "ActiveRecord::PreparedStatementInvalid"],
  [() => m134.ProtectedEnvironmentError, "ActiveRecord::ProtectedEnvironmentError"],
  [() => m115.QueryAborted, "ActiveRecord::QueryAborted"],
  [() => m145.QueryCache, "ActiveRecord::QueryCache"],
  [() => m145.ClassMethods, "ActiveRecord::QueryCache::ClassMethods"],
  [() => m115.QueryCanceled, "ActiveRecord::QueryCanceled"],
  [() => m148, "ActiveRecord::Querying"],
  [() => m147.QueryLogs, "ActiveRecord::QueryLogs"],
  [() => m147.GetKeyHandler, "ActiveRecord::QueryLogs::GetKeyHandler"],
  [() => m147.IdentityHandler, "ActiveRecord::QueryLogs::IdentityHandler"],
  [() => m146.LegacyFormatter, "ActiveRecord::QueryLogs::LegacyFormatter"],
  [() => m146.SQLCommenter, "ActiveRecord::QueryLogs::SQLCommenter"],
  [() => m147.ZeroArityHandler, "ActiveRecord::QueryLogs::ZeroArityHandler"],
  [() => m167.QueryMethods, "ActiveRecord::QueryMethods"],
  [() => m167.CTEJoin, "ActiveRecord::QueryMethods::CTEJoin"],
  [() => m167.WhereChain, "ActiveRecord::QueryMethods::WhereChain"],
  [() => m115.RangeError, "ActiveRecord::RangeError"],
  [() => m149.ReadonlyAttributeError, "ActiveRecord::ReadonlyAttributeError"],
  [() => m149.ReadonlyAttributes, "ActiveRecord::ReadonlyAttributes"],
  [() => m149.ClassMethods, "ActiveRecord::ReadonlyAttributes::ClassMethods"],
  [() => m149.HasReadonlyAttributes, "ActiveRecord::ReadonlyAttributes::HasReadonlyAttributes"],
  [() => m115.ReadOnlyError, "ActiveRecord::ReadOnlyError"],
  [() => m115.ReadOnlyRecord, "ActiveRecord::ReadOnlyRecord"],
  [() => m214.RecordInvalid, "ActiveRecord::RecordInvalid"],
  [() => m115.RecordNotDestroyed, "ActiveRecord::RecordNotDestroyed"],
  [() => m115.RecordNotFound, "ActiveRecord::RecordNotFound"],
  [() => m115.RecordNotSaved, "ActiveRecord::RecordNotSaved"],
  [() => m115.RecordNotUnique, "ActiveRecord::RecordNotUnique"],
  [() => m150.Reflection, "ActiveRecord::Reflection"],
  [() => m150.AbstractReflection, "ActiveRecord::Reflection::AbstractReflection"],
  [() => m150.AggregateReflection, "ActiveRecord::Reflection::AggregateReflection"],
  [() => m150.AssociationReflection, "ActiveRecord::Reflection::AssociationReflection"],
  [() => m150.BelongsToReflection, "ActiveRecord::Reflection::BelongsToReflection"],
  [() => m150.ClassMethods, "ActiveRecord::Reflection::ClassMethods"],
  [
    () => m150.HasAndBelongsToManyReflection,
    "ActiveRecord::Reflection::HasAndBelongsToManyReflection",
  ],
  [() => m150.HasManyReflection, "ActiveRecord::Reflection::HasManyReflection"],
  [() => m150.HasOneReflection, "ActiveRecord::Reflection::HasOneReflection"],
  [() => m150.MacroReflection, "ActiveRecord::Reflection::MacroReflection"],
  [() => m150.PolymorphicReflection, "ActiveRecord::Reflection::PolymorphicReflection"],
  [() => m150.RuntimeReflection, "ActiveRecord::Reflection::RuntimeReflection"],
  [() => m150.ThroughReflection, "ActiveRecord::Reflection::ThroughReflection"],
  [() => m151.Relation, "ActiveRecord::Relation"],
  [() => m151.ExplainProxy, "ActiveRecord::Relation::ExplainProxy"],
  [() => m157.FromClause, "ActiveRecord::Relation::FromClause"],
  [() => m158.HashMerger, "ActiveRecord::Relation::HashMerger"],
  [() => m158.Merger, "ActiveRecord::Relation::Merger"],
  [() => m166.QueryAttribute, "ActiveRecord::Relation::QueryAttribute"],
  [() => m151.Relation.StrictLoadingScope, "ActiveRecord::Relation::StrictLoadingScope"],
  [() => m169.WhereClause, "ActiveRecord::Relation::WhereClause"],
  [() => m170.Result, "ActiveRecord::Result"],
  [() => m170.IndexedRow, "ActiveRecord::Result::IndexedRow"],
  [() => m115.Rollback, "ActiveRecord::Rollback"],
  [() => m171, "ActiveRecord::RuntimeRegistry"],
  [() => m172, "ActiveRecord::Sanitization"],
  [() => m172.ClassMethods, "ActiveRecord::Sanitization::ClassMethods"],
  [() => m175.Schema, "ActiveRecord::Schema"],
  [() => m175.Definition, "ActiveRecord::Schema::Definition"],
  [() => m173.SchemaDumper, "ActiveRecord::SchemaDumper"],
  [() => m174.SchemaMigration, "ActiveRecord::SchemaMigration"],
  [() => m174.NullSchemaMigration, "ActiveRecord::SchemaMigration::NullSchemaMigration"],
  [() => m177.Default, "ActiveRecord::Scoping::Default"],
  [() => m177.DefaultScope, "ActiveRecord::Scoping::DefaultScope"],
  [() => m178, "ActiveRecord::Scoping::Named"],
  [() => m178.ClassMethods, "ActiveRecord::Scoping::Named::ClassMethods"],
  [() => m176.ScopeRegistry, "ActiveRecord::Scoping::ScopeRegistry"],
  [() => m179, "ActiveRecord::SecurePassword"],
  [() => m180, "ActiveRecord::SecureToken"],
  [() => m180.MinimumLengthError, "ActiveRecord::SecureToken::MinimumLengthError"],
  [() => m181, "ActiveRecord::Serialization"],
  [() => m115.SerializationFailure, "ActiveRecord::SerializationFailure"],
  [() => m115.SerializationTypeMismatch, "ActiveRecord::SerializationTypeMismatch"],
  [() => m182.SignedId, "ActiveRecord::SignedId"],
  [() => m182.ClassMethods, "ActiveRecord::SignedId::ClassMethods"],
  [() => m182.RelationMethods, "ActiveRecord::SignedId::RelationMethods"],
  [() => m115.SoleRecordExceeded, "ActiveRecord::SoleRecordExceeded"],
  [() => m168.SpawnMethods, "ActiveRecord::SpawnMethods"],
  [() => m115.SQLWarning, "ActiveRecord::SQLWarning"],
  [() => m115.StaleObjectError, "ActiveRecord::StaleObjectError"],
  [() => m183.StatementCache, "ActiveRecord::StatementCache"],
  [() => m183.BindMap, "ActiveRecord::StatementCache::BindMap"],
  [() => m183.Params, "ActiveRecord::StatementCache::Params"],
  [() => m183.PartialQuery, "ActiveRecord::StatementCache::PartialQuery"],
  [() => m183.PartialQueryCollector, "ActiveRecord::StatementCache::PartialQueryCollector"],
  [() => m183.Query, "ActiveRecord::StatementCache::Query"],
  [() => m183.Substitute, "ActiveRecord::StatementCache::Substitute"],
  [() => m115.StatementInvalid, "ActiveRecord::StatementInvalid"],
  [() => m115.StatementTimeout, "ActiveRecord::StatementTimeout"],
  [() => m184, "ActiveRecord::Store"],
  [() => m184.ClassMethods, "ActiveRecord::Store::ClassMethods"],
  [() => m184.HashAccessor, "ActiveRecord::Store::HashAccessor"],
  [() => m184.IndifferentCoder, "ActiveRecord::Store::IndifferentCoder"],
  [() => m184.IndifferentHashAccessor, "ActiveRecord::Store::IndifferentHashAccessor"],
  [() => m184.StringKeyedHashAccessor, "ActiveRecord::Store::StringKeyedHashAccessor"],
  [() => m115.StrictLoadingViolationError, "ActiveRecord::StrictLoadingViolationError"],
  [() => m115.SubclassNotFound, "ActiveRecord::SubclassNotFound"],
  [() => m185, "ActiveRecord::Suppressor"],
  [() => m186.TableMetadata, "ActiveRecord::TableMetadata"],
  [() => m115.TableNotSpecified, "ActiveRecord::TableNotSpecified"],
  [() => m187.DatabaseNotSupported, "ActiveRecord::Tasks::DatabaseNotSupported"],
  [() => m187.DatabaseTasks, "ActiveRecord::Tasks::DatabaseTasks"],
  [() => m188.MySQLDatabaseTasks, "ActiveRecord::Tasks::MySQLDatabaseTasks"],
  [() => m189.PostgreSQLDatabaseTasks, "ActiveRecord::Tasks::PostgreSQLDatabaseTasks"],
  [() => m190.SQLiteDatabaseTasks, "ActiveRecord::Tasks::SQLiteDatabaseTasks"],
  [
    () => m18.ThroughCantAssociateThroughHasOneOrManyReflection,
    "ActiveRecord::ThroughCantAssociateThroughHasOneOrManyReflection",
  ],
  [
    () => m18.ThroughNestedAssociationsAreReadonly,
    "ActiveRecord::ThroughNestedAssociationsAreReadonly",
  ],
  [() => m191.Timestamp, "ActiveRecord::Timestamp"],
  [() => m192.TokenFor, "ActiveRecord::TokenFor"],
  [() => m192.RelationMethods, "ActiveRecord::TokenFor::RelationMethods"],
  [() => m192.TokenDefinition, "ActiveRecord::TokenFor::TokenDefinition"],
  [() => m193.TouchLater, "ActiveRecord::TouchLater"],
  [() => m194.ControllerRuntime, "ActiveRecord::Trailties::ControllerRuntime"],
  [() => m194.ClassMethods, "ActiveRecord::Trailties::ControllerRuntime::ClassMethods"],
  [() => m195.JobRuntime, "ActiveRecord::Trailties::JobRuntime"],
  [() => m196.Transaction, "ActiveRecord::Transaction"],
  [() => m115.TransactionIsolationError, "ActiveRecord::TransactionIsolationError"],
  [() => m115.TransactionRollbackError, "ActiveRecord::TransactionRollbackError"],
  [() => m197.Transactions, "ActiveRecord::Transactions"],
  [() => m198.Translation, "ActiveRecord::Translation"],
  [() => m201, "ActiveRecord::Type"],
  [() => m202.AdapterSpecificRegistry, "ActiveRecord::Type::AdapterSpecificRegistry"],
  [() => m204.Date, "ActiveRecord::Type::Date"],
  [() => m203.DateTime, "ActiveRecord::Type::DateTime"],
  [() => m205.DecimalWithoutScale, "ActiveRecord::Type::DecimalWithoutScale"],
  [() => m202.DecorationRegistration, "ActiveRecord::Type::DecorationRegistration"],
  [() => m206.HashLookupTypeMap, "ActiveRecord::Type::HashLookupTypeMap"],
  [() => m207.Timezone, "ActiveRecord::Type::Internal::Timezone"],
  [() => m208.Json, "ActiveRecord::Type::Json"],
  [() => m202.Registration, "ActiveRecord::Type::Registration"],
  [() => m209.Serialized, "ActiveRecord::Type::Serialized"],
  [() => m210.Text, "ActiveRecord::Type::Text"],
  [() => m211.Time, "ActiveRecord::Type::Time"],
  [() => m211.Value, "ActiveRecord::Type::Time::Value"],
  [() => m212.TypeMap, "ActiveRecord::Type::TypeMap"],
  [() => m213.UnsignedInteger, "ActiveRecord::Type::UnsignedInteger"],
  [() => m199.Connection, "ActiveRecord::TypeCaster::Connection"],
  [() => m200.Map, "ActiveRecord::TypeCaster::Map"],
  [() => m202.TypeConflictError, "ActiveRecord::TypeConflictError"],
  [() => m115.UnknownAttributeReference, "ActiveRecord::UnknownAttributeReference"],
  [() => m134.UnknownMigrationVersionError, "ActiveRecord::UnknownMigrationVersionError"],
  [() => m115.UnknownPrimaryKey, "ActiveRecord::UnknownPrimaryKey"],
  [() => m115.UnmodifiableRelation, "ActiveRecord::UnmodifiableRelation"],
  [() => m214.Validations, "ActiveRecord::Validations"],
  [() => m215.AbsenceValidator, "ActiveRecord::Validations::AbsenceValidator"],
  [() => m216.AssociatedValidator, "ActiveRecord::Validations::AssociatedValidator"],
  [() => m215.ClassMethods, "ActiveRecord::Validations::ClassMethods"],
  [() => m217.LengthValidator, "ActiveRecord::Validations::LengthValidator"],
  [() => m218.NumericalityValidator, "ActiveRecord::Validations::NumericalityValidator"],
  [() => m219.PresenceValidator, "ActiveRecord::Validations::PresenceValidator"],
  [() => m220.UniquenessValidator, "ActiveRecord::Validations::UniquenessValidator"],
  [() => m115.ValueTooLong, "ActiveRecord::ValueTooLong"],
  [() => m120.VERSION, "ActiveRecord::VERSION"],
  [() => m115.WrappedDatabaseException, "ActiveRecord::WrappedDatabaseException"],
]);

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
import * as m48 from "./attributes.js";
import * as m49 from "./autosave-association.js";
import * as m50 from "./base.js";
import * as m51 from "./callbacks.js";
import * as m52 from "./coders/column-serializer.js";
import * as m53 from "./coders/json.js";
import * as m54 from "./coders/yaml-column.js";
import * as m55 from "./connection-adapters.js";
import * as m56 from "./connection-adapters/abstract-adapter.js";
import * as m57 from "./connection-adapters/abstract/connection-handler.js";
import * as m58 from "./connection-adapters/abstract/connection-pool.js";
import * as m59 from "./connection-adapters/abstract/connection-pool/queue.js";
import * as m60 from "./connection-adapters/abstract/connection-pool/reaper.js";
import * as m61 from "./connection-adapters/abstract/database-statements.js";
import * as m62 from "./connection-adapters/abstract/query-cache.js";
import * as m63 from "./connection-adapters/abstract/quoting.js";
import * as m64 from "./connection-adapters/abstract/savepoints.js";
import * as m65 from "./connection-adapters/abstract/schema-creation.js";
import * as m66 from "./connection-adapters/abstract/schema-definitions.js";
import * as m67 from "./connection-adapters/abstract/schema-dumper.js";
import * as m68 from "./connection-adapters/abstract/schema-statements.js";
import * as m69 from "./connection-adapters/abstract/transaction.js";
import * as m70 from "./connection-adapters/column.js";
import * as m71 from "./connection-adapters/deduplicable.js";
import * as m72 from "./connection-adapters/pool-config.js";
import * as m73 from "./connection-adapters/pool-manager.js";
import * as m74 from "./connection-adapters/postgresql/oid/range.js";
import * as m75 from "./connection-adapters/schema-cache.js";
import * as m76 from "./connection-adapters/sql-type-metadata.js";
import * as m77 from "./connection-adapters/sqlite3/database-statements.js";
import * as m78 from "./connection-adapters/sqlite3/quoting.js";
import * as m79 from "./connection-adapters/sqlite3/schema-statements.js";
import * as m80 from "./connection-adapters/statement-pool.js";
import * as m81 from "./connection-handling.js";
import * as m82 from "./core.js";
import * as m83 from "./counter-cache.js";
import * as m84 from "./database-configurations.js";
import * as m85 from "./database-configurations/connection-url-resolver.js";
import * as m86 from "./database-configurations/database-config.js";
import * as m87 from "./database-configurations/hash-config.js";
import * as m88 from "./database-configurations/url-config.js";
import * as m89 from "./disable-joins-association-relation.js";
import * as m90 from "./dynamic-matchers.js";
import * as m91 from "./encryption.js";
import * as m92 from "./encryption/auto-filtered-parameters.js";
import * as m93 from "./encryption/cipher.js";
import * as m94 from "./encryption/cipher/aes256-gcm.js";
import * as m95 from "./encryption/config.js";
import * as m96 from "./encryption/configurable.js";
import * as m97 from "./encryption/context.js";
import * as m98 from "./encryption/contexts.js";
import * as m99 from "./encryption/derived-secret-key-provider.js";
import * as m100 from "./encryption/deterministic-key-provider.js";
import * as m101 from "./encryption/encryptable-record.js";
import * as m102 from "./encryption/encrypted-attribute-type.js";
import * as m103 from "./encryption/encrypting-only-encryptor.js";
import * as m104 from "./encryption/encryptor.js";
import * as m105 from "./encryption/errors.js";
import * as m106 from "./encryption/extended-deterministic-uniqueness-validator.js";
import * as m107 from "./encryption/key-generator.js";
import * as m108 from "./encryption/key-provider.js";
import * as m109 from "./encryption/key.js";
import * as m110 from "./encryption/message-serializer.js";
import * as m111 from "./encryption/message.js";
import * as m112 from "./encryption/null-encryptor.js";
import * as m113 from "./encryption/properties.js";
import * as m114 from "./encryption/scheme.js";
import * as m115 from "./enum.js";
import * as m116 from "./errors.js";
import * as m117 from "./explain-registry.js";
import * as m118 from "./explain-subscriber.js";
import * as m119 from "./explain.js";
import * as m120 from "./future-result.js";
import * as m121 from "./gem-version.js";
import * as m122 from "./inheritance.js";
import * as m123 from "./insert-all.js";
import * as m124 from "./integration.js";
import * as m125 from "./internal-metadata.js";
import * as m126 from "./legacy-yaml-adapter.js";
import * as m127 from "./locking/optimistic.js";
import * as m128 from "./locking/pessimistic.js";
import * as m129 from "./log-subscriber.js";
import * as m130 from "./marshalling.js";
import * as m131 from "./middleware/database-selector.js";
import * as m132 from "./middleware/database-selector/resolver.js";
import * as m133 from "./middleware/database-selector/resolver/session.js";
import * as m134 from "./middleware/shard-selector.js";
import * as m135 from "./migration.js";
import * as m136 from "./migration/command-recorder.js";
import * as m137 from "./migration/compatibility.js";
import * as m138 from "./migration/default-strategy.js";
import * as m139 from "./migration/execution-strategy.js";
import * as m140 from "./migration/pending-migration-connection.js";
import * as m141 from "./model-schema.js";
import * as m142 from "./nested-attributes.js";
import * as m143 from "./no-touching.js";
import * as m144 from "./normalization.js";
import * as m145 from "./persistence.js";
import * as m146 from "./query-cache.js";
import * as m147 from "./query-logs-formatter.js";
import * as m148 from "./query-logs.js";
import * as m149 from "./querying.js";
import * as m150 from "./readonly-attributes.js";
import * as m151 from "./reflection.js";
import * as m152 from "./relation.js";
import * as m153 from "./relation/batches.js";
import * as m154 from "./relation/batches/batch-enumerator.js";
import * as m155 from "./relation/calculations.js";
import * as m156 from "./relation/delegation.js";
import * as m157 from "./relation/finder-methods.js";
import * as m158 from "./relation/from-clause.js";
import * as m159 from "./relation/merger.js";
import * as m160 from "./relation/predicate-builder.js";
import * as m161 from "./relation/predicate-builder/array-handler.js";
import * as m162 from "./relation/predicate-builder/association-query-value.js";
import * as m163 from "./relation/predicate-builder/basic-object-handler.js";
import * as m164 from "./relation/predicate-builder/polymorphic-array-value.js";
import * as m165 from "./relation/predicate-builder/range-handler.js";
import * as m166 from "./relation/predicate-builder/relation-handler.js";
import * as m167 from "./relation/query-attribute.js";
import * as m168 from "./relation/query-methods.js";
import * as m169 from "./relation/spawn-methods.js";
import * as m170 from "./relation/where-clause.js";
import * as m171 from "./result.js";
import * as m172 from "./runtime-registry.js";
import * as m173 from "./sanitization.js";
import * as m174 from "./schema-dumper.js";
import * as m175 from "./schema-migration.js";
import * as m176 from "./schema.js";
import * as m177 from "./scoping.js";
import * as m178 from "./scoping/default.js";
import * as m179 from "./scoping/named.js";
import * as m180 from "./secure-password.js";
import * as m181 from "./secure-token.js";
import * as m182 from "./serialization.js";
import * as m183 from "./signed-id.js";
import * as m184 from "./statement-cache.js";
import * as m185 from "./store.js";
import * as m186 from "./suppressor.js";
import * as m187 from "./table-metadata.js";
import * as m188 from "./tasks/database-tasks.js";
import * as m189 from "./tasks/mysql-database-tasks.js";
import * as m190 from "./tasks/postgresql-database-tasks.js";
import * as m191 from "./tasks/sqlite-database-tasks.js";
import * as m192 from "./timestamp.js";
import * as m193 from "./token-for.js";
import * as m194 from "./touch-later.js";
import * as m195 from "./trailties/controller-runtime.js";
import * as m196 from "./trailties/job-runtime.js";
import * as m197 from "./transaction.js";
import * as m198 from "./transactions.js";
import * as m199 from "./translation.js";
import * as m200 from "./type-caster/connection.js";
import * as m201 from "./type-caster/map.js";
import * as m202 from "./type.js";
import * as m203 from "./type/adapter-specific-registry.js";
import * as m204 from "./type/date-time.js";
import * as m205 from "./type/date.js";
import * as m206 from "./type/decimal-without-scale.js";
import * as m207 from "./type/hash-lookup-type-map.js";
import * as m208 from "./type/internal/timezone.js";
import * as m209 from "./type/json.js";
import * as m210 from "./type/serialized.js";
import * as m211 from "./type/text.js";
import * as m212 from "./type/time.js";
import * as m213 from "./type/type-map.js";
import * as m214 from "./type/unsigned-integer.js";
import * as m215 from "./validations.js";
import * as m216 from "./validations/absence.js";
import * as m217 from "./validations/associated.js";
import * as m218 from "./validations/length.js";
import * as m219 from "./validations/numericality.js";
import * as m220 from "./validations/presence.js";
import * as m221 from "./validations/uniqueness.js";

defineConstants([
  [() => m116.ActiveRecordError, "ActiveRecord::ActiveRecordError"],
  [() => m116.AdapterError, "ActiveRecord::AdapterError"],
  [() => m116.AdapterNotFound, "ActiveRecord::AdapterNotFound"],
  [() => m116.AdapterNotSpecified, "ActiveRecord::AdapterNotSpecified"],
  [() => m116.AdapterTimeout, "ActiveRecord::AdapterTimeout"],
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
  [() => m116.AssociationTypeMismatch, "ActiveRecord::AssociationTypeMismatch"],
  [() => m36.AsynchronousQueriesTracker, "ActiveRecord::AsynchronousQueriesTracker"],
  [() => m36.Session, "ActiveRecord::AsynchronousQueriesTracker::Session"],
  [
    () => m116.AsynchronousQueryInsideTransactionError,
    "ActiveRecord::AsynchronousQueryInsideTransactionError",
  ],
  [() => m37.AttributeAssignment, "ActiveRecord::AttributeAssignment"],
  [() => m116.AttributeAssignmentError, "ActiveRecord::AttributeAssignmentError"],
  [() => m38.AttributeMethods, "ActiveRecord::AttributeMethods"],
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
  [() => m48.Attributes, "ActiveRecord::Attributes"],
  [() => m49.AutosaveAssociation, "ActiveRecord::AutosaveAssociation"],
  [() => m50.Base, "ActiveRecord::Base"],
  [() => m153.Batches, "ActiveRecord::Batches"],
  [() => m154.BatchEnumerator, "ActiveRecord::Batches::BatchEnumerator"],
  [() => m155.Calculations, "ActiveRecord::Calculations"],
  [() => m155.ColumnAliasTracker, "ActiveRecord::Calculations::ColumnAliasTracker"],
  [() => m51.Callbacks, "ActiveRecord::Callbacks"],
  [() => m51.ClassMethods, "ActiveRecord::Callbacks::ClassMethods"],
  [() => m52.ColumnSerializer, "ActiveRecord::Coders::ColumnSerializer"],
  [() => m53.JSON, "ActiveRecord::Coders::JSON"],
  [() => m54.YAMLColumn, "ActiveRecord::Coders::YAMLColumn"],
  [() => m18.CompositePrimaryKeyMismatchError, "ActiveRecord::CompositePrimaryKeyMismatchError"],
  [() => m135.ConcurrentMigrationError, "ActiveRecord::ConcurrentMigrationError"],
  [() => m116.ConfigurationError, "ActiveRecord::ConfigurationError"],
  [() => m55.ConnectionAdapters, "ActiveRecord::ConnectionAdapters"],
  [() => m56.AbstractAdapter, "ActiveRecord::ConnectionAdapters::AbstractAdapter"],
  [() => m56.Version, "ActiveRecord::ConnectionAdapters::AbstractAdapter::Version"],
  [() => m58.AbstractPool, "ActiveRecord::ConnectionAdapters::AbstractPool"],
  [() => m66.AddColumnDefinition, "ActiveRecord::ConnectionAdapters::AddColumnDefinition"],
  [() => m66.AlterTable, "ActiveRecord::ConnectionAdapters::AlterTable"],
  [() => m75.BoundSchemaReflection, "ActiveRecord::ConnectionAdapters::BoundSchemaReflection"],
  [() => m75.FakePool, "ActiveRecord::ConnectionAdapters::BoundSchemaReflection::FakePool"],
  [
    () => m66.ChangeColumnDefaultDefinition,
    "ActiveRecord::ConnectionAdapters::ChangeColumnDefaultDefinition",
  ],
  [() => m66.ChangeColumnDefinition, "ActiveRecord::ConnectionAdapters::ChangeColumnDefinition"],
  [
    () => m66.CheckConstraintDefinition,
    "ActiveRecord::ConnectionAdapters::CheckConstraintDefinition",
  ],
  [() => m70.Column, "ActiveRecord::ConnectionAdapters::Column"],
  [() => m66.ColumnDefinition, "ActiveRecord::ConnectionAdapters::ColumnDefinition"],
  [() => m66.ColumnMethods, "ActiveRecord::ConnectionAdapters::ColumnMethods"],
  [() => m57.ConnectionHandler, "ActiveRecord::ConnectionAdapters::ConnectionHandler"],
  [
    () => m57.ConnectionDescriptor,
    "ActiveRecord::ConnectionAdapters::ConnectionHandler::ConnectionDescriptor",
  ],
  [() => m58.ConnectionPool, "ActiveRecord::ConnectionAdapters::ConnectionPool"],
  [() => m59.BiasableQueue, "ActiveRecord::ConnectionAdapters::ConnectionPool::BiasableQueue"],
  [
    () => m59.BiasedConditionVariable,
    "ActiveRecord::ConnectionAdapters::ConnectionPool::BiasableQueue::BiasedConditionVariable",
  ],
  [
    () => m59.ConnectionLeasingQueue,
    "ActiveRecord::ConnectionAdapters::ConnectionPool::ConnectionLeasingQueue",
  ],
  [() => m58.ExecutorHooks, "ActiveRecord::ConnectionAdapters::ConnectionPool::ExecutorHooks"],
  [() => m58.Lease, "ActiveRecord::ConnectionAdapters::ConnectionPool::Lease"],
  [() => m58.LeaseRegistry, "ActiveRecord::ConnectionAdapters::ConnectionPool::LeaseRegistry"],
  [() => m59.Queue, "ActiveRecord::ConnectionAdapters::ConnectionPool::Queue"],
  [() => m60.Reaper, "ActiveRecord::ConnectionAdapters::ConnectionPool::Reaper"],
  [
    () => m58.WeakThreadKeyMap,
    "ActiveRecord::ConnectionAdapters::ConnectionPool::WeakThreadKeyMap",
  ],
  [() => m66.CreateIndexDefinition, "ActiveRecord::ConnectionAdapters::CreateIndexDefinition"],
  [() => m61.DatabaseStatements, "ActiveRecord::ConnectionAdapters::DatabaseStatements"],
  [() => m71.Deduplicable, "ActiveRecord::ConnectionAdapters::Deduplicable"],
  [() => m71.ClassMethods, "ActiveRecord::ConnectionAdapters::Deduplicable::ClassMethods"],
  [() => m66.ForeignKeyDefinition, "ActiveRecord::ConnectionAdapters::ForeignKeyDefinition"],
  [() => m66.IndexDefinition, "ActiveRecord::ConnectionAdapters::IndexDefinition"],
  [() => m70.NullColumn, "ActiveRecord::ConnectionAdapters::NullColumn"],
  [() => m58.NullPool, "ActiveRecord::ConnectionAdapters::NullPool"],
  [() => m58.NullConfig, "ActiveRecord::ConnectionAdapters::NullPool::NullConfig"],
  [() => m69.NullTransaction, "ActiveRecord::ConnectionAdapters::NullTransaction"],
  [() => m72.PoolConfig, "ActiveRecord::ConnectionAdapters::PoolConfig"],
  [() => m73.PoolManager, "ActiveRecord::ConnectionAdapters::PoolManager"],
  [() => m74.RangeType, "ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Range"],
  [() => m66.PrimaryKeyDefinition, "ActiveRecord::ConnectionAdapters::PrimaryKeyDefinition"],
  [() => m62.QueryCache, "ActiveRecord::ConnectionAdapters::QueryCache"],
  [
    () => m62.ConnectionPoolConfiguration,
    "ActiveRecord::ConnectionAdapters::QueryCache::ConnectionPoolConfiguration",
  ],
  [
    () => m62.QueryCacheRegistry,
    "ActiveRecord::ConnectionAdapters::QueryCache::QueryCacheRegistry",
  ],
  [() => m62.Store, "ActiveRecord::ConnectionAdapters::QueryCache::Store"],
  [() => m63.Quoting, "ActiveRecord::ConnectionAdapters::Quoting"],
  [() => m63.ClassMethods, "ActiveRecord::ConnectionAdapters::Quoting::ClassMethods"],
  [() => m69.RealTransaction, "ActiveRecord::ConnectionAdapters::RealTransaction"],
  [() => m66.ReferenceDefinition, "ActiveRecord::ConnectionAdapters::ReferenceDefinition"],
  [
    () => m69.RestartParentTransaction,
    "ActiveRecord::ConnectionAdapters::RestartParentTransaction",
  ],
  [() => m64.Savepoints, "ActiveRecord::ConnectionAdapters::Savepoints"],
  [() => m69.SavepointTransaction, "ActiveRecord::ConnectionAdapters::SavepointTransaction"],
  [() => m75.SchemaCache, "ActiveRecord::ConnectionAdapters::SchemaCache"],
  [() => m65.SchemaCreation, "ActiveRecord::ConnectionAdapters::SchemaCreation"],
  [() => m67.SchemaDumper, "ActiveRecord::ConnectionAdapters::SchemaDumper"],
  [() => m75.SchemaReflection, "ActiveRecord::ConnectionAdapters::SchemaReflection"],
  [() => m68.SchemaStatements, "ActiveRecord::ConnectionAdapters::SchemaStatements"],
  [() => m77, "ActiveRecord::ConnectionAdapters::SQLite3::DatabaseStatements"],
  [() => m78, "ActiveRecord::ConnectionAdapters::SQLite3::Quoting"],
  [() => m79, "ActiveRecord::ConnectionAdapters::SQLite3::SchemaStatements"],
  [() => m76.SqlTypeMetadata, "ActiveRecord::ConnectionAdapters::SqlTypeMetadata"],
  [() => m80.StatementPool, "ActiveRecord::ConnectionAdapters::StatementPool"],
  [() => m66.Table, "ActiveRecord::ConnectionAdapters::Table"],
  [() => m66.TableDefinition, "ActiveRecord::ConnectionAdapters::TableDefinition"],
  [() => m69.Transaction, "ActiveRecord::ConnectionAdapters::Transaction"],
  [() => m69.Callback, "ActiveRecord::ConnectionAdapters::Transaction::Callback"],
  [() => m69.TransactionInstrumenter, "ActiveRecord::ConnectionAdapters::TransactionInstrumenter"],
  [
    () => m69.InstrumentationAlreadyStartedError,
    "ActiveRecord::ConnectionAdapters::TransactionInstrumenter::InstrumentationAlreadyStartedError",
  ],
  [
    () => m69.InstrumentationNotStartedError,
    "ActiveRecord::ConnectionAdapters::TransactionInstrumenter::InstrumentationNotStartedError",
  ],
  [() => m69.TransactionManager, "ActiveRecord::ConnectionAdapters::TransactionManager"],
  [() => m69.TransactionState, "ActiveRecord::ConnectionAdapters::TransactionState"],
  [() => m116.ConnectionFailed, "ActiveRecord::ConnectionFailed"],
  [() => m81.ConnectionHandling, "ActiveRecord::ConnectionHandling"],
  [() => m116.ConnectionNotDefined, "ActiveRecord::ConnectionNotDefined"],
  [() => m116.ConnectionNotEstablished, "ActiveRecord::ConnectionNotEstablished"],
  [() => m116.ConnectionTimeoutError, "ActiveRecord::ConnectionTimeoutError"],
  [() => m82.Core, "ActiveRecord::Core"],
  [() => m82.ClassMethods, "ActiveRecord::Core::ClassMethods"],
  [() => m82.InspectionMask, "ActiveRecord::Core::InspectionMask"],
  [() => m83.CounterCache, "ActiveRecord::CounterCache"],
  [() => m83.ClassMethods, "ActiveRecord::CounterCache::ClassMethods"],
  [() => m116.DangerousAttributeError, "ActiveRecord::DangerousAttributeError"],
  [() => m116.DatabaseAlreadyExists, "ActiveRecord::DatabaseAlreadyExists"],
  [() => m84.DatabaseConfigurations, "ActiveRecord::DatabaseConfigurations"],
  [() => m85.ConnectionUrlResolver, "ActiveRecord::DatabaseConfigurations::ConnectionUrlResolver"],
  [() => m86.DatabaseConfig, "ActiveRecord::DatabaseConfigurations::DatabaseConfig"],
  [() => m87.HashConfig, "ActiveRecord::DatabaseConfigurations::HashConfig"],
  [
    () => m84.InvalidConfigurationError,
    "ActiveRecord::DatabaseConfigurations::InvalidConfigurationError",
  ],
  [() => m88.UrlConfig, "ActiveRecord::DatabaseConfigurations::UrlConfig"],
  [() => m116.DatabaseConnectionError, "ActiveRecord::DatabaseConnectionError"],
  [() => m116.DatabaseVersionError, "ActiveRecord::DatabaseVersionError"],
  [() => m116.Deadlocked, "ActiveRecord::Deadlocked"],
  [() => m156.Delegation, "ActiveRecord::Delegation"],
  [() => m156.ClassSpecificRelation, "ActiveRecord::Delegation::ClassSpecificRelation"],
  [() => m156.DelegateCache, "ActiveRecord::Delegation::DelegateCache"],
  [() => m156.GeneratedRelationMethods, "ActiveRecord::Delegation::GeneratedRelationMethods"],
  [() => m18.DeleteRestrictionError, "ActiveRecord::DeleteRestrictionError"],
  [() => m89.DisableJoinsAssociationRelation, "ActiveRecord::DisableJoinsAssociationRelation"],
  [() => m135.DuplicateMigrationNameError, "ActiveRecord::DuplicateMigrationNameError"],
  [() => m135.DuplicateMigrationVersionError, "ActiveRecord::DuplicateMigrationVersionError"],
  [() => m90.DynamicMatchers, "ActiveRecord::DynamicMatchers"],
  [() => m90.FindBy, "ActiveRecord::DynamicMatchers::FindBy"],
  [() => m90.FindByBang, "ActiveRecord::DynamicMatchers::FindByBang"],
  [() => m90.Method, "ActiveRecord::DynamicMatchers::Method"],
  [() => m18.EagerLoadPolymorphicError, "ActiveRecord::EagerLoadPolymorphicError"],
  [() => m91.Encryption, "ActiveRecord::Encryption"],
  [() => m92.AutoFilteredParameters, "ActiveRecord::Encryption::AutoFilteredParameters"],
  [() => m93.Cipher, "ActiveRecord::Encryption::Cipher"],
  [() => m94.Aes256Gcm, "ActiveRecord::Encryption::Cipher::Aes256Gcm"],
  [() => m95.Config, "ActiveRecord::Encryption::Config"],
  [() => m96.Configurable, "ActiveRecord::Encryption::Configurable"],
  [() => m97.Context, "ActiveRecord::Encryption::Context"],
  [() => m98.Contexts, "ActiveRecord::Encryption::Contexts"],
  [() => m99.DerivedSecretKeyProvider, "ActiveRecord::Encryption::DerivedSecretKeyProvider"],
  [() => m100.DeterministicKeyProvider, "ActiveRecord::Encryption::DeterministicKeyProvider"],
  [() => m101.EncryptableRecord, "ActiveRecord::Encryption::EncryptableRecord"],
  [() => m102.EncryptedAttributeType, "ActiveRecord::Encryption::EncryptedAttributeType"],
  [() => m103.EncryptingOnlyEncryptor, "ActiveRecord::Encryption::EncryptingOnlyEncryptor"],
  [() => m104.Encryptor, "ActiveRecord::Encryption::Encryptor"],
  [() => m105, "ActiveRecord::Encryption::Errors"],
  [() => m105.Base, "ActiveRecord::Encryption::Errors::Base"],
  [() => m105.Configuration, "ActiveRecord::Encryption::Errors::Configuration"],
  [() => m105.Decryption, "ActiveRecord::Encryption::Errors::Decryption"],
  [() => m105.Encoding, "ActiveRecord::Encryption::Errors::Encoding"],
  [
    () => m105.EncryptedContentIntegrity,
    "ActiveRecord::Encryption::Errors::EncryptedContentIntegrity",
  ],
  [() => m105.Encryption, "ActiveRecord::Encryption::Errors::Encryption"],
  [() => m105.ForbiddenClass, "ActiveRecord::Encryption::Errors::ForbiddenClass"],
  [
    () => m106.ExtendedDeterministicUniquenessValidator,
    "ActiveRecord::Encryption::ExtendedDeterministicUniquenessValidator",
  ],
  [
    () => m106.EncryptedUniquenessValidator,
    "ActiveRecord::Encryption::ExtendedDeterministicUniquenessValidator::EncryptedUniquenessValidator",
  ],
  [() => m109.Key, "ActiveRecord::Encryption::Key"],
  [() => m107.KeyGenerator, "ActiveRecord::Encryption::KeyGenerator"],
  [() => m108.KeyProvider, "ActiveRecord::Encryption::KeyProvider"],
  [() => m111.Message, "ActiveRecord::Encryption::Message"],
  [() => m110.MessageSerializer, "ActiveRecord::Encryption::MessageSerializer"],
  [() => m112.NullEncryptor, "ActiveRecord::Encryption::NullEncryptor"],
  [() => m113.Properties, "ActiveRecord::Encryption::Properties"],
  [() => m114.Scheme, "ActiveRecord::Encryption::Scheme"],
  [() => m115.EnumMethods, "ActiveRecord::Enum::EnumMethods"],
  [() => m115.EnumType, "ActiveRecord::Enum::EnumType"],
  [() => m135.EnvironmentMismatchError, "ActiveRecord::EnvironmentMismatchError"],
  [() => m135.EnvironmentStorageError, "ActiveRecord::EnvironmentStorageError"],
  [() => m116.ExclusiveConnectionTimeoutError, "ActiveRecord::ExclusiveConnectionTimeoutError"],
  [() => m119.Explain, "ActiveRecord::Explain"],
  [() => m117.ExplainRegistry, "ActiveRecord::ExplainRegistry"],
  [() => m118.ExplainSubscriber, "ActiveRecord::ExplainSubscriber"],
  [() => m157.FinderMethods, "ActiveRecord::FinderMethods"],
  [() => m120.FutureResult, "ActiveRecord::FutureResult"],
  [() => m120.Canceled, "ActiveRecord::FutureResult::Canceled"],
  [() => m120.Complete, "ActiveRecord::FutureResult::Complete"],
  [() => m120.EventBuffer, "ActiveRecord::FutureResult::EventBuffer"],
  [() => m120.SelectAll, "ActiveRecord::FutureResult::SelectAll"],
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
  [() => m135.IllegalMigrationNameError, "ActiveRecord::IllegalMigrationNameError"],
  [() => m122.Inheritance, "ActiveRecord::Inheritance"],
  [() => m122.ClassMethods, "ActiveRecord::Inheritance::ClassMethods"],
  [() => m123.InsertAll, "ActiveRecord::InsertAll"],
  [() => m123.Builder, "ActiveRecord::InsertAll::Builder"],
  [() => m124.Integration, "ActiveRecord::Integration"],
  [() => m124.ClassMethods, "ActiveRecord::Integration::ClassMethods"],
  [() => m125.InternalMetadata, "ActiveRecord::InternalMetadata"],
  [() => m125.NullInternalMetadata, "ActiveRecord::InternalMetadata::NullInternalMetadata"],
  [() => m116.InvalidForeignKey, "ActiveRecord::InvalidForeignKey"],
  [() => m135.InvalidMigrationTimestampError, "ActiveRecord::InvalidMigrationTimestampError"],
  [() => m18.InverseOfAssociationNotFoundError, "ActiveRecord::InverseOfAssociationNotFoundError"],
  [
    () => m18.InverseOfAssociationRecursiveError,
    "ActiveRecord::InverseOfAssociationRecursiveError",
  ],
  [() => m135.IrreversibleMigration, "ActiveRecord::IrreversibleMigration"],
  [() => m116.IrreversibleOrderError, "ActiveRecord::IrreversibleOrderError"],
  [() => m126.LegacyYamlAdapter, "ActiveRecord::LegacyYamlAdapter"],
  [() => m127.LockingType, "ActiveRecord::Locking::LockingType"],
  [() => m127.Optimistic, "ActiveRecord::Locking::Optimistic"],
  [() => m127.ClassMethods, "ActiveRecord::Locking::Optimistic::ClassMethods"],
  [() => m128.Pessimistic, "ActiveRecord::Locking::Pessimistic"],
  [() => m116.LockWaitTimeout, "ActiveRecord::LockWaitTimeout"],
  [() => m129.LogSubscriber, "ActiveRecord::LogSubscriber"],
  [() => m130, "ActiveRecord::Marshalling"],
  [() => m130.Methods, "ActiveRecord::Marshalling::Methods"],
  [() => m131.DatabaseSelector, "ActiveRecord::Middleware::DatabaseSelector"],
  [() => m132.Resolver, "ActiveRecord::Middleware::DatabaseSelector::Resolver"],
  [() => m133.Session, "ActiveRecord::Middleware::DatabaseSelector::Resolver::Session"],
  [() => m134.ShardSelector, "ActiveRecord::Middleware::ShardSelector"],
  [() => m135.Migration, "ActiveRecord::Migration"],
  [() => m135.CheckPending, "ActiveRecord::Migration::CheckPending"],
  [() => m136.CommandRecorder, "ActiveRecord::Migration::CommandRecorder"],
  [() => m137, "ActiveRecord::Migration::Compatibility"],
  [() => m137.V4_2, "ActiveRecord::Migration::Compatibility::V4_2"],
  [() => m137.V5_0, "ActiveRecord::Migration::Compatibility::V5_0"],
  [() => m137.V5_1, "ActiveRecord::Migration::Compatibility::V5_1"],
  [() => m137.V5_2, "ActiveRecord::Migration::Compatibility::V5_2"],
  [
    () => m137.V5_2.CommandRecorder,
    "ActiveRecord::Migration::Compatibility::V5_2::CommandRecorder",
  ],
  [() => m137.V6_0, "ActiveRecord::Migration::Compatibility::V6_0"],
  [
    () => m137.V6_0.ReferenceDefinition,
    "ActiveRecord::Migration::Compatibility::V6_0::ReferenceDefinition",
  ],
  [() => m137.V6_1, "ActiveRecord::Migration::Compatibility::V6_1"],
  [
    () => m137.V6_1.PostgreSQLCompat,
    "ActiveRecord::Migration::Compatibility::V6_1::PostgreSQLCompat",
  ],
  [() => m137.V7_0, "ActiveRecord::Migration::Compatibility::V7_0"],
  [
    () => m137.V7_0.LegacyIndexName,
    "ActiveRecord::Migration::Compatibility::V7_0::LegacyIndexName",
  ],
  [() => m137.V7_1, "ActiveRecord::Migration::Compatibility::V7_1"],
  [() => m137.V7_2, "ActiveRecord::Migration::Compatibility::V7_2"],
  [() => m135.Current, "ActiveRecord::Migration::Current"],
  [() => m138.DefaultStrategy, "ActiveRecord::Migration::DefaultStrategy"],
  [() => m139.ExecutionStrategy, "ActiveRecord::Migration::ExecutionStrategy"],
  [() => m135.ReversibleBlockHelper, "ActiveRecord::Migration::ReversibleBlockHelper"],
  [() => m135.MigrationContext, "ActiveRecord::MigrationContext"],
  [() => m135.MigrationError, "ActiveRecord::MigrationError"],
  [() => m135.MigrationProxy, "ActiveRecord::MigrationProxy"],
  [() => m135.Migrator, "ActiveRecord::Migrator"],
  [() => m116.MismatchedForeignKey, "ActiveRecord::MismatchedForeignKey"],
  [() => m141.ModelSchema, "ActiveRecord::ModelSchema"],
  [() => m141.ClassMethods, "ActiveRecord::ModelSchema::ClassMethods"],
  [() => m116.MultiparameterAssignmentErrors, "ActiveRecord::MultiparameterAssignmentErrors"],
  [() => m142.NestedAttributes, "ActiveRecord::NestedAttributes"],
  [() => m142.TooManyRecords, "ActiveRecord::NestedAttributes::TooManyRecords"],
  [() => m116.NoDatabaseError, "ActiveRecord::NoDatabaseError"],
  [() => m135.NoEnvironmentInSchemaError, "ActiveRecord::NoEnvironmentInSchemaError"],
  [() => m144.Normalization, "ActiveRecord::Normalization"],
  [() => m144.ClassMethods, "ActiveRecord::Normalization::ClassMethods"],
  [() => m144.NormalizedValueType, "ActiveRecord::Normalization::NormalizedValueType"],
  [() => m116.NotNullViolation, "ActiveRecord::NotNullViolation"],
  [() => m143.NoTouching, "ActiveRecord::NoTouching"],
  [() => m140.PendingMigrationConnection, "ActiveRecord::PendingMigrationConnection"],
  [() => m135.PendingMigrationError, "ActiveRecord::PendingMigrationError"],
  [() => m145.Persistence, "ActiveRecord::Persistence"],
  [() => m145.ClassMethods, "ActiveRecord::Persistence::ClassMethods"],
  [() => m160.PredicateBuilder, "ActiveRecord::PredicateBuilder"],
  [() => m161.ArrayHandler, "ActiveRecord::PredicateBuilder::ArrayHandler"],
  [() => m161.NullPredicate, "ActiveRecord::PredicateBuilder::ArrayHandler::NullPredicate"],
  [() => m162.AssociationQueryValue, "ActiveRecord::PredicateBuilder::AssociationQueryValue"],
  [() => m163.BasicObjectHandler, "ActiveRecord::PredicateBuilder::BasicObjectHandler"],
  [() => m164.PolymorphicArrayValue, "ActiveRecord::PredicateBuilder::PolymorphicArrayValue"],
  [() => m165.RangeHandler, "ActiveRecord::PredicateBuilder::RangeHandler"],
  [() => m165.RangeWithBinds, "ActiveRecord::PredicateBuilder::RangeHandler::RangeWithBinds"],
  [() => m166.RelationHandler, "ActiveRecord::PredicateBuilder::RelationHandler"],
  [() => m116.PreparedStatementCacheExpired, "ActiveRecord::PreparedStatementCacheExpired"],
  [() => m116.PreparedStatementInvalid, "ActiveRecord::PreparedStatementInvalid"],
  [() => m135.ProtectedEnvironmentError, "ActiveRecord::ProtectedEnvironmentError"],
  [() => m116.QueryAborted, "ActiveRecord::QueryAborted"],
  [() => m146.QueryCache, "ActiveRecord::QueryCache"],
  [() => m146.ClassMethods, "ActiveRecord::QueryCache::ClassMethods"],
  [() => m116.QueryCanceled, "ActiveRecord::QueryCanceled"],
  [() => m149, "ActiveRecord::Querying"],
  [() => m148.QueryLogs, "ActiveRecord::QueryLogs"],
  [() => m148.GetKeyHandler, "ActiveRecord::QueryLogs::GetKeyHandler"],
  [() => m148.IdentityHandler, "ActiveRecord::QueryLogs::IdentityHandler"],
  [() => m147.LegacyFormatter, "ActiveRecord::QueryLogs::LegacyFormatter"],
  [() => m147.SQLCommenter, "ActiveRecord::QueryLogs::SQLCommenter"],
  [() => m148.ZeroArityHandler, "ActiveRecord::QueryLogs::ZeroArityHandler"],
  [() => m168.QueryMethods, "ActiveRecord::QueryMethods"],
  [() => m168.CTEJoin, "ActiveRecord::QueryMethods::CTEJoin"],
  [() => m168.WhereChain, "ActiveRecord::QueryMethods::WhereChain"],
  [() => m116.RangeError, "ActiveRecord::RangeError"],
  [() => m150.ReadonlyAttributeError, "ActiveRecord::ReadonlyAttributeError"],
  [() => m150.ReadonlyAttributes, "ActiveRecord::ReadonlyAttributes"],
  [() => m150.ClassMethods, "ActiveRecord::ReadonlyAttributes::ClassMethods"],
  [() => m150.HasReadonlyAttributes, "ActiveRecord::ReadonlyAttributes::HasReadonlyAttributes"],
  [() => m116.ReadOnlyError, "ActiveRecord::ReadOnlyError"],
  [() => m116.ReadOnlyRecord, "ActiveRecord::ReadOnlyRecord"],
  [() => m215.RecordInvalid, "ActiveRecord::RecordInvalid"],
  [() => m116.RecordNotDestroyed, "ActiveRecord::RecordNotDestroyed"],
  [() => m116.RecordNotFound, "ActiveRecord::RecordNotFound"],
  [() => m116.RecordNotSaved, "ActiveRecord::RecordNotSaved"],
  [() => m116.RecordNotUnique, "ActiveRecord::RecordNotUnique"],
  [() => m151.Reflection, "ActiveRecord::Reflection"],
  [() => m151.AbstractReflection, "ActiveRecord::Reflection::AbstractReflection"],
  [() => m151.AggregateReflection, "ActiveRecord::Reflection::AggregateReflection"],
  [() => m151.AssociationReflection, "ActiveRecord::Reflection::AssociationReflection"],
  [() => m151.BelongsToReflection, "ActiveRecord::Reflection::BelongsToReflection"],
  [() => m151.ClassMethods, "ActiveRecord::Reflection::ClassMethods"],
  [
    () => m151.HasAndBelongsToManyReflection,
    "ActiveRecord::Reflection::HasAndBelongsToManyReflection",
  ],
  [() => m151.HasManyReflection, "ActiveRecord::Reflection::HasManyReflection"],
  [() => m151.HasOneReflection, "ActiveRecord::Reflection::HasOneReflection"],
  [() => m151.MacroReflection, "ActiveRecord::Reflection::MacroReflection"],
  [() => m151.PolymorphicReflection, "ActiveRecord::Reflection::PolymorphicReflection"],
  [() => m151.RuntimeReflection, "ActiveRecord::Reflection::RuntimeReflection"],
  [() => m151.ThroughReflection, "ActiveRecord::Reflection::ThroughReflection"],
  [() => m152.Relation, "ActiveRecord::Relation"],
  [() => m152.ExplainProxy, "ActiveRecord::Relation::ExplainProxy"],
  [() => m158.FromClause, "ActiveRecord::Relation::FromClause"],
  [() => m159.HashMerger, "ActiveRecord::Relation::HashMerger"],
  [() => m159.Merger, "ActiveRecord::Relation::Merger"],
  [() => m167.QueryAttribute, "ActiveRecord::Relation::QueryAttribute"],
  [() => m152.Relation.StrictLoadingScope, "ActiveRecord::Relation::StrictLoadingScope"],
  [() => m170.WhereClause, "ActiveRecord::Relation::WhereClause"],
  [() => m171.Result, "ActiveRecord::Result"],
  [() => m171.IndexedRow, "ActiveRecord::Result::IndexedRow"],
  [() => m116.Rollback, "ActiveRecord::Rollback"],
  [() => m172, "ActiveRecord::RuntimeRegistry"],
  [() => m173, "ActiveRecord::Sanitization"],
  [() => m173.ClassMethods, "ActiveRecord::Sanitization::ClassMethods"],
  [() => m176.Schema, "ActiveRecord::Schema"],
  [() => m176.Definition, "ActiveRecord::Schema::Definition"],
  [() => m174.SchemaDumper, "ActiveRecord::SchemaDumper"],
  [() => m175.SchemaMigration, "ActiveRecord::SchemaMigration"],
  [() => m175.NullSchemaMigration, "ActiveRecord::SchemaMigration::NullSchemaMigration"],
  [() => m178.Default, "ActiveRecord::Scoping::Default"],
  [() => m178.DefaultScope, "ActiveRecord::Scoping::DefaultScope"],
  [() => m179, "ActiveRecord::Scoping::Named"],
  [() => m179.ClassMethods, "ActiveRecord::Scoping::Named::ClassMethods"],
  [() => m177.ScopeRegistry, "ActiveRecord::Scoping::ScopeRegistry"],
  [() => m180, "ActiveRecord::SecurePassword"],
  [() => m181, "ActiveRecord::SecureToken"],
  [() => m181.MinimumLengthError, "ActiveRecord::SecureToken::MinimumLengthError"],
  [() => m182, "ActiveRecord::Serialization"],
  [() => m116.SerializationFailure, "ActiveRecord::SerializationFailure"],
  [() => m116.SerializationTypeMismatch, "ActiveRecord::SerializationTypeMismatch"],
  [() => m183.SignedId, "ActiveRecord::SignedId"],
  [() => m183.ClassMethods, "ActiveRecord::SignedId::ClassMethods"],
  [() => m183.RelationMethods, "ActiveRecord::SignedId::RelationMethods"],
  [() => m116.SoleRecordExceeded, "ActiveRecord::SoleRecordExceeded"],
  [() => m169.SpawnMethods, "ActiveRecord::SpawnMethods"],
  [() => m116.SQLWarning, "ActiveRecord::SQLWarning"],
  [() => m116.StaleObjectError, "ActiveRecord::StaleObjectError"],
  [() => m184.StatementCache, "ActiveRecord::StatementCache"],
  [() => m184.BindMap, "ActiveRecord::StatementCache::BindMap"],
  [() => m184.Params, "ActiveRecord::StatementCache::Params"],
  [() => m184.PartialQuery, "ActiveRecord::StatementCache::PartialQuery"],
  [() => m184.PartialQueryCollector, "ActiveRecord::StatementCache::PartialQueryCollector"],
  [() => m184.Query, "ActiveRecord::StatementCache::Query"],
  [() => m184.Substitute, "ActiveRecord::StatementCache::Substitute"],
  [() => m116.StatementInvalid, "ActiveRecord::StatementInvalid"],
  [() => m116.StatementTimeout, "ActiveRecord::StatementTimeout"],
  [() => m185, "ActiveRecord::Store"],
  [() => m185.ClassMethods, "ActiveRecord::Store::ClassMethods"],
  [() => m185.HashAccessor, "ActiveRecord::Store::HashAccessor"],
  [() => m185.IndifferentCoder, "ActiveRecord::Store::IndifferentCoder"],
  [() => m185.IndifferentHashAccessor, "ActiveRecord::Store::IndifferentHashAccessor"],
  [() => m185.StringKeyedHashAccessor, "ActiveRecord::Store::StringKeyedHashAccessor"],
  [() => m116.StrictLoadingViolationError, "ActiveRecord::StrictLoadingViolationError"],
  [() => m116.SubclassNotFound, "ActiveRecord::SubclassNotFound"],
  [() => m186, "ActiveRecord::Suppressor"],
  [() => m187.TableMetadata, "ActiveRecord::TableMetadata"],
  [() => m116.TableNotSpecified, "ActiveRecord::TableNotSpecified"],
  [() => m188.DatabaseNotSupported, "ActiveRecord::Tasks::DatabaseNotSupported"],
  [() => m188.DatabaseTasks, "ActiveRecord::Tasks::DatabaseTasks"],
  [() => m189.MySQLDatabaseTasks, "ActiveRecord::Tasks::MySQLDatabaseTasks"],
  [() => m190.PostgreSQLDatabaseTasks, "ActiveRecord::Tasks::PostgreSQLDatabaseTasks"],
  [() => m191.SQLiteDatabaseTasks, "ActiveRecord::Tasks::SQLiteDatabaseTasks"],
  [
    () => m18.ThroughCantAssociateThroughHasOneOrManyReflection,
    "ActiveRecord::ThroughCantAssociateThroughHasOneOrManyReflection",
  ],
  [
    () => m18.ThroughNestedAssociationsAreReadonly,
    "ActiveRecord::ThroughNestedAssociationsAreReadonly",
  ],
  [() => m192.Timestamp, "ActiveRecord::Timestamp"],
  [() => m193.TokenFor, "ActiveRecord::TokenFor"],
  [() => m193.RelationMethods, "ActiveRecord::TokenFor::RelationMethods"],
  [() => m193.TokenDefinition, "ActiveRecord::TokenFor::TokenDefinition"],
  [() => m194.TouchLater, "ActiveRecord::TouchLater"],
  [() => m195.ControllerRuntime, "ActiveRecord::Trailties::ControllerRuntime"],
  [() => m195.ClassMethods, "ActiveRecord::Trailties::ControllerRuntime::ClassMethods"],
  [() => m196.JobRuntime, "ActiveRecord::Trailties::JobRuntime"],
  [() => m197.Transaction, "ActiveRecord::Transaction"],
  [() => m116.TransactionIsolationError, "ActiveRecord::TransactionIsolationError"],
  [() => m116.TransactionRollbackError, "ActiveRecord::TransactionRollbackError"],
  [() => m198.Transactions, "ActiveRecord::Transactions"],
  [() => m199.Translation, "ActiveRecord::Translation"],
  [() => m202, "ActiveRecord::Type"],
  [() => m203.AdapterSpecificRegistry, "ActiveRecord::Type::AdapterSpecificRegistry"],
  [() => m205.Date, "ActiveRecord::Type::Date"],
  [() => m204.DateTime, "ActiveRecord::Type::DateTime"],
  [() => m206.DecimalWithoutScale, "ActiveRecord::Type::DecimalWithoutScale"],
  [() => m203.DecorationRegistration, "ActiveRecord::Type::DecorationRegistration"],
  [() => m207.HashLookupTypeMap, "ActiveRecord::Type::HashLookupTypeMap"],
  [() => m208.Timezone, "ActiveRecord::Type::Internal::Timezone"],
  [() => m209.Json, "ActiveRecord::Type::Json"],
  [() => m203.Registration, "ActiveRecord::Type::Registration"],
  [() => m210.Serialized, "ActiveRecord::Type::Serialized"],
  [() => m211.Text, "ActiveRecord::Type::Text"],
  [() => m212.Time, "ActiveRecord::Type::Time"],
  [() => m212.Value, "ActiveRecord::Type::Time::Value"],
  [() => m213.TypeMap, "ActiveRecord::Type::TypeMap"],
  [() => m214.UnsignedInteger, "ActiveRecord::Type::UnsignedInteger"],
  [() => m200.Connection, "ActiveRecord::TypeCaster::Connection"],
  [() => m201.Map, "ActiveRecord::TypeCaster::Map"],
  [() => m203.TypeConflictError, "ActiveRecord::TypeConflictError"],
  [() => m116.UnknownAttributeReference, "ActiveRecord::UnknownAttributeReference"],
  [() => m135.UnknownMigrationVersionError, "ActiveRecord::UnknownMigrationVersionError"],
  [() => m116.UnknownPrimaryKey, "ActiveRecord::UnknownPrimaryKey"],
  [() => m116.UnmodifiableRelation, "ActiveRecord::UnmodifiableRelation"],
  [() => m215.Validations, "ActiveRecord::Validations"],
  [() => m216.AbsenceValidator, "ActiveRecord::Validations::AbsenceValidator"],
  [() => m217.AssociatedValidator, "ActiveRecord::Validations::AssociatedValidator"],
  [() => m216.ClassMethods, "ActiveRecord::Validations::ClassMethods"],
  [() => m218.LengthValidator, "ActiveRecord::Validations::LengthValidator"],
  [() => m219.NumericalityValidator, "ActiveRecord::Validations::NumericalityValidator"],
  [() => m220.PresenceValidator, "ActiveRecord::Validations::PresenceValidator"],
  [() => m221.UniquenessValidator, "ActiveRecord::Validations::UniquenessValidator"],
  [() => m116.ValueTooLong, "ActiveRecord::ValueTooLong"],
  [() => m121.VERSION, "ActiveRecord::VERSION"],
  [() => m116.WrappedDatabaseException, "ActiveRecord::WrappedDatabaseException"],
]);

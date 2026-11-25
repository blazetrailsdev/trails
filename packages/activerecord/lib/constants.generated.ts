import { defineConstants } from "@blazetrails/ruby-compat/classpath";
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
import * as m77 from "./connection-adapters/statement-pool.js";
import * as m78 from "./connection-handling.js";
import * as m79 from "./core.js";
import * as m80 from "./counter-cache.js";
import * as m81 from "./database-configurations.js";
import * as m82 from "./database-configurations/connection-url-resolver.js";
import * as m83 from "./database-configurations/database-config.js";
import * as m84 from "./database-configurations/hash-config.js";
import * as m85 from "./database-configurations/url-config.js";
import * as m86 from "./disable-joins-association-relation.js";
import * as m87 from "./dynamic-matchers.js";
import * as m88 from "./encryption.js";
import * as m89 from "./encryption/auto-filtered-parameters.js";
import * as m90 from "./encryption/cipher.js";
import * as m91 from "./encryption/cipher/aes256-gcm.js";
import * as m92 from "./encryption/config.js";
import * as m93 from "./encryption/configurable.js";
import * as m94 from "./encryption/context.js";
import * as m95 from "./encryption/contexts.js";
import * as m96 from "./encryption/derived-secret-key-provider.js";
import * as m97 from "./encryption/deterministic-key-provider.js";
import * as m98 from "./encryption/encryptable-record.js";
import * as m99 from "./encryption/encrypted-attribute-type.js";
import * as m100 from "./encryption/encrypting-only-encryptor.js";
import * as m101 from "./encryption/encryptor.js";
import * as m102 from "./encryption/errors.js";
import * as m103 from "./encryption/extended-deterministic-uniqueness-validator.js";
import * as m104 from "./encryption/key-generator.js";
import * as m105 from "./encryption/key-provider.js";
import * as m106 from "./encryption/key.js";
import * as m107 from "./encryption/message-serializer.js";
import * as m108 from "./encryption/message.js";
import * as m109 from "./encryption/null-encryptor.js";
import * as m110 from "./encryption/properties.js";
import * as m111 from "./encryption/scheme.js";
import * as m112 from "./enum.js";
import * as m113 from "./errors.js";
import * as m114 from "./explain-registry.js";
import * as m115 from "./explain-subscriber.js";
import * as m116 from "./explain.js";
import * as m117 from "./future-result.js";
import * as m118 from "./gem-version.js";
import * as m119 from "./inheritance.js";
import * as m120 from "./insert-all.js";
import * as m121 from "./integration.js";
import * as m122 from "./internal-metadata.js";
import * as m123 from "./legacy-yaml-adapter.js";
import * as m124 from "./locking/optimistic.js";
import * as m125 from "./locking/pessimistic.js";
import * as m126 from "./log-subscriber.js";
import * as m127 from "./marshalling.js";
import * as m128 from "./middleware/database-selector.js";
import * as m129 from "./middleware/database-selector/resolver.js";
import * as m130 from "./middleware/database-selector/resolver/session.js";
import * as m131 from "./middleware/shard-selector.js";
import * as m132 from "./migration.js";
import * as m133 from "./migration/command-recorder.js";
import * as m134 from "./migration/compatibility.js";
import * as m135 from "./migration/default-strategy.js";
import * as m136 from "./migration/execution-strategy.js";
import * as m137 from "./migration/pending-migration-connection.js";
import * as m138 from "./model-schema.js";
import * as m139 from "./nested-attributes.js";
import * as m140 from "./no-touching.js";
import * as m141 from "./normalization.js";
import * as m142 from "./persistence.js";
import * as m143 from "./query-cache.js";
import * as m144 from "./query-logs-formatter.js";
import * as m145 from "./query-logs.js";
import * as m146 from "./querying.js";
import * as m147 from "./readonly-attributes.js";
import * as m148 from "./reflection.js";
import * as m149 from "./relation.js";
import * as m150 from "./relation/batches.js";
import * as m151 from "./relation/batches/batch-enumerator.js";
import * as m152 from "./relation/calculations.js";
import * as m153 from "./relation/delegation.js";
import * as m154 from "./relation/finder-methods.js";
import * as m155 from "./relation/from-clause.js";
import * as m156 from "./relation/merger.js";
import * as m157 from "./relation/predicate-builder.js";
import * as m158 from "./relation/predicate-builder/array-handler.js";
import * as m159 from "./relation/predicate-builder/association-query-value.js";
import * as m160 from "./relation/predicate-builder/basic-object-handler.js";
import * as m161 from "./relation/predicate-builder/polymorphic-array-value.js";
import * as m162 from "./relation/predicate-builder/range-handler.js";
import * as m163 from "./relation/predicate-builder/relation-handler.js";
import * as m164 from "./relation/query-attribute.js";
import * as m165 from "./relation/query-methods.js";
import * as m166 from "./relation/spawn-methods.js";
import * as m167 from "./relation/where-clause.js";
import * as m168 from "./result.js";
import * as m169 from "./runtime-registry.js";
import * as m170 from "./sanitization.js";
import * as m171 from "./schema-dumper.js";
import * as m172 from "./schema-migration.js";
import * as m173 from "./schema.js";
import * as m174 from "./scoping.js";
import * as m175 from "./scoping/default.js";
import * as m176 from "./scoping/named.js";
import * as m177 from "./secure-password.js";
import * as m178 from "./secure-token.js";
import * as m179 from "./serialization.js";
import * as m180 from "./signed-id.js";
import * as m181 from "./statement-cache.js";
import * as m182 from "./store.js";
import * as m183 from "./suppressor.js";
import * as m184 from "./table-metadata.js";
import * as m185 from "./timestamp.js";
import * as m186 from "./token-for.js";
import * as m187 from "./touch-later.js";
import * as m188 from "./trailties/controller-runtime.js";
import * as m189 from "./trailties/job-runtime.js";
import * as m190 from "./transaction.js";
import * as m191 from "./transactions.js";
import * as m192 from "./translation.js";
import * as m193 from "./type-caster/connection.js";
import * as m194 from "./type-caster/map.js";
import * as m195 from "./type.js";
import * as m196 from "./type/adapter-specific-registry.js";
import * as m197 from "./type/date-time.js";
import * as m198 from "./type/date.js";
import * as m199 from "./type/decimal-without-scale.js";
import * as m200 from "./type/hash-lookup-type-map.js";
import * as m201 from "./type/internal/timezone.js";
import * as m202 from "./type/json.js";
import * as m203 from "./type/serialized.js";
import * as m204 from "./type/text.js";
import * as m205 from "./type/time.js";
import * as m206 from "./type/type-map.js";
import * as m207 from "./type/unsigned-integer.js";
import * as m208 from "./validations.js";
import * as m209 from "./validations/absence.js";
import * as m210 from "./validations/associated.js";
import * as m211 from "./validations/length.js";
import * as m212 from "./validations/numericality.js";
import * as m213 from "./validations/presence.js";
import * as m214 from "./validations/uniqueness.js";

defineConstants([
  [() => m113, "ActiveRecordError", "ActiveRecord::ActiveRecordError"],
  [() => m113, "AdapterError", "ActiveRecord::AdapterError"],
  [() => m113, "AdapterNotFound", "ActiveRecord::AdapterNotFound"],
  [() => m113, "AdapterNotSpecified", "ActiveRecord::AdapterNotSpecified"],
  [() => m113, "AdapterTimeout", "ActiveRecord::AdapterTimeout"],
  [() => m0, "Aggregations", "ActiveRecord::Aggregations"],
  [() => m0, "ClassMethods", "ActiveRecord::Aggregations::ClassMethods"],
  [
    () => m18,
    "AmbiguousSourceReflectionForThroughAssociation",
    "ActiveRecord::AmbiguousSourceReflectionForThroughAssociation",
  ],
  [() => m18, "AssociationNotFoundError", "ActiveRecord::AssociationNotFoundError"],
  [() => m1, "AssociationRelation", "ActiveRecord::AssociationRelation"],
  [() => m2, "Associations", "ActiveRecord::Associations"],
  [() => m3, "AliasTracker", "ActiveRecord::Associations::AliasTracker"],
  [() => m5, "Association", "ActiveRecord::Associations::Association"],
  [() => m4, "AssociationScope", "ActiveRecord::Associations::AssociationScope"],
  [() => m4, "ReflectionProxy", "ActiveRecord::Associations::AssociationScope::ReflectionProxy"],
  [() => m6, "BelongsToAssociation", "ActiveRecord::Associations::BelongsToAssociation"],
  [
    () => m7,
    "BelongsToPolymorphicAssociation",
    "ActiveRecord::Associations::BelongsToPolymorphicAssociation",
  ],
  [() => m8, "Association", "ActiveRecord::Associations::Builder::Association"],
  [() => m9, "BelongsTo", "ActiveRecord::Associations::Builder::BelongsTo"],
  [
    () => m10,
    "CollectionAssociation",
    "ActiveRecord::Associations::Builder::CollectionAssociation",
  ],
  [() => m11, "HasAndBelongsToMany", "ActiveRecord::Associations::Builder::HasAndBelongsToMany"],
  [() => m12, "HasMany", "ActiveRecord::Associations::Builder::HasMany"],
  [() => m13, "HasOne", "ActiveRecord::Associations::Builder::HasOne"],
  [() => m14, "SingularAssociation", "ActiveRecord::Associations::Builder::SingularAssociation"],
  [() => m15, "CollectionAssociation", "ActiveRecord::Associations::CollectionAssociation"],
  [() => m16, "CollectionProxy", "ActiveRecord::Associations::CollectionProxy"],
  [
    () => m17,
    "DisableJoinsAssociationScope",
    "ActiveRecord::Associations::DisableJoinsAssociationScope",
  ],
  [() => m19, "ForeignAssociation", "ActiveRecord::Associations::ForeignAssociation"],
  [() => m20, "HasManyAssociation", "ActiveRecord::Associations::HasManyAssociation"],
  [() => m21, "HasManyThroughAssociation", "ActiveRecord::Associations::HasManyThroughAssociation"],
  [() => m22, "HasOneAssociation", "ActiveRecord::Associations::HasOneAssociation"],
  [() => m23, "HasOneThroughAssociation", "ActiveRecord::Associations::HasOneThroughAssociation"],
  [() => m24, "JoinDependency", "ActiveRecord::Associations::JoinDependency"],
  [() => m24, "Aliases", "ActiveRecord::Associations::JoinDependency::Aliases"],
  [() => m24, "Aliases.Column", "ActiveRecord::Associations::JoinDependency::Aliases::Column"],
  [() => m24, "Aliases.Table", "ActiveRecord::Associations::JoinDependency::Aliases::Table"],
  [() => m25, "JoinAssociation", "ActiveRecord::Associations::JoinDependency::JoinAssociation"],
  [() => m26, "JoinBase", "ActiveRecord::Associations::JoinDependency::JoinBase"],
  [() => m27, "JoinPart", "ActiveRecord::Associations::JoinDependency::JoinPart"],
  [() => m28, "NestedError", "ActiveRecord::Associations::NestedError"],
  [() => m29, "Preloader", "ActiveRecord::Associations::Preloader"],
  [() => m30, "Association", "ActiveRecord::Associations::Preloader::Association"],
  [() => m30, "LoaderQuery", "ActiveRecord::Associations::Preloader::Association::LoaderQuery"],
  [() => m30, "LoaderRecords", "ActiveRecord::Associations::Preloader::Association::LoaderRecords"],
  [() => m31, "Batch", "ActiveRecord::Associations::Preloader::Batch"],
  [() => m32, "Branch", "ActiveRecord::Associations::Preloader::Branch"],
  [() => m33, "ThroughAssociation", "ActiveRecord::Associations::Preloader::ThroughAssociation"],
  [() => m34, "SingularAssociation", "ActiveRecord::Associations::SingularAssociation"],
  [() => m35, "ThroughAssociation", "ActiveRecord::Associations::ThroughAssociation"],
  [() => m113, "AssociationTypeMismatch", "ActiveRecord::AssociationTypeMismatch"],
  [() => m36, "AsynchronousQueriesTracker", "ActiveRecord::AsynchronousQueriesTracker"],
  [() => m36, "Session", "ActiveRecord::AsynchronousQueriesTracker::Session"],
  [
    () => m113,
    "AsynchronousQueryInsideTransactionError",
    "ActiveRecord::AsynchronousQueryInsideTransactionError",
  ],
  [() => m37, "AttributeAssignment", "ActiveRecord::AttributeAssignment"],
  [() => m113, "AttributeAssignmentError", "ActiveRecord::AttributeAssignmentError"],
  [() => m38, "AttributeMethods", "ActiveRecord::AttributeMethods"],
  [() => m39, "BeforeTypeCast", "ActiveRecord::AttributeMethods::BeforeTypeCast"],
  [() => m38, "ClassMethods", "ActiveRecord::AttributeMethods::ClassMethods"],
  [() => m40, "CompositePrimaryKey", "ActiveRecord::AttributeMethods::CompositePrimaryKey"],
  [() => m41, "Dirty", "ActiveRecord::AttributeMethods::Dirty"],
  [
    () => m38,
    "GeneratedAttributeMethods",
    "ActiveRecord::AttributeMethods::GeneratedAttributeMethods",
  ],
  [() => m42, "PrimaryKey", "ActiveRecord::AttributeMethods::PrimaryKey"],
  [() => m43, "Query", "ActiveRecord::AttributeMethods::Query"],
  [() => m44, "Read", "ActiveRecord::AttributeMethods::Read"],
  [() => m45, "Serialization", "ActiveRecord::AttributeMethods::Serialization"],
  [() => m45, "ClassMethods", "ActiveRecord::AttributeMethods::Serialization::ClassMethods"],
  [
    () => m45,
    "ColumnNotSerializableError",
    "ActiveRecord::AttributeMethods::Serialization::ColumnNotSerializableError",
  ],
  [() => m46, "TimeZoneConversion", "ActiveRecord::AttributeMethods::TimeZoneConversion"],
  [
    () => m46,
    "TimeZoneConverter",
    "ActiveRecord::AttributeMethods::TimeZoneConversion::TimeZoneConverter",
  ],
  [() => m47, "Write", "ActiveRecord::AttributeMethods::Write"],
  [() => m48, "Attributes", "ActiveRecord::Attributes"],
  [() => m49, "AutosaveAssociation", "ActiveRecord::AutosaveAssociation"],
  [() => m50, "Base", "ActiveRecord::Base"],
  [() => m150, "Batches", "ActiveRecord::Batches"],
  [() => m151, "BatchEnumerator", "ActiveRecord::Batches::BatchEnumerator"],
  [() => m152, "Calculations", "ActiveRecord::Calculations"],
  [() => m152, "ColumnAliasTracker", "ActiveRecord::Calculations::ColumnAliasTracker"],
  [() => m51, "Callbacks", "ActiveRecord::Callbacks"],
  [() => m51, "ClassMethods", "ActiveRecord::Callbacks::ClassMethods"],
  [() => m52, "ColumnSerializer", "ActiveRecord::Coders::ColumnSerializer"],
  [() => m53, "JSON", "ActiveRecord::Coders::JSON"],
  [() => m54, "YAMLColumn", "ActiveRecord::Coders::YAMLColumn"],
  [() => m18, "CompositePrimaryKeyMismatchError", "ActiveRecord::CompositePrimaryKeyMismatchError"],
  [() => m132, "ConcurrentMigrationError", "ActiveRecord::ConcurrentMigrationError"],
  [() => m113, "ConfigurationError", "ActiveRecord::ConfigurationError"],
  [() => m55, "ConnectionAdapters", "ActiveRecord::ConnectionAdapters"],
  [() => m56, "AbstractAdapter", "ActiveRecord::ConnectionAdapters::AbstractAdapter"],
  [() => m56, "Version", "ActiveRecord::ConnectionAdapters::AbstractAdapter::Version"],
  [() => m58, "AbstractPool", "ActiveRecord::ConnectionAdapters::AbstractPool"],
  [() => m66, "AddColumnDefinition", "ActiveRecord::ConnectionAdapters::AddColumnDefinition"],
  [() => m66, "AlterTable", "ActiveRecord::ConnectionAdapters::AlterTable"],
  [() => m75, "BoundSchemaReflection", "ActiveRecord::ConnectionAdapters::BoundSchemaReflection"],
  [() => m75, "FakePool", "ActiveRecord::ConnectionAdapters::BoundSchemaReflection::FakePool"],
  [
    () => m66,
    "ChangeColumnDefaultDefinition",
    "ActiveRecord::ConnectionAdapters::ChangeColumnDefaultDefinition",
  ],
  [() => m66, "ChangeColumnDefinition", "ActiveRecord::ConnectionAdapters::ChangeColumnDefinition"],
  [
    () => m66,
    "CheckConstraintDefinition",
    "ActiveRecord::ConnectionAdapters::CheckConstraintDefinition",
  ],
  [() => m70, "Column", "ActiveRecord::ConnectionAdapters::Column"],
  [() => m66, "ColumnDefinition", "ActiveRecord::ConnectionAdapters::ColumnDefinition"],
  [() => m66, "ColumnMethods", "ActiveRecord::ConnectionAdapters::ColumnMethods"],
  [() => m57, "ConnectionHandler", "ActiveRecord::ConnectionAdapters::ConnectionHandler"],
  [
    () => m57,
    "ConnectionDescriptor",
    "ActiveRecord::ConnectionAdapters::ConnectionHandler::ConnectionDescriptor",
  ],
  [() => m58, "ConnectionPool", "ActiveRecord::ConnectionAdapters::ConnectionPool"],
  [() => m59, "BiasableQueue", "ActiveRecord::ConnectionAdapters::ConnectionPool::BiasableQueue"],
  [
    () => m59,
    "BiasedConditionVariable",
    "ActiveRecord::ConnectionAdapters::ConnectionPool::BiasableQueue::BiasedConditionVariable",
  ],
  [
    () => m59,
    "ConnectionLeasingQueue",
    "ActiveRecord::ConnectionAdapters::ConnectionPool::ConnectionLeasingQueue",
  ],
  [() => m58, "ExecutorHooks", "ActiveRecord::ConnectionAdapters::ConnectionPool::ExecutorHooks"],
  [() => m58, "Lease", "ActiveRecord::ConnectionAdapters::ConnectionPool::Lease"],
  [() => m58, "LeaseRegistry", "ActiveRecord::ConnectionAdapters::ConnectionPool::LeaseRegistry"],
  [() => m59, "Queue", "ActiveRecord::ConnectionAdapters::ConnectionPool::Queue"],
  [() => m60, "Reaper", "ActiveRecord::ConnectionAdapters::ConnectionPool::Reaper"],
  [
    () => m58,
    "WeakThreadKeyMap",
    "ActiveRecord::ConnectionAdapters::ConnectionPool::WeakThreadKeyMap",
  ],
  [() => m66, "CreateIndexDefinition", "ActiveRecord::ConnectionAdapters::CreateIndexDefinition"],
  [() => m61, "DatabaseStatements", "ActiveRecord::ConnectionAdapters::DatabaseStatements"],
  [() => m71, "Deduplicable", "ActiveRecord::ConnectionAdapters::Deduplicable"],
  [() => m71, "ClassMethods", "ActiveRecord::ConnectionAdapters::Deduplicable::ClassMethods"],
  [() => m66, "ForeignKeyDefinition", "ActiveRecord::ConnectionAdapters::ForeignKeyDefinition"],
  [() => m66, "IndexDefinition", "ActiveRecord::ConnectionAdapters::IndexDefinition"],
  [() => m70, "NullColumn", "ActiveRecord::ConnectionAdapters::NullColumn"],
  [() => m58, "NullPool", "ActiveRecord::ConnectionAdapters::NullPool"],
  [() => m58, "NullConfig", "ActiveRecord::ConnectionAdapters::NullPool::NullConfig"],
  [() => m69, "NullTransaction", "ActiveRecord::ConnectionAdapters::NullTransaction"],
  [() => m72, "PoolConfig", "ActiveRecord::ConnectionAdapters::PoolConfig"],
  [() => m73, "PoolManager", "ActiveRecord::ConnectionAdapters::PoolManager"],
  [() => m74, "RangeType", "ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Range"],
  [() => m66, "PrimaryKeyDefinition", "ActiveRecord::ConnectionAdapters::PrimaryKeyDefinition"],
  [() => m62, "QueryCache", "ActiveRecord::ConnectionAdapters::QueryCache"],
  [
    () => m62,
    "ConnectionPoolConfiguration",
    "ActiveRecord::ConnectionAdapters::QueryCache::ConnectionPoolConfiguration",
  ],
  [
    () => m62,
    "QueryCacheRegistry",
    "ActiveRecord::ConnectionAdapters::QueryCache::QueryCacheRegistry",
  ],
  [() => m62, "Store", "ActiveRecord::ConnectionAdapters::QueryCache::Store"],
  [() => m63, "Quoting", "ActiveRecord::ConnectionAdapters::Quoting"],
  [() => m63, "ClassMethods", "ActiveRecord::ConnectionAdapters::Quoting::ClassMethods"],
  [() => m69, "RealTransaction", "ActiveRecord::ConnectionAdapters::RealTransaction"],
  [() => m66, "ReferenceDefinition", "ActiveRecord::ConnectionAdapters::ReferenceDefinition"],
  [
    () => m69,
    "RestartParentTransaction",
    "ActiveRecord::ConnectionAdapters::RestartParentTransaction",
  ],
  [() => m64, "Savepoints", "ActiveRecord::ConnectionAdapters::Savepoints"],
  [() => m69, "SavepointTransaction", "ActiveRecord::ConnectionAdapters::SavepointTransaction"],
  [() => m75, "SchemaCache", "ActiveRecord::ConnectionAdapters::SchemaCache"],
  [() => m65, "SchemaCreation", "ActiveRecord::ConnectionAdapters::SchemaCreation"],
  [() => m67, "SchemaDumper", "ActiveRecord::ConnectionAdapters::SchemaDumper"],
  [() => m75, "SchemaReflection", "ActiveRecord::ConnectionAdapters::SchemaReflection"],
  [() => m68, "SchemaStatements", "ActiveRecord::ConnectionAdapters::SchemaStatements"],
  [() => m76, "SqlTypeMetadata", "ActiveRecord::ConnectionAdapters::SqlTypeMetadata"],
  [() => m77, "StatementPool", "ActiveRecord::ConnectionAdapters::StatementPool"],
  [() => m66, "Table", "ActiveRecord::ConnectionAdapters::Table"],
  [() => m66, "TableDefinition", "ActiveRecord::ConnectionAdapters::TableDefinition"],
  [() => m69, "Transaction", "ActiveRecord::ConnectionAdapters::Transaction"],
  [() => m69, "Callback", "ActiveRecord::ConnectionAdapters::Transaction::Callback"],
  [
    () => m69,
    "TransactionInstrumenter",
    "ActiveRecord::ConnectionAdapters::TransactionInstrumenter",
  ],
  [
    () => m69,
    "InstrumentationAlreadyStartedError",
    "ActiveRecord::ConnectionAdapters::TransactionInstrumenter::InstrumentationAlreadyStartedError",
  ],
  [
    () => m69,
    "InstrumentationNotStartedError",
    "ActiveRecord::ConnectionAdapters::TransactionInstrumenter::InstrumentationNotStartedError",
  ],
  [() => m69, "TransactionManager", "ActiveRecord::ConnectionAdapters::TransactionManager"],
  [() => m69, "TransactionState", "ActiveRecord::ConnectionAdapters::TransactionState"],
  [() => m113, "ConnectionFailed", "ActiveRecord::ConnectionFailed"],
  [() => m78, "ConnectionHandling", "ActiveRecord::ConnectionHandling"],
  [() => m113, "ConnectionNotDefined", "ActiveRecord::ConnectionNotDefined"],
  [() => m113, "ConnectionNotEstablished", "ActiveRecord::ConnectionNotEstablished"],
  [() => m113, "ConnectionTimeoutError", "ActiveRecord::ConnectionTimeoutError"],
  [() => m79, "Core", "ActiveRecord::Core"],
  [() => m79, "ClassMethods", "ActiveRecord::Core::ClassMethods"],
  [() => m79, "InspectionMask", "ActiveRecord::Core::InspectionMask"],
  [() => m80, "CounterCache", "ActiveRecord::CounterCache"],
  [() => m80, "ClassMethods", "ActiveRecord::CounterCache::ClassMethods"],
  [() => m113, "DangerousAttributeError", "ActiveRecord::DangerousAttributeError"],
  [() => m113, "DatabaseAlreadyExists", "ActiveRecord::DatabaseAlreadyExists"],
  [() => m81, "DatabaseConfigurations", "ActiveRecord::DatabaseConfigurations"],
  [
    () => m82,
    "ConnectionUrlResolver",
    "ActiveRecord::DatabaseConfigurations::ConnectionUrlResolver",
  ],
  [() => m83, "DatabaseConfig", "ActiveRecord::DatabaseConfigurations::DatabaseConfig"],
  [() => m84, "HashConfig", "ActiveRecord::DatabaseConfigurations::HashConfig"],
  [
    () => m81,
    "InvalidConfigurationError",
    "ActiveRecord::DatabaseConfigurations::InvalidConfigurationError",
  ],
  [() => m85, "UrlConfig", "ActiveRecord::DatabaseConfigurations::UrlConfig"],
  [() => m113, "DatabaseConnectionError", "ActiveRecord::DatabaseConnectionError"],
  [() => m113, "DatabaseVersionError", "ActiveRecord::DatabaseVersionError"],
  [() => m113, "Deadlocked", "ActiveRecord::Deadlocked"],
  [() => m153, "Delegation", "ActiveRecord::Delegation"],
  [() => m153, "ClassSpecificRelation", "ActiveRecord::Delegation::ClassSpecificRelation"],
  [() => m153, "DelegateCache", "ActiveRecord::Delegation::DelegateCache"],
  [() => m153, "GeneratedRelationMethods", "ActiveRecord::Delegation::GeneratedRelationMethods"],
  [() => m18, "DeleteRestrictionError", "ActiveRecord::DeleteRestrictionError"],
  [() => m86, "DisableJoinsAssociationRelation", "ActiveRecord::DisableJoinsAssociationRelation"],
  [() => m132, "DuplicateMigrationNameError", "ActiveRecord::DuplicateMigrationNameError"],
  [() => m132, "DuplicateMigrationVersionError", "ActiveRecord::DuplicateMigrationVersionError"],
  [() => m87, "DynamicMatchers", "ActiveRecord::DynamicMatchers"],
  [() => m87, "FindBy", "ActiveRecord::DynamicMatchers::FindBy"],
  [() => m87, "FindByBang", "ActiveRecord::DynamicMatchers::FindByBang"],
  [() => m87, "Method", "ActiveRecord::DynamicMatchers::Method"],
  [() => m18, "EagerLoadPolymorphicError", "ActiveRecord::EagerLoadPolymorphicError"],
  [() => m88, "Encryption", "ActiveRecord::Encryption"],
  [() => m89, "AutoFilteredParameters", "ActiveRecord::Encryption::AutoFilteredParameters"],
  [() => m90, "Cipher", "ActiveRecord::Encryption::Cipher"],
  [() => m91, "Aes256Gcm", "ActiveRecord::Encryption::Cipher::Aes256Gcm"],
  [() => m92, "Config", "ActiveRecord::Encryption::Config"],
  [() => m93, "Configurable", "ActiveRecord::Encryption::Configurable"],
  [() => m94, "Context", "ActiveRecord::Encryption::Context"],
  [() => m95, "Contexts", "ActiveRecord::Encryption::Contexts"],
  [() => m96, "DerivedSecretKeyProvider", "ActiveRecord::Encryption::DerivedSecretKeyProvider"],
  [() => m97, "DeterministicKeyProvider", "ActiveRecord::Encryption::DeterministicKeyProvider"],
  [() => m98, "EncryptableRecord", "ActiveRecord::Encryption::EncryptableRecord"],
  [() => m99, "EncryptedAttributeType", "ActiveRecord::Encryption::EncryptedAttributeType"],
  [() => m100, "EncryptingOnlyEncryptor", "ActiveRecord::Encryption::EncryptingOnlyEncryptor"],
  [() => m101, "Encryptor", "ActiveRecord::Encryption::Encryptor"],
  [() => m102, null, "ActiveRecord::Encryption::Errors"],
  [() => m102, "Base", "ActiveRecord::Encryption::Errors::Base"],
  [() => m102, "Configuration", "ActiveRecord::Encryption::Errors::Configuration"],
  [() => m102, "Decryption", "ActiveRecord::Encryption::Errors::Decryption"],
  [() => m102, "Encoding", "ActiveRecord::Encryption::Errors::Encoding"],
  [
    () => m102,
    "EncryptedContentIntegrity",
    "ActiveRecord::Encryption::Errors::EncryptedContentIntegrity",
  ],
  [() => m102, "Encryption", "ActiveRecord::Encryption::Errors::Encryption"],
  [() => m102, "ForbiddenClass", "ActiveRecord::Encryption::Errors::ForbiddenClass"],
  [
    () => m103,
    "ExtendedDeterministicUniquenessValidator",
    "ActiveRecord::Encryption::ExtendedDeterministicUniquenessValidator",
  ],
  [
    () => m103,
    "EncryptedUniquenessValidator",
    "ActiveRecord::Encryption::ExtendedDeterministicUniquenessValidator::EncryptedUniquenessValidator",
  ],
  [() => m106, "Key", "ActiveRecord::Encryption::Key"],
  [() => m104, "KeyGenerator", "ActiveRecord::Encryption::KeyGenerator"],
  [() => m105, "KeyProvider", "ActiveRecord::Encryption::KeyProvider"],
  [() => m108, "Message", "ActiveRecord::Encryption::Message"],
  [() => m107, "MessageSerializer", "ActiveRecord::Encryption::MessageSerializer"],
  [() => m109, "NullEncryptor", "ActiveRecord::Encryption::NullEncryptor"],
  [() => m110, "Properties", "ActiveRecord::Encryption::Properties"],
  [() => m111, "Scheme", "ActiveRecord::Encryption::Scheme"],
  [() => m112, "Enum", "ActiveRecord::Enum"],
  [() => m112, "EnumMethods", "ActiveRecord::Enum::EnumMethods"],
  [() => m112, "EnumType", "ActiveRecord::Enum::EnumType"],
  [() => m132, "EnvironmentMismatchError", "ActiveRecord::EnvironmentMismatchError"],
  [() => m132, "EnvironmentStorageError", "ActiveRecord::EnvironmentStorageError"],
  [() => m113, "ExclusiveConnectionTimeoutError", "ActiveRecord::ExclusiveConnectionTimeoutError"],
  [() => m116, "Explain", "ActiveRecord::Explain"],
  [() => m114, "ExplainRegistry", "ActiveRecord::ExplainRegistry"],
  [() => m115, "ExplainSubscriber", "ActiveRecord::ExplainSubscriber"],
  [() => m154, "FinderMethods", "ActiveRecord::FinderMethods"],
  [() => m117, "FutureResult", "ActiveRecord::FutureResult"],
  [() => m117, "Canceled", "ActiveRecord::FutureResult::Canceled"],
  [() => m117, "Complete", "ActiveRecord::FutureResult::Complete"],
  [() => m117, "EventBuffer", "ActiveRecord::FutureResult::EventBuffer"],
  [() => m117, "SelectAll", "ActiveRecord::FutureResult::SelectAll"],
  [
    () => m18,
    "HasManyThroughAssociationNotFoundError",
    "ActiveRecord::HasManyThroughAssociationNotFoundError",
  ],
  [
    () => m18,
    "HasManyThroughAssociationPointlessSourceTypeError",
    "ActiveRecord::HasManyThroughAssociationPointlessSourceTypeError",
  ],
  [
    () => m18,
    "HasManyThroughAssociationPolymorphicSourceError",
    "ActiveRecord::HasManyThroughAssociationPolymorphicSourceError",
  ],
  [
    () => m18,
    "HasManyThroughAssociationPolymorphicThroughError",
    "ActiveRecord::HasManyThroughAssociationPolymorphicThroughError",
  ],
  [
    () => m18,
    "HasManyThroughCantAssociateThroughHasOneOrManyReflection",
    "ActiveRecord::HasManyThroughCantAssociateThroughHasOneOrManyReflection",
  ],
  [
    () => m18,
    "HasManyThroughNestedAssociationsAreReadonly",
    "ActiveRecord::HasManyThroughNestedAssociationsAreReadonly",
  ],
  [() => m18, "HasManyThroughOrderError", "ActiveRecord::HasManyThroughOrderError"],
  [
    () => m18,
    "HasManyThroughSourceAssociationNotFoundError",
    "ActiveRecord::HasManyThroughSourceAssociationNotFoundError",
  ],
  [
    () => m18,
    "HasOneAssociationPolymorphicThroughError",
    "ActiveRecord::HasOneAssociationPolymorphicThroughError",
  ],
  [
    () => m18,
    "HasOneThroughCantAssociateThroughCollection",
    "ActiveRecord::HasOneThroughCantAssociateThroughCollection",
  ],
  [
    () => m18,
    "HasOneThroughCantAssociateThroughHasOneOrManyReflection",
    "ActiveRecord::HasOneThroughCantAssociateThroughHasOneOrManyReflection",
  ],
  [
    () => m18,
    "HasOneThroughNestedAssociationsAreReadonly",
    "ActiveRecord::HasOneThroughNestedAssociationsAreReadonly",
  ],
  [() => m132, "IllegalMigrationNameError", "ActiveRecord::IllegalMigrationNameError"],
  [() => m119, "Inheritance", "ActiveRecord::Inheritance"],
  [() => m119, "ClassMethods", "ActiveRecord::Inheritance::ClassMethods"],
  [() => m120, "InsertAll", "ActiveRecord::InsertAll"],
  [() => m120, "Builder", "ActiveRecord::InsertAll::Builder"],
  [() => m121, "Integration", "ActiveRecord::Integration"],
  [() => m121, "ClassMethods", "ActiveRecord::Integration::ClassMethods"],
  [() => m122, "InternalMetadata", "ActiveRecord::InternalMetadata"],
  [() => m122, "NullInternalMetadata", "ActiveRecord::InternalMetadata::NullInternalMetadata"],
  [() => m113, "InvalidForeignKey", "ActiveRecord::InvalidForeignKey"],
  [() => m132, "InvalidMigrationTimestampError", "ActiveRecord::InvalidMigrationTimestampError"],
  [
    () => m18,
    "InverseOfAssociationNotFoundError",
    "ActiveRecord::InverseOfAssociationNotFoundError",
  ],
  [
    () => m18,
    "InverseOfAssociationRecursiveError",
    "ActiveRecord::InverseOfAssociationRecursiveError",
  ],
  [() => m132, "IrreversibleMigration", "ActiveRecord::IrreversibleMigration"],
  [() => m113, "IrreversibleOrderError", "ActiveRecord::IrreversibleOrderError"],
  [() => m123, "LegacyYamlAdapter", "ActiveRecord::LegacyYamlAdapter"],
  [() => m124, "LockingType", "ActiveRecord::Locking::LockingType"],
  [() => m124, "Optimistic", "ActiveRecord::Locking::Optimistic"],
  [() => m124, "ClassMethods", "ActiveRecord::Locking::Optimistic::ClassMethods"],
  [() => m125, "Pessimistic", "ActiveRecord::Locking::Pessimistic"],
  [() => m113, "LockWaitTimeout", "ActiveRecord::LockWaitTimeout"],
  [() => m126, "LogSubscriber", "ActiveRecord::LogSubscriber"],
  [() => m127, null, "ActiveRecord::Marshalling"],
  [() => m127, "Methods", "ActiveRecord::Marshalling::Methods"],
  [() => m128, "DatabaseSelector", "ActiveRecord::Middleware::DatabaseSelector"],
  [() => m129, "Resolver", "ActiveRecord::Middleware::DatabaseSelector::Resolver"],
  [() => m130, "Session", "ActiveRecord::Middleware::DatabaseSelector::Resolver::Session"],
  [() => m131, "ShardSelector", "ActiveRecord::Middleware::ShardSelector"],
  [() => m132, "Migration", "ActiveRecord::Migration"],
  [() => m132, "CheckPending", "ActiveRecord::Migration::CheckPending"],
  [() => m133, "CommandRecorder", "ActiveRecord::Migration::CommandRecorder"],
  [() => m134, null, "ActiveRecord::Migration::Compatibility"],
  [() => m134, "V4_2", "ActiveRecord::Migration::Compatibility::V4_2"],
  [() => m134, "V5_0", "ActiveRecord::Migration::Compatibility::V5_0"],
  [() => m134, "V5_1", "ActiveRecord::Migration::Compatibility::V5_1"],
  [() => m134, "V5_2", "ActiveRecord::Migration::Compatibility::V5_2"],
  [
    () => m134,
    "V5_2.CommandRecorder",
    "ActiveRecord::Migration::Compatibility::V5_2::CommandRecorder",
  ],
  [() => m134, "V6_0", "ActiveRecord::Migration::Compatibility::V6_0"],
  [
    () => m134,
    "V6_0.ReferenceDefinition",
    "ActiveRecord::Migration::Compatibility::V6_0::ReferenceDefinition",
  ],
  [() => m134, "V6_1", "ActiveRecord::Migration::Compatibility::V6_1"],
  [
    () => m134,
    "V6_1.PostgreSQLCompat",
    "ActiveRecord::Migration::Compatibility::V6_1::PostgreSQLCompat",
  ],
  [() => m134, "V7_0", "ActiveRecord::Migration::Compatibility::V7_0"],
  [
    () => m134,
    "V7_0.LegacyIndexName",
    "ActiveRecord::Migration::Compatibility::V7_0::LegacyIndexName",
  ],
  [() => m134, "V7_1", "ActiveRecord::Migration::Compatibility::V7_1"],
  [() => m134, "V7_2", "ActiveRecord::Migration::Compatibility::V7_2"],
  [() => m132, "Current", "ActiveRecord::Migration::Current"],
  [() => m135, "DefaultStrategy", "ActiveRecord::Migration::DefaultStrategy"],
  [() => m136, "ExecutionStrategy", "ActiveRecord::Migration::ExecutionStrategy"],
  [() => m132, "ReversibleBlockHelper", "ActiveRecord::Migration::ReversibleBlockHelper"],
  [() => m132, "MigrationContext", "ActiveRecord::MigrationContext"],
  [() => m132, "MigrationError", "ActiveRecord::MigrationError"],
  [() => m132, "MigrationProxy", "ActiveRecord::MigrationProxy"],
  [() => m132, "Migrator", "ActiveRecord::Migrator"],
  [() => m113, "MismatchedForeignKey", "ActiveRecord::MismatchedForeignKey"],
  [() => m138, "ModelSchema", "ActiveRecord::ModelSchema"],
  [() => m138, "ClassMethods", "ActiveRecord::ModelSchema::ClassMethods"],
  [() => m113, "MultiparameterAssignmentErrors", "ActiveRecord::MultiparameterAssignmentErrors"],
  [() => m139, "NestedAttributes", "ActiveRecord::NestedAttributes"],
  [() => m139, "TooManyRecords", "ActiveRecord::NestedAttributes::TooManyRecords"],
  [() => m113, "NoDatabaseError", "ActiveRecord::NoDatabaseError"],
  [() => m132, "NoEnvironmentInSchemaError", "ActiveRecord::NoEnvironmentInSchemaError"],
  [() => m141, "Normalization", "ActiveRecord::Normalization"],
  [() => m141, "ClassMethods", "ActiveRecord::Normalization::ClassMethods"],
  [() => m141, "NormalizedValueType", "ActiveRecord::Normalization::NormalizedValueType"],
  [() => m113, "NotNullViolation", "ActiveRecord::NotNullViolation"],
  [() => m140, "NoTouching", "ActiveRecord::NoTouching"],
  [() => m137, "PendingMigrationConnection", "ActiveRecord::PendingMigrationConnection"],
  [() => m132, "PendingMigrationError", "ActiveRecord::PendingMigrationError"],
  [() => m142, "Persistence", "ActiveRecord::Persistence"],
  [() => m142, "ClassMethods", "ActiveRecord::Persistence::ClassMethods"],
  [() => m157, "PredicateBuilder", "ActiveRecord::PredicateBuilder"],
  [() => m158, "ArrayHandler", "ActiveRecord::PredicateBuilder::ArrayHandler"],
  [() => m158, "NullPredicate", "ActiveRecord::PredicateBuilder::ArrayHandler::NullPredicate"],
  [() => m159, "AssociationQueryValue", "ActiveRecord::PredicateBuilder::AssociationQueryValue"],
  [() => m160, "BasicObjectHandler", "ActiveRecord::PredicateBuilder::BasicObjectHandler"],
  [() => m161, "PolymorphicArrayValue", "ActiveRecord::PredicateBuilder::PolymorphicArrayValue"],
  [() => m162, "RangeHandler", "ActiveRecord::PredicateBuilder::RangeHandler"],
  [() => m162, "RangeWithBinds", "ActiveRecord::PredicateBuilder::RangeHandler::RangeWithBinds"],
  [() => m163, "RelationHandler", "ActiveRecord::PredicateBuilder::RelationHandler"],
  [() => m113, "PreparedStatementCacheExpired", "ActiveRecord::PreparedStatementCacheExpired"],
  [() => m113, "PreparedStatementInvalid", "ActiveRecord::PreparedStatementInvalid"],
  [() => m132, "ProtectedEnvironmentError", "ActiveRecord::ProtectedEnvironmentError"],
  [() => m113, "QueryAborted", "ActiveRecord::QueryAborted"],
  [() => m143, "QueryCache", "ActiveRecord::QueryCache"],
  [() => m143, "ClassMethods", "ActiveRecord::QueryCache::ClassMethods"],
  [() => m113, "QueryCanceled", "ActiveRecord::QueryCanceled"],
  [() => m146, null, "ActiveRecord::Querying"],
  [() => m145, "QueryLogs", "ActiveRecord::QueryLogs"],
  [() => m145, "GetKeyHandler", "ActiveRecord::QueryLogs::GetKeyHandler"],
  [() => m145, "IdentityHandler", "ActiveRecord::QueryLogs::IdentityHandler"],
  [() => m144, "LegacyFormatter", "ActiveRecord::QueryLogs::LegacyFormatter"],
  [() => m144, "SQLCommenter", "ActiveRecord::QueryLogs::SQLCommenter"],
  [() => m145, "ZeroArityHandler", "ActiveRecord::QueryLogs::ZeroArityHandler"],
  [() => m165, "QueryMethods", "ActiveRecord::QueryMethods"],
  [() => m165, "CTEJoin", "ActiveRecord::QueryMethods::CTEJoin"],
  [() => m165, "WhereChain", "ActiveRecord::QueryMethods::WhereChain"],
  [() => m113, "RangeError", "ActiveRecord::RangeError"],
  [() => m147, "ReadonlyAttributeError", "ActiveRecord::ReadonlyAttributeError"],
  [() => m147, "ReadonlyAttributes", "ActiveRecord::ReadonlyAttributes"],
  [() => m147, "ClassMethods", "ActiveRecord::ReadonlyAttributes::ClassMethods"],
  [() => m147, "HasReadonlyAttributes", "ActiveRecord::ReadonlyAttributes::HasReadonlyAttributes"],
  [() => m113, "ReadOnlyError", "ActiveRecord::ReadOnlyError"],
  [() => m113, "ReadOnlyRecord", "ActiveRecord::ReadOnlyRecord"],
  [() => m208, "RecordInvalid", "ActiveRecord::RecordInvalid"],
  [() => m113, "RecordNotDestroyed", "ActiveRecord::RecordNotDestroyed"],
  [() => m113, "RecordNotFound", "ActiveRecord::RecordNotFound"],
  [() => m113, "RecordNotSaved", "ActiveRecord::RecordNotSaved"],
  [() => m113, "RecordNotUnique", "ActiveRecord::RecordNotUnique"],
  [() => m148, "Reflection", "ActiveRecord::Reflection"],
  [() => m148, "AbstractReflection", "ActiveRecord::Reflection::AbstractReflection"],
  [() => m148, "AggregateReflection", "ActiveRecord::Reflection::AggregateReflection"],
  [() => m148, "AssociationReflection", "ActiveRecord::Reflection::AssociationReflection"],
  [() => m148, "BelongsToReflection", "ActiveRecord::Reflection::BelongsToReflection"],
  [() => m148, "ClassMethods", "ActiveRecord::Reflection::ClassMethods"],
  [
    () => m148,
    "HasAndBelongsToManyReflection",
    "ActiveRecord::Reflection::HasAndBelongsToManyReflection",
  ],
  [() => m148, "HasManyReflection", "ActiveRecord::Reflection::HasManyReflection"],
  [() => m148, "HasOneReflection", "ActiveRecord::Reflection::HasOneReflection"],
  [() => m148, "MacroReflection", "ActiveRecord::Reflection::MacroReflection"],
  [() => m148, "PolymorphicReflection", "ActiveRecord::Reflection::PolymorphicReflection"],
  [() => m148, "RuntimeReflection", "ActiveRecord::Reflection::RuntimeReflection"],
  [() => m148, "ThroughReflection", "ActiveRecord::Reflection::ThroughReflection"],
  [() => m149, "Relation", "ActiveRecord::Relation"],
  [() => m149, "ExplainProxy", "ActiveRecord::Relation::ExplainProxy"],
  [() => m155, "FromClause", "ActiveRecord::Relation::FromClause"],
  [() => m156, "HashMerger", "ActiveRecord::Relation::HashMerger"],
  [() => m156, "Merger", "ActiveRecord::Relation::Merger"],
  [() => m164, "QueryAttribute", "ActiveRecord::Relation::QueryAttribute"],
  [() => m149, "Relation.StrictLoadingScope", "ActiveRecord::Relation::StrictLoadingScope"],
  [() => m167, "WhereClause", "ActiveRecord::Relation::WhereClause"],
  [() => m168, "Result", "ActiveRecord::Result"],
  [() => m168, "IndexedRow", "ActiveRecord::Result::IndexedRow"],
  [() => m113, "Rollback", "ActiveRecord::Rollback"],
  [() => m169, null, "ActiveRecord::RuntimeRegistry"],
  [() => m170, null, "ActiveRecord::Sanitization"],
  [() => m170, "ClassMethods", "ActiveRecord::Sanitization::ClassMethods"],
  [() => m173, "Schema", "ActiveRecord::Schema"],
  [() => m173, "Definition", "ActiveRecord::Schema::Definition"],
  [() => m171, "SchemaDumper", "ActiveRecord::SchemaDumper"],
  [() => m172, "SchemaMigration", "ActiveRecord::SchemaMigration"],
  [() => m172, "NullSchemaMigration", "ActiveRecord::SchemaMigration::NullSchemaMigration"],
  [() => m175, "Default", "ActiveRecord::Scoping::Default"],
  [() => m175, "DefaultScope", "ActiveRecord::Scoping::DefaultScope"],
  [() => m176, null, "ActiveRecord::Scoping::Named"],
  [() => m176, "ClassMethods", "ActiveRecord::Scoping::Named::ClassMethods"],
  [() => m174, "ScopeRegistry", "ActiveRecord::Scoping::ScopeRegistry"],
  [() => m177, null, "ActiveRecord::SecurePassword"],
  [() => m178, null, "ActiveRecord::SecureToken"],
  [() => m178, "MinimumLengthError", "ActiveRecord::SecureToken::MinimumLengthError"],
  [() => m179, null, "ActiveRecord::Serialization"],
  [() => m113, "SerializationFailure", "ActiveRecord::SerializationFailure"],
  [() => m113, "SerializationTypeMismatch", "ActiveRecord::SerializationTypeMismatch"],
  [() => m180, "SignedId", "ActiveRecord::SignedId"],
  [() => m180, "ClassMethods", "ActiveRecord::SignedId::ClassMethods"],
  [() => m180, "RelationMethods", "ActiveRecord::SignedId::RelationMethods"],
  [() => m113, "SoleRecordExceeded", "ActiveRecord::SoleRecordExceeded"],
  [() => m166, "SpawnMethods", "ActiveRecord::SpawnMethods"],
  [() => m113, "SQLWarning", "ActiveRecord::SQLWarning"],
  [() => m113, "StaleObjectError", "ActiveRecord::StaleObjectError"],
  [() => m181, "StatementCache", "ActiveRecord::StatementCache"],
  [() => m181, "BindMap", "ActiveRecord::StatementCache::BindMap"],
  [() => m181, "Params", "ActiveRecord::StatementCache::Params"],
  [() => m181, "PartialQuery", "ActiveRecord::StatementCache::PartialQuery"],
  [() => m181, "PartialQueryCollector", "ActiveRecord::StatementCache::PartialQueryCollector"],
  [() => m181, "Query", "ActiveRecord::StatementCache::Query"],
  [() => m181, "Substitute", "ActiveRecord::StatementCache::Substitute"],
  [() => m113, "StatementInvalid", "ActiveRecord::StatementInvalid"],
  [() => m113, "StatementTimeout", "ActiveRecord::StatementTimeout"],
  [() => m182, null, "ActiveRecord::Store"],
  [() => m182, "ClassMethods", "ActiveRecord::Store::ClassMethods"],
  [() => m182, "HashAccessor", "ActiveRecord::Store::HashAccessor"],
  [() => m182, "IndifferentCoder", "ActiveRecord::Store::IndifferentCoder"],
  [() => m182, "IndifferentHashAccessor", "ActiveRecord::Store::IndifferentHashAccessor"],
  [() => m182, "StringKeyedHashAccessor", "ActiveRecord::Store::StringKeyedHashAccessor"],
  [() => m113, "StrictLoadingViolationError", "ActiveRecord::StrictLoadingViolationError"],
  [() => m113, "SubclassNotFound", "ActiveRecord::SubclassNotFound"],
  [() => m183, null, "ActiveRecord::Suppressor"],
  [() => m184, "TableMetadata", "ActiveRecord::TableMetadata"],
  [() => m113, "TableNotSpecified", "ActiveRecord::TableNotSpecified"],
  [
    () => m18,
    "ThroughCantAssociateThroughHasOneOrManyReflection",
    "ActiveRecord::ThroughCantAssociateThroughHasOneOrManyReflection",
  ],
  [
    () => m18,
    "ThroughNestedAssociationsAreReadonly",
    "ActiveRecord::ThroughNestedAssociationsAreReadonly",
  ],
  [() => m185, "Timestamp", "ActiveRecord::Timestamp"],
  [() => m186, "TokenFor", "ActiveRecord::TokenFor"],
  [() => m186, "RelationMethods", "ActiveRecord::TokenFor::RelationMethods"],
  [() => m186, "TokenDefinition", "ActiveRecord::TokenFor::TokenDefinition"],
  [() => m187, "TouchLater", "ActiveRecord::TouchLater"],
  [() => m188, "ControllerRuntime", "ActiveRecord::Trailties::ControllerRuntime"],
  [() => m188, "ClassMethods", "ActiveRecord::Trailties::ControllerRuntime::ClassMethods"],
  [() => m189, "JobRuntime", "ActiveRecord::Trailties::JobRuntime"],
  [() => m190, "Transaction", "ActiveRecord::Transaction"],
  [() => m113, "TransactionIsolationError", "ActiveRecord::TransactionIsolationError"],
  [() => m113, "TransactionRollbackError", "ActiveRecord::TransactionRollbackError"],
  [() => m191, "Transactions", "ActiveRecord::Transactions"],
  [() => m192, "Translation", "ActiveRecord::Translation"],
  [() => m195, null, "ActiveRecord::Type"],
  [() => m196, "AdapterSpecificRegistry", "ActiveRecord::Type::AdapterSpecificRegistry"],
  [() => m198, "Date", "ActiveRecord::Type::Date"],
  [() => m197, "DateTime", "ActiveRecord::Type::DateTime"],
  [() => m199, "DecimalWithoutScale", "ActiveRecord::Type::DecimalWithoutScale"],
  [() => m196, "DecorationRegistration", "ActiveRecord::Type::DecorationRegistration"],
  [() => m200, "HashLookupTypeMap", "ActiveRecord::Type::HashLookupTypeMap"],
  [() => m201, "Timezone", "ActiveRecord::Type::Internal::Timezone"],
  [() => m202, "Json", "ActiveRecord::Type::Json"],
  [() => m196, "Registration", "ActiveRecord::Type::Registration"],
  [() => m203, "Serialized", "ActiveRecord::Type::Serialized"],
  [() => m204, "Text", "ActiveRecord::Type::Text"],
  [() => m205, "Time", "ActiveRecord::Type::Time"],
  [() => m205, "Value", "ActiveRecord::Type::Time::Value"],
  [() => m206, "TypeMap", "ActiveRecord::Type::TypeMap"],
  [() => m207, "UnsignedInteger", "ActiveRecord::Type::UnsignedInteger"],
  [() => m193, "Connection", "ActiveRecord::TypeCaster::Connection"],
  [() => m194, "Map", "ActiveRecord::TypeCaster::Map"],
  [() => m196, "TypeConflictError", "ActiveRecord::TypeConflictError"],
  [() => m113, "UnknownAttributeReference", "ActiveRecord::UnknownAttributeReference"],
  [() => m132, "UnknownMigrationVersionError", "ActiveRecord::UnknownMigrationVersionError"],
  [() => m113, "UnknownPrimaryKey", "ActiveRecord::UnknownPrimaryKey"],
  [() => m113, "UnmodifiableRelation", "ActiveRecord::UnmodifiableRelation"],
  [() => m208, "Validations", "ActiveRecord::Validations"],
  [() => m209, "AbsenceValidator", "ActiveRecord::Validations::AbsenceValidator"],
  [() => m210, "AssociatedValidator", "ActiveRecord::Validations::AssociatedValidator"],
  [() => m209, "ClassMethods", "ActiveRecord::Validations::ClassMethods"],
  [() => m211, "LengthValidator", "ActiveRecord::Validations::LengthValidator"],
  [() => m212, "NumericalityValidator", "ActiveRecord::Validations::NumericalityValidator"],
  [() => m213, "PresenceValidator", "ActiveRecord::Validations::PresenceValidator"],
  [() => m214, "UniquenessValidator", "ActiveRecord::Validations::UniquenessValidator"],
  [() => m113, "ValueTooLong", "ActiveRecord::ValueTooLong"],
  [() => m118, "VERSION", "ActiveRecord::VERSION"],
  [() => m113, "WrappedDatabaseException", "ActiveRecord::WrappedDatabaseException"],
]);

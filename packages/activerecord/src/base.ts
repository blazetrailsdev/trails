import { Temporal } from "@blazetrails/date";
// Registers Active Record's `en` locale (active_record.rb's on_load(:i18n) hook).
import "./i18n.js";
import {
  Locator as _Locator,
  GlobalID as _GlobalIDCtor,
  SignedGlobalID as _SignedGlobalIDType,
} from "@blazetrails/globalid";
// _SignedGlobalIDType is imported from the barrel so Locator.locateSigned's
// parameter type stays nominally identical. Going through the
// `/signed-global-id` subpath produces a distinct SignedGlobalID class under
// src/ vs dist/ resolution (private fields are nominal in TS).

/**
 * Options accepted by {@link Base.toSgid} / {@link Base.toSignedGlobalId} /
 * {@link Base.toSgidParam}. Mirrors SignedGlobalIDOptions minus `verifier`
 * (AR supplies the verifier via signedIdVerifier(this)). The index signature
 * carries arbitrary keys through as GID URI params, matching Rails.
 */
interface ToSgidOptions {
  app?: string;
  /** Rails-canonical purpose option (`options.fetch :for, DEFAULT_PURPOSE`). */
  for?: string;
  expiresIn?: number;
  expiresAt?: Temporal.Instant;
  [key: string]: unknown;
}
import type {
  GlobalIDModel,
  SignedGlobalID as SignedGlobalIDType,
} from "@blazetrails/globalid/signed-global-id";
import {
  ArgumentError,
  AttributeMethodPattern,
  Model,
  Type,
  type AttributeOptions,
  type TransactionalCallbackConditions,
} from "@blazetrails/activemodel";
import { setCurrentAdapterResolver } from "./type.js";
import { Table, DeleteManager, Nodes } from "@blazetrails/arel";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { Relation } from "./relation.js";
// Side-effect import: relation.ts registers the `Relation` family slot that
// `relationClassFor` builds every per-model relation subclass from. relation.ts
// no longer imports base.js for its value, so this edge is one-way.
import "./relation.js";
import { generatedRelationMethods as _generatedRelationMethods } from "./relation/delegation.js";
import { _registerBase as _registerBaseWithQueryCache } from "./query-cache.js";
import { _registerBase as _registerBaseWithSchemaMigration } from "./schema-migration.js";
import { _registerBase as _registerBaseWithInternalMetadata } from "./internal-metadata.js";
import { _registerBase as _registerBaseWithSchemaDumper } from "./schema-dumper.js";
import { _registerBase as _registerBaseWithNamedScoping } from "./scoping/named.js";
import { _registerBase as _registerBaseWithAsynchronousQueriesTracker } from "./asynchronous-queries-tracker.js";
import { _registerBase as _registerBaseWithDatabaseStatements } from "./connection-adapters/abstract/database-statements.js";
import {
  discriminateClassForRecord,
  stiName,
  polymorphicName as inheritancePolymorphicName,
  computeType as inheritanceComputeType,
  subclasses as inheritanceSubclasses,
  descendants as inheritanceDescendants,
  isFinderNeedsTypeCondition,
  typeCondition,
  primaryAbstractClass,
  applicationRecordClassQ as _applicationRecordClassQ,
  stiClassFor,
  polymorphicClassFor,
  initializeInternalsCallback as inheritanceInitializeInternalsCallback,
  baseClass as _inheritanceBaseClass,
  isBaseClass as _isBaseClass,
  ensureProperType as _ensureProperType,
  narrowToProjectedColumns,
  defineDynamicSelectReaders,
  subclassFromAttributesForNew,
  isDescendsFromActiveRecord as _isDescendsFromActiveRecord,
  usingSingleTableInheritance as _usingSingleTableInheritance,
} from "./inheritance.js";
import { NotImplementedError, RecordNotFound, StaleObjectError } from "./errors.js";
import {
  AutosaveAssociation,
  reload as _autosaveReload,
  flushPendingReplaces,
  computePrimaryKey as _computePrimaryKey,
  _ensureNoDuplicateErrors as _autosaveEnsureNoDuplicateErrors,
  _registerAssociationBuilderExtension,
  initInternals as _autosaveInitInternals,
} from "./autosave-association.js";
import { Association as AssociationBuilder } from "./associations/builder/association.js";
import {
  isValid as validationsIsValid,
  defaultValidationContext,
  _setSuperIsValid,
  _setSuperValidates,
  type ValidationContextArg,
} from "./validations.js";
import * as _Validations from "./validations.js";
import { encryptionHooks } from "./encryption-hooks.js";
import type { EncryptsOptions } from "./encryption.js";
import * as CounterCache from "./counter-cache.js";
import * as ReadonlyAttributes from "./readonly-attributes.js";
import {
  defineAttribute as _defineAttribute,
  _defaultAttributes as _arDefaultAttributes,
  resolveTypeName as _resolveTypeName,
} from "./attributes.js";
import * as Timestamp from "./timestamp.js";
import * as TouchLater from "./touch-later.js";
import { Association as AssociationInstance } from "./associations/association.js";
import {
  type AssociationCache as _AssociationCache,
  createAssociationCache,
} from "./association-cache.js";
import {
  ConnectionHandler,
  _registerBase as _registerBaseWithConnectionHandler,
} from "./connection-adapters/abstract/connection-handler.js";

import * as ConnectionHandling from "./connection-handling.js";
import type { DatabaseConfig } from "./database-configurations/database-config.js";
import * as ModelSchema from "./model-schema.js";
import { WRITING_ROLE, READING_ROLE } from "./roles.js";
import {
  createOrUpdate as callbacksCreateOrUpdate,
  _createRecord as callbacksCreateRecord,
  _updateRecord as callbacksUpdateRecord,
} from "./callbacks.js";
import {
  runAllCallbacks as cbRunAll,
  runAfterCallbacksOnProto as cbRunAfter,
  beforeOrAroundCallbackSources,
  sanitizeForMassAssignment,
  isMassAssignmentEmpty,
} from "@blazetrails/activemodel";
import { SignedGlobalID as _SignedGlobalIDCtor } from "@blazetrails/globalid/signed-global-id";
import * as Inheritance from "./inheritance.js";
import * as SignedId from "./signed-id.js";
import {
  signedId as _signedId,
  findSigned as _findSigned,
  findSignedBang as _findSignedBang,
} from "./signed-id.js";
import {
  tokenDefinitions as _tokenDefinitions,
  setTokenDefinitions as _setTokenDefinitions,
  generatedTokenVerifier as _generatedTokenVerifier,
  setGeneratedTokenVerifier as _setGeneratedTokenVerifier,
  generatesTokenFor as _generatesTokenFor,
  generateTokenFor as _generateTokenFor,
  findByTokenFor as _findByTokenFor,
  findByTokenForBang as _findByTokenForBang,
} from "./token-for.js";
import type { TokenDefinition as _TokenDefinition } from "./token-for.js";
import type { MessageVerifier as _MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import {
  getVerboseQueryLogs as _getVerboseQueryLogs,
  setVerboseQueryLogs as _setVerboseQueryLogs,
} from "./log-subscriber.js";
import { registerMigrationArConfig } from "./migration/ar-config-source.js";
import { registerTableNameOptions } from "./connection-adapters/abstract/table-name-options.js";
import { DatabaseTasks } from "./tasks/database-tasks.js";
import * as LockingOptimistic from "./locking/optimistic.js";
import * as LockingPessimistic from "./locking/pessimistic.js";
import { hookAttributeType as tzHookAttributeType } from "./attribute-methods/time-zone-conversion.js";
import * as Translation from "./translation.js";
import * as Sanitization from "./sanitization.js";
import * as Serialization from "./serialization.js";
import * as Querying from "./querying.js";
import * as QueryCacheClassMethods from "./query-cache.js";
import {
  include,
  prepend,
  extend,
  classAttribute,
  benchmark as benchmarkable,
  runLoadHooks,
  isBlank as _isBlankValue,
  type PrependMethod,
  singularize as _singularize,
  type Included,
  type ParameterFilter,
  type BenchmarkLogger,
} from "@blazetrails/activesupport";
import {
  hasAttribute as _hasAttribute,
  _hasAttribute as _privateHasAttribute,
  attributePresent as _attributePresent,
  attributeNames as _attributeNames,
  accessedFields as _accessedFields,
  attributesForCreate as _attributesForCreate,
  attributesForUpdate as _attributesForUpdate,
  ClassMethods as AttributeMethodsClassMethods,
  isAttributeMethod as _isAttributeMethod,
  defineAttributeMethods as _defineAttributeMethods,
  initializeGeneratedModules as _initializeGeneratedModules,
  GeneratedAttributeMethods,
  generateAliasAttributes as _generateAliasAttributes,
  eagerlyGenerateAliasAttributeMethods as _eagerlyGenerateAliasAttributeMethods,
  attributesWithValues as _attributesWithValues,
  formatForInspect as _formatForInspect,
  pkAttribute as _pkAttribute,
  readAttributeBeforeTypeCast as _readAttributeBeforeTypeCast,
  readAttributeForDatabase as _readAttributeForDatabase,
  attributesBeforeTypeCast as _attributesBeforeTypeCast,
  attributesForDatabase as _attributesForDatabase,
  attributeBeforeTypeCast as _attributeBeforeTypeCast,
  attributeForDatabase as _attributeForDatabase,
  queryCastAttribute as _queryCastAttribute,
  isSavedChangeToAttribute as _isSavedChangeToAttribute,
  attributeBeforeLastSave as _attributeBeforeLastSave,
  isWillSaveChangeToAttribute as _isWillSaveChangeToAttribute,
  attributeChangeToBeSaved as _attributeChangeToBeSaved,
  attributeInDatabase as _attributeInDatabase,
  attributeNamesForPartialUpdates as _attributeNamesForPartialUpdates,
  attributeNamesForPartialInserts as _attributeNamesForPartialInserts,
  isSavedChanges as _isSavedChanges,
  get as _get,
  set as _set,
} from "./attribute-methods.js";
import * as Normalization from "./normalization.js";
import type { NormalizesArgs } from "./normalization.js";
import {
  toKey as _toKey,
  PrimaryKey as _PrimaryKey,
  getPrimaryKeyAttr as _getPrimaryKeyAttr,
  getPrimaryKey as _getPrimaryKey,
  resetPrimaryKey as _resetPrimaryKey,
  setPrimaryKeyAttr as _setPrimaryKeyAttr,
  isInstanceMethodAlreadyImplemented as _pkIsInstanceMethodAlreadyImplemented,
  isDangerousAttributeMethod as _pkIsDangerousAttributeMethod,
  isCompositePrimaryKey as _isCompositePrimaryKey,
} from "./attribute-methods/primary-key.js";
import { CompositePrimaryKey as _CompositePrimaryKey } from "./attribute-methods/composite-primary-key.js";
import {
  readAttribute as _readAttribute,
  _readAttribute as _readAttributeFn,
  defineMethodAttribute as _defineMethodAttribute,
} from "./attribute-methods/read.js";
import {
  setDefineMethodAttribute as _setDefineMethodAttribute,
  writeAttribute as _writeAttributeMethod,
  _writeAttribute as _writeAttributeLowLevel,
} from "./attribute-methods/write.js";
import { attributeCameFromUser as _attributeCameFromUser } from "./attribute-methods/before-type-cast.js";
import {
  queryAttribute as _queryAttribute,
  _queryAttribute as _queryAttributeFn,
} from "./attribute-methods/query.js";
import {
  toParam as _toParam,
  toParamClass as _toParamClass,
  cacheKey as _cacheKey,
  cacheKeyWithVersion as _cacheKeyWithVersion,
  cacheVersion as _cacheVersion,
  collectionCacheKey as _collectionCacheKey,
  canUseFastCacheVersion as _canUseFastCacheVersion,
  rawTimestampToCacheVersion as _rawTimestampToCacheVersion,
} from "./integration.js";
import { noTouching as _noTouchingBlock, isNoTouching as _isNoTouching } from "./no-touching.js";
import { suppress as _suppressBlock, registry as _suppressorRegistry } from "./suppressor.js";
import {
  inspect as _inspect,
  attributeForInspect as _attributeForInspect,
  equals as _equals,
  compare as _compare,
  hash as _hash,
  isPresent as _isPresent,
  isBlank as _isBlank,
  filterAttributes as _coreFilterAttributes,
} from "./core.js";
import * as _Core from "./core.js";
import * as _AttributeMethodsDirty from "./attribute-methods/dirty.js";
import { Dirty as _Dirty } from "./attribute-methods/dirty.js";
import type { AsynchronousQueriesTracker, Session } from "./asynchronous-queries-tracker.js";
import * as _Persistence from "./persistence.js";
import * as _EnumModule from "./enum.js";
import {
  collectingQueriesForExplain as _collectingQueriesForExplain,
  execExplain as _execExplain,
  renderBind as _renderBind,
  buildExplainClause as _buildExplainClause,
} from "./explain.js";
import {
  delegatedType as _delegatedType,
  defineDelegatedTypeMethods as _defineDelegatedTypeMethods,
} from "./delegated-type.js";
import * as _Reflection from "./reflection.js";
import * as _AssocInstance from "./associations/instance-methods.js";
import { argumentError } from "./relation/query-methods.js";
import type { WhereChain } from "./relation/query-methods.js";
import {
  ScopeRegistry,
  scopeRegistry as _scopeRegistry,
  setCurrentScope as _setCurrentScope,
  globalCurrentScope as _globalCurrentScope,
  setGlobalCurrentScope as _setGlobalCurrentScope,
  scopeAttributes,
  defaultScopeOverride as _defaultScopeOverride,
  populateWithCurrentScopeAttributes as _populateWithCurrentScopeAttributes,
} from "./scoping.js";
import {
  transaction as _transaction,
  currentTransactionPublic as _currentTransactionPublic,
  withTransactionReturningStatus as _withTransactionReturningStatus,
  committedBang as _committedBang,
  rolledbackBang as _rolledbackBang,
  isTriggerTransactionalCallbacks as _isTriggerTransactionalCallbacks,
  addToTransaction as _addToTransaction,
  hasTransactionalCallbacks as _hasTransactionalCallbacks,
  _newRecordBeforeLastCommit as _txNewRecordBeforeLastCommit,
  _triggerDestroyCallback as _txTriggerDestroyCallback,
  clearTransactionRecordState as _clearTransactionRecordState,
  _committedAlreadyCalled as _txCommittedAlreadyCalled,
  _triggerUpdateCallback as _txTriggerUpdateCallback,
  rememberTransactionRecordState as _rememberTransactionRecordState,
  restoreTransactionRecordState as _restoreTransactionRecordState,
  isTransactionIncludeAnyAction as _isTransactionIncludeAnyAction,
  beforeCommit as _beforeCommit,
  afterCommit as _afterCommit,
  afterRollback as _afterRollback,
  setCallback as _txSetCallback,
  afterSaveCommit as _afterSaveCommit,
  afterCreateCommit as _afterCreateCommit,
  afterUpdateCommit as _afterUpdateCommit,
  afterDestroyCommit as _afterDestroyCommit,
  initInternals as _transactionsInitInternals,
} from "./transactions.js";

import {
  isIgnoreDefaultScope,
  defaultScope as _defaultScope,
  isScopeAttributes as _isScopeAttributes,
  unscoped as _unscoped,
} from "./scoping/default.js";
import * as NamedScoping from "./scoping/named.js";
import {
  Associations as _Associations,
  isAssociationCached as _isAssociationCached,
  associationInstanceGet as _associationInstanceGet,
  associationInstanceSet as _associationInstanceSet,
  registerModelConstant,
  initInternals as _associationsInitInternals,
  type AssociationDefinition,
} from "./associations.js";
import * as _AttributeAssignment from "./attribute-assignment.js";
import * as _NestedAttributes from "./nested-attributes.js";
import {
  hasSecureToken as _hasSecureToken,
  generateUniqueSecureToken as _generateUniqueSecureToken,
} from "./secure-token.js";
import {
  store as _storeFunction,
  storeAccessor as _storeAccessorFunction,
  registerSerializeFn as _registerSerializeFn,
  localStoredAttributesMethod as _localStoredAttributesMethod,
  storedAttributes as _storedAttributes,
  readStoreAttribute as _readStoreAttribute,
  writeStoreAttribute as _writeStoreAttribute,
  storeAccessorFor as _storeAccessorFor,
} from "./store.js";
import { serialize as _serializeAttribute } from "./serialize.js";
import { respondToMissing } from "./dynamic-matchers.js";
import { YAMLColumn as _YAMLColumn } from "./coders/yaml-column.js";

// Break store→serialize→json→store circular dep by injecting serialize into store at init.
_registerSerializeFn(_serializeAttribute as any);
import {
  hasMultiparameterKeys,
  extractMultiparameterCallstack,
  executeMultiparameterAssignment,
} from "./multiparameter-attribute-assignment.js";

/**
 * A single column of a primary key.
 *
 * - `string` / `number` — the common scalar PK types (auto-increment ids, UUIDs).
 * - `bigint` — large integer PKs (big_integer columns, e.g. PG int8 / MySQL BIGINT).
 * - `null` / `undefined` — column unset (e.g. a new record, or an unassigned
 *   CPK column).
 */
export type PrimaryKeyScalar = string | number | bigint | null | undefined;

/**
 * Value of a primary key on a persisted (or to-be-persisted) record.
 *
 * - `PrimaryKeyScalar` — single-column primary key.
 * - `PrimaryKeyScalar[]` — composite primary key tuple. Individual columns
 *   may be null/undefined when the record isn't fully persisted
 *   (e.g. `readAttribute` returned `null` for an unset CPK column).
 *
 * When the concrete PK type is known, narrow at the use site (e.g.
 * `record.id as number`) rather than redeclaring `id` on a subclass —
 * `Base#id` is an accessor, and TS forbids overriding it with a
 * differently-typed instance property.
 *
 * Mirrors: the value returned by `ActiveRecord::Base#id`.
 */
export type PrimaryKeyValue = PrimaryKeyScalar | PrimaryKeyScalar[];

/**
 * Rails' `persistence.rb#update` / `#update!` dispatch on the first arg:
 *   ":all" | nil | bare hash    → iterate `all()` and update each
 *   Array (of ids)              → parallel with `attributes` array
 *   ActiveRecord::Base instance → ArgumentError
 *   anything else               → primary-key lookup, single update
 *
 * The string sentinel is `":all"` (with leading colon) — a bare `"all"`
 * would collide with a legitimate string/slug primary-key value.
 */
async function performClassUpdate(
  this: typeof Base,
  idOrAttrs: unknown,
  attrs: Record<string, unknown> | Record<string, unknown>[] | undefined,
  bang: boolean,
): Promise<unknown> {
  const run = async (record: InstanceType<typeof Base>, a: Record<string, unknown>) => {
    if (bang) await record.updateBang(a);
    else await record.update(a);
  };

  // Rails accepts `nil`/`:all` default. TS callers write update(attrs) with
  // a single hash, or pass the sentinel ":all" explicitly.
  //
  // A non-array object argument is only treated as "attrs" when `attrs` is
  // omitted (one-arg form) AND the value is a plain object. Otherwise a
  // call like `update(dateId, attrs)` or `update(customIdObj, attrs)`
  // would silently mass-update the scope; fall through to `find(id)`
  // instead, matching Rails' `update(id, attributes)` path.
  const isPlainObject = (v: unknown): v is Record<string, unknown> => {
    if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
    if (v instanceof Base) return false;
    const proto = Object.getPrototypeOf(v) as object | null;
    return proto === Object.prototype || proto === null;
  };
  const isAllSentinel =
    idOrAttrs === undefined ||
    idOrAttrs === null ||
    idOrAttrs === ":all" ||
    (attrs === undefined && isPlainObject(idOrAttrs));

  if (isAllSentinel) {
    // update(attrs) — apply to every record in the current scope.
    const candidate = attrs ?? idOrAttrs;
    if (!isPlainObject(candidate)) {
      throw new ArgumentError(
        "update: attributes must be a plain object (missing or invalid attrs for the :all / nil form)",
      );
    }
    const records = await this.all();
    for (const r of records) await run(r, candidate);
    return records;
  }

  if (Array.isArray(idOrAttrs)) {
    if (idOrAttrs.some((i) => i instanceof Base)) {
      // Rails raises the *array*-specific message here (distinct from the
      // single-instance message below), pointing at `pluck(:id)`/`map(&:id)`.
      throw new ArgumentError(
        `You are passing an array of ActiveRecord::Base instances to \`${
          bang ? "update!" : "update"
        }\`. Please pass the ids of the objects by calling \`pluck(:id)\` or \`map(&:id)\`.`,
      );
    }
    // Mirror destroy's CPK detection: on a composite-PK model, a flat
    // array `[shop_id, id]` is ONE tuple, not parallel ids. Only an
    // array-of-arrays triggers the parallel-update path.
    const isParallel = this.compositePrimaryKey ? Array.isArray(idOrAttrs[0]) : true;
    if (!isParallel) {
      // Single CPK tuple — fall through to the single-id branch. Reject
      // the parallel-update shape (an attrs array) up front so the
      // user gets a readable error instead of UnknownAttributeError on
      // numeric-keyed forwarding.
      if (Array.isArray(attrs)) {
        throw new ArgumentError(
          `${this.name}.update: parallel updates for composite PKs require an array-of-tuples first arg, e.g. update([[k1a,k2a],[k1b,k2b]], [attrsA, attrsB])`,
        );
      }
      if (!isPlainObject(attrs)) {
        throw new ArgumentError(`${this.name}.update: attributes must be a plain object`);
      }
      const record = await this.find(idOrAttrs);
      await run(record, attrs);
      return record;
    }
    // Empty ids list is a no-op (Rails behaves this way; Base.find([]) would
    // otherwise raise RecordNotFound "without an ID").
    if (idOrAttrs.length === 0) return [];
    const attrsArr = attrs as Record<string, unknown>[];
    if (!Array.isArray(attrsArr) || attrsArr.length !== idOrAttrs.length) {
      throw new ArgumentError(
        "update(ids, attrs): ids and attrs must be arrays of the same length",
      );
    }
    for (const a of attrsArr) {
      if (!isPlainObject(a)) {
        throw new ArgumentError(`${this.name}.update: every attrs entry must be a plain object`);
      }
    }
    // Mirror Rails' `id.map { |one_id| find(one_id) }.each_with_index { … }`:
    // find each id individually (so a duplicated id like update([1, 1, 2], …)
    // yields two DISTINCT in-memory instances of the same row), collecting all
    // records BEFORE running any update so a missing id raises RecordNotFound
    // up front without partially applying changes.
    const records: InstanceType<typeof Base>[] = [];
    for (const id of idOrAttrs) {
      records.push(await this.find(id));
    }
    for (let i = 0; i < records.length; i++) {
      await run(records[i], attrsArr[i]);
    }
    return records;
  }

  if (idOrAttrs instanceof Base) {
    throw new ArgumentError(
      `You are passing an instance of ActiveRecord::Base to \`${
        bang ? "update!" : "update"
      }\`. Please pass the id of the object by calling \`.id\`.`,
    );
  }

  if (!isPlainObject(attrs)) {
    throw new ArgumentError(`${this.name}.update: attributes must be a plain object`);
  }
  const record = await this.find(idOrAttrs);
  await run(record, attrs);
  return record;
}

/**
 * Base — the core ActiveRecord class with persistence and finders.
 *
 * Mirrors: ActiveRecord::Base
 */

/**
 * Apply current-scope attributes to a new record instance, skipping any key
 * that was already explicitly provided in `explicitAttrs`.
 *
 * Rails calls populate_with_current_scope_attributes BEFORE super (so explicit
 * attrs overwrite scope attrs). In TS we call it after super, so we invert:
 * only write scope attrs for keys NOT in the explicit set.
 */
function _shouldApplyScopeAttributes(ctor: typeof Base): boolean {
  return ctor.isScopeAttributes();
}

/**
 * True when any before/around destroy callback source dereferences the
 * `belongs_to` reflection named `name` — matched as a whole identifier so
 * `firm` doesn't match `firmId` and `tag` doesn't match `tagWithPrimaryKey`.
 * Covers both dotted reads (`record.firm`) and the string form
 * (`this.association("firm")`).
 */
function referencesAssociationName(sources: string[], name: string): boolean {
  const pattern = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  return sources.some((src) => pattern.test(src));
}

/**
 * Expand callback filter sources with the source of any model-defined instance
 * method they (transitively) reference, so an association read reached through a
 * helper — e.g. `before_destroy { this.makeComments() }` where `makeComments`
 * reads `this.person` — is still detected. Methods declared on the model's own
 * prototype chain (below `Base`) are followed, as are instance-own
 * function-valued properties — arrow-function class fields
 * (`makeComments = async () => { ... this.person }`) live on the instance, not
 * the prototype, so the prototype walk alone would miss them. Framework methods
 * and the association readers themselves are ignored. Bounded by the model's
 * method count via the `seen` set, so mutually-recursive helpers can't loop.
 */
function expandCallbackSourcesWithHelpers(
  sources: string[],
  ctor: typeof Base,
  record?: InstanceType<typeof Base>,
): string[] {
  const methods = new Map<string, string>();
  // Instance-own function properties (arrow-field methods) first: they win
  // method dispatch over a same-named prototype method, so their source is the
  // one actually run — record them before the prototype walk, whose
  // `methods.has(key)` guard then leaves them in place.
  if (record) {
    for (const key of Object.getOwnPropertyNames(record)) {
      if (key === "constructor" || methods.has(key)) continue;
      const desc = Object.getOwnPropertyDescriptor(record, key);
      if (typeof desc?.value === "function") methods.set(key, desc.value.toString());
    }
  }
  for (
    let proto = ctor.prototype;
    proto && proto !== Base.prototype;
    proto = Object.getPrototypeOf(proto)
  ) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key === "constructor" || methods.has(key)) continue;
      const desc = Object.getOwnPropertyDescriptor(proto, key);
      if (typeof desc?.value === "function") methods.set(key, desc.value.toString());
    }
  }
  const result = [...sources];
  const seen = new Set<string>();
  const queue = [...sources];
  while (queue.length > 0) {
    const src = queue.pop()!;
    for (const [name, body] of methods) {
      if (seen.has(name)) continue;
      if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(src)) {
        seen.add(name);
        result.push(body);
        queue.push(body);
      }
    }
  }
  return result;
}

function _applyScopeAttributes(
  ctor: typeof Base,
  record: InstanceType<typeof Base>,
  explicitKeys: Set<string>,
): void {
  if (!_shouldApplyScopeAttributes(ctor)) return;
  const attrs = scopeAttributes.call(ctor as any);
  if (!attrs || Object.keys(attrs).length === 0) return;
  const toApply: Record<string, unknown> = Object.create(null);
  for (const [k, v] of Object.entries(attrs)) {
    if (!explicitKeys.has(k)) {
      toApply[k] = v;
    }
  }
  if (Object.keys(toApply).length > 0) {
    // assignAttributes is always mixed into Base instances; call directly.
    // `populate_with_current_scope_attributes` runs from `initialize`
    // (scoping.rb:60-66, core.rb:474), which a JS constructor cannot await, so
    // the assignment is parked on the record for `save` to drain — the same
    // deferral the nested-attribute writers use. A scope value naming an
    // association (`Firm.where(firm: f).new`) is the only one that can still be
    // in flight.
    const pending = (record as any).assignAttributes(toApply) as Promise<void> | void;
    if (pending) _NestedAttributes.parkNestedReaderLoad(record as any, pending);
  }
}

/** @internal An association definition as `_extractAssociationAttrs` reads it. */
interface _AssociationDefLike {
  name: string;
  type: string;
}

/**
 * A constructor-form assignment held back until after `super()` —
 * `_dispatchAssociationAttrs` reaches `this.association(...)`, whose cache
 * field is not initialized until `super()` returns.
 * @internal
 */
interface _PendingAssociationAttr {
  name: string;
  value: unknown;
  /** The association `name` resolved to, and whether `name` was its `#{singular}Ids` key. */
  assoc: _AssociationDefLike;
  idsKey: boolean;
}

/**
 * @internal
 * The collection association whose `#{singular}Ids` mass-assignment key is
 * `key`, if any. A `*Ids` key naming no collection association (a genuine
 * column, say) is left on the attribute path.
 */
function _collectionIdsKeyOwner(
  defs: _AssociationDefLike[],
  key: string,
): _AssociationDefLike | undefined {
  if (!key.endsWith("Ids")) return undefined;
  return defs.find(
    (a) =>
      (a.type === "hasMany" || a.type === "hasAndBelongsToMany") &&
      `${_singularize(a.name)}Ids` === key,
  );
}

/**
 * @internal
 * Pull constructor-form association assignments (e.g. `new Owner({items:
 * [...], profile: p})`) out of the regular attribute bag. Returns null
 * when no key matches a declared association so the hot path allocates
 * nothing.
 *
 * A `#{singular}Ids` key (`new Author({postIds: [...]})`) is deferred too:
 * `_dispatchAssociationAttrs` reaches `this.association(name)`, whose cache
 * field is not initialized until after `super()` returns.
 */
function _extractAssociationAttrs(
  ctor: typeof Base | undefined,
  attrs: Record<string, unknown>,
): {
  rest: Record<string, unknown>;
  assocs: _PendingAssociationAttr[];
} | null {
  const defs = (ctor as { _associations?: _AssociationDefLike[] } | undefined)?._associations;
  if (!defs || defs.length === 0) return null;
  // Common case: models that declare associations but receive only regular
  // attrs at construction (`new Post({title})`). First pass detects whether
  // any key matches an association; only then do we allocate `rest` and
  // copy entries. Avoids per-construction overhead for the hot path.
  let assocs: _PendingAssociationAttr[] | null = null;
  for (const k of Object.keys(attrs)) {
    const named = defs.find((a) => a.name === k);
    if (named) {
      (assocs ??= []).push({ name: k, value: attrs[k], assoc: named, idsKey: false });
      continue;
    }
    const idsOwner = _collectionIdsKeyOwner(defs, k);
    if (idsOwner) {
      (assocs ??= []).push({ name: k, value: attrs[k], assoc: idsOwner, idsKey: true });
    }
  }
  if (!assocs) return null;
  // Null-prototype to avoid `__proto__`/`constructor` keys mutating
  // Object.prototype before `rest` is handed to super().
  const rest = Object.create(null) as Record<string, unknown>;
  const assocNames = new Set(assocs.map((a) => a.name));
  for (const [k, v] of Object.entries(attrs)) {
    if (!assocNames.has(k)) rest[k] = v;
  }
  return { rest, assocs };
}

/**
 * Route a constructor-form composite primary key through the deferred `id`
 * handling: trails holds the `id` key out of super()'s attribute loop and
 * re-dispatches it here, once `initInternals` has run.
 *
 * `id: [a, b]` goes through the `id=` setter (`PrimaryKey#id=`, mirroring
 * `CompositePrimaryKey#id=`), which zips the Enumerable (array/set) across the
 * key columns. A scalar `id` on a model-level composite PK raises `TypeError`
 * there, matching Rails (which wants `id: [author_id, id]`, not a bare scalar).
 * @internal
 */
function _applyCompositePrimaryKey(
  record: Base,
  ctor: typeof Base,
  attrs: Record<string, unknown>,
): void {
  const pk = (ctor as { primaryKey?: unknown }).primaryKey;
  if (!Array.isArray(pk) || !Object.prototype.hasOwnProperty.call(attrs, "id")) return;
  // Dispatch through the `id=` setter (`PrimaryKey#id=`): an array spreads across the key
  // columns; a scalar raises TypeError, matching `CompositePrimaryKey#id=`.
  (record as unknown as { id: unknown }).id = (attrs as { id: unknown }).id;
}

/**
 * The one key held out of super()'s setter-dispatching attribute loop and
 * re-applied post-`initInternals`: a composite-PK `id`
 * (→ `_applyCompositePrimaryKey`), whose `id=` writes key columns that are not
 * wired until after `super()`.
 * @internal
 */
function _withoutDeferredConstructionKeys(
  ctor: typeof Base | undefined,
  attrs: Record<string, unknown>,
): Record<string, unknown> {
  if (
    !Array.isArray((ctor as { primaryKey?: unknown } | undefined)?.primaryKey) ||
    !Object.prototype.hasOwnProperty.call(attrs, "id")
  ) {
    return attrs;
  }
  return Object.fromEntries(Object.entries(attrs).filter(([k]) => k !== "id"));
}

/**
 * Re-mark constructor-assigned attributes as dirty against their schema
 * defaults, so `new Model(attrs).changes` matches Rails — a new record built
 * by assignment is dirty against column defaults (`Topic.new(title: "x")` →
 * `{ title: [nil, "x"] }`, `Topic.new` → `{}`). The Model constructor snapshots
 * a clean baseline; this restores the new-record dirtiness Rails gets for free
 * because assignment produces `FromUser`-over-default attributes whose
 * `changed?` is true. Reuses the same `reinstateNewRecordChanges` pass the
 * create path runs (callbacks.ts `_createRecord`), but keeps the primary key in
 * scope: an explicitly assigned `id` IS dirty at construction in Rails.
 *
 * Called only from the `!wasSuppressed` constructor branches (where the inline
 * `after_initialize` fires), so the dirty state is established before
 * `after_initialize` — matching Rails, where `assign_attributes` runs before
 * `_run_initialize_callbacks` and `changed?` is already true inside the hook.
 * Found-record reconstruction is the only path that constructs with callbacks
 * suppressed, and it always does so with an EMPTY attribute bag (`new this()` in
 * `_instantiate` / `directInstantiate`) before populating via `writeFromDatabase`
 * + `changesApplied`. So no new-record-with-values construction ever reaches the
 * suppressed branch, and skipping the pass there loses no dirtiness.
 *
 * @internal
 */
function _reinstateConstructorDirtiness(
  record: { _dirty: { reinstateNewRecordChanges: (...args: any[]) => void }; _attributes: unknown },
  ctor: { _defaultAttributes?: () => unknown },
): void {
  if (typeof ctor._defaultAttributes !== "function") return;
  record._dirty.reinstateNewRecordChanges(record._attributes);
}

/**
 * The constructor's association arm. Rails reaches these writers through
 * `assign_attributes` → `public_send("#{k}=", v)`
 * (activemodel/lib/active_model/attribute_assignment.rb:67-75); trails cannot,
 * because a has_one / collection writer is awaitable (RFC 0087) and `new` is
 * not. It stays synchronous here and only here, because a constructor's owner
 * is unpersisted by definition and Rails does no I/O for one either:
 * `save &&= owner.persisted?` (has_one_association.rb:66), `remove_target!`'s
 * `owner.persisted?` gate (:108) and `find_target?` (association.rb:320-322)
 * are all false, so the write is in-memory in Rails too and autosave persists
 * it at the owner's first `save`. Mass assignment onto an *existing* record has
 * no such guarantee and no longer routes here — it goes through `#update`,
 * which awaits the real writer.
 *
 * @internal
 */
function _dispatchAssociationAttrs(record: Base, assocs: _PendingAssociationAttr[]): void {
  for (const { value, assoc, idsKey } of assocs) {
    const proxy = (
      record as unknown as { association(n: string): _ConstructorAssociationWriter | null }
    ).association(assoc.name);
    if (!proxy) continue;
    if (idsKey) {
      proxy.syncIdsWrite?.(value as unknown[]);
    } else if (assoc.type === "hasMany" || assoc.type === "hasAndBelongsToMany") {
      // Rails fidelity: pass the value through unchanged. `replace` calls
      // `.each` on the argument and raises on nil / scalars, so an `Array.wrap`
      // here would silently accept inputs the writer rejects.
      proxy.syncWrite?.(value as unknown[]);
    } else if (assoc.type === "hasOne") {
      proxy.syncWrite?.(value);
    } else if (assoc.type === "belongsTo") {
      proxy.writer?.(value);
    }
  }
}

/** @internal The writers {@link _dispatchAssociationAttrs} reaches on an association. */
interface _ConstructorAssociationWriter {
  writer?: (v: unknown) => void;
  syncWrite?: (v: unknown) => void;
  syncIdsWrite?: (v: unknown[]) => void;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Base extends Model {
  // --- Translation mixin (wired via extend() after class) ---
  // Normalization
  declare static normalizes: (...args: NormalizesArgs) => void;
  declare static normalizeValueFor: (name: string, value: unknown) => unknown;
  /**
   * Mirrors: ActiveRecord::Normalization's `class_attribute
   * :normalized_attributes, default: Set.new` (normalization.rb:8), installed
   * by the module's `included` hook.
   */
  declare static normalizedAttributes: Set<string>;

  declare static lookupAncestors: typeof Translation.lookupAncestors;

  // --- Sanitization mixin (wired via extend() after class) ---
  declare static sanitizeSql: typeof Sanitization.ClassMethods.sanitizeSql;
  declare static sanitizeSqlArray: typeof Sanitization.ClassMethods.sanitizeSqlArray;
  declare static sanitizeSqlLike: typeof Sanitization.sanitizeSqlLike;
  declare static sanitizeSqlForConditions: typeof Sanitization.ClassMethods.sanitizeSqlForConditions;
  declare static sanitizeSqlForAssignment: typeof Sanitization.ClassMethods.sanitizeSqlForAssignment;
  declare static sanitizeSqlForOrder: typeof Sanitization.ClassMethods.sanitizeSqlForOrder;
  declare static sanitizeSqlHashForAssignment: typeof Sanitization.ClassMethods.sanitizeSqlHashForAssignment;
  declare static disallowRawSqlBang: typeof Sanitization.disallowRawSqlBang;

  // --- Associations (wired below after class body) ---
  declare static belongsTo: typeof _Associations.belongsTo;
  declare static hasOne: typeof _Associations.hasOne;
  declare static hasMany: typeof _Associations.hasMany;
  declare static hasAndBelongsToMany: typeof _Associations.hasAndBelongsToMany;
  static get i18nScope(): string {
    return Translation.i18nScope.call(this);
  }

  // -- Class-level configuration --
  static _tableName: string | null = null;
  // No default value: an *absent* _primaryKey (anywhere up the prototype chain)
  // means "not configured", so primary_key resolution can consult the schema
  // cache (Rails get_primary_key) before falling back to the "id" convention.
  // An explicit `primary_key=` — including on a parent an STI subclass inherits
  // from — sets an own value that the chain walk in getPrimaryKeyAttr honors.
  declare static _primaryKey?: string | string[];
  static readonly _isActiveRecordBase = true;

  /** @internal */
  declare static _associations: AssociationDefinition[];
  /** @internal */
  declare static _registryKeys: string[];
  /**
   * One-shot guard for virtual-attribute reconciliation (model-schema.ts
   * reconcileVirtualAttributes). Cleared on `attribute()` and
   * `resetColumnInformation` so a re-declare/reset re-runs it.
   * @internal
   */
  declare static _virtualAttributesReconciled?: boolean;

  /** Mirrors: ActiveRecord.writing_role */
  static writingRole = WRITING_ROLE;
  /** Mirrors: ActiveRecord.reading_role */
  static readingRole = READING_ROLE;

  // Mirrors: ActiveRecord::Base.filter_attributes = [] at class definition time.
  static _filterAttributes: (string | RegExp | ((key: string, value: unknown) => unknown))[] = [];

  static get filterAttributes(): (string | RegExp | ((key: string, value: unknown) => unknown))[] {
    return _coreFilterAttributes.call(this);
  }

  static set filterAttributes(
    value: (string | RegExp | ((key: string, value: unknown) => unknown))[],
  ) {
    _coreFilterAttributes.call(this, value);
  }

  static inspectionFilter(): ParameterFilter {
    return _Core.inspectionFilter.call(this);
  }

  static _adapter: DatabaseAdapter | null = null;
  /**
   * Class name → class, populated whenever a subclass receives an adapter.
   * Used by globalid's model finder so Base.findGlobalId can resolve any
   * AR model without requiring explicit registerModel() calls.
   * @internal
   */
  static _connectionHandler: ConnectionHandler = new ConnectionHandler();
  static _abstractClass = false;
  static _connectionClass = false;
  static automaticScopeInversing = false;
  static automaticallyInvertPluralAssociations = false;
  static hasManyInversing = false;
  static paramDelimiter = "_";
  static cacheVersioning = false;
  static cacheTimestampFormat: "usec" | "number" = "usec";
  static collectionCacheVersioning = false;
  static _tableNamePrefix = "";
  static _tableNameSuffix = "";
  static _protectedEnvironments: string[] = ["production"];
  static _lockingColumn: string = "lock_version";

  /**
   * When true, datetime/time attributes are wrapped in a TimeZoneConverter.
   *
   * Mirrors: ActiveRecord::AttributeMethods::TimeZoneConversion.time_zone_aware_attributes
   */
  static timeZoneAwareAttributes: boolean = false;

  /**
   * Attribute names exempt from time-zone conversion.
   *
   * Mirrors: ActiveRecord::AttributeMethods::TimeZoneConversion.skip_time_zone_conversion_for_attributes
   */
  static skipTimeZoneConversionForAttributes: string[] = [];

  /**
   * Column types eligible for time-zone conversion.
   *
   * Mirrors: ActiveRecord::AttributeMethods::TimeZoneConversion.time_zone_aware_types
   */
  static timeZoneAwareTypes: string[] = ["datetime", "time"];

  static get protectedEnvironments(): string[] {
    return ModelSchema.protectedEnvironments.call(this);
  }

  static set protectedEnvironments(envs: string[]) {
    ModelSchema.protectedEnvironments.call(this, envs);
  }

  /** Mirrors: ActiveRecord::Inheritance::ClassMethods#abstract_class */
  declare static abstractClass: boolean;

  /** Mirrors: ActiveRecord::SignedId::ClassMethods#signed_id_verifier */
  declare static signedIdVerifier: _MessageVerifier;

  /** Mirrors: ActiveRecord::SignedId#signed_id_verifier_secret */
  declare static signedIdVerifierSecret: string | (() => string | null | undefined) | null;

  static _requireConcreteClass(): void {
    // Rails: `abstract_class? || self == Base` (inheritance.rb:57) — Base
    // itself is not abstract_class? but still cannot be instantiated.
    if ((this.abstractClass || this === Base) && !this._suppressAbstractCheck) {
      // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/inheritance.rb:58
      throw new NotImplementedError(
        `${this.name} is an abstract class and cannot be instantiated.`,
      );
    }
  }

  /**
   * Whether this class is a connection class (owns its own connection pool).
   * Not a `class_attribute`: Rails stores it in a plain `@connection_class`
   * ivar on the class singleton (core.rb:226-231), which is per-class and does
   * NOT inherit — hence the hasOwnProperty read here.
   *
   * Mirrors: ActiveRecord::Base.connection_class
   */
  static get connectionClass(): boolean {
    return Object.prototype.hasOwnProperty.call(this, "_connectionClass")
      ? this._connectionClass
      : false;
  }

  static set connectionClass(value: boolean) {
    this._connectionClass = value;
  }

  /**
   * Returns true if this class has `connectionClass` set.
   *
   * Mirrors: ActiveRecord::Base.connection_class?
   */
  static connectionClassQ(): boolean {
    return !!this.connectionClass;
  }

  /**
   * Returns true if this class is `Base` itself or the designated
   * application-record class (set via `primaryAbstractClass()` or implicitly
   * via a `globalThis.ApplicationRecord` constant).
   *
   * Mirrors: ActiveRecord::Base.primary_class?
   */
  static primaryClassQ(): boolean {
    return this === Base || this.applicationRecordClassQ();
  }

  // Mirrors: ActiveRecord::Core.asynchronous_queries_session (core.rb:141-143).
  static asynchronousQueriesSession(): Session {
    return _Core.asynchronousQueriesSession();
  }

  // Mirrors: ActiveRecord::Core.asynchronous_queries_tracker (core.rb:145-148).
  static asynchronousQueriesTracker(): AsynchronousQueriesTracker {
    return _Core.asynchronousQueriesTracker();
  }

  static currentPreventingWrites(): boolean {
    return _Core.currentPreventingWrites.call(this);
  }

  // Mirrors: ActiveRecord::Core.current_role (core.rb:160-171).
  static currentRole(): string {
    return _Core.currentRole.call(this);
  }

  // Mirrors: ActiveRecord::Core.current_shard (core.rb:173-184).
  static currentShard(): string {
    return _Core.currentShard.call(this);
  }

  /**
   * Walks up the superclass chain until it finds a class where
   * connectionClassQ() is true, or reaches Base.
   *
   * Mirrors: ActiveRecord::Base.connection_class_for_self
   */
  static connectionClassForSelf(): typeof Base {
    let klass: typeof Base = this;
    while (klass !== Base) {
      if (klass.connectionClassQ()) return klass;
      const parent = Object.getPrototypeOf(klass);
      if (!parent || parent === Function.prototype) break;
      klass = parent;
    }
    return Base;
  }

  /**
   * Prefix applied to the inferred table name.
   *
   * Mirrors: ActiveRecord::Base.table_name_prefix
   */
  static get tableNamePrefix(): string {
    return this._tableNamePrefix;
  }

  static set tableNamePrefix(prefix: string) {
    this._tableNamePrefix = prefix;
  }

  /**
   * Suffix applied to the inferred table name.
   *
   * Mirrors: ActiveRecord::Base.table_name_suffix
   */
  static get tableNameSuffix(): string {
    return this._tableNameSuffix;
  }

  static set tableNameSuffix(suffix: string) {
    this._tableNameSuffix = suffix;
  }

  static get tableName(): string {
    return ModelSchema.tableName.call(this);
  }

  static set tableName(name: string) {
    ModelSchema.tableName.call(this, name);
  }

  static get primaryKey(): string | string[] {
    // Type-level assertion (not a runtime guarantee) of the non-null contract
    // every persistable model satisfies — see getPrimaryKeyAttr for why. A view
    // still returns null at runtime; the assertion just keeps callers off the
    // null-guard treadmill.
    return _getPrimaryKeyAttr.call(this) as string | string[];
  }

  static set primaryKey(key: string | string[]) {
    _setPrimaryKeyAttr.call(this, key);
  }

  /**
   * The column used for optimistic locking. Defaults to "lock_version".
   *
   * Mirrors: ActiveRecord::Locking::Optimistic.locking_column
   */
  declare static lockingColumn: string;

  /**
   * Whether optimistic locking is enabled for this model (default true). Set to
   * false to disable it even when a lock_version column exists.
   *
   * Mirrors: ActiveRecord::Base.lock_optimistically
   */
  declare static lockOptimistically: boolean;

  /** Mirrors: ActiveRecord::Locking::Optimistic::ClassMethods#locking_enabled? */
  declare static lockingEnabled: boolean;

  static get compositePrimaryKey(): boolean {
    return _isCompositePrimaryKey.call(this);
  }

  /**
   * Quote a single value for use in SQL.
   */
  static _buildPkWhere(idValue: unknown): string {
    return ModelSchema.buildPkWhere.call(this, idValue);
  }

  static _buildPkWhereNode(idValue: unknown): InstanceType<typeof Nodes.Node> {
    return ModelSchema.buildPkWhereNode.call(this, idValue);
  }

  static _buildQueryConstraintsWhereNode(
    constraints: Record<string, unknown>,
  ): InstanceType<typeof Nodes.Node> {
    return ModelSchema.buildWhereNodeFromConstraints.call(this, constraints);
  }

  /**
   * Override attribute() to prevent generating an accessor for "id"
   * (Base defines id getter/setter with CPK support) and to apply
   * any pending encryption decorations (matching Rails' deferred
   * PendingDecorator pattern).
   */
  static attribute(
    name: string,
    // Type is optional, mirroring Rails' `attribute(name, type = nil, **options)`.
    // When omitted (`attribute("col", { default: "x" })`) the attribute keeps its
    // existing schema-reflected / declared type and only the default is applied.
    typeName?: string | Type | AttributeOptions,
    options?: AttributeOptions,
  ): void {
    super.attribute(name, typeName, options);
    // Rails' `attribute` ends in `reload_schema_from_cache`, which nils
    // `@attribute_names` recursively.
    ModelSchema.clearAttributeNamesMemo(this as never);
    // A newly declared attribute may be virtual (no DB column); force the next
    // ensureSchemaLoaded to re-run virtual reconciliation (model-schema.ts
    // reconcileVirtualAttributes) instead of skipping it via the one-shot guard.
    this._virtualAttributesReconciled = false;
    // If we just defined an "id" accessor on a subclass prototype, remove it
    // so Base.prototype.id (which handles CPK) is used instead.
    if (name === "id" && Object.prototype.hasOwnProperty.call(this.prototype, "id")) {
      delete (this.prototype as any).id;
    }
    // Encryption still needs a post-declaration pass — not for type wrapping
    // (the durable decorator is pushed once at declaration and resolved via
    // `typeForAttribute`) but for bookkeeping: column-size validation re-runs
    // and the frozen-encryption validator install. `normalizes` / `serialize`
    // push their durable decorator eagerly at declaration, so — now that
    // `type_for_attribute` / `TypeCaster::Map` resolve through
    // `attribute_types` (the decorated default attribute set) — they need
    // no per-feature `_attributeDefinitions` replay here.
    encryptionHooks.applyPendingEncryptions(this);
  }

  /**
   * Chains time-zone-conversion and optimistic-locking type decoration.
   *
   * @internal Rails-private helper.
   * Mirrors: ActiveRecord::Base#hook_attribute_type (composed via module includes)
   */
  static override hookAttributeType(name: string, type: Type): Type {
    const tzType = tzHookAttributeType.call(this as any, name, type);
    return LockingOptimistic.hookAttributeType.call(this as any, name, tzType);
  }

  /**
   * Returns the type object for a named attribute.
   *
   * Mirrors: ActiveRecord::ModelSchema::ClassMethods#type_for_attribute
   */
  static override typeForAttribute(name: string, block?: () => Type): Type {
    (ModelSchema.loadSchema as any).call(this);
    // Rails resolves attribute aliases first
    // (`attr_name = attribute_aliases[attr_name] || attr_name`).
    const resolved = (this as any).attributeAliases?.[name] ?? name;
    // Resolve through the decorated default attribute set — Rails'
    // `attribute_types[name]` is `_default_attributes.cast_types[name]` with a
    // `Type.default_value` hash default (attribute_registration.rb:43-50). The set
    // replays every pending decorator (serialize/normalizes/encrypts) onto the
    // reflected column type, so query-side decorations are honored without a
    // per-feature post-reflection replay onto `_attributeDefinitions`. Read the
    // single attribute (O(1), and `getAttribute` returns a `value`-typed Null for
    // an unknown name) rather than `attributeTypes()[name]` — even though the
    // cast-types record + Proxy are now memoized, this avoids the record's
    // full-set iteration on the cold call in a hot per-bind path.
    // Ruby `attribute_types.fetch(name, &block)` (attribute_registration.rb:47).
    // `attribute_types` is `_default_attributes.cast_types` (:36-40), so the
    // block answers on a plain hash-KEY miss — not on `AttributeSet#key?`,
    // which additionally requires the attribute to be initialized.
    if (block) {
      const attributeTypes = this.attributeTypes();
      return Object.hasOwn(attributeTypes, resolved) ? attributeTypes[resolved] : block();
    }
    return this._defaultAttributes().getAttribute(resolved).type;
  }

  /**
   * Get the Arel table for this model.
   *
   * Wires a TypeCasterMap so `arelTable.typeForAttribute(col)` resolves
   * through the model's `_attributeDefinitions`. Predicate-builder bind
   * values rely on this to serialize through the right Type (e.g.
   * EncryptedAttributeType for deterministic encryption) — without a
   * typeCaster, `.where({col: "x"})` would emit the raw `"x"` in SQL
   * instead of the encrypted ciphertext.
   *
   * Mirrors: ActiveRecord::Base.arel_table (memoized; ours builds each
   * call since Table is cheap).
   */
  static get arelTable(): Table {
    return _Core.arelTable.call(this);
  }

  /** Mirrors: ActiveRecord::Base.type_caster (core.rb:399-401). */
  static typeCaster = _Core.typeCaster;

  /**
   * Returns the model's predicate builder, creating it if necessary.
   * Use this to register custom value handlers:
   *
   *   MyModel.predicateBuilder.registerHandler(MyRange, handler)
   *
   * Mirrors: ActiveRecord::Base.predicate_builder
   */
  static get predicateBuilder(): import("./relation/predicate-builder.js").PredicateBuilder {
    return _Core.predicateBuilder.call(this);
  }

  /**
   * Create the database table for this model from its attribute definitions.
   * Drops the table first if it already exists to handle schema changes
   * between tests.
   *
   * This is a test/development helper — in production, use migrations.
   * Wired via extend() after class.
   */
  declare static createTable: typeof ModelSchema.createTable;

  /**
   * Set the database adapter for this model class.
   *
   * This is a convenience setter that bypasses the ConnectionHandler/ConnectionPool
   * infrastructure. Prefer `establishConnection` for production use.
   */
  static set adapter(adapter: DatabaseAdapter) {
    // Reassigning the same adapter is a no-op — avoid dropping reflected
    // columns/types unnecessarily when user code re-sets the same ref.
    if (this._adapter === adapter) {
      return;
    }
    // Registers (and shadow-guards) the name before any mutation: the guard
    // throws, and a half-applied swap would leave `_adapter` pointing at the new
    // adapter with the schema reset below never run.
    if (this !== Base && this.name) {
      registerModelConstant(this.name, this);
    }
    this._adapter = adapter;

    // Full schema reset on adapter swap: drops schema-sourced defs and
    // their prototype accessors (preserves user-declared defs), and
    // clears every derived cache. Without this, a swap A → B could
    // leave stale columns reachable (e.g. columns that only existed in
    // A's schema) and `await Model.loadSchema()` would reuse the
    // resolved promise from adapter A and never pick up B's types.
    const invalidate = (klass: typeof Base) => {
      (ModelSchema.resetColumnInformation as any).call(klass);
      (klass as unknown as { _schemaLoadPromise?: Promise<void> })._schemaLoadPromise = undefined;
    };
    invalidate(this);
    // Also invalidate descendants that inherit this adapter — otherwise
    // a subclass that already called Subclass.loadSchema() keeps its
    // own cached promise / columns from the old adapter.
    for (const descendant of this.descendants) {
      if (!Object.prototype.hasOwnProperty.call(descendant, "_adapter")) {
        invalidate(descendant);
      }
    }
    // No longer kicks off a fire-and-forget schema reflection — the
    // async query path races with explicit pool client usage. Schema
    // reflection still runs via:
    //   1. The sync loadSchema call in _instantiate (after the adapter
    //      has naturally populated the schema cache via its first query).
    //   2. An explicit `await Model.loadSchema()` when ordering matters.
  }

  /**
   * Await schema reflection — ensures `_attributeDefinitions` is populated
   * from the adapter's schema cache before proceeding. Idempotent; cheap
   * to call repeatedly.
   *
   * Mirrors: ActiveRecord::ModelSchema#load_schema (explicit variant).
   */
  static async loadSchema(this: typeof Base): Promise<void> {
    const state = this as unknown as { _schemaLoadPromise?: Promise<void> };
    if (
      !Object.prototype.hasOwnProperty.call(this, "_schemaLoadPromise") ||
      !state._schemaLoadPromise
    ) {
      state._schemaLoadPromise = (ModelSchema.loadSchemaFromAdapter as any).call(this);
    }
    try {
      await state._schemaLoadPromise;
    } catch (e) {
      state._schemaLoadPromise = undefined;
      throw e;
    }
  }

  /**
   * Lazily reflect the schema from the configured adapter the first time
   * the query/persistence path needs it, so consumers can drop the
   * explicit `loadSchema` step. Only reflects when the model has no
   * *concrete* (non-virtual) attribute definitions yet — a model that
   * declared a real `attribute()` or already reflected once knows its schema,
   * so this is a no-op for it (matching the pre-lazy-reflection behavior and
   * avoiding a needless schema round-trip on the hot query path). A model
   * whose only declared attributes are virtual (Rails' `attribute :foo` on an
   * ignored column) still reflects, since it relies on the schema for its real
   * columns. Idempotent.
   *
   * Async analogue of Rails' synchronous `method_missing` schema load —
   * queries are already async, so awaiting here is fully contained. The
   * residual gap is attribute access on a record that was never queried
   * and never loaded (e.g. `new User().handle` before any DB hit), which
   * a getter can't await without wrapping instances in a `Proxy`.
   *
   * @internal
   */
  static ensureSchemaLoaded(this: typeof Base): Promise<void> {
    // A model whose declared attributes are all virtual (e.g. Rails'
    // `attribute :last_name` on an ignored column) still needs to reflect its
    // real DB columns from the schema cache — the sync fallback in loadSchema
    // would otherwise synthesize a columnsHash containing only the virtual
    // attrs and mark the model schema-loaded, hiding every real column.
    //
    // Bail early when a concrete attr exists that proves the schema is known:
    // either (a) a source:"schema" attr (DB reflection already ran), or (b) a
    // source:"user" attr that is NOT an enum overlay (the model explicitly
    // declared its own schema, no DB reflection needed).
    //
    // Enum-only attrs (registered by `_enum` via `this.attribute()`) must NOT
    // block reflection — they're type overlays, not full schema declarations,
    // and the model still needs the DB to discover its other columns.
    // The bail check reads `_attributeDefinitions`, which is copy-on-write and
    // thus inherited from an ancestor until this class mutates it. A subclass
    // that overrides `_tableName` (a non-STI subclass pointing at a different
    // table) but has not yet reflected reads its ancestor's map — reflected
    // against a *different* table. Bailing here would flag those foreign
    // columns as known and never reflect this class's own table. Find the class
    // that actually owns the map; if it is a table-backed class whose
    // `tableName` differs from ours, the inherited defs describe another table,
    // so reflect instead of bailing. The `typeof ... === "string"` guard keeps
    // us on the fast path when the owner is a table-less root (e.g. the
    // activemodel `Model`, which has no `tableName` getter) — that case falls
    // through to the loop below rather than spuriously forcing a reflection.
    const thisTable = this.tableName;
    let defsOwner: unknown = this;
    while (defsOwner && !Object.prototype.hasOwnProperty.call(defsOwner, "_attributeDefinitions")) {
      defsOwner = Object.getPrototypeOf(defsOwner);
    }
    let foreignTable = false;
    if (defsOwner && defsOwner !== this) {
      // Map still inherited: if its owner is a table-backed class whose
      // `tableName` differs from ours, the inherited defs describe another
      // table. (`typeof ... === "string"` keeps us on the fast path when the
      // owner is a table-less root like activemodel `Model`.)
      const ownerTable = (defsOwner as { tableName?: unknown }).tableName;
      foreignTable = typeof ownerTable === "string" && ownerTable !== thisTable;
    } else if (typeof thisTable === "string") {
      // Map already forked (defsOwner === this): a subclass overriding
      // `_tableName` that declared an `attribute()` before reflecting copied the
      // ancestor's schema defs. Those carry a `reflectedTable` that differs from
      // ours — trust none of them; reflect our own table instead.
      for (const [, def] of this._attributeDefinitions) {
        const d = def as { reflectedTable?: string };
        if (typeof d.reflectedTable === "string" && d.reflectedTable !== thisTable) {
          foreignTable = true;
          break;
        }
      }
    }
    if (foreignTable) {
      // Reset first so the reflection actually runs against our own table. The
      // subclass otherwise inherits the ancestor's `_schemaLoaded` /
      // `_schemaLoadPromise` (set when the ancestor reflected — which is what
      // put foreign schema defs in the shared map) and `loadSchema` would bail
      // on that stale "loaded" state. `resetColumnInformation` shadows those
      // inherited flags with own `false`/`undefined` and scrubs the copied
      // foreign schema defs from a forked map.
      void (ModelSchema.resetColumnInformation as () => PromiseLike<void> | void).call(this);
      return this.loadSchema();
    }

    const enumNames = (this as any)._enums as Map<string, unknown> | undefined;
    for (const [name, def] of this._attributeDefinitions) {
      const d = def as { virtual?: boolean };
      if (
        !d.virtual &&
        (!ModelSchema.pendingAttributeDeclarationQ(this, name) || !enumNames?.has(name))
      ) {
        // The model declares its own attributes, but some may be virtual (no
        // backing DB column). Rails' `column_names` is always DB-sourced, so
        // reconcile against the real columns and flag those as virtual — keeping
        // `columnNames()` correct without a full re-reflection. One-shot.
        return (ModelSchema.reconcileVirtualAttributes as () => Promise<void>).call(this);
      }
    }
    return this.loadSchema();
  }

  /** @deprecated Use {@link connection} instead. Compatibility alias. */
  static get adapter(): DatabaseAdapter {
    return this.connection;
  }

  static get connectionHandler(): ConnectionHandler {
    return _Core.connectionHandler.call(this);
  }

  /**
   * Establish a database connection from a URL, config object, or config file.
   *
   * Accepts:
   * - A URL string: `Base.establishConnection("postgres://localhost/mydb")`
   * - A config object: `Base.establishConnection({ adapter: "postgresql", url: "..." })`
   * - A `DatabaseConfig` instance: `Base.establishConnection(db_config)` (e.g.
   *   the object captured by `removeConnection`), mirroring Rails'
   *   `establish_connection(db_config)`.
   * - No arguments: loads from `config/database.json` for NODE_ENV, or DATABASE_URL
   *
   * Creates a ConnectionPool managed by the ConnectionHandler, mirroring how
   * Rails wires establish_connection → ConnectionHandler → ConnectionPool.
   *
   * Mirrors: ActiveRecord::Base.establish_connection
   */
  static async establishConnection(
    config?:
      | string
      | DatabaseConfig
      | {
          adapter?: string;
          url?: string;
          database?: string;
          host?: string;
          port?: number | string;
          username?: string;
          password?: string;
          [key: string]: unknown;
        },
  ): Promise<void> {
    return ConnectionHandling.establishConnection(this, config);
  }

  // --- ConnectionHandling mixin (static methods, wired via extend() after class) ---
  declare static connectsTo: typeof ConnectionHandling.connectsTo;
  declare static connectedTo: typeof ConnectionHandling.connectedTo;
  declare static connectedToMany: typeof ConnectionHandling.connectedToMany;
  declare static connectedToAllShards: typeof ConnectionHandling.connectedToAllShards;
  declare static connectingTo: typeof ConnectionHandling.connectingTo;
  declare static connectedToQ: typeof ConnectionHandling.connectedToQ;
  declare static whilePreventingWrites: typeof ConnectionHandling.whilePreventingWrites;
  declare static prohibitShardSwapping: typeof ConnectionHandling.prohibitShardSwapping;
  declare static isShardSwappingProhibited: typeof ConnectionHandling.isShardSwappingProhibited;
  declare static clearQueryCachesForCurrentThread: typeof ConnectionHandling.clearQueryCachesForCurrentThread;
  // --- QueryCache::ClassMethods mixin (wired via extend() after class) ---
  declare static cache: typeof QueryCacheClassMethods.ClassMethods.cache;
  declare static uncached: typeof QueryCacheClassMethods.ClassMethods.uncached;
  declare static leaseConnection: typeof ConnectionHandling.leaseConnection;
  declare static releaseConnection: typeof ConnectionHandling.releaseConnection;
  declare static withConnection: typeof ConnectionHandling.withConnection;
  declare static connectionPool: typeof ConnectionHandling.connectionPool;
  declare static retrieveConnection: typeof ConnectionHandling.retrieveConnection;
  declare static connectionDbConfig: typeof ConnectionHandling.connectionDbConfig;
  static get connectionSpecificationName(): string {
    return ConnectionHandling.connectionSpecificationName.call(this);
  }
  static set connectionSpecificationName(name: string) {
    (this as any)._connectionSpecificationName = name;
  }
  declare static connectedQ: typeof ConnectionHandling.connectedQ;
  declare static readonly connection: DatabaseAdapter;
  declare static isPrimaryClass: typeof ConnectionHandling.isPrimaryClass;
  declare static adapterClass: typeof ConnectionHandling.adapterClass;
  declare static adapterClassSync: typeof ConnectionHandling.adapterClassSync;
  declare static removeConnection: typeof ConnectionHandling.removeConnection;
  declare static schemaCache: typeof ConnectionHandling.schemaCache;
  declare static clearCacheBang: typeof ConnectionHandling.clearCacheBang;
  declare static shardKeys: typeof ConnectionHandling.shardKeys;
  declare static isSharded: typeof ConnectionHandling.isSharded;
  declare static defaultShard: typeof ConnectionHandling.defaultShard;
  /** @internal */
  declare static withRoleAndShard: typeof ConnectionHandling.withRoleAndShard;
  /** @internal */
  declare static appendToConnectedToStack: typeof ConnectionHandling.appendToConnectedToStack;
  /** @internal */
  declare static resolveConfigForConnection: typeof ConnectionHandling.resolveConfigForConnection;

  // --- ModelSchema mixin (wired via extend() after class) ---
  // Mirrors: ActiveRecord::Attributes
  declare static defineAttribute: typeof _defineAttribute;
  declare static initializeGeneratedModules: typeof _initializeGeneratedModules;
  /** @internal */
  declare static _generatedAttributeMethods?: GeneratedAttributeMethods;
  // ActiveRecord's override of ActiveModel's `define_attribute_methods`
  // (attribute_methods.rb:139-159): no attr-name splat, and it answers whether
  // the class's methods were generated.
  declare static defineAttributeMethods: typeof _defineAttributeMethods;
  declare static generateAliasAttributes: typeof _generateAliasAttributes;
  declare static _defaultAttributes: typeof _arDefaultAttributes;
  /** @internal */
  declare static resolveTypeName: typeof _resolveTypeName;

  // Mirrors: ActiveRecord::ModelSchema::ClassMethods
  declare static columnNames: typeof ModelSchema.columnNames;
  declare static columnsHash: typeof ModelSchema.columnsHash;
  declare static contentColumns: typeof ModelSchema.contentColumns;
  declare static quotedTableName: typeof ModelSchema.quotedTableName;
  declare static resetTableName: typeof ModelSchema.resetTableName;
  declare static fullTableNamePrefix: typeof ModelSchema.fullTableNamePrefix;
  declare static fullTableNameSuffix: typeof ModelSchema.fullTableNameSuffix;
  declare static resetSequenceName: typeof ModelSchema.resetSequenceName;
  declare static isPrefetchPrimaryKey: typeof ModelSchema.isPrefetchPrimaryKey;
  declare static nextSequenceValue: typeof ModelSchema.nextSequenceValue;
  declare static attributesBuilder: typeof ModelSchema.attributesBuilder;
  declare static columns: typeof ModelSchema.columns;
  declare static yamlEncoder: typeof ModelSchema.yamlEncoder;
  declare static columnForAttribute: typeof ModelSchema.columnForAttribute;
  declare static symbolColumnToString: typeof ModelSchema.symbolColumnToString;
  declare static resetColumnInformation: typeof ModelSchema.resetColumnInformation;
  declare static _returningColumnsForInsert: typeof ModelSchema._returningColumnsForInsert;

  /**
   * Return the STI inheritance column name. Defaults to "type" (Rails default
   * for every model), regardless of whether the model participates in STI.
   *
   * Mirrors: ActiveRecord::Base.inheritance_column
   */
  static get inheritanceColumn(): string | null {
    return ModelSchema.inheritanceColumn.call(this);
  }

  static set inheritanceColumn(col: string | null) {
    ModelSchema.inheritanceColumn.call(this, col);
  }

  static get baseClass(): typeof Base {
    return _inheritanceBaseClass.call(this);
  }

  /** @internal */
  static computeType(typeName: string): typeof Base {
    return inheritanceComputeType(this, typeName);
  }

  static isFinderNeedsTypeCondition(): boolean {
    return isFinderNeedsTypeCondition(this);
  }

  /**
   * Returns true if this class is its own STI base class.
   *
   * Mirrors: ActiveRecord::Inheritance::ClassMethods#base_class?
   */
  static isBaseClass(): boolean {
    return _isBaseClass(this);
  }

  static primaryAbstractClass(): void {
    primaryAbstractClass(this);
  }

  /**
   * @internal
   * Mirrors: ActiveRecord::Core::ClassMethods#application_record_class?
   */
  static applicationRecordClassQ(): boolean {
    return _applicationRecordClassQ(this);
  }

  static stiClassFor(typeName: string): typeof Base {
    return stiClassFor(this, typeName);
  }

  static polymorphicClassFor(name: string): typeof Base {
    return polymorphicClassFor(this, name);
  }

  static get subclasses(): (typeof Base)[] {
    return inheritanceSubclasses(this);
  }

  static get descendants(): (typeof Base)[] {
    return inheritanceDescendants(this);
  }

  // -- Logger --
  static _logger: {
    debug?: (...args: any[]) => void;
    info?: (...args: any[]) => void;
    warn?: (...args: any[]) => void;
    error?: (...args: any[]) => void;
  } | null = null;

  /**
   * Set or get the logger for SQL and lifecycle events.
   *
   * Mirrors: ActiveRecord::Base.logger
   */
  static get logger(): {
    debug?: (...args: any[]) => void;
    info?: (...args: any[]) => void;
    warn?: (...args: any[]) => void;
    error?: (...args: any[]) => void;
  } | null {
    return this._logger;
  }

  static set logger(
    log: {
      debug?: (...args: any[]) => void;
      info?: (...args: any[]) => void;
      warn?: (...args: any[]) => void;
      error?: (...args: any[]) => void;
    } | null,
  ) {
    this._logger = log;
  }

  /**
   * Times the given block and logs the result.
   * Mirrors: ActiveRecord::Base.benchmark (via ActiveSupport::Benchmarkable)
   */
  static benchmark<T>(
    message: string,
    options: { level?: "debug" | "info" | "warn" | "error"; silence?: boolean } = {},
    fn: () => T | Promise<T>,
  ): T | Promise<Awaited<T>> {
    return benchmarkable(this.logger as BenchmarkLogger | null, message, options, fn);
  }

  // -- Timestamp control --
  static _recordTimestamps = true;

  static get recordTimestamps(): boolean {
    return this._recordTimestamps;
  }

  static set recordTimestamps(value: boolean) {
    this._recordTimestamps = value;
  }

  // Mirrors: ActiveRecord::AttributeMethods::Dirty — class_attribute
  // :partial_updates/:partial_inserts, default: true (dirty.rb:49-50). Apps flip
  // partial_inserts to false via `config.load_defaults 7.0`; that belongs in a
  // config layer, not this framework default.
  static partialUpdates = true;
  static partialInserts = true;

  static async noTouching<R>(fn: () => R | Promise<R>): Promise<R> {
    return _noTouchingBlock(this, fn);
  }

  /**
   * Returns true if the record's class has noTouching set.
   *
   * Mirrors: ActiveRecord::NoTouching#no_touching?. Wired via include() below.
   */
  declare isNoTouching: () => boolean;

  // -- Sequence name --
  static _sequenceName: string | null = null;

  static get sequenceName(): string | null {
    return ModelSchema.sequenceName.call(this);
  }

  static set sequenceName(name: string | null) {
    ModelSchema.sequenceName.call(this, name);
  }

  /**
   * The `included do` blocks of AttributeMethods::BeforeTypeCast
   * (before_type_cast.rb:32-33) and AttributeMethods::Dirty (dirty.rb:53-59).
   * The `class_attribute` writer gives Active Record its own array rather than
   * mutating ActiveModel's.
   *
   * dirty.rb:54's `attribute_method_prefix("saved_change_to_",
   * parameters: false)` has no entry: Ruby tells the array-returning
   * `saved_change_to_name` from the predicate `saved_change_to_name?` by the
   * `?`, which the camel spelling drops, so both would generate
   * `savedChangeToName`. Story:
   * 0096-naming-identifier-burndown/saved-change-to-attribute-values-generated-half.
   */
  static {
    this.attributeMethodPatterns = [
      ...this.attributeMethodPatterns,
      new AttributeMethodPattern({ suffix: "BeforeTypeCast", parameters: false }),
      new AttributeMethodPattern({ suffix: "ForDatabase", parameters: false }),
      new AttributeMethodPattern({ suffix: "CameFromUser", parameters: false }),
      new AttributeMethodPattern({ prefix: "savedChangeTo", parameters: "**options" }),
      new AttributeMethodPattern({ suffix: "BeforeLastSave", parameters: false }),
      new AttributeMethodPattern({ prefix: "willSaveChangeTo", parameters: "**options" }),
      new AttributeMethodPattern({ suffix: "ChangeToBeSaved", parameters: false }),
      new AttributeMethodPattern({ suffix: "InDatabase", parameters: false }),
    ];
  }

  // -- Ignored columns --
  static _ignoredColumns: string[] = [];

  static get ignoredColumns(): string[] {
    return ModelSchema.ignoredColumns.call(this);
  }

  static set ignoredColumns(columns: string[]) {
    ModelSchema.ignoredColumns.call(this, columns);
  }

  // -- Readonly attributes --
  static _readonlyAttributes: Set<string> = new Set();

  // Suppresses after_initialize in the constructor when set by _instantiate /
  // directInstantiate (inheritance.ts) so we can fire after_find first, then
  // after_initialize — matching Rails' init_with_attributes call order.
  static _suppressInitializeCallback = false;

  // Suppresses the abstract-class guard during _instantiate, mirroring Rails'
  // use of allocate (which bypasses initialize) for DB-loaded records.
  static _suppressAbstractCheck = false;

  // --- ReadonlyAttributes mixin (wired via extend() after class) ---
  declare static attrReadonly: typeof ReadonlyAttributes.attrReadonly;
  declare static readonlyAttributeQ: typeof ReadonlyAttributes.readonlyAttributeQ;

  /**
   * Return the list of readonly attribute names.
   *
   * Mirrors: ActiveRecord::Base.readonly_attributes
   */
  static get readonlyAttributes(): string[] {
    return ReadonlyAttributes.readonlyAttributes.call(this);
  }

  /**
   * Per-model `associationName => options` map from accepts_nested_attributes_for.
   *
   * Mirrors: ActiveRecord::Base.nested_attributes_options
   */
  static get nestedAttributesOptions(): Readonly<Record<string, unknown>> {
    return _NestedAttributes.nestedAttributesOptions.call(this);
  }

  /**
   * Declare that this model accepts nested attributes for an association.
   *
   * Mirrors: ActiveRecord::NestedAttributes::ClassMethods#accepts_nested_attributes_for
   */
  static acceptsNestedAttributesFor(
    associationName: string,
    options?: Parameters<typeof _NestedAttributes.acceptsNestedAttributesFor>[2],
  ): void {
    _NestedAttributes.acceptsNestedAttributesFor(this, associationName, options);
  }

  /** Mirrors: ActiveRecord.verbose_query_logs, verbose_query_logs= */
  static get verboseQueryLogs(): boolean {
    return _getVerboseQueryLogs();
  }

  static set verboseQueryLogs(value: boolean) {
    _setVerboseQueryLogs(value);
  }

  /**
   * Whether this model defines its own default_scope (vs only inheriting it).
   * Nil until `build_default_scope` first memoizes it (Rails class_attribute).
   *
   * Mirrors: ActiveRecord::Base.default_scope_override
   */
  static get defaultScopeOverride(): boolean | null {
    return _defaultScopeOverride.call(this);
  }

  static set defaultScopeOverride(value: boolean | null) {
    (this as { _defaultScopeOverride?: boolean | null })._defaultScopeOverride = value;
  }

  /**
   * Per-model `purpose => TokenDefinition` map (inherited purposes included).
   *
   * Mirrors: ActiveRecord::Base.token_definitions
   */
  static get tokenDefinitions(): ReturnType<typeof _tokenDefinitions> {
    return _tokenDefinitions(this);
  }

  static set tokenDefinitions(value: Record<string, _TokenDefinition>) {
    _setTokenDefinitions(this, value);
  }

  /**
   * MessageVerifier backing token-for (null until a verifier is configured).
   *
   * Mirrors: ActiveRecord::Base.generated_token_verifier
   */
  static get generatedTokenVerifier(): _MessageVerifier | null {
    return _generatedTokenVerifier(this);
  }

  static set generatedTokenVerifier(value: _MessageVerifier | null) {
    _setGeneratedTokenVerifier(this, value);
  }

  // -- Encrypted attributes --

  /**
   * Declare attributes as encrypted.
   * Reads decrypt, writes encrypt transparently.
   *
   * Mirrors: ActiveRecord::Encryption.encrypts
   */
  static encrypts(...args: Array<string | EncryptsOptions>): void {
    encryptionHooks.encrypts(this, ...args);
  }

  /**
   * Returns true if the attribute is currently stored as encrypted ciphertext.
   * Mirrors: ActiveRecord::Encryption::EncryptableRecord#encrypted_attribute?
   *
   * @internal
   */
  encryptedAttribute(attributeName: string): boolean {
    return encryptionHooks.encryptedAttribute(this, attributeName);
  }

  /**
   * Returns the raw ciphertext stored for the attribute.
   * Mirrors: ActiveRecord::Encryption::EncryptableRecord#ciphertext_for
   *
   * @internal
   */
  ciphertextFor(attributeName: string): unknown {
    return encryptionHooks.ciphertextFor(this, attributeName);
  }

  /**
   * Encrypts all encryptable attributes and persists via update_columns.
   * Mirrors: ActiveRecord::Encryption::EncryptableRecord#encrypt
   *
   * @internal
   */
  async encrypt(): Promise<void> {
    return encryptionHooks.encrypt(this);
  }

  /**
   * Decrypts all encryptable attributes and persists via update_columns.
   * Mirrors: ActiveRecord::Encryption::EncryptableRecord#decrypt
   *
   * @internal
   */
  async decrypt(): Promise<void> {
    return encryptionHooks.decrypt(this);
  }

  static async suppress<R>(fn: () => R | Promise<R>): Promise<R> {
    return _suppressBlock(this, fn);
  }

  static get registry(): Record<string, true | undefined> {
    return _suppressorRegistry();
  }

  // --- Reflection::ClassMethods (wired via extend() after class body) ---
  /** reflection.rb:11 — `class_attribute :_reflections, instance_writer: false, default: {}`. */
  declare static _reflections: Record<string, _Reflection.AssociationReflection>;
  declare static _reflectOnAssociation: typeof _Reflection.ClassMethods._reflectOnAssociation;
  declare static reflections: typeof _Reflection.ClassMethods.reflections;
  declare static normalizedReflections: typeof _Reflection.ClassMethods.normalizedReflections;
  declare static reflectOnAssociation: typeof _Reflection.ClassMethods.reflectOnAssociation;
  declare static reflectOnAllAssociations: typeof _Reflection.ClassMethods.reflectOnAllAssociations;
  declare static reflectOnAllAggregations: typeof _Reflection.ClassMethods.reflectOnAllAggregations;
  declare static reflectOnAggregation: typeof _Reflection.ClassMethods.reflectOnAggregation;
  declare static reflectOnAllAutosaveAssociations: typeof _Reflection.ClassMethods.reflectOnAllAutosaveAssociations;
  declare static aggregateReflections: typeof _Reflection.ClassMethods.aggregateReflections;

  // --- Validations::ClassMethods (wired via extend() after class body) ---
  declare static validates: typeof _Validations.validates;
  declare static validatesAssociated: typeof _Validations.validatesAssociated;

  // -- Enums (wired via extend() after class body) --
  static _enums: Map<string, Record<string, number | string | boolean | null>> = new Map();

  /**
   * Declare an enum attribute. Maps symbolic names to integer values.
   *
   * Mirrors: ActiveRecord::Enum.enum
   */
  declare static enum: typeof _EnumModule.enumMethod;

  /** @internal */
  declare static _enum: typeof _EnumModule._enum;
  /** @internal */
  declare static _enumMethodsModule: typeof _EnumModule._enumMethodsModule;
  /** @internal */
  declare static detectEnumConflictBang: typeof _EnumModule.detectEnumConflictBang;
  /** @internal */
  declare static raiseConflictError: typeof _EnumModule.raiseConflictError;
  /** @internal */
  declare static assertValidEnumDefinitionValues: typeof _EnumModule.assertValidEnumDefinitionValues;
  /** @internal */
  declare static assertValidEnumOptions: typeof _EnumModule.assertValidEnumOptions;
  /** @internal */
  declare static detectNegativeEnumConditionsBang: typeof _EnumModule.detectNegativeEnumConditionsBang;

  // Cast `from:`/`to:` options through the enum mapping before comparison.
  // Rails normalises these via AttributeMutationTracker#type_cast (which calls
  // type.cast on the attribute's EnumType); we mirror it here for both live
  // changes (attributeChanged) and persisted changes (savedChangeToAttribute).
  // All enums are label-stored via the registered EnumType with their mapping
  // in the single `_enums` registry.
  override attributeChanged(name: string, options?: { from?: unknown; to?: unknown }): boolean {
    if (options) {
      const ctor = this.constructor as typeof Base;
      const canonical = (ctor as any).attributeAliases?.[name] ?? name;
      options = _castEnumDirtyOpts(ctor, canonical, options);
    }
    return super.attributeChanged(name, options);
  }

  /**
   * Mirrors: ActiveRecord::AttributeMethods::Dirty#saved_change_to_attribute?
   * (attribute_methods/dirty.rb:86-88), declared alongside its
   * `attribute_method_affix` in `attributeMethodPatterns` above.
   *
   * The body is the port in `attribute-methods/dirty.ts`. What stays here is
   * what Rails does inside `AttributeMutationTracker#changed?`
   * (attribute_mutation_tracker.rb:44-48) and trails cannot: alias resolution
   * and the `type_cast(attr_name, …)` of each option through the attribute's
   * `EnumType`, both of which need the class, not the record.
   *
   * The NAME is forced: a generated `savedChangeToName` reaches its target
   * through the derived `${prefix}attribute${suffix}` join
   * (attribute_methods.rb:481), and Ruby tells the predicate from the value
   * reader by a TRAILING `?` where TypeScript's convention is a LEADING `is` —
   * so no pattern can derive `isSavedChangeToAttribute`, the spelling the port
   * carries. Story:
   * 0096-naming-identifier-burndown/converge-ar-dirty-generic-names-onto-dirty-ts.
   */
  savedChangeToAttribute(name: string, options?: { from?: unknown; to?: unknown }): boolean {
    const ctor = this.constructor as typeof Base;
    if (options) {
      const canonical = (ctor as any).attributeAliases?.[name] ?? name;
      options = _castEnumDirtyOpts(ctor, canonical, options);
    }
    return _isSavedChangeToAttribute.call(this as any, ctor.resolveAttributeName(name), options);
  }

  /**
   * Mirrors: ActiveRecord::AttributeMethods::Dirty#will_save_change_to_attribute?
   * (attribute_methods/dirty.rb:138-140). Same split and the same forced
   * spelling as {@link Base.savedChangeToAttribute}.
   */
  willSaveChangeToAttribute(name: string, options?: { from?: unknown; to?: unknown }): boolean {
    const ctor = this.constructor as typeof Base;
    if (options) {
      const canonical = (ctor as any).attributeAliases?.[name] ?? name;
      options = _castEnumDirtyOpts(ctor, canonical, options);
    }
    return _isWillSaveChangeToAttribute.call(this as any, ctor.resolveAttributeName(name), options);
  }

  // -- Explain --

  /** @internal */
  declare static collectingQueriesForExplain: typeof _collectingQueriesForExplain;

  /** @internal */
  declare static execExplain: typeof _execExplain;

  /** @internal */
  declare static renderBind: typeof _renderBind;

  /** @internal */
  declare static buildExplainClause: typeof _buildExplainClause;

  // -- DelegatedType --

  /**
   * Declare a delegated type on this model.
   *
   * Mirrors: ActiveRecord::DelegatedType.delegated_type
   */
  static delegatedType(
    role: string,
    options: import("./delegated-type.js").DelegatedTypeOptions,
  ): void {
    _delegatedType(this, role, options);
  }

  /** @internal */
  static defineDelegatedTypeMethods(
    role: string,
    types: string[],
    options: Omit<import("./delegated-type.js").DelegatedTypeOptions, "types">,
  ): void {
    _defineDelegatedTypeMethods(
      this,
      role,
      types,
      options as import("./delegated-type.js").DelegatedTypeOptions,
    );
  }

  // -- Store --

  /**
   * Declare a stored attribute backed by a JSON/text column.
   * Registers an IndifferentCoder for the column. For plain text/string columns,
   * also calls serialize() so readAttribute returns HashWithIndifferentAccess.
   * Structured types (json/jsonb/hstore) have a type-level accessor and handle
   * their own cast/serialize — IndifferentCoder is registered but serialize()
   * is not called for those.
   *
   * Mirrors: ActiveRecord::Store::ClassMethods#store
   */
  static store(
    attribute: string,
    options?: {
      accessors?: string[];
      prefix?: boolean | string;
      suffix?: boolean | string;
      coder?: unknown;
      yaml?: Record<string, unknown>;
    },
  ): void {
    _storeFunction(this, attribute, {
      accessors: options?.accessors,
      prefix: options?.prefix,
      suffix: options?.suffix,
      coder: options?.coder,
      yaml: options?.yaml,
    });
  }

  /**
   * Add accessors to an already-serialized store column without re-running
   * the serialize step. Use store() instead when declaring a new store column.
   *
   * Mirrors: ActiveRecord::Store::ClassMethods#store_accessor
   */
  static storeAccessor(
    attribute: string,
    options?: { accessors?: string[]; prefix?: boolean | string; suffix?: boolean | string },
  ): void {
    _storeAccessorFunction(this, attribute, {
      accessors: options?.accessors,
      prefix: options?.prefix,
      suffix: options?.suffix,
    });
  }

  /** Mirrors: ActiveRecord::SecureToken::ClassMethods#has_secure_token (secure_token.rb:38). */
  static hasSecureToken = _hasSecureToken;

  /** Mirrors: ActiveRecord::SecureToken::ClassMethods#generate_unique_secure_token (secure_token.rb:57). */
  static generateUniqueSecureToken = _generateUniqueSecureToken;

  /** Mirrors: ActiveRecord::TokenFor::ClassMethods#generates_token_for (token_for.rb:100). */
  static generatesTokenFor = _generatesTokenFor;

  /** Mirrors: ActiveRecord::TokenFor::ClassMethods#find_by_token_for (token_for.rb:104). */
  static findByTokenFor = _findByTokenFor;

  /** Mirrors: ActiveRecord::TokenFor::ClassMethods#find_by_token_for! (token_for.rb:108). */
  static findByTokenForBang = _findByTokenForBang;

  // The fallback coder used by `serialize` when no explicit coder is given
  // (`coder ||= default_column_serializer`). Subclasses inherit via JS
  // prototype lookup and may override per-class.
  //
  // Mirrors: ActiveRecord::AttributeMethods::Serialization — `class_attribute
  // :default_column_serializer, instance_accessor: false, default:
  // Coders::YAMLColumn` (serialization.rb:19-20).
  static _defaultColumnSerializer: unknown = _YAMLColumn;

  /** Mirrors: ActiveRecord::Base.default_column_serializer */
  static get defaultColumnSerializer(): unknown {
    return this._defaultColumnSerializer;
  }

  static set defaultColumnSerializer(value: unknown) {
    this._defaultColumnSerializer = value;
  }

  /**
   * Declare that an attribute should be serialized using the given coder.
   *
   * Mirrors: ActiveRecord::Base.serialize
   */
  static serialize(
    attribute: string,
    options?: { coder?: unknown; type?: "Array" | "Hash" | (new (...args: any[]) => any) },
  ): void {
    _serializeAttribute(this, attribute, options as any);
  }

  /** Mirrors: ActiveRecord::Store::ClassMethods#local_stored_attributes */
  declare static localStoredAttributes: typeof _localStoredAttributesMethod;

  /** Mirrors: ActiveRecord::Store::ClassMethods#stored_attributes */
  static storedAttributes = _storedAttributes;

  // -- Scopes registry (used by Relation) --
  static _scopes: Map<string, (rel: any, ...args: any[]) => any> = new Map();
  /** Accumulated default_scope declarations. @internal */
  static defaultScopes: import("./scoping/default.js").DefaultScope[] = [];

  // --- Default scope (wired via extend() after class body) ---
  declare static defaultScope: typeof _defaultScope;
  declare static unscoped: typeof _unscoped;

  /** @internal Like all() but skips currentScope — used by the preloader. */
  static _allForPreload(): any {
    return this.defaultScoped();
  }

  /**
   * Mirrors: ActiveRecord::Core::ClassMethods#relation (core.rb:431-435).
   *
   * @internal Rails-private (core.rb:408 `private`).
   */
  static relation(): any {
    const relation = Relation.create(this);

    if (isFinderNeedsTypeCondition(this) && !isIgnoreDefaultScope.call(this)) {
      // `finder_needs_type_condition?` memoizes on first call (inheritance.rb:92),
      // so clearing `inheritance_column` afterwards leaves it answering true.
      // Rails' `type_condition` then builds `table[nil]` (inheritance.rb:322);
      // trails' `typeCondition` raises instead, so skip the arm rather than
      // turning a Rails no-op into an error.
      if (this.inheritanceColumn === null) return relation;
      return relation.whereBang(typeCondition(this));
    } else {
      return relation;
    }
  }

  // Scope extension methods: scope name -> Record of extra methods
  static _scopeExtensions: Map<string, Record<string, (...args: any[]) => any>> = new Map();

  /**
   * Define a named scope with an optional extension block.
   *
   * The extension object adds extra methods to the returned relation
   * when the scope is invoked.
   *
   * Mirrors: ActiveRecord::Scoping::Named::ClassMethods. Wired via extend()
   * after class.
   */
  declare static scope: typeof NamedScoping.scope;
  declare static scopeForAssociation: typeof NamedScoping.scopeForAssociation;
  declare static defaultScoped: typeof NamedScoping.defaultScoped;
  declare static defaultExtensions: typeof NamedScoping.defaultExtensions;

  // -- Scoping --

  /**
   * Execute a block with the given relation as the current scope.
   *
   * Mirrors: ActiveRecord::Relation#scoping
   */
  static async scoping<R>(rel: any, fn: () => R | Promise<R>): Promise<R>;
  static async scoping<R>(
    rel: any,
    options: { allQueries?: boolean | null },
    fn: () => R | Promise<R>,
  ): Promise<R>;
  static async scoping<R>(
    rel: any,
    optionsOrFn: { allQueries?: boolean | null } | (() => R | Promise<R>),
    maybeFn?: () => R | Promise<R>,
  ): Promise<R> {
    // Delegate to Relation#scoping so the all_queries threading (global current
    // scope + nested-unset guard) lives in one place.
    return typeof optionsOrFn === "function"
      ? rel.scoping(optionsOrFn)
      : rel.scoping(optionsOrFn, maybeFn);
  }

  /**
   * Return the current scope if set, or null.
   *
   * Mirrors: ActiveRecord::Base.current_scope
   */
  static currentScope(skipInheritedScope = false): any | null {
    return ScopeRegistry.currentScope(this, skipInheritedScope);
  }

  /**
   * Mirrors: ActiveRecord::Scoping::ClassMethods#current_scope=
   */
  static setCurrentScope = _setCurrentScope;

  /**
   * Mirrors: ActiveRecord::Scoping::ClassMethods#global_current_scope
   */
  static globalCurrentScope = _globalCurrentScope;

  /**
   * Mirrors: ActiveRecord::Scoping::ClassMethods#global_current_scope=
   */
  static setGlobalCurrentScope = _setGlobalCurrentScope;

  /**
   * Mirrors: ActiveRecord::Scoping::ClassMethods#scope_registry
   */
  static scopeRegistry = _scopeRegistry;

  /**
   * Mirrors: ActiveRecord::Scoping::Default::ClassMethods#scope_attributes?
   */
  static isScopeAttributes = _isScopeAttributes;

  // -- Finders (class methods) --

  // Overloads match Rails' behavior:
  //   find(id)          → single record
  //   find([id, ...])   → array of records (plural PK)
  //                       OR a single record when the model has a composite
  //                       primary key and the array is the tuple form
  //                       (`find([shop_id, id])`). Because TS can't inspect
  //                       `primaryKey` at the type level, the return is a
  //                       union: callers narrow with `Array.isArray` or cast.
  //   find(id, id, ...) → variadic → array of records
  declare static find: {
    <T extends typeof Base>(
      this: T,
      ids: [unknown, ...unknown[]],
    ): Promise<InstanceType<T> | InstanceType<T>[]>;
    <T extends typeof Base>(this: T, id: unknown): Promise<InstanceType<T>>;
    <T extends typeof Base>(
      this: T,
      id: unknown,
      ...ids: [unknown, ...unknown[]]
    ): Promise<InstanceType<T>[]>;
  };

  declare static findBy: <T extends typeof Base>(
    this: T,
    conditions: Record<string, unknown>,
  ) => Promise<InstanceType<T> | null>;

  // Mirrors Rails `Core::ClassMethods#initialize_find_by_cache` — resets the
  // per-class `@find_by_statement_cache` (bucketed by prepared_statements).
  declare static initializeFindByCache: typeof _Core.initializeFindByCache;
  declare static cachedFindByStatement: typeof _Core.cachedFindByStatement;
  declare static _findByStatementCache?: Map<boolean, Map<string, unknown>>;

  // Mirrors Rails' `Base.configurations` / `.configurations=` pair, collapsed
  // into one optional-argument accessor.
  declare static configurations: typeof _Core.configurations;

  // Mirrors Rails `find_by!(arg, *args)`: a Hash of conditions or a raw SQL
  // fragment (`Post.find_by!("1 = 0")`) plus optional bind args.
  declare static findByBang: <T extends typeof Base>(
    this: T,
    conditions: Record<string, unknown> | string,
    ...rest: unknown[]
  ) => Promise<InstanceType<T>>;

  /** Mirrors `include DynamicMatchers` (base.rb) — see dynamic-matchers.ts. */
  static respondToMissing = respondToMissing;

  /**
   * Find the sole record matching conditions.
   * Raises RecordNotFound if none, SoleRecordExceeded if more than one.
   *
   * Mirrors: ActiveRecord::Base.find_sole_by
   */
  static async findSoleBy<T extends typeof Base>(
    this: T,
    ...conditions: unknown[]
  ): Promise<InstanceType<T>> {
    return (this.all().where as any)(...conditions).sole();
  }

  /**
   * Return all records as a Relation.
   *
   * Mirrors: ActiveRecord::Base.all
   */
  static all<T extends typeof Base>(
    this: T,
    options?: { allQueries?: boolean | null },
  ): Relation<InstanceType<T>> {
    const scope = this.currentScope();
    if (scope) {
      // Rails' `all`: `self == scope.model ? scope.clone :
      // relation.merge!(scope)`. When the current scope was set on a
      // superclass (an STI subclass reading a scope installed on its base, e.g.
      // inside `Comment.unscoped { SpecialComment.find(1) }`), build this
      // class's own relation — which carries the STI `type_condition` — and
      // merge the inherited scope into it, rather than cloning the parent's
      // type-unconstrained relation.
      if (scope._model === this) {
        return scope.clone();
      }
      return this.relation().mergeBang(scope);
    }
    return this.defaultScoped({ allQueries: options?.allQueries });
  }

  /**
   * Shorthand for all().where(conditions).
   *
   * Mirrors: ActiveRecord::Base.where
   */
  static where<T extends typeof Base>(this: T): WhereChain<Relation<InstanceType<T>>>;
  static where<T extends typeof Base>(
    this: T,
    conditions: Record<string, unknown>,
  ): Relation<InstanceType<T>>;
  static where<T extends typeof Base>(
    this: T,
    sql: string,
    ...binds: unknown[]
  ): Relation<InstanceType<T>>;
  static where<T extends typeof Base>(this: T, conditions: unknown[]): Relation<InstanceType<T>>;
  static where<T extends typeof Base>(
    this: T,
    cols: string[],
    tuples: unknown[][],
  ): Relation<InstanceType<T>>;
  static where<T extends typeof Base>(this: T, node: Nodes.Node): Relation<InstanceType<T>>;
  static where<T extends typeof Base>(
    this: T,
    conditionsOrSql?: Record<string, unknown> | string | string[] | unknown[] | Nodes.Node,
    ...rest: unknown[]
  ): Relation<InstanceType<T>> | WhereChain<Relation<InstanceType<T>>> {
    if (conditionsOrSql === undefined) {
      return this.all().where();
    }
    if (conditionsOrSql instanceof Nodes.Node) {
      return this.all().where(conditionsOrSql);
    }
    if (typeof conditionsOrSql === "string") {
      return this.all().where(conditionsOrSql, ...rest);
    }
    // Composite-key form (`where(cols, tuples)`) is a two-argument call, so it
    // is disambiguated from Rails' sanitized-array conditions form
    // (`where(["name = ?", x])`, a single array argument) by argument count. A
    // single all-strings array falls through to `Relation#where`, which routes
    // it to `buildWhereClause` for sanitization / BoundSqlLiteral handling.
    if (
      Array.isArray(conditionsOrSql) &&
      rest.length > 0 &&
      conditionsOrSql.every((c) => typeof c === "string")
    ) {
      if (rest.length !== 1 || !Array.isArray(rest[0])) {
        throw argumentError(
          `${(this as { name?: string }).name ?? "Model"}.where(cols, tuples): composite-key form requires a tuples argument as an array of arrays`,
        );
      }
      return this.all().where(conditionsOrSql as string[], rest[0] as unknown[][]);
    }
    if (Array.isArray(conditionsOrSql)) {
      // A single array argument is the sanitized-conditions form. Any extra
      // positional `rest` is intentionally dropped, mirroring Rails'
      // `build_where_clause`, whose `opts, *rest = opts` overwrites `rest` with
      // the array tail and discards the originally-passed args
      // (query_methods.rb:1616-1618).
      return this.all().where(conditionsOrSql as unknown[]);
    }
    return this.all().where(conditionsOrSql);
  }

  // insertAll / upsertAll / updateAll / deleteAll / destroyBy / deleteBy
  // extracted to querying.ts; declared in the Querying mixin section below.

  /**
   * Update record(s). Mirrors Rails' `persistence.rb#update` — the id
   * argument shape drives behavior:
   *
   *   update(attrs)                 → update every record in `all()` (Rails' `:all` default)
   *   update(":all", attrs)         → same, explicit sentinel (mirrors Rails' :all symbol)
   *   update(id, attrs)             → find(id) + update(attrs), returns the record
   *   update([ids], [attrs])        → parallel arrays, index-aligned
   *
   * Passing a `Base` instance (or array containing one) raises.
   */
  static update<T extends typeof Base>(
    this: T,
    attrs: Record<string, unknown>,
  ): Promise<InstanceType<T>[]>;
  static update<T extends typeof Base>(
    this: T,
    sentinel: ":all" | null | undefined,
    attrs: Record<string, unknown>,
  ): Promise<InstanceType<T>[]>;
  static update<T extends typeof Base>(
    this: T,
    ids: unknown[],
    attrs: Record<string, unknown>[],
  ): Promise<InstanceType<T>[]>;
  static update<T extends typeof Base>(
    this: T,
    id: unknown,
    attrs: Record<string, unknown>,
  ): Promise<InstanceType<T>>;
  static async update<T extends typeof Base>(
    this: T,
    idOrAttrs: unknown,
    attrs?: Record<string, unknown> | Record<string, unknown>[],
  ): Promise<InstanceType<T> | InstanceType<T>[]> {
    return performClassUpdate.call(this, idOrAttrs, attrs, /*bang*/ false) as Promise<
      InstanceType<T> | InstanceType<T>[]
    >;
  }

  /**
   * Destroy a record by primary key (with callbacks). Accepts a single id,
   * an array of ids, a composite-PK tuple, or an array of tuples.
   *
   * Mirrors: ActiveRecord::Base.destroy — Rails detects multiple ids via
   *   `composite_primary_key? ? id.first.is_a?(Array) : id.is_a?(Array)`
   * so a plain tuple on a composite-PK model is treated as ONE record,
   * not N.
   *
   * @missingRailsCall with_transaction_returning_status — PERMANENT: File-mapping artifact:
   *   `base.ts`'s `destroy` is the instance-method table entry `destroy:
   *   _Persistence.destroy` (base.ts:4609), not a body. Rails'
   *   `Transactions#destroy` (transactions.rb:356-358) maps to persistence.ts
   *   `destroy`, which does call `withTransactionReturningStatus`
   *   (persistence.ts:855).
   */
  static async destroy<T extends typeof Base>(
    this: T,
    id: unknown | unknown[],
  ): Promise<InstanceType<T> | InstanceType<T>[]> {
    const multipleIds = this.compositePrimaryKey
      ? Array.isArray(id) && Array.isArray((id as unknown[])[0])
      : Array.isArray(id);

    if (multipleIds) {
      const found = await this.find(id);
      const records = Array.isArray(found) ? found : [found];
      for (const record of records) await record.destroy();
      return records;
    }
    const record = await this.find(id);
    await record.destroy();
    return record;
  }

  // destroyAll extracted to querying.ts; declared in the Querying mixin section.

  /**
   * Update record(s) and raise on validation failure. Same arg shapes as
   * `update`.
   *
   * Mirrors: ActiveRecord::Base.update!
   */
  static updateBang<T extends typeof Base>(
    this: T,
    attrs: Record<string, unknown>,
  ): Promise<InstanceType<T>[]>;
  static updateBang<T extends typeof Base>(
    this: T,
    sentinel: ":all" | null | undefined,
    attrs: Record<string, unknown>,
  ): Promise<InstanceType<T>[]>;
  static updateBang<T extends typeof Base>(
    this: T,
    ids: unknown[],
    attrs: Record<string, unknown>[],
  ): Promise<InstanceType<T>[]>;
  static updateBang<T extends typeof Base>(
    this: T,
    id: unknown,
    attrs: Record<string, unknown>,
  ): Promise<InstanceType<T>>;
  static async updateBang<T extends typeof Base>(
    this: T,
    idOrAttrs: unknown,
    attrs?: Record<string, unknown> | Record<string, unknown>[],
  ): Promise<InstanceType<T> | InstanceType<T>[]> {
    return performClassUpdate.call(this, idOrAttrs, attrs, /*bang*/ true) as Promise<
      InstanceType<T> | InstanceType<T>[]
    >;
  }

  /**
   * Touch all records matching conditions (update timestamps).
   *
   * Mirrors: ActiveRecord::Base.touch_all — a class-level entry point that
   * delegates to `all().touchAll(...)` (Rails wires it up through
   * `Querying::QUERYING_METHODS`, whose implementation lives on Relation).
   * Wired via extend() after class.
   */
  declare static touchAll: typeof Timestamp.touchAll;

  // Positional / calculation / predicate delegators (second..thirdToLast,
  // exists, count/minimum/maximum/average/sum/pluck/ids/pick,
  // first[!] / last[!] / take / sole, findOrCreateBy, findOrInitializeBy)
  // extracted to querying.ts; declared in the Querying mixin section below.

  /**
   * Try to create a record first; if it already exists (uniqueness violation),
   * find and return the existing one.
   *
   * Mirrors: ActiveRecord::Base.create_or_find_by
   */
  static createOrFindBy<T extends typeof Base>(
    this: T,
    conditions: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): Promise<InstanceType<T>> {
    // Rails: `delegate :create_or_find_by, to: :all`. Routing through all()
    // picks up the current scope + uses the narrow RecordNotUnique retry
    // Relation#createOrFindBy implements, so validation failures and
    // other adapter errors propagate unchanged.
    return this.all().createOrFindBy(conditions, extra);
  }

  /**
   * Try to create a record first (raising on validation failure);
   * if it already exists, find and return the existing one.
   *
   * Mirrors: ActiveRecord::Base.create_or_find_by!
   */
  static createOrFindByBang<T extends typeof Base>(
    this: T,
    conditions: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): Promise<InstanceType<T>> {
    return this.all().createOrFindByBang(conditions, extra);
  }

  /**
   * Instantiate a new record (not yet saved).
   *
   * Rails: `Base.new(attributes = nil, &block)` — recurses on arrays and
   * yields each record to the block before returning.
   *
   * @noRailsEquivalent PERMANENT Ruby never writes `def new` for this — the
   * allocator is `Class#new` and the model side is
   * `vendor/rails/activerecord/lib/active_record/core.rb:471` (`def
   * initialize`), so no `.rb` can ever declare a matching name. TS reserves
   * `new` for the constructor, which cannot recurse over an array of attribute
   * hashes nor yield each record to a block, so the `Model.new(attrs, &block)`
   * semantics have to live on a static factory of the same name.
   */
  static new<T extends typeof Base>(
    this: T,
    attrs: Record<string, unknown>[],
    block?: (record: InstanceType<T>) => void,
  ): InstanceType<T>[];
  static new<T extends typeof Base>(
    this: T,
    attrs?: Record<string, unknown>,
    block?: (record: InstanceType<T>) => void,
  ): InstanceType<T>;
  static new<T extends typeof Base>(
    this: T,
    attrs: Record<string, unknown> | Record<string, unknown>[] = {},
    block?: (record: InstanceType<T>) => void,
  ): InstanceType<T> | InstanceType<T>[] {
    if (Array.isArray(attrs)) {
      return attrs.map((a) => this.new(a, block));
    }
    const record = new this(this._mergeCurrentScopeAttrs(attrs)) as InstanceType<T>;
    if (block) block(record);
    return record;
  }

  /**
   * Alias for `new` (Rails 7.2+). Handy when `new` reads awkwardly in
   * fluent chains or template literals.
   *
   * Mirrors: ActiveRecord::Persistence::ClassMethods#build
   */
  static build<T extends typeof Base>(
    this: T,
    attrs: Record<string, unknown>[],
    block?: (record: InstanceType<T>) => void,
  ): InstanceType<T>[];
  static build<T extends typeof Base>(
    this: T,
    attrs?: Record<string, unknown>,
    block?: (record: InstanceType<T>) => void,
  ): InstanceType<T>;
  static build<T extends typeof Base>(
    this: T,
    attrs: Record<string, unknown> | Record<string, unknown>[] = {},
    block?: (record: InstanceType<T>) => void,
  ): InstanceType<T> | InstanceType<T>[] {
    return Array.isArray(attrs) ? this.new(attrs, block) : this.new(attrs, block);
  }

  /**
   * Create a record and save it to the database.
   *
   * Rails: `Base.create(attributes = nil, &block)` — recurses on arrays
   * and yields each record to the block before save.
   */
  private static _mergeCurrentScopeAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
    const scope = this.currentScope();
    if (scope) {
      const scopeAttrs = scope.scopeForCreate?.() ?? {};
      return { ...scopeAttrs, ...attrs };
    }
    return attrs;
  }

  static async create<T extends typeof Base>(
    this: T,
    attrs: Record<string, unknown>[],
    block?: (record: InstanceType<T>) => void,
  ): Promise<InstanceType<T>[]>;
  static async create<T extends typeof Base>(
    this: T,
    attrs?: Record<string, unknown>,
    block?: (record: InstanceType<T>) => void,
  ): Promise<InstanceType<T>>;
  static async create<T extends typeof Base>(
    this: T,
    attrs: Record<string, unknown> | Record<string, unknown>[] = {},
    block?: (record: InstanceType<T>) => void,
  ): Promise<InstanceType<T> | InstanceType<T>[]> {
    return _Persistence.create.call(this, attrs, block);
  }

  static async createBang<T extends typeof Base>(
    this: T,
    attrs: Record<string, unknown>[],
    block?: (record: InstanceType<T>) => void,
  ): Promise<InstanceType<T>[]>;
  static async createBang<T extends typeof Base>(
    this: T,
    attrs?: Record<string, unknown>,
    block?: (record: InstanceType<T>) => void,
  ): Promise<InstanceType<T>>;
  static async createBang<T extends typeof Base>(
    this: T,
    attrs: Record<string, unknown> | Record<string, unknown>[] = {},
    block?: (record: InstanceType<T>) => void,
  ): Promise<InstanceType<T> | InstanceType<T>[]> {
    return _Persistence.createBang.call(this, attrs, block);
  }

  /**
   * Instantiate a record from a hash of database attributes, dispatching
   * through STI if applicable.
   *
   * Mirrors: ActiveRecord::Persistence::ClassMethods#instantiate
   */
  static instantiate<T extends typeof Base>(
    this: T,
    attributes: Record<string, unknown>,
    columnTypes?: Record<string, unknown>,
    block?: (record: InstanceType<T>) => void,
  ): InstanceType<T> {
    return _Persistence.instantiate.call(this, attributes, columnTypes, block);
  }

  // --- Querying mixin (static methods, wired via extend() after class) ---
  declare static findBySql: typeof Querying.findBySql;
  declare static asyncFindBySql: typeof Querying.asyncFindBySql;
  declare static countBySql: typeof Querying.countBySql;
  declare static asyncCountBySql: typeof Querying.asyncCountBySql;
  declare static from: typeof Querying.from;
  declare static select: typeof Querying.select;
  declare static order: typeof Querying.order;
  declare static group: typeof Querying.group;
  declare static limit: typeof Querying.limit;
  declare static offset: typeof Querying.offset;
  declare static distinct: typeof Querying.distinct;
  declare static joins: typeof Querying.joins;
  declare static optimizerHints: typeof Querying.optimizerHints;
  declare static leftJoins: typeof Querying.leftJoins;
  declare static leftOuterJoins: typeof Querying.leftOuterJoins;
  declare static none: typeof Querying.none;
  declare static insert: typeof Querying.insert;
  declare static insertBang: typeof Querying.insertBang;
  declare static insertAll: typeof Querying.insertAll;
  declare static insertAllBang: typeof Querying.insertAllBang;
  declare static upsert: typeof Querying.upsert;
  declare static upsertAll: typeof Querying.upsertAll;
  declare static updateAll: typeof Querying.updateAll;
  declare static deleteAll: typeof Querying.deleteAll;
  declare static destroyAll: typeof Querying.destroyAll;
  declare static destroyBy: typeof Querying.destroyBy;
  declare static deleteBy: typeof Querying.deleteBy;
  declare static second: typeof Querying.second;
  declare static secondBang: typeof Querying.secondBang;
  declare static third: typeof Querying.third;
  declare static thirdBang: typeof Querying.thirdBang;
  declare static fourth: typeof Querying.fourth;
  declare static fourthBang: typeof Querying.fourthBang;
  declare static fifth: typeof Querying.fifth;
  declare static fifthBang: typeof Querying.fifthBang;
  declare static fortyTwo: typeof Querying.fortyTwo;
  declare static fortyTwoBang: typeof Querying.fortyTwoBang;
  declare static secondToLast: typeof Querying.secondToLast;
  declare static secondToLastBang: typeof Querying.secondToLastBang;
  declare static thirdToLast: typeof Querying.thirdToLast;
  declare static thirdToLastBang: typeof Querying.thirdToLastBang;

  declare static count: typeof Querying.count;
  declare static minimum: typeof Querying.minimum;
  declare static maximum: typeof Querying.maximum;
  declare static average: typeof Querying.average;
  declare static sum: typeof Querying.sum;
  declare static pluck: typeof Querying.pluck;
  declare static ids: typeof Querying.ids;
  declare static pick: typeof Querying.pick;
  declare static first: typeof Querying.first;
  declare static firstBang: typeof Querying.firstBang;
  declare static last: typeof Querying.last;
  declare static lastBang: typeof Querying.lastBang;
  declare static take: typeof Querying.take;
  declare static takeBang: typeof Querying.takeBang;
  declare static sole: typeof Querying.sole;
  declare static exists: typeof Querying.exists;
  declare static findOrCreateBy: typeof Querying.findOrCreateBy;
  declare static findOrCreateByBang: typeof Querying.findOrCreateByBang;
  declare static findOrInitializeBy: typeof Querying.findOrInitializeBy;
  declare static isAny: typeof Querying.isAny;
  declare static isMany: typeof Querying.isMany;
  declare static isOne: typeof Querying.isOne;
  declare static isNone: typeof Querying.isNone;
  declare static isEmpty: typeof Querying.isEmpty;
  declare static firstOrCreate: typeof Querying.firstOrCreate;
  declare static firstOrCreateBang: typeof Querying.firstOrCreateBang;
  declare static firstOrInitialize: typeof Querying.firstOrInitialize;
  declare static findEach: typeof Querying.findEach;
  declare static findInBatches: typeof Querying.findInBatches;
  declare static inBatches: typeof Querying.inBatches;
  declare static includes: typeof Querying.includes;
  declare static preload: typeof Querying.preload;
  declare static eagerLoad: typeof Querying.eagerLoad;
  declare static references: typeof Querying.references;
  declare static extending: typeof Querying.extending;
  declare static unscope: typeof Querying.unscope;
  declare static reselect: typeof Querying.reselect;
  declare static reorder: typeof Querying.reorder;
  declare static rewhere: typeof Querying.rewhere;
  declare static regroup: typeof Querying.regroup;
  declare static having: typeof Querying.having;
  declare static lock: typeof Querying.lock;
  declare static readonly: typeof Querying.readonly;
  declare static withCte: typeof Querying.withCte;
  declare static with: typeof Querying.withCte;
  declare static withRecursive: typeof Querying.withRecursive;
  declare static annotate: typeof Querying.annotate;
  declare static excluding: typeof Querying.excluding;
  declare static or: typeof Querying.or;
  declare static and: typeof Querying.and;
  declare static inOrderOf: typeof Querying.inOrderOf;
  declare static strictLoading: typeof Querying.strictLoading;
  declare static createWith: typeof Querying.createWith;
  declare static invertWhere: typeof Querying.invertWhere;
  declare static without: typeof Querying.without;
  declare static only: typeof Querying.only;
  declare static merge: typeof Querying.merge;
  declare static asyncIds: typeof Querying.asyncIds;
  declare static extractAssociated: typeof Querying.extractAssociated;
  declare static except: typeof Querying.except;
  declare static calculate: typeof Querying.calculate;
  declare static asyncCount: typeof Querying.asyncCount;
  declare static asyncAverage: typeof Querying.asyncAverage;
  declare static asyncMinimum: typeof Querying.asyncMinimum;
  declare static asyncMaximum: typeof Querying.asyncMaximum;
  declare static asyncSum: typeof Querying.asyncSum;
  declare static asyncPluck: typeof Querying.asyncPluck;
  declare static asyncPick: typeof Querying.asyncPick;
  /** @internal */
  declare static _queryBySql: typeof Querying._queryBySql;
  /** @internal */
  declare static _loadFromSql: typeof Querying._loadFromSql;

  /**
   * Increment counter columns for a record by primary key.
   *
   * Mirrors: ActiveRecord::CounterCache::ClassMethods. Wired via extend()
   * after class.
   */
  declare static incrementCounter: typeof CounterCache.incrementCounter;
  declare static decrementCounter: typeof CounterCache.decrementCounter;
  declare static updateCounters: typeof CounterCache.updateCounters;
  declare static resetCounters: typeof CounterCache.resetCounters;
  declare static isCounterCacheColumn: typeof CounterCache.isCounterCacheColumn;
  /** counter_cache.rb:9 — `class_attribute :_counter_cache_columns`. */
  declare static _counterCacheColumns: string[];
  /** counter_cache.rb:10 — `class_attribute :counter_cached_association_names`. */
  declare static counterCachedAssociationNames: string[];

  /**
   * Instantiate a model from a database row (marks it as persisted).
   */
  static _instantiate<T extends typeof Base>(
    this: T,
    row: Record<string, unknown>,
    block?: (record: InstanceType<T>) => void,
    columnTypes?: Record<string, { deserialize(value: unknown): unknown }>,
    overrideTypes?: Record<string, { deserialize(value: unknown): unknown }>,
  ): InstanceType<T> {
    // Guard on class identity, not on `row[type] !== this.name`: the stored value
    // is `sti_name`, which for a `store_full_sti_class` namespaced model
    // ("ClothingItem::Used") never equals the flattened JS class name
    // (`ClothingItemUsed`). Re-entry terminates because the resolution is
    // idempotent. Receiver is `this`, as in Rails, not `base_class` — a projected
    // row that omits the inheritance column must stay on the receiver.
    const klass = discriminateClassForRecord(this, row);
    if (klass !== this) {
      return klass._instantiate(
        row,
        block as ((record: Base) => void) | undefined,
        columnTypes,
        overrideTypes,
      ) as InstanceType<T>;
    }

    // Ensure schema reflection has populated _attributeDefinitions with
    // adapter-resolved cast types before hydrating from the row —
    // otherwise writeFromDatabase falls back to ValueType and PG OID
    // casts (uuid/jsonb/hstore/inet/range) are lost. Sync path only
    // reads an already-populated schema cache; the preceding query
    // would have populated it.

    (ModelSchema.loadSchema as any).call(this);

    const hadOwnSuppress = Object.prototype.hasOwnProperty.call(
      this,
      "_suppressInitializeCallback",
    );
    const prevSuppress = this._suppressInitializeCallback;
    this._suppressInitializeCallback = true;
    const hadOwnAbstractSuppress = Object.prototype.hasOwnProperty.call(
      this,
      "_suppressAbstractCheck",
    );
    const prevAbstractSuppress = this._suppressAbstractCheck;
    this._suppressAbstractCheck = true;
    let record: InstanceType<T>;
    try {
      record = new this() as InstanceType<T>;
    } finally {
      if (hadOwnSuppress) {
        this._suppressInitializeCallback = prevSuppress;
      } else {
        delete (this as any)._suppressInitializeCallback;
      }
      if (hadOwnAbstractSuppress) {
        this._suppressAbstractCheck = prevAbstractSuppress;
      } else {
        delete (this as any)._suppressAbstractCheck;
      }
    }
    // Load DB values through deserialize (not cast) so encrypted types decrypt.
    // Extra/computed select columns aren't in the schema, so pass the result
    // set's column type (when the adapter reported one) to cast them — mirrors
    // Rails' `instantiate(record, column_types)` slice in find_by_sql /
    // JoinDependency#instantiate.
    for (const [key, value] of Object.entries(row)) {
      const override = overrideTypes?.[key];
      if (override) {
        record._attributes.overrideFromDatabase(key, value, override);
      } else {
        record._attributes.writeFromDatabase(key, value, columnTypes?.[key]);
      }
    }
    // A SELECT that projects only a subset of columns yields a row with just
    // those keys, so hasAttribute() must reflect what was loaded rather than
    // the full schema. Mirrors Rails' attributes_builder narrowing (see
    // narrowToProjectedColumns). Shared with the STI path in inheritance.ts.
    // `overrideTypes` is threaded so a schema column absent from the row adopts
    // the per-query override type when narrowed to uninitialized (builder.rb's
    // `else Attribute.uninitialized(name, type)` branch, where `type` resolves
    // via `additional_types.fetch(name, types[name])`).
    narrowToProjectedColumns(
      this as unknown as typeof Base,
      record as unknown as Base,
      row,
      overrideTypes,
    );
    defineDynamicSelectReaders(record as unknown as Base);
    record._newRecord = false;
    (record as any)._dirty.snapshot(record._attributes);
    record.changesApplied();
    // Apply strict_loading_by_default
    if (this._strictLoadingByDefault) {
      record._strictLoading = true;
    }
    // Rails' `init_with_attributes` yields the record to the loader block
    // (e.g. association inverse wiring) BEFORE running the find/initialize
    // callbacks, so an `after_find` hook already sees the inverse set.
    block?.(record);
    // strict:"sync" guarantees synchronous completion — void the settled result.
    void cbRunAfter(this.prototype, "find", record, { strict: "sync" });
    void cbRunAfter(this.prototype, "initialize", record, { strict: "sync" });
    return record;
  }

  // -- Instance state --

  _newRecord = true;
  _destroyed = false;
  // Mirrors ActiveRecord::Callbacks#destroy's `@_destroy_callback_already_called`
  // reentrancy guard: two records that `dependent: :destroy` each other would
  // otherwise recurse forever. Set while this record's destroy callback chain is
  // running so a cascade back into the same record short-circuits.
  _destroyCallbackAlreadyCalled = false;
  _readonly = false;
  _previouslyNewRecord = false;
  private _destroyedByAssociation: unknown = null;
  _transactionAction: "create" | "update" | "destroy" | undefined = undefined;
  // No Rails counterpart: Rails' strict_loading is tripped by `load_target`
  // alone. Trails keeps the counter only for `loadBelongsTo` / `loadHasOne`
  // (associations/instance-methods.ts) — explicit lazy loads the caller asked
  // for by name, which Rails has no method to express an exemption for.
  _strictLoadingBypassCount = 0;

  /**
   * Return the *loaded* cached association object for `name` — callers read
   * `.target` off it. This reads across the association-cache facets
   * (`_collectionProxies`, `_associationInstances`), which since RFC-0022's fold
   * are views onto one backing slot (`_associationCacheStore`) rather than
   * separate maps. The literal
   * `association_instance_get` analog (the built wrapper regardless of loaded
   * state) is `_associationInstances.get(name)`.
   *
   * The gate still matters: a has_many's canonical target lives on its
   * `CollectionProxy` (incl. in-memory inverse-seeded records on a
   * not-yet-loaded proxy) while the `HasManyAssociation` mirror in
   * `_associationInstances` is a stale secondary copy, so returning an
   * unloaded/empty wrapper here would surface the wrong store's `.target`.
   * Hence: a loaded-or-seeded proxy for collections; a loaded singular holder
   * (or ad-hoc seed, which exposes no `isCollection`) otherwise; `undefined`
   * for a miss or an unknown name.
   *
   * @internal
   */
  _associationCache(name: string): { target?: Base | Base[] | null } | undefined {
    // A loaded *singular* holder (has_one/belongs_to, incl. has_one :through) is
    // canonical and must win over any CollectionProxy that happens to share the
    // name — a singular reader stores the unwrapped single record in
    // `@association_cache`, whereas a proxy hydrated from that same holder boxes
    // it into a 1-element array. Checking the holder first keeps the singular
    // reader's target a single record on every preload path (RFC 0022).
    const instance = this._associationInstances.get(name) as
      | (AssociationInstance & {
          isLoaded?(): boolean;
          isCollection?(): boolean;
          target?: Base | Base[] | null;
        })
      | undefined;
    if (instance?.isLoaded?.() && instance.isCollection?.() !== true) return instance;
    const proxy = this._collectionProxies.get(name) as
      | { loaded?: boolean; target?: Base[] }
      | undefined;
    if (
      proxy &&
      (proxy.loaded === true || (Array.isArray(proxy.target) && proxy.target.length > 0))
    ) {
      return proxy;
    }
    // No proxy: the collection's canonical `@target` is the association object
    // itself (`CollectionAssociation#@target`,
    // collection_association.rb:284-296) — a proxy only reads through to that
    // same store — so an inverse-seeded target is visible here without anyone
    // having materialized the proxy first.
    if (
      instance?.isCollection?.() === true &&
      (instance.isLoaded?.() === true ||
        (Array.isArray(instance.target) && instance.target.length > 0))
    ) {
      return instance;
    }
    return undefined;
  }

  /**
   * Reset every per-record association cache in one place — the single
   * lifecycle seam mirroring Rails resetting `@association_cache = {}` (in
   * `init_internals`, and effectively on `reload`/`destroy`).
   *
   * RFC-0022 fold: the former maps are now `Map`-compatible facet views onto
   * one backing slot (`_associationCacheStore`), so a single `clear()` resets
   * all of them. Each facet still carries a genuinely distinct semantic that
   * Ruby's single Association object folds together internally:
   *   - `_associationInstances` is the canonical `@association_cache` analog
   *     (name → built `Association` wrapper; what `association_instance_get/set`
   *     and `association()` read/write). The holder also carries any
   *     preloaded/eager-loaded target (`isLoaded()` + `_loadedFromPreload`),
   *     including an eagerly-preloaded *nil* association.
   *   - `_collectionProxies` is the Trails-specific user-facing `CollectionProxy`
   *     layer (incl. in-memory inverse-seeded records on a not-yet-loaded proxy),
   *     which has no standalone Ruby analog — Rails' proxy lives *inside* the
   *     Association object.
   * See `association-cache.ts` and associations.ts `initInternals`.
   *
   * @internal
   */
  _resetAssociationCaches(): void {
    if (this._associationCacheStore === undefined) {
      // First call is `init_internals`' `@association_cache = {}`; later calls
      // (reload/destroy) clear in place so callers holding a facet view keep
      // seeing the record's cache.
      this._associationCacheStore = createAssociationCache();
      this._collectionProxies = this._associationCacheStore.proxies;
      this._associationInstances = this._associationCacheStore.instances as Map<
        string,
        AssociationInstance
      >;
      return;
    }
    this._associationCacheStore.clear();
  }

  constructor(attrs: Record<string, unknown> = {}, initBlock?: (record: Base) => void) {
    (new.target as typeof Base | undefined)?._requireConcreteClass();
    // Forbid/unwrap strong-params before anything inspects the attribute bag.
    // Mirrors the Rails construction path: ActiveModel::API#initialize skips
    // assignment for a nil bag (`assign_attributes(attributes) if attributes`
    // → blank record), and #assign_attributes returns before sanitizing an
    // empty one (`return if new_attributes.empty?`) — so a nil or empty (even
    // un-permitted) params object neither raises nor sanitizes. Only a
    // non-empty bag is checked.
    attrs ??= {};
    if (!isMassAssignmentEmpty(attrs)) {
      attrs = sanitizeForMassAssignment(attrs);
    }
    // STI dispatch at `new`: when the inheritance column names a subclass in
    // this class's own subtree, construct that subclass instead (Rails'
    // Inheritance::ClassMethods#new). Resolution is registry-safe — scoped to
    // this class's descendants, never the ambiguous global name map — so it
    // runs after sanitize (the un-permitted params case raises above first).
    // `_suppressStiNewDispatch` lets `becomes` build the exact target class
    // (Rails uses `klass.allocate`, which bypasses `new`'s STI dispatch) so a
    // record becomes(Topic) yields a Topic even when `topics.type` defaults to
    // a subclass (persistence_test.rb#test_becomes_default_sti_subclass). It
    // holds the suppressed class itself, not a boolean: statics inherit down the
    // hierarchy, so the identity check confines suppression to that exact class
    // and never leaks into a nested `new <subclass>()` during the window.
    if (
      (new.target as (typeof Base & { _suppressStiNewDispatch?: unknown }) | undefined)
        ?._suppressStiNewDispatch !== new.target
    ) {
      const stiTarget = subclassFromAttributesForNew(new.target, attrs);
      if (stiTarget && stiTarget !== new.target) {
        return new stiTarget(attrs, initBlock);
      }
    }
    // Split out constructor-form association values (e.g. `new Owner({items:
    // [...]})`) so super() never sees them as plain attributes. Dispatched
    // after super() so the association proxy exists on `this`.
    let assocPending = _extractAssociationAttrs(new.target, attrs);
    if (assocPending) attrs = assocPending.rest;
    if (hasMultiparameterKeys(attrs)) {
      // Mirrors Rails: Base#initialize calls assign_attributes which handles
      // multiparameter keys. We split: regular attrs go through the Model
      // constructor for setup, mp attrs are assembled after.
      //
      // Suppress after_initialize so it fires after ALL attrs are present
      // (not just the regular subset), and re-snapshot dirty state so mp
      // attrs appear clean (part of initial construction, not changes).
      const ctor = new.target;
      const suppressor = ctor as typeof ctor & { _suppressInitializeCallback?: boolean };
      const hadOwnSuppressor = Object.prototype.hasOwnProperty.call(
        suppressor,
        "_suppressInitializeCallback",
      );
      const wasSuppressed = suppressor._suppressInitializeCallback;
      suppressor._suppressInitializeCallback = true;
      const { multiparams, regular } = extractMultiparameterCallstack(attrs);
      // Same deferral as the non-multiparameter branch: a composite-PK `id` or
      // nested-attribute key sitting alongside multiparameter keys must not
      // dispatch its setter inside super() before `initInternals` runs.
      const regularForSuper = _withoutDeferredConstructionKeys(ctor, regular);
      try {
        super(regularForSuper);
      } finally {
        // Always restore the flag even if super() throws, so later instances
        // on this class still fire after_initialize normally.
        if (hadOwnSuppressor) {
          suppressor._suppressInitializeCallback = wasSuppressed;
        } else {
          delete (suppressor as { _suppressInitializeCallback?: boolean })
            ._suppressInitializeCallback;
        }
      }
      _applyCompositePrimaryKey(this as unknown as Base, ctor, attrs);
      executeMultiparameterAssignment(this as any, multiparams);
      // Re-snapshot so mp attrs are part of the initial clean state.
      (this as any)._dirty.snapshot((this as any)._attributes);
      if (!wasSuppressed) {
        inheritanceInitializeInternalsCallback.call(this as any);
        // Guard before allocating the Set — the no-scope case is the hot path.
        if (_shouldApplyScopeAttributes(ctor)) {
          _applyScopeAttributes(
            ctor,
            this as any,
            new Set([...Object.keys(multiparams), ...Object.keys(regular)]),
          );
        }
        // Re-snapshot so internals writes are part of the initial clean state.
        (this as any)._dirty.snapshot((this as any)._attributes);
        if (assocPending) {
          _dispatchAssociationAttrs(this as unknown as Base, assocPending.assocs);
          // belongsTo writers may write the owner FK; re-snapshot so
          // constructor-form association assignment lands in the clean
          // baseline, matching regular constructor attrs.
          (this as any)._dirty.snapshot((this as any)._attributes);
          assocPending = null;
        }
        _reinstateConstructorDirtiness(this as any, ctor as any);
        // Rails yields the constructor block (Core#initialize, core.rb:479)
        // before after_initialize — used by association `build_record` to run
        // `initialize_attributes` (scope FK + set_inverse_instance) first.
        initBlock?.(this as unknown as Base);
        // strict:"sync" guarantees synchronous completion -- void the settled result.
        void cbRunAfter(ctor.prototype, "initialize", this, { strict: "sync" });
      }
    } else {
      // For the regular (non-multiparameter) path, mirror the multiparameter
      // pattern: suppress after_initialize during super() so we can call
      // initialize_internals_callback first, then fire after_initialize.
      // This matches Rails' Core#initialize order:
      //   init_internals → initialize_internals_callback → super → after_initialize
      const ctor2 = new.target;
      // Separate store accessor keys (virtual, backed by a store column rather
      // than a direct DB column) from regular column attrs. Store accessor attrs
      // are assigned AFTER the clean re-snapshot so they appear as dirty for new
      // records — matching Rails' new-record dirty semantics where assign_attributes
      // runs after init_internals / initialize_internals_callback.
      const _storeKeys = new Set(Object.values(ctor2.storedAttributes()).flat());
      const _storeAttrs: Record<string, unknown> = {};
      let attrsForSuper = attrs;
      if (_storeKeys.size > 0) {
        for (const [k, v] of Object.entries(attrs)) {
          if (_storeKeys.has(k)) _storeAttrs[k] = v;
        }
        if (Object.keys(_storeAttrs).length > 0) {
          attrsForSuper = Object.fromEntries(
            Object.entries(attrs).filter(([k]) => !_storeKeys.has(k)),
          );
        }
      }
      // Hold the composite-PK `id` out of super()'s setter-dispatching loop:
      // `id=` touches key columns that aren't wired until after super()
      // (`initInternals`). Re-dispatched post-super by
      // `_applyCompositePrimaryKey`.
      attrsForSuper = _withoutDeferredConstructionKeys(ctor2, attrsForSuper);
      const suppressor2 = ctor2 as typeof ctor2 & { _suppressInitializeCallback?: boolean };
      const hadOwn2 = Object.prototype.hasOwnProperty.call(
        suppressor2,
        "_suppressInitializeCallback",
      );
      const wasSuppressed2 = suppressor2._suppressInitializeCallback;
      suppressor2._suppressInitializeCallback = true;
      try {
        super(attrsForSuper);
      } finally {
        if (hadOwn2) {
          suppressor2._suppressInitializeCallback = wasSuppressed2;
        } else {
          delete (suppressor2 as { _suppressInitializeCallback?: boolean })
            ._suppressInitializeCallback;
        }
      }
      _applyCompositePrimaryKey(this as unknown as Base, ctor2, attrs);
      if (!wasSuppressed2) {
        inheritanceInitializeInternalsCallback.call(this as any);
        // Guard before allocating the Set — the no-scope case is the hot path.
        if (_shouldApplyScopeAttributes(ctor2)) {
          _applyScopeAttributes(ctor2, this as any, new Set(Object.keys(attrs)));
        }
        // Re-snapshot so internals writes are part of the initial clean state.
        (this as any)._dirty.snapshot((this as any)._attributes);
        // Assign store accessor keys after the clean baseline so they appear
        // as dirty on new records (mirrors Rails: new-record attrs are changed
        // relative to nil). Dispatch through the prototype setter so the write
        // lands in the store hash rather than a standalone attribute slot.
        for (const [k, v] of Object.entries(_storeAttrs)) {
          let proto = Object.getPrototypeOf(this);
          let dispatched = false;
          while (proto !== null && proto !== Object.prototype) {
            const desc = Object.getOwnPropertyDescriptor(proto, k);
            if (desc?.set) {
              (desc.set as (val: unknown) => void).call(this, v);
              dispatched = true;
              break;
            }
            proto = Object.getPrototypeOf(proto);
          }
          if (!dispatched) (this as any)._writeAttribute(k, v);
        }
        if (assocPending) {
          _dispatchAssociationAttrs(this as unknown as Base, assocPending.assocs);
          // belongsTo writers may write the owner FK; re-snapshot so
          // constructor-form association assignment lands in the clean
          // baseline, matching regular constructor attrs.
          (this as any)._dirty.snapshot((this as any)._attributes);
          assocPending = null;
        }
        _reinstateConstructorDirtiness(this as any, ctor2 as any);
        // Rails yields the constructor block (Core#initialize, core.rb:479)
        // before after_initialize — used by association `build_record` to run
        // `initialize_attributes` (scope FK + set_inverse_instance) first.
        initBlock?.(this as unknown as Base);
        // strict:"sync" guarantees synchronous completion -- void the settled result.
        void cbRunAfter(ctor2.prototype, "initialize", this, { strict: "sync" });
      }
    }
    // Suppressed-callback fallback: parent caller fires after_initialize, so
    // we still dispatch first to keep Rails' "assign → after_initialize" order.
    if (assocPending) {
      _dispatchAssociationAttrs(this as unknown as Base, assocPending.assocs);
      // Match the dispatch sites above: re-snapshot so any belongsTo FK
      // writes from the association writers don't leave construction in a
      // dirty state.
      (this as any)._dirty.snapshot((this as any)._attributes);
    }
  }

  // --- Persistence instance predicates (wired via include() after class body) ---
  declare isNewRecord: typeof _Persistence.isNewRecord;
  declare isPersisted: typeof _Persistence.isPersisted;
  declare isDestroyed: typeof _Persistence.isDestroyed;
  declare isPreviouslyNewRecord: typeof _Persistence.isPreviouslyNewRecord;
  declare isPreviouslyPersisted: typeof _Persistence.isPreviouslyPersisted;

  // --- Core instance methods (wired via include() after class body) ---
  declare isReadonly: typeof _Core.isReadonly;
  declare readonlyBang: typeof _Core.readonlyBang;
  declare isStrictLoading: typeof _Core.isStrictLoading;
  declare strictLoadingBang: typeof _Core.strictLoadingBang;
  declare strictLoadingMode: typeof _Core.strictLoadingMode;
  declare isStrictLoadingAll: typeof _Core.isStrictLoadingAll;
  declare isStrictLoadingNPlusOneOnly: typeof _Core.isStrictLoadingNPlusOneOnly;
  declare isFrozen: typeof _Core.isFrozen;
  declare freeze: typeof _Core.freeze;

  /**
   * Get the association that triggered the destruction of this record (if any).
   *
   * Mirrors: ActiveRecord::Base#destroyed_by_association
   */
  get destroyedByAssociation(): unknown {
    return this._destroyedByAssociation;
  }

  /**
   * Set the association that triggered the destruction of this record.
   *
   * Mirrors: ActiveRecord::Base#destroyed_by_association=
   */
  set destroyedByAssociation(assoc: unknown) {
    this._destroyedByAssociation = assoc;
  }

  declare cacheKey: () => string;
  declare cacheKeyWithVersion: () => string;
  declare cacheVersion: () => string | null;

  static toParam(): string;
  static toParam(methodName: string): void;
  static toParam(methodName?: string): string | void {
    return _toParamClass.call(this, methodName);
  }

  declare static collectionCacheKey: typeof _collectionCacheKey;

  declare writeAttribute: typeof _writeAttributeMethod;

  declare id: PrimaryKeyValue;

  // increment/decrement/toggle + bang variants wired via include() below;
  // signatures live on the merged `interface Base` at the bottom of this file.

  /**
   * Register a uniqueness validation.
   *
   * Mirrors: validates uniqueness: true
   */
  declare static validatesUniqueness: typeof _Validations.validatesUniqueness;

  /**
   * Register uniqueness validations for one or more attributes.
   *
   * Mirrors: ActiveRecord::Validations::ClassMethods#validates_uniqueness_of
   */
  declare static validatesUniquenessOf: typeof _Validations.validatesUniquenessOf;

  // save / saveBang extracted to persistence.ts; wired via include() below.

  /**
   * The persistence half of save — runs callbacks, performs INSERT or UPDATE,
   * autosaves children, and touches parents. Called by save() inside a
   * transaction wrapper.
   *
   * Mirrors: ActiveRecord::Persistence#save (the super that Transactions#save calls)
   */
  private async _createOrUpdate(block?: (record: this) => void): Promise<boolean> {
    const ctor = this.constructor as typeof Base;
    let saved = false;
    let wasNewRecord = false;

    // Rails: Callbacks#create_or_update wraps super in run_callbacks(:save) { ... }.
    // Around_save callbacks correctly wrap the _createRecord/_updateRecord calls which
    // themselves run their own run_callbacks(:create/:update) { ... } chains.
    const saveOk = await cbRunAll(ctor.prototype, "save", this, async () => {
      wasNewRecord = this._newRecord;
      if (wasNewRecord) {
        const createOk = await this._createRecord(block);
        if (createOk) saved = true;
        else saved = false;
      } else {
        const updateOk = await this._updateRecord(block);
        if (updateOk) saved = true;
        else saved = false;
      }

      if (saved) {
        this._transactionAction = wasNewRecord ? "create" : "update";
        (this as any)._newRecordBeforeLastCommit = wasNewRecord;
        // `@_trigger_update_callback` is set inside `_updateRecord` from the
        // UPDATE's affected-row count (Rails persistence.rb:900-909), so it is
        // NOT forced here: a real update whose WHERE matched zero rows (e.g. a
        // separate instance deleted the row earlier in the transaction) must
        // leave the flag false so after_update_commit doesn't fire.
      }

      // Rails Callbacks#create_or_update is `_run_save_callbacks { super }`,
      // where `super` (Persistence#create_or_update) returns `result != false`.
      // Threading that boolean back as the run_callbacks block value lets the
      // after-model-callback `value != false` conditional skip after_save when
      // an inner before_create/before_update chain halted via throw(:abort).
      return saved;
    });

    if (!saveOk) return false;

    if (saved) {
      await flushPendingReplaces(this);
    }

    return saved;
  }

  // Mirrors ActiveRecord::Timestamp's @_touch_record ivar (timestamp.rb:104),
  // set by Timestamp#create_or_update and read by record_update_timestamps.
  private _touchRecord: boolean | null = null;
  private _instanceRecordTimestamps: boolean | null = null;

  // Mirrors: ActiveRecord class_attribute :record_timestamps instance-level override
  get recordTimestamps(): boolean {
    return this._instanceRecordTimestamps ?? (this.constructor as typeof Base).recordTimestamps;
  }

  set recordTimestamps(value: boolean) {
    this._instanceRecordTimestamps = value;
  }

  // update / updateBang extracted to persistence.ts; wired via include() below.

  // destroy / destroyBang extracted to persistence.ts; wired via include() below.

  /**
   * The persistence half of destroy — runs callbacks, performs DELETE,
   * updates counter caches, and touches parents. Called by destroy() inside
   * a transaction wrapper.
   *
   * Mirrors: ActiveRecord::Persistence#destroy (the super that Transactions#destroy calls)
   */
  /**
   * Materialize this record's unloaded `belongs_to` targets before the destroy
   * callback chain runs, so a sync `before_destroy`/`around_destroy` callback
   * reading the association sees a loaded record (matching Rails' lazy
   * synchronous query) rather than trails' async-reader Promise.
   *
   * Scoped to classes that actually register a before/around destroy callback,
   * and further narrowed to the `belongs_to` targets whose association name
   * appears in the callback source — mirroring Rails, which lazily loads only
   * the associations a callback dereferences and issues no query for the rest.
   * When a before/around destroy callback is an object/method filter whose body
   * cannot be introspected, we conservatively load every `belongs_to` (we can't
   * tell what it reads). A same-FK sibling (e.g. Account#firm and
   * Account#unautosavedFirm share `firm_id`) referenced in the source is loaded
   * too; the extra read is side-effect-free and resolves to the same owner row.
   *
   * Loading is best-effort: a `belongs_to` whose target class is unregistered or
   * whose row is missing must not abort the destroy (the callback may never read
   * it). On a load failure we resolve the association to `null` rather than
   * leaving it unloaded, so a sync callback that *does* read it sees `null` and
   * not trails' async-reader Promise — keeping the bare `if (record.parent)`
   * guard safe even when the preload could not materialize the parent. Any load
   * that runs inside an open transaction is isolated in its own savepoint: a
   * doomed query (e.g. a `belongs_to ..., primary_key:` at a non-existent column
   * like `tag_with_primary_key`) throwing here would otherwise abort the whole
   * PostgreSQL transaction (25P02), and the surrounding `catch` swallowing the
   * JS error cannot undo that abort. Narrowing removes the *per-association*
   * savepoint churn PR #4792 paid on every `belongs_to` — only the (usually one)
   * association the callback actually names is loaded, so an unread doomed query
   * is never issued in the first place.
   *
   * The scan resolves reads reached through the record's own helper methods, not
   * just those inline in the registered filter, by expanding the callback source
   * with the source of any model-defined method it references (see
   * `expandCallbackSourcesWithHelpers`). This mirrors Rails resolving
   * associations by ordinary method dispatch at any call depth.
   *
   * @internal
   */
  private async _preloadBelongsToForDestroyCallbacks(): Promise<void> {
    const ctor = this.constructor as typeof Base;
    if (typeof (this as any).association !== "function") return;
    const { sources, opaque } = beforeOrAroundCallbackSources(ctor.prototype, "destroy");
    if (!opaque && sources.length === 0) return;
    const expanded = opaque ? sources : expandCallbackSourcesWithHelpers(sources, ctor, this);
    const useSavepoint = _currentTransactionPublic().isOpen();
    for (const ref of ctor.reflectOnAllAssociations("belongsTo")) {
      // Narrow to associations the callback names (unless an opaque callback
      // forces loading all): Rails only queries the targets it dereferences.
      if (!opaque && !referencesAssociationName(expanded, ref.name)) continue;
      let assoc: any;
      try {
        assoc = (this as any).association(ref.name);
        if (!assoc || assoc.isLoaded?.()) continue;
        if (useSavepoint) {
          await _transaction(ctor, () => assoc.loadTarget(), { requiresNew: true });
        } else {
          await assoc.loadTarget();
        }
      } catch {
        // An unregistered target class, missing FK row, strict-loading
        // violation, or transient DB error must not abort the destroy. Resolve
        // the association to `null` so a sync callback that reads it sees `null`
        // rather than trails' async-reader Promise.
        assoc?.setTarget?.(null);
      }
    }
  }

  /**
   * Resolve `belongs_to ..., default:` blocks before validation runs.
   *
   * Rails registers the default on before_validation
   * (associations/builder/belongs_to.rb#add_default_callbacks) so a required
   * association's presence validation sees the defaulted foreign key. A default
   * block may be async (e.g. `() => Developer.first()`); on the save path its
   * awaited resolution runs here — a pre-validation pass invoked from `save` —
   * before the chain, so the FK is set once and marked applied. The
   * before_validation callback the builder registers still covers the
   * standalone `valid?` path.
   *
   * @internal
   */
  private async _runBelongsToDefaults(): Promise<void> {
    const ctor = this.constructor as typeof Base;
    if (typeof (this as any).association !== "function") return;
    for (const ref of ctor.reflectOnAllAssociations("belongsTo")) {
      const block = (ref as any).options?.default;
      if (block == null) continue;
      const assoc = (this as any).association(ref.name);
      if (typeof assoc?.default === "function") {
        await assoc.default(block);
      }
    }
  }

  private async _destroyRow(): Promise<boolean> {
    const ctor = this.constructor as typeof Base;

    // A sync `before_destroy` callback that reads an unloaded `belongs_to`
    // cannot await trails' async association reader, so the reader surfaces a
    // Promise and the callback's `if record.parent` guard sees a truthy
    // Promise (or skips it). Rails issues the lazy synchronous query inside the
    // callback. We approximate that by materializing the record's `belongs_to`
    // targets here — before the destroy callback chain runs — so the reader
    // returns the loaded record synchronously. The dependent-destroy cascade
    // has its own inverse preload (`preloadDestroyInverseBelongsTo`); this is
    // the direct-destroy counterpart.
    await this._preloadBelongsToForDestroyCallbacks();

    let didDelete = false;
    const destroyResult = await cbRunAll(ctor.prototype, "destroy", this, async () => {
      // Mirrors Rails Persistence#destroy: `destroy_associations` runs inside the
      // destroy callback chain — after before_destroy, before the row delete.
      // The base hook is a no-op; HABTM overrides it to clean up join rows.
      await (this as any).destroyAssociations();

      const table = ctor.arelTable;
      // Mirrors Rails Persistence#destroy: `@_trigger_destroy_callback ||=
      // persisted? && destroy_row > 0` (persistence.rb:457). The DELETE runs
      // iff the record is persisted — a new record (even one with an assigned
      // primary key) runs callbacks/freeze but emits no DELETE. When persisted,
      // `destroy_row` always calls `_delete_record(_query_constraints_hash)`
      // (persistence.rb:866-871) with no id-present guard, so query-constraints
      // models (and nil-in-database PKs) still issue the DELETE.
      if (this.isPersisted()) {
        // Mirrors Rails Persistence#destroy → _delete_record(_query_constraints_hash):
        // WHERE targets each query-constraint column's `*_in_database` value (the
        // primary key keyed to `id_in_database` when no query_constraints are
        // declared), so destroying a record whose primary key was mutated in
        // memory still removes the originally loaded row.
        const dm = new DeleteManager()
          .from(table)
          .where(
            ctor._buildQueryConstraintsWhereNode(
              _Persistence._queryConstraintsHash.call(this as any),
            ),
          );
        const lockCol = ctor.lockingColumn;
        if (ctor.lockingEnabled) {
          // Mirrors Rails _lock_value_for_database: if user explicitly changed lock_version,
          // use valueForDatabase (user-set value as expected DB version → stale if mismatch).
          // Otherwise use originalValueForDatabase() so NULL-in-DB → IS NULL.
          const lockAttr = this._attributes.getAttribute(lockCol);
          const lockWhereValue = this.willSaveChangeToAttribute(lockCol)
            ? lockAttr.valueForDatabase
            : lockAttr.originalValueForDatabase();
          if (lockWhereValue == null) {
            dm.where(table.get(lockCol).eq(null));
          } else {
            dm.where(table.get(lockCol).eq(Number(lockWhereValue) || 0));
          }
        }
        _Persistence.applyDefaultAndGlobalConstraints(dm as any, ctor);

        // Thread the `withConnection` connection rather than the deprecated
        // `.connection` getter (see `_createRecord` in persistence.ts); resolved here, at the
        // actual DELETE, so a connectionless model never touches `.connection`.
        const adapter = ConnectionHandling.threadedConnectionFor(ctor) ?? ctor.connection;
        const [deleteSql, deleteBinds] = adapter.toSqlAndBinds(dm);
        const affected = await adapter.execDelete(deleteSql, `${ctor.name} Destroy`, deleteBinds);
        if (ctor.lockingEnabled && affected !== 1) {
          throw new StaleObjectError(this, "destroy");
        }
        // Mirrors Rails CounterCache#destroy_row, which wraps
        // Persistence#destroy_row and decrements the belongs_to counter caches
        // from the affected-row count — before `@destroyed = true`, so the
        // owner is still `persisted?` when `decrement_counters` runs.
        didDelete = (await CounterCache.destroyRow.call(this as any, async () => affected)) > 0;
      }

      this._destroyed = true;
      this._previouslyNewRecord = false;
      // Rails' destroy ends with a bare `freeze` (persistence.rb) — it does
      // NOT touch `@association_cache`. Delegate to `freeze` for the
      // clone-and-freeze semantics on `_attributes` and leave the association
      // caches intact: loaded associations stay readable on a destroyed record
      // exactly as in Rails (and as `Core#freeze` already documents).
      this.freeze();
      // Rails' `_run_destroy_callbacks { super }` block value is truthy; only a
      // halted chain yields false (run_callbacks returns env.value).
      return true;
    });

    if (!destroyResult) return false;

    if (didDelete) {
      this._transactionAction = "destroy";
      (this as any)._triggerDestroyCallback = true;
      (this as any)._newRecordBeforeLastCommit = false;
      (this as any)._triggerUpdateCallback = false;
    }

    return true;
  }

  // delete extracted to persistence.ts; wired via include() below.

  /**
   * Delete record(s) by primary key without callbacks / validations.
   *
   * Mirrors: ActiveRecord::Base.delete — Rails defines this as
   * `delete_by(primary_key => id_or_array)`, so single ids, arrays of
   * ids, `nil`, and empty arrays all route through the same where-builder.
   * Composite primary keys are supported via `where(cols, tuples)` for
   * both single-tuple and array-of-tuples inputs, which compiles to an
   * OR-of-AND predicate — not a per-column IN cross-product.
   */
  static async delete(id: unknown): Promise<number> {
    if (id === null || id === undefined || (Array.isArray(id) && id.length === 0)) {
      return 0;
    }
    const pk = this.primaryKey;
    if (Array.isArray(pk)) {
      // Composite PK — mirror find()'s detection:
      //   - array-of-arrays → multiple tuples
      //   - single array    → one tuple
      if (!Array.isArray(id)) {
        throw argumentError(
          `${this.name}.delete expects a tuple (or array of tuples) matching the composite primary key [${pk.join(", ")}]`,
        );
      }
      const arr = id as unknown[];
      const tuples: unknown[][] = Array.isArray(arr[0]) ? (arr as unknown[][]) : [arr];
      for (const tuple of tuples) {
        if (!Array.isArray(tuple) || tuple.length !== pk.length) {
          throw argumentError(
            `${this.name}.delete tuple length ${Array.isArray(tuple) ? tuple.length : "<scalar>"} does not match composite primary key arity ${pk.length}`,
          );
        }
      }
      // where(cols, tuples) compiles to OR-of-AND (`(pk1=v1 AND pk2=v2) OR ...`)
      // via PredicateBuilder.buildComposite, so multi-tuple deletes produce
      // correct SQL instead of a cross-product of per-column IN lists.
      return this.all().where(pk, tuples).deleteAll();
    }
    // Single-column PK — where({[pk]: id}) handles scalar and array alike
    // (predicate builder emits `=` or `IN(...)` as appropriate).
    return this.all()
      .where({ [pk]: id as unknown })
      .deleteAll();
  }

  // reload extracted to persistence.ts; wired via include() below.

  /**
   * Reload the record with a pessimistic lock (SELECT ... FOR UPDATE), and
   * `with_lock` wraps a block in a transaction that first locks the record.
   *
   * Mirrors: ActiveRecord::Locking::Pessimistic#lock! and #with_lock.
   * Wired via include() after class. The module functions use
   * `<T extends Base>(this: T, ...)` generics so subclass instances see
   * `this`-polymorphic types — `user.lockBang()` returns `Promise<User>`
   * (when `user: User`), and `user.withLock(cb)` gives `cb` a `User` record.
   */
  declare lockBang: typeof LockingPessimistic.lockBang;
  declare withLock: typeof LockingPessimistic.withLock;

  declare toParam: () => string | null;

  declare inspect: () => string;
  declare prettyPrint: typeof _Core.prettyPrint;
  declare attributeForInspect: (attr: string) => string;

  // slice extracted to persistence.ts.

  /**
   * Return a GlobalID for this record.
   *
   * Mirrors: ActiveRecord::Base#to_gid — alias of to_global_id; returns a
   * GlobalID instance. Requires setApp() from \@blazetrails/globalid to be
   * called first.
   */
  toGid(
    options?: import("@blazetrails/globalid").GlobalIDOptions,
  ): import("@blazetrails/globalid").GlobalID {
    return this.toGlobalId(options);
  }

  /**
   * Return a SignedGlobalID for this record.
   * Uses the model's `signedIdVerifier` (same secret as signed IDs).
   *
   * Mirrors: ActiveRecord::Base#to_sgid
   */
  toSgid(options?: ToSgidOptions): SignedGlobalIDType {
    const verifier = (this.constructor as typeof Base).signedIdVerifier;
    return _SignedGlobalIDCtor.create(this as GlobalIDModel, { ...options, verifier });
  }

  /**
   * Return the signed GlobalID token string for this record.
   *
   * Mirrors: ActiveRecord::Base#to_sgid_param
   */
  toSgidParam(options?: Parameters<Base["toSgid"]>[0]): string {
    return this.toSgid(options).toParam();
  }

  /** Mirrors: Identification#to_global_id — returns a GlobalID instance. */
  toGlobalId(
    options?: import("@blazetrails/globalid").GlobalIDOptions,
  ): import("@blazetrails/globalid").GlobalID {
    return _GlobalIDCtor.create(this as unknown as GlobalIDModel, options);
  }

  /** Mirrors: Identification#to_gid_param — base64url-encoded GID. */
  toGidParam(options?: import("@blazetrails/globalid").GlobalIDOptions): string {
    return this.toGlobalId(options).toParam();
  }

  /** Mirrors: Identification#to_signed_global_id — alias of toSgid. */
  toSignedGlobalId(options?: Parameters<Base["toSgid"]>[0]): SignedGlobalIDType {
    return this.toSgid(options);
  }

  /**
   * Find a record by its GlobalID URI string (or GlobalID instance).
   * Returns null if the GID is invalid, the model class isn't registered, or
   * the `only:` filter rejects it. If the record doesn't exist, `find`
   * raises (Rails parity: RecordNotFound).
   *
   * NOT Rails: `find_global_id` exists nowhere in Rails or globalid — apps call
   * `GlobalID::Locator.locate` directly, and globalid's railtie injects only the
   * instance-side `GlobalID::Identification`. Left deliberately un-suppressed in
   * `parity:api:extra` so it keeps reporting as extra surface until it is removed or a
   * caller justifies it (tasks 0023 globalid-model-side-finders-are-uncalled-
   * trails-invention).
   */
  static findGlobalId(
    input: string | import("@blazetrails/globalid").GlobalID,
    options?: import("@blazetrails/globalid").LocateOptions,
  ): Promise<unknown | null> {
    return _Locator.locate(input, options);
  }

  /**
   * Signed counterpart of {@link findGlobalId} — uses signedIdVerifier(this).
   *
   * NOT Rails: same invention as {@link findGlobalId}, carrying the verifier
   * this model signs with; Rails apps call `GlobalID::Locator.locate_signed`.
   */
  static async findSignedGlobalId(
    input: string | _SignedGlobalIDType,
    options?: Omit<import("@blazetrails/globalid").LocateSignedOptions, "verifier">,
  ): Promise<unknown | null> {
    const verifier = this.signedIdVerifier;
    return _Locator.locateSigned(input, { ...options, verifier });
  }

  /**
   * Raising counterpart of {@link findSignedGlobalId} — throws on miss.
   *
   * NOT Rails: same invention as {@link findGlobalId}, in the bang shape.
   */
  static async findSignedGlobalIdBang(
    input: string | _SignedGlobalIDType,
    options?: Omit<import("@blazetrails/globalid").LocateSignedOptions, "verifier">,
  ): Promise<unknown> {
    const found = await this.findSignedGlobalId(input, options);
    if (found == null) throw new RecordNotFound("Couldn't find SignedGlobalID");
    return found;
  }

  // valuesAt / assignAttributes extracted to persistence.ts.

  /**
   * Update the updated_at timestamp (and optionally other timestamp
   * columns) without changing other attributes. Skips validations
   * and callbacks.
   *
   * Mirrors: ActiveRecord::Base#touch. Wired via include() after class.
   */
  declare touch: typeof TouchLater.touch;
  declare touchLater: typeof TouchLater.touchLater;
  declare beforeCommittedBang: typeof TouchLater.beforeCommittedBang;

  // updateAttribute / updateColumn / updateColumns / dup / clone / becomes
  // extracted to persistence.ts; wired via include() below.

  declare hasAttribute: (name: string) => boolean;
  declare attributePresent: (name: string) => boolean;
  declare readAttributeBeforeTypeCast: (name: string) => unknown;
  declare attributesBeforeTypeCast: () => Record<string, unknown>;
  declare columnForAttribute: (name: string) => any;
  declare toKey: () => unknown[] | null;
  declare accessedFields: () => string[];
  declare queryAttribute: (name: string) => boolean;
  declare _queryAttribute: (name: string) => boolean;
  declare readAttribute: (name: string, block?: (name: string) => unknown) => unknown;
  /** Mirrors: ActiveRecord::AttributeMethods#[] (attribute_methods.rb:415) */
  declare get: (attrName: string) => unknown;
  /** Mirrors: ActiveRecord::AttributeMethods#[]= (attribute_methods.rb:428) */
  declare set: (attrName: string, value: unknown) => void;
  /** @internal */
  declare _readAttribute: (name: string) => unknown;
  declare _writeAttribute: (name: string, value: unknown) => void;
  /** @internal */
  declare readStoreAttribute: (storeAttribute: string, key: string) => unknown;
  /** @internal */
  declare writeStoreAttribute: (storeAttribute: string, key: string, value: unknown) => void;
  /** @internal */
  declare storeAccessorFor: (storeAttribute: string) => typeof import("./store.js").HashAccessor;

  attributeNames(): string[] {
    return _attributeNames.call(this as any);
  }

  static attributeNames(): string[] {
    return AttributeMethodsClassMethods.attributeNames.call(this);
  }

  /**
   * Mirrors: ActiveRecord::AttributeMethods::ClassMethods#_has_attribute?
   * (attribute_methods.rb:260-262).
   *
   * @internal Rails-private helper.
   */
  static _hasAttribute(attrName: string): boolean {
    return AttributeMethodsClassMethods._hasAttribute.call(this as never, attrName);
  }

  /**
   * Return a hash of attribute name to default value.
   *
   * Mirrors: ActiveRecord::Base.column_defaults
   */
  static get columnDefaults(): Record<string, unknown> {
    return ModelSchema.columnDefaults.call(this as any);
  }

  // -- Strict loading class-level default --
  //
  // Off by default, matching Rails
  // (`config.active_record.strict_loading_by_default` is false unless
  // explicitly enabled). Opt in per-class with
  // `Post.strictLoadingByDefault = true`, per-instance with
  // `record.strictLoadingBang()`, or globally with
  // `Base.strictLoadingByDefault = true`.
  //
  // Phase R.3 makes strict loading LOUD on sync singular-association
  // reader access: when enabled, `post.author` on an unloaded
  // association throws `StrictLoadingViolationError` — pointing users
  // at `post.loadBelongsTo("author")` or `Post.includes("author")`
  // instead of silently returning null.
  static _strictLoadingByDefault = false;

  /**
   * When true, all records loaded from this model will have strict_loading enabled.
   *
   * Mirrors: ActiveRecord::Base.strict_loading_by_default
   */
  static get strictLoadingByDefault(): boolean {
    return this._strictLoadingByDefault;
  }

  static set strictLoadingByDefault(value: boolean) {
    this._strictLoadingByDefault = value;
  }

  // -- Strict loading mode (per-model) --
  //
  // Selects strictness when strict loading is on: "all" (default, raises on
  // any lazily-loaded association) or "n_plus_one_only" (raises only on
  // associations that would lead to N+1 queries). Set per-class with
  // `Post.strictLoadingMode = "n_plus_one_only"`; subclasses inherit via JS
  // prototype lookup and may override.
  //
  // Mirrors: ActiveRecord::Base — `class_attribute :strict_loading_mode,
  // instance_accessor: false, default: :all` in core.rb.
  static _strictLoadingMode: _Core.StrictLoadingMode = "all";

  /** Mirrors: ActiveRecord::Base.strict_loading_mode */
  static get strictLoadingMode(): _Core.StrictLoadingMode {
    return this._strictLoadingMode;
  }

  static set strictLoadingMode(value: _Core.StrictLoadingMode) {
    this._strictLoadingMode = value;
  }

  // Whether the STI inheritance column stores the full namespaced class name
  // ("Namespaced::Post") or the demodulized bare name ("Post"). Subclasses
  // inherit via JS prototype lookup and may override per-class.
  //
  // Mirrors: ActiveRecord::ModelSchema — `class_attribute :store_full_sti_class,
  // instance_writer: false, default: true`.
  static _storeFullStiClass = true;

  /** Mirrors: ActiveRecord::Base.store_full_sti_class */
  static get storeFullStiClass(): boolean {
    return this._storeFullStiClass;
  }

  static set storeFullStiClass(value: boolean) {
    this._storeFullStiClass = value;
  }

  // Whether polymorphic `*_type` columns store the full namespaced class name
  // or the demodulized bare name. Also gates `sti_name` together with
  // `storeFullStiClass`. Subclasses inherit via JS prototype lookup.
  //
  // Mirrors: ActiveRecord::ModelSchema — `class_attribute
  // :store_full_class_name, instance_writer: false, default: true`.
  static _storeFullClassName = true;

  /** Mirrors: ActiveRecord::Base.store_full_class_name */
  static get storeFullClassName(): boolean {
    return this._storeFullClassName;
  }

  static set storeFullClassName(value: boolean) {
    this._storeFullClassName = value;
  }

  // When the same persisted row participates in one transaction via multiple
  // instances, controls which instance runs the transactional commit
  // callbacks: `true` keeps the FIRST saved instance, `false` the last.
  // Subclasses inherit via JS prototype lookup.
  //
  // Mirrors: ActiveRecord::Core — `class_attribute
  // :run_commit_callbacks_on_first_saved_instances_in_transaction,
  // instance_accessor: false, default: true` (core.rb:96).
  static _runCommitCallbacksOnFirstSavedInstancesInTransaction = true;

  /** Mirrors: ActiveRecord::Base.run_commit_callbacks_on_first_saved_instances_in_transaction */
  static get runCommitCallbacksOnFirstSavedInstancesInTransaction(): boolean {
    return this._runCommitCallbacksOnFirstSavedInstancesInTransaction;
  }

  static set runCommitCallbacksOnFirstSavedInstancesInTransaction(value: boolean) {
    this._runCommitCallbacksOnFirstSavedInstancesInTransaction = value;
  }

  // -- Core config accessors (ActiveRecord::Core class_attributes) --
  //
  // Each mirrors a `class_attribute` declared in core.rb. trails realizes the
  // backing behavior elsewhere (or matches the Rails default), so these are
  // plain settable class fields the existing call sites already read.

  // The default ConnectionHandler. Rails layers an IsolatedExecutionState
  // override on top of this in `connection_handler`; trails reads
  // `_connectionHandler` directly (no per-context override), so the default
  // handler IS that field.
  // Mirrors: ActiveRecord::Core.default_connection_handler (core.rb:98).
  static get defaultConnectionHandler(): ConnectionHandler {
    return this._connectionHandler;
  }

  static set defaultConnectionHandler(value: ConnectionHandler) {
    this._connectionHandler = value;
  }

  // The default connected role, its own class_attribute in Rails (distinct from
  // `writing_role`), seeded to `writing_role` at load (core.rb:250). `currentRole`
  // falls back to it when no `connected_to` frame applies (core.rb:165).
  // Mirrors: ActiveRecord::Core.default_role (core.rb:100).
  static defaultRole: string = WRITING_ROLE;

  // When true, `belongs_to` associations are required (validate presence)
  // unless `optional: true`. Read by associations/builder/belongs-to.ts.
  // Mirrors: ActiveRecord::Core.belongs_to_required_by_default (core.rb:88).
  static belongsToRequiredByDefault = false;

  // Force enumeration of all columns in SELECT statements instead of `SELECT *`.
  // Read by relation/query-methods.ts.
  // Mirrors: ActiveRecord::Core.enumerate_columns_in_select_statements (core.rb:86).
  static enumerateColumnsInSelectStatements = false;

  // The resolver used by the ShardSelector middleware. nil (no selector) by
  // default — trails' actual behavior absent explicit sharding config.
  // Mirrors: ActiveRecord::Core.shard_selector (core.rb:104).
  static shardSelector: unknown = null;

  // Mirrors: ActiveRecord::Core._destroy_association_async_job (core.rb:24),
  // minus Rails' "ActiveRecord::DestroyAssociationAsyncJob" default: that
  // ActiveJob::Base subclass is unported (scripts/api-compare/unported-files.ts),
  // so adopting the default would make every read raise NameError.
  static _destroyAssociationAsyncJob: unknown = null;

  static destroyAssociationAsyncJob = _Core.destroyAssociationAsyncJob;

  // Maximum records destroyed per background job by `dependent: :destroy_async`.
  // nil (single job) by default, matching Rails and trails' behavior.
  // Mirrors: ActiveRecord::Core.destroy_association_async_batch_size (core.rb:47).
  static destroyAssociationAsyncBatchSize: number | null = null;

  // -- ModelSchema config accessors (ActiveRecord::ModelSchema class_attributes) --

  // Controls the primary-key naming prefix convention. nil (no prefix) by
  // default. Read by attribute-methods/primary-key.ts.
  // Mirrors: ActiveRecord::ModelSchema.primary_key_prefix_type (model_schema.rb:163).
  static primaryKeyPrefixType: string | null = null;

  static getPrimaryKey = _getPrimaryKey;

  /** Mirrors: ActiveRecord::AttributeMethods::PrimaryKey::ClassMethods#reset_primary_key */
  static resetPrimaryKey = _resetPrimaryKey;

  // Column used to order records when no explicit order is given (e.g. for
  // `first`/`last`). nil by default. Read by relation/finder-methods.ts.
  // Mirrors: ActiveRecord::ModelSchema.implicit_order_column (model_schema.rb:169).
  static implicitOrderColumn: string | null = null;

  // When true (the Rails default), inferred table names are pluralized. Read by
  // model-schema.ts (undecoratedTableName / containedTableNamePrefix).
  // Mirrors: ActiveRecord::ModelSchema.pluralize_table_names (model_schema.rb:168).
  static pluralizeTableNames = true;

  // The unprefixed name of the table tracking run migrations. Composed with
  // tableNamePrefix/Suffix by SchemaMigration. Mirrors Rails default.
  // Mirrors: ActiveRecord::ModelSchema.schema_migrations_table_name (model_schema.rb:166).
  static schemaMigrationsTableName = "schema_migrations";

  // The unprefixed name of the internal metadata table. Composed with
  // tableNamePrefix/Suffix by InternalMetadata. Mirrors Rails default.
  // Mirrors: ActiveRecord::ModelSchema.internal_metadata_table_name (model_schema.rb:167).
  static internalMetadataTableName = "ar_internal_metadata";

  // When true, string attribute types reflected from the schema are made
  // immutable (StringType#toImmutableString). nil/false by default. Read by
  // model-schema.ts column-type resolution.
  // Mirrors: ActiveRecord::ModelSchema.immutable_strings_by_default (model_schema.rb:170).
  static immutableStringsByDefault = false;

  /** Whether this class inherits directly from ActiveRecord::Base (i.e. is not
   * an STI subclass).
   * Mirrors: ActiveRecord::Inheritance::ClassMethods#descends_from_active_record? */
  static isDescendsFromActiveRecord = _isDescendsFromActiveRecord;

  /** Whether the given row carries a non-empty inheritance-column value that
   * this class can dispatch on.
   * Mirrors: ActiveRecord::Inheritance::ClassMethods#using_single_table_inheritance?
   * @internal */
  static usingSingleTableInheritance = _usingSingleTableInheritance;

  /** Generates the `<association>Attributes=` writer for a nested-attributes
   * association.
   * Mirrors: ActiveRecord::NestedAttributes::ClassMethods#generate_association_writer
   * @internal */
  static generateAssociationWriter = _NestedAttributes.generateAssociationWriter;

  /** The memoized per-model module holding the relation methods generated for
   * this class's delegation carriers.
   * Mirrors: ActiveRecord::Delegation::DelegateCache#generated_relation_methods
   * @internal */
  static generatedRelationMethods = _generatedRelationMethods;

  /** The value stored in a polymorphic `*_type` column for this class —
   * the full namespaced name when `storeFullClassName`, else demodulized.
   * Mirrors: ActiveRecord::Inheritance::ClassMethods#polymorphic_name */
  static polymorphicName(): string {
    return inheritancePolymorphicName(this);
  }

  /** The value stored in the STI inheritance column for this class.
   * Mirrors: ActiveRecord::Inheritance::ClassMethods#sti_name */
  static stiName(): string {
    return stiName(this);
  }

  /**
   * Generate a signed ID for this record using HMAC-SHA256 via MessageVerifier.
   * The purpose parameter scopes the signed ID. expiresIn is in seconds.
   *
   * Mirrors: ActiveRecord::SignedId#signed_id
   */
  signedId(options?: {
    purpose?: string;
    expiresIn?: number;
    expiresAt?: Temporal.Instant;
  }): string {
    return _signedId(this, options);
  }

  /**
   * Find a record by its signed ID, or return null.
   *
   * Mirrors: ActiveRecord::SignedId.find_signed
   */
  static async findSigned<T extends typeof Base>(
    this: T,
    signedId: string,
    options?: { purpose?: string },
  ): Promise<InstanceType<T> | null> {
    return _findSigned.call<
      T,
      [string, { purpose?: string } | undefined],
      Promise<InstanceType<T> | null>
    >(this, signedId, options);
  }

  /**
   * Find a record by its signed ID, or throw.
   * Throws InvalidSignature if tampered/expired, RecordNotFound if not found.
   *
   * Mirrors: ActiveRecord::SignedId.find_signed!
   */
  static async findSignedBang<T extends typeof Base>(
    this: T,
    signedId: string,
    options?: { purpose?: string },
  ): Promise<InstanceType<T>> {
    return _findSignedBang.call<
      T,
      [string, { purpose?: string } | undefined],
      Promise<InstanceType<T>>
    >(this, signedId, options);
  }

  /**
   * Mirrors: ActiveRecord::SignedId::ClassMethods#combine_signed_id_purposes
   */
  static combineSignedIdPurposes(purpose?: string): string {
    return SignedId.combineSignedIdPurposes(this, purpose);
  }

  /**
   * Compare two records for equality based on class and primary key.
   *
   * Mirrors: ActiveRecord::Core#==
   */
  declare equals: (other: unknown) => boolean;

  /**
   * Order two records by primary key.
   *
   * Mirrors: ActiveRecord::Core#<=>
   */
  declare compare: (other: unknown) => number | undefined;

  /**
   * Return a value that dedups records the way Ruby's `hash` + `eql?` do.
   *
   * Mirrors: ActiveRecord::Core#hash
   */
  declare hash: () => unknown;

  // becomesBang / updateAttributeBang extracted to persistence.ts.

  /**
   * Instance-level transaction wrapper — delegates to the class method
   * so `record.transaction(...)` and `Model.transaction(...)` share one
   * implementation path.
   *
   * Mirrors: ActiveRecord::Base#transaction
   */
  async transaction<R>(
    fn: (tx: any) => Promise<R>,
    options?: { isolation?: string; requiresNew?: boolean; joinable?: boolean },
  ): Promise<R | undefined> {
    return (this.constructor as typeof Base).transaction(fn, options);
  }

  /**
   * Class-level transaction wrapper.
   *
   * Mirrors: ActiveRecord::Base.transaction — Rails exposes this as a
   * class method (`Model.transaction do ... end`). In TS the block is
   * async, so callers must `await` the result.
   */
  static transaction<R>(
    this: typeof Base,
    fn: (tx: any) => Promise<R>,
    options?: { isolation?: string; requiresNew?: boolean; joinable?: boolean },
  ): Promise<R | undefined> {
    return _transaction(this, fn, options);
  }

  /**
   * Returns the currently active transaction, or a null transaction if no
   * transaction is open. On the null transaction, `afterCommit` runs
   * immediately and `afterRollback` is a no-op.
   *
   * Mirrors: ActiveRecord::Base.current_transaction
   */
  static currentTransaction() {
    return _currentTransactionPublic();
  }

  static beforeCommit = _beforeCommit;

  /**
   * Mirrors: ActiveRecord::Transactions::ClassMethods#after_commit
   *
   * The body lives in transactions.ts at the Rails name; this is the `include`
   * point. It cannot be a plain `static override afterCommit = _afterCommit`
   * assignment the way the non-overriding members here are: a `this`-typed
   * function assigned as a *property* over an inherited *method* is checked
   * contravariantly, which drops `typeof Base` out of `typeof Model` and reds
   * every `this.beforeDestroy(...)` in a subclass body.
   */
  static override afterCommit<T extends typeof Model>(
    this: T,
    fn: ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>) | object,
    conditions?: TransactionalCallbackConditions<InstanceType<T>>,
  ): void {
    _afterCommit.call(this, fn as (...args: any[]) => any, conditions as never);
  }

  static afterSaveCommit = _afterSaveCommit;

  static afterCreateCommit = _afterCreateCommit;

  static afterUpdateCommit = _afterUpdateCommit;

  static afterDestroyCommit = _afterDestroyCommit;

  /** Mirrors: ActiveRecord::Transactions::ClassMethods#after_rollback */
  static override afterRollback<T extends typeof Model>(
    this: T,
    fn: ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>) | object,
    conditions?: TransactionalCallbackConditions<InstanceType<T>>,
  ): void {
    _afterRollback.call(this, fn as (...args: any[]) => any, conditions as never);
  }

  /** Mirrors: ActiveRecord::Transactions::ClassMethods#set_callback */
  static override setCallback<T extends typeof Model>(
    this: T,
    event: string,
    timing: "before" | "after" | "around",
    fn: (...args: any[]) => any,
    options?: Record<string, unknown>,
  ): void {
    _txSetCallback.call(this, event, timing, fn, options);
  }

  /**
   * Run validations and return self.
   *
   * Mirrors: ActiveRecord::Validations#validate
   */
  // readAttributeForValidation: wired via include() below.

  /**
   * Mirrors: ActiveRecord::Validations#valid?
   *
   * Delegates to validations module for context resolution, then runs
   * autosave association validations.
   */
  override async isValid(context?: ValidationContextArg): Promise<boolean> {
    const effectiveContext =
      context ?? this._validationContext ?? defaultValidationContext.call(this);
    const output = await validationsIsValid.call(this, effectiveContext);
    return this.errors.empty && output;
  }

  // validate / customValidationContext: wired via include() below.

  declare isPresent: () => boolean;
  declare isBlank: () => boolean;

  // Associations instance methods wired via include() below;
  // signatures declared on the merged `interface Base` at the bottom
  // of this file so subclass-variance rules treat them as methods
  // (bivariant) rather than properties (invariant).

  static async tableExists(): Promise<boolean> {
    return ModelSchema.tableExists.call(this);
  }

  /**
   * Class-level string representation, e.g. `Post(id: integer, title: string)`.
   *
   * Mirrors: ActiveRecord::Core.inspect (the class method). Crucially, the
   * not-connected branch must NOT touch the connection — a Model whose
   * connection config points at an unreachable database (see
   * invalid-connection.test.ts) inspects without raising.
   */
  static inspect(): string {
    const name = this.name;
    if (this === Base) {
      return name;
    } else if (this.abstractClass) {
      return `${name}(abstract)`;
    } else if (!ModelSchema.isSchemaLoaded.call(this as never) && !this.connectedQ()) {
      return `${name} (call '${name}.load_schema' to load schema informations)`;
    }
    // Schema is loaded (or a live connection is available): list the columns'
    // attribute types. Mirrors Rails' `table_exists?` branch — `columnsHash` is
    // empty when the table is absent.
    const columns = this.columnsHash();
    if (Object.keys(columns).length === 0) {
      return `${name}(Table doesn't exist)`;
    }
    const attrList = Object.entries(this.attributeTypes())
      // Rails interpolates `type.type` (core.rb:383); a nil type renders as the
      // empty string, so mirror Ruby's nil-to-"" rather than JS's "undefined".
      .map(([attr, type]) => `${attr}: ${type.type() ?? ""}`)
      .join(", ");
    return `${name}(${attrList})`;
  }

  /** Mirrors: ActiveRecord::AttributeMethods::ClassMethods#has_attribute?
   * (attribute_methods.rb:254-258). */
  static hasAttribute(name: string): boolean {
    let attrName = String(name);
    attrName = this.attributeAliases[attrName] ?? attrName;
    return Object.hasOwn(this.attributeTypes(), attrName);
  }

  /**
   * Mirrors: ActiveRecord::TokenFor#generate_token_for (token_for.rb:118).
   */
  generateTokenFor(purpose: string): string {
    return _generateTokenFor.call(this, purpose);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Base extends Included<typeof AutosaveAssociation> {
  /** Mirrors: ActiveRecord::Normalization#normalize_attribute (normalization.rb:26). */
  normalizeAttribute(name: string): void;
  /**
   * Mirrors: ActiveRecord::Normalization#normalize_changed_in_place_attributes
   * (normalization.rb:112, private).
   *
   * @internal
   */
  normalizeChangedInPlaceAttributes(): void;

  /**
   * Assigned by `init_internals` (core.rb:834-849) during `super()`. Declared
   * here rather than as a class field because a field initializer runs after
   * `super()` returns and would clobber what the chain just assigned.
   *
   * @internal
   */
  _strictLoading: boolean;
  /** @internal */
  _strictLoadingMode?: _Core.StrictLoadingMode;
  /**
   * The single backing slot for this record's association cache — RFC-0022's
   * fold of the three formerly-separate maps into one store keyed by name (see
   * `_resetAssociationCaches`). The two accessors below are `Map`-compatible
   * facet views onto one field of this shared store, mirroring Rails' single
   * `@association_cache`, which `Associations#init_internals` allocates
   * (associations.rb:75-77) — hence no class field here either.
   *
   * @internal
   */
  _associationCacheStore: _AssociationCache;
  /** @internal */
  _collectionProxies: Map<string, unknown>;
  /** @internal */
  _associationInstances: Map<string, AssociationInstance>;
  association(name: string): AssociationInstance;
  /**
   * Explicitly load a `belongsTo` target and resolve to it.
   *
   * @noRailsEquivalent PERMANENT Ruby has no counterpart because it needs none:
   * `post.author` is a plain reader that blocks on I/O
   * (`vendor/rails/activerecord/lib/active_record/associations/builder/association.rb:102`
   * generates it via `define_readers`), so `def load_belongs_to` exists nowhere
   * in Rails. A JS getter cannot await, so the async half of the reader has to be
   * a separately named method. It is also the deliberate strict-loading escape
   * hatch: an explicit call bumps the bypass count for the duration of the load
   * (`associations/instance-methods.ts:104`), which is how a caller says "this
   * lazy load is intentional" — the role Ruby fills by simply calling the
   * reader.
   */
  loadBelongsTo(name: string): Promise<Base | null>;
  /**
   * Explicitly load a `hasOne` target and resolve to it.
   *
   * @noRailsEquivalent PERMANENT Same reasoning as {@link Base.loadBelongsTo}:
   * no `def load_has_one` exists in Rails, the Ruby reader blocks on I/O, and
   * the explicit call doubles as the strict-loading bypass.
   */
  loadHasOne(name: string): Promise<Base | null>;
  /**
   * Mirrors: ActiveRecord::AttributeMethods::Dirty#saved_changes
   * (attribute_methods/dirty.rb:118-120). A zero-arg Ruby reader, so an
   * accessor property here — see CLAUDE.md, "Generated attribute readers are
   * properties". Ported on the `Dirty` class module and mixed in, as
   * {@link Base.attributeBeforeLastSave} is.
   */
  readonly savedChanges: Record<string, [unknown, unknown]>;
  /**
   * Mirrors: ActiveRecord::AttributeMethods::Dirty#has_changes_to_save?
   * (attribute_methods/dirty.rb:169-171). Accessor property and mixed in as
   * {@link Base.savedChanges} is.
   */
  readonly hasChangesToSave: boolean;
  /**
   * Mirrors: ActiveRecord::AttributeMethods::Dirty#changes_to_save
   * (attribute_methods/dirty.rb:175-177). Accessor property and mixed in as
   * {@link Base.savedChanges} is.
   */
  readonly changesToSave: Record<string, [unknown, unknown]>;
  /**
   * Mirrors: ActiveRecord::AttributeMethods::Dirty#changed_attribute_names_to_save
   * (attribute_methods/dirty.rb:181-183). Accessor property and mixed in as
   * {@link Base.savedChanges} is.
   */
  readonly changedAttributeNamesToSave: string[];
  /**
   * Mirrors: ActiveRecord::AttributeMethods::Dirty#attributes_in_database
   * (attribute_methods/dirty.rb:191-193). Accessor property and mixed in as
   * {@link Base.savedChanges} is.
   */
  readonly attributesInDatabase: Record<string, unknown>;
  /**
   * Mirrors: ActiveRecord::AttributeMethods::Dirty#attribute_before_last_save
   * (attribute_methods/dirty.rb:108-110).
   *
   * Ported in `attribute-methods/dirty.ts` and mixed onto the prototype, so
   * only the signature lives here. A class-body definition would win over the
   * mixin — `include()` never replaces a class-body method — and displace the
   * port.
   */
  attributeBeforeLastSave(attr: string): unknown;
  /**
   * Mirrors: ActiveRecord::AttributeMethods::Dirty#attribute_change_to_be_saved
   * (attribute_methods/dirty.rb:152-154). Ported and mixed in as
   * {@link Base.attributeBeforeLastSave} is.
   */
  attributeChangeToBeSaved(attr: string): [unknown, unknown] | null;
  /**
   * Mirrors: ActiveRecord::AttributeMethods::Dirty#attribute_in_database
   * (attribute_methods/dirty.rb:164-166). Ported and mixed in as
   * {@link Base.attributeBeforeLastSave} is.
   */
  attributeInDatabase(attr: string): unknown;
  readAttributeForValidation(attribute: string): unknown;
  validate(context?: ValidationContextArg): Promise<boolean>;
  customValidationContext(): boolean;
  increment(attribute: string, by?: number): this;
  decrement(attribute: string, by?: number): this;
  toggle(attribute: string): this;
  incrementBang(
    attribute: string,
    by?: number,
    options?: { touch?: boolean | string | string[] },
  ): Promise<this>;
  decrementBang(
    attribute: string,
    by?: number,
    options?: { touch?: boolean | string | string[] },
  ): Promise<this>;
  toggleBang(attribute: string): Promise<boolean | undefined>;
  save(
    options?: { validate?: boolean; touch?: boolean },
    block?: (record: this) => void,
  ): Promise<boolean | undefined>;
  saveBang(
    options?: { validate?: boolean; touch?: boolean },
    block?: (record: this) => void,
  ): Promise<true | undefined>;
  destroy(): Promise<this | false>;
  destroyBang(): Promise<this>;
  update(attrs: Record<string, unknown>): Promise<boolean | undefined>;
  updateBang(attrs: Record<string, unknown>): Promise<true | undefined>;
  delete(): Promise<this>;
  reload(options?: { lock?: boolean | string; unscoped?: boolean }): Promise<this>;
  initializeDup(other: unknown): void;
  /** @internal */
  committedBang(options?: { shouldRunCallbacks?: boolean }): Promise<void>;
  /** @internal */
  rolledbackBang(options?: {
    forceRestoreState?: boolean;
    shouldRunCallbacks?: boolean;
  }): Promise<void>;
  /** @internal */
  isTriggerTransactionalCallbacks(): boolean;
  /** @internal */
  withTransactionReturningStatus<T>(fn: () => Promise<T>): Promise<T>;
  /** @internal */
  addToTransaction(ensureFinalize?: boolean): Promise<void>;
  /** @internal */
  hasTransactionalCallbacks(): boolean;
  /** @internal */
  _createRecord(block?: (record: this) => void): Promise<boolean>;
  /** @internal */
  _updateRecord(block?: (record: this) => void): Promise<boolean>;
  slice(...keys: string[]): Record<string, unknown>;
  valuesAt(...keys: string[]): unknown[];
  assignAttributes(attrs: Record<string, unknown>): Promise<void> | void;
  updateAttribute(name: string, value: unknown): Promise<boolean | undefined>;
  updateAttributeBang(name: string, value: unknown): Promise<true | undefined>;
  updateColumn(name: string, value: unknown): Promise<boolean>;
  updateColumns(attrs: Record<string, unknown>): Promise<boolean>;
  dup(): this;
  clone(): this;
  becomes<K extends typeof Base>(klass: K): InstanceType<K>;
  becomesBang<K extends typeof Base>(klass: K): InstanceType<K>;
}

// Normalise a single `from:` or `to:` option value through the enum mapping so
// that label / symbol / integer forms all compare equal to the stored value.
// All enums register their mapping in the single `_enums` registry (the former
// `defineEnum` EnumType registry has been folded in).
function _castEnumDirtyOpts(
  ctor: typeof Base,
  name: string,
  opts: { from?: unknown; to?: unknown },
): { from?: unknown; to?: unknown } {
  const mapping = ctor._enums?.get(name);
  if (mapping) {
    // Since I-2, _enum stores label strings in _attributes (via EnumType.cast).
    // Normalise both label inputs and integer storage-value inputs to the label
    // string so the comparison matches the in-memory value.
    const entries = Object.entries(mapping) as [string, number | string][];
    const cast = (v: unknown): unknown => {
      if (typeof v === "string" && Object.prototype.hasOwnProperty.call(mapping, v)) return v;
      const found = entries.find(([, sv]) => sv === v);
      if (found) return found[0];
      if (_isBlankValue(v)) return null;
      return v;
    };
    const result: { from?: unknown; to?: unknown } = {};
    if ("from" in opts) result.from = cast(opts.from);
    if ("to" in opts) result.to = cast(opts.to);
    return result;
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Ruby-style mixin wiring — one `extend` per module, mirroring Rails:
//
//   class Base
//     extend ConnectionHandling  # via ClassMethods in connection-handling.ts
//     extend Querying
//     include Core, Integration, AttributeMethods, PrimaryKey
//   end
//
// Per-method types chain from the source modules via `declare static` lines
// in the class body, so `Base.findBySql` and `Base.connectsTo` carry the
// exact generics, `this` parameter, and return type of their implementations.
// ---------------------------------------------------------------------------

extend(Base, ConnectionHandling.ClassMethods);
extend(Base, Inheritance.ClassMethods);
extend(Base, LockingOptimistic.ClassMethods);
extend(Base, SignedId.ClassMethods);
extend(Base, QueryCacheClassMethods.ClassMethods);

// Re-define `connection` as a getter (accessor) after extend() overwrites it
// with a data property. The getter delegates to ConnectionHandling.connection
// with the correct `this` binding and includes the _adapter fast-path.
Object.defineProperty(Base, "connection", {
  get() {
    return ConnectionHandling.connection.call(this);
  },
  configurable: true,
  enumerable: false,
});

extend(Base, { collectionCacheKey: _collectionCacheKey });
extend(Base, { find: _Core.find, findBy: _Core.findBy, findByBang: _Core.findByBang });
extend(Base, { configurations: _Core.configurations });
// Mirrors core.rb:74 — `self.configurations = {}` runs at load.
Base.configurations({});
extend(Base, {
  initializeFindByCache: _Core.initializeFindByCache,
  cachedFindByStatement: _Core.cachedFindByStatement,
});
extend(Base, Querying);
extend(Base, {
  belongsTo: _Associations.belongsTo,
  hasOne: _Associations.hasOne,
  hasMany: _Associations.hasMany,
  hasAndBelongsToMany: _Associations.hasAndBelongsToMany,
});
extend(Base, Translation.ClassMethods);
extend(Base, Sanitization.ClassMethods);
extend(Base, ReadonlyAttributes.ClassMethods);
extend(Base, CounterCache.ClassMethods);
// Mirrors ActiveRecord::Locking::Optimistic::ClassMethods#update_counters, which
// prepends over CounterCache#update_counters and `super`s into it after merging
// the locking-column bump. Capture the CounterCache implementation as `super`.
{
  const superUpdateCounters = CounterCache.updateCounters;
  extend(Base, {
    updateCounters(this: typeof Base, id: unknown, counters: CounterCache.CounterCacheCounters) {
      return LockingOptimistic.updateCounters.call(
        this,
        (cid, ccounters) => superUpdateCounters.call(this, cid, ccounters),
        id,
        counters,
      );
    },
  });
}
extend(Base, Timestamp.ClassMethods);
extend(Base, NamedScoping.ClassMethods);
extend(Base, _Validations.ClassMethods);
extend(Base, Normalization.ClassMethods);
include(Base, Normalization.InstanceMethods);
extend(Base, {
  enum: _EnumModule.enumMethod,
  _enum: _EnumModule._enum,
  _enumMethodsModule: _EnumModule._enumMethodsModule,
  detectEnumConflictBang: _EnumModule.detectEnumConflictBang,
  raiseConflictError: _EnumModule.raiseConflictError,
  assertValidEnumDefinitionValues: _EnumModule.assertValidEnumDefinitionValues,
  assertValidEnumOptions: _EnumModule.assertValidEnumOptions,
  detectNegativeEnumConditionsBang: _EnumModule.detectNegativeEnumConditionsBang,
});
extend(Base, {
  collectingQueriesForExplain: _collectingQueriesForExplain,
  execExplain: _execExplain,
  renderBind: _renderBind,
  buildExplainClause: _buildExplainClause,
});
extend(Base, _Reflection.ClassMethods);
// Mirrors `class_attribute :_reflections, instance_writer: false, default: {}`
// (reflection.rb:11): reads walk the constructor chain, writes are local to the
// class, so `add_reflection`'s reassignment is the whole copy-on-write
// mechanism. `_associations` has no `class_attribute` of its own upstream —
// reflection.rb:11-14 declares only `_reflections`, `aggregate_reflections`,
// `automatic_scope_inversing` and `automatically_invert_plural_associations` —
// it is trails-only registry bookkeeping carried on the same mechanism as the
// `_reflections` it shadows, so the two cannot drift apart.
classAttribute.call(Base, "_reflections", { instanceWriter: false, default: {} });
classAttribute.call(Base, "_associations", { instanceWriter: false, default: [] });
classAttribute.call(Base, "_counterCacheColumns", { instanceAccessor: false, default: [] });
classAttribute.call(Base, "counterCachedAssociationNames", {
  instanceWriter: false,
  default: [],
});
extend(Base, {
  defaultScope: _defaultScope,
  unscoped: _unscoped,
});
extend(Base, ModelSchema.ClassMethods);
extend(Base, {
  defineAttribute: _defineAttribute,
  defineAttributeMethods: _defineAttributeMethods,
  initializeGeneratedModules: _initializeGeneratedModules,
  generateAliasAttributes: _generateAliasAttributes,
  eagerlyGenerateAliasAttributeMethods: _eagerlyGenerateAliasAttributeMethods,
  _defaultAttributes: _arDefaultAttributes,
  resolveTypeName: _resolveTypeName,
});
// AttributeMethods class method — gates association/attribute names that would
// clash with an Active Record instance method (Rails: dangerous_attribute_method?).
// Consumed by Associations::Builder::Association#build to reject e.g. `has_one :save`.
extend(Base, { isDangerousAttributeMethod: _pkIsDangerousAttributeMethod });
// ActiveRecord's override of ActiveModel's predicate (attribute_methods.rb:165):
// define_attribute_method_pattern dispatches it through the class, so the
// dangerous-method raise runs before any accessor is generated.
extend(Base, { isInstanceMethodAlreadyImplemented: _pkIsInstanceMethodAlreadyImplemented });
extend(Base, {
  defineMethodAttribute: _defineMethodAttribute,
  setDefineMethodAttribute: _setDefineMethodAttribute,
});
extend(Base, {
  // ConnectionHandling.ClassMethods does not include resolveConfigForConnection
  // (it's a standalone export, not in the ClassMethods object), so wire it here.
  resolveConfigForConnection: ConnectionHandling.resolveConfigForConnection,
  localStoredAttributes: _localStoredAttributesMethod,
});

include(Base, {
  // AttributeMethods::Write
  writeAttribute: _writeAttributeMethod,
  // Persistence
  isNewRecord: _Persistence.isNewRecord,
  isPersisted: _Persistence.isPersisted,
  isDestroyed: _Persistence.isDestroyed,
  isPreviouslyNewRecord: _Persistence.isPreviouslyNewRecord,
  isPreviouslyPersisted: _Persistence.isPreviouslyPersisted,
  increment: _Persistence.increment,
  decrement: _Persistence.decrement,
  toggle: _Persistence.toggle,
  incrementBang: _Persistence.incrementBang,
  decrementBang: _Persistence.decrementBang,
  toggleBang: _Persistence.toggleBang,
  save: _Persistence.save,
  saveBang: _Persistence.saveBang,
  destroy: _Persistence.destroy,
  destroyBang: _Persistence.destroyBang,
  update: _Persistence.update,
  updateBang: _Persistence.updateBang,
  delete: _Persistence.deleteRow,
  destroyRow: _Persistence.destroyRow,
  _touchRow: _Persistence._touchRow,
  _updateRow: _Persistence._updateRow,
  reload: _Persistence.reload,
  slice: _Persistence.slice,
  valuesAt: _Persistence.valuesAt,
  updateAttribute: _Persistence.updateAttribute,
  updateAttributeBang: _Persistence.updateAttributeBang,
  updateColumn: _Persistence.updateColumn,
  updateColumns: _Persistence.updateColumns,
  dup: _Persistence.dup,
  clone: _Persistence.clone,
  becomes: _Persistence.becomes,
  becomesBang: _Persistence.becomesBang,
  // Core
  inspect: _inspect,
  prettyPrint: _Core.prettyPrint,
  attributeForInspect: _attributeForInspect,
  equals: _equals,
  compare: _compare,
  hash: _hash,
  isPresent: _isPresent,
  isBlank: _isBlank,
  isReadonly: _Core.isReadonly,
  readonlyBang: _Core.readonlyBang,
  isStrictLoading: _Core.isStrictLoading,
  strictLoadingBang: _Core.strictLoadingBang,
  strictLoadingMode: _Core.strictLoadingMode,
  isStrictLoadingAll: _Core.isStrictLoadingAll,
  isStrictLoadingNPlusOneOnly: _Core.isStrictLoadingNPlusOneOnly,
  isFrozen: _Core.isFrozen,
  freeze: _Core.freeze,
  // NoTouching
  isNoTouching: _isNoTouching,
  // Integration
  toParam: _toParam,
  cacheKey: _cacheKey,
  cacheKeyWithVersion: _cacheKeyWithVersion,
  cacheVersion: _cacheVersion,
  // Serialization
  serializableHash: Serialization.serializableHash,
  // AttributeMethods
  readAttribute: _readAttribute,
  readAttributeBeforeTypeCast: _readAttributeBeforeTypeCast,
  hasAttribute: _hasAttribute,
  attributePresent: _attributePresent,
  accessedFields: _accessedFields,
  queryAttribute: _queryAttribute,
  get: _get,
  set: _set,
  _queryAttribute: _queryAttributeFn,
  _readAttribute: _readAttributeFn,
  _writeAttribute: _writeAttributeLowLevel,
  // PrimaryKey
  toKey: _toKey,
  // Store (private instance helpers)
  readStoreAttribute: _readStoreAttribute,
  writeStoreAttribute: _writeStoreAttribute,
  storeAccessorFor: _storeAccessorFor,
});
include(Base, ModelSchema.InstanceMethods);
// The accessor-property half of AttributeMethods::Dirty. A class module, so
// `include()` copies the getter descriptors rather than flattening them.
include(Base, _Dirty);
include(Base, _PrimaryKey);
// Rails includes CompositePrimaryKey into a model when `primary_key=` takes an
// Array (primary_key.rb:132); each of its bodies opens with the
// `composite_primary_key?` guard, so mixing it in once above PrimaryKey is the
// same behaviour for a scalar-keyed model.
include(Base, _CompositePrimaryKey);
include(Base, LockingPessimistic.InstanceMethods);
include(Base, LockingOptimistic.InstanceMethods);
include(Base, Timestamp.InstanceMethods);
// TouchLater is included after Timestamp, so include()'s last-included-wins
// ancestry lets TouchLater#touch (deferred-attr merge) override Timestamp#touch
// — no manual prototype patching needed. Mirrors Ruby's include ordering.
// Aggregations is NOT included here: mirroring Rails, it is mixed in lazily by
// composed_of (see aggregations.ts includeAggregations), so models without a
// composed_of declaration never carry its reload/initialize_dup overrides.
include(Base, TouchLater.InstanceMethods);
include(Base, _AttributeAssignment.InstanceMethods);
include(Base, AutosaveAssociation);
// The `init_internals` chain (core.rb:834 is the root; every other definition
// opens with `super`). Prepended in Rails' `include` order (base.rb:299-322), so
// the last one wired is the outermost link and the stack unwinds into Core —
// and, below it, into the ActiveModel links `Model.prototype` carries
// (validations.rb:467, dirty.rb:372).
prepend(Base.prototype, { initInternals: _Core.initInternals as PrependMethod });
prepend(Base.prototype, { initInternals: _Persistence.initInternals as PrependMethod });
prepend(Base.prototype, {
  initInternals: _AttributeMethodsDirty.initInternals as PrependMethod,
});
prepend(Base.prototype, { initInternals: Timestamp.initInternals as PrependMethod });
prepend(Base.prototype, { initInternals: _associationsInitInternals as PrependMethod });
prepend(Base.prototype, { initInternals: _autosaveInitInternals as PrependMethod });
prepend(Base.prototype, { initInternals: _transactionsInitInternals as PrependMethod });
prepend(Base.prototype, { initInternals: TouchLater.initInternals as PrependMethod });
// The `initialize_dup` chain, same construction: Core (core.rb:550) fires the
// initialize callbacks and resets the new-record state, then `super` unwinds
// through Locking::Optimistic (optimistic.rb:72-75) and Timestamp
// (timestamp.rb:50-53), whose clears therefore run AFTER the callbacks have seen
// the source's `lock_version` / timestamps. Aggregations' link (aggregations.rb:6)
// is prepended above these by `includeAggregations` on composed_of models only.
// `dup` (persistence.ts) enters the chain once the duped attributes and dirty
// baseline are in place.
prepend(Base.prototype, { initializeDup: _Core.initializeDup as PrependMethod });
prepend(Base.prototype, { initializeDup: LockingOptimistic.initializeDup as PrependMethod });
prepend(Base.prototype, { initializeDup: Timestamp.initializeDup as PrependMethod });
_registerAssociationBuilderExtension(AssociationBuilder.extensions);
// AutosaveAssociation#reload resets marked-for-destruction / destroyed-by-
// association state, then calls super. Capture the inherited reload (Persistence)
// at wire time and slot it BELOW Aggregations' lazy wrap, so the MRO is
// Aggregations → AutosaveAssociation → Persistence. Mirrors Ruby's module super
// chain; trails has no super across mixins, so wire it explicitly.
{
  const inheritedReload = (Base.prototype as any).reload as (
    this: Base,
    options?: { lock?: boolean | string; unscoped?: boolean },
  ) => Promise<Base>;
  Object.defineProperty(Base.prototype, "reload", {
    value: _autosaveReload(inheritedReload),
    writable: true,
    configurable: true,
  });
}
include(Base, _NestedAttributes.InstanceMethods);
include(Base, _AssocInstance.InstanceMethods);
include(Base, {
  readAttributeForValidation: _Validations.readAttributeForValidation,
  validate: _Validations.validate,
  customValidationContext: _Validations.customValidationContext,
});
include(Base, {
  attributeNamesForSerialization: Serialization.attributeNamesForSerialization,
});
// Wire private/internal helpers onto Base so parity:api credits them to base.rb.
// These are standalone exports in their respective module files; the include()
// call here is the only thing that causes the extractor to attribute them to base.ts.
include(Base, {
  // Core privates
  initWithAttributes: _Core.initWithAttributes,
  initAttributes: _Core.initAttributes,
  fullInspect: _Core.fullInspect,
  destroyAssociationAsyncJob: _Core.destroyAssociationAsyncJob,
  initializeInternalsCallback: _Core.initializeInternalsCallback,
  isCustomInspectMethodDefined: _Core.isCustomInspectMethodDefined,
  inspectWithAttributes: _Core.inspectWithAttributes,
  attributesForInspect: _Core.attributesForInspect,
  allAttributesForInspect: _Core.allAttributesForInspect,
  // Persistence privates
  strictLoadedAssociations: _Persistence.strictLoadedAssociations,
  _findRecord: _Persistence._findRecord,
  _inMemoryQueryConstraintsHash: _Persistence._inMemoryQueryConstraintsHash,
  isApplyScoping: _Persistence.isApplyScoping,
  destroyAssociations: _Persistence.destroyAssociations,
  _deleteRow: _Persistence._deleteRow,
  verifyReadonlyAttribute: _Persistence.verifyReadonlyAttribute,
  _raiseRecordNotDestroyed: _Persistence._raiseRecordNotDestroyed,
  _raiseReadonlyRecordError: _Persistence._raiseReadonlyRecordError,
  _raiseRecordNotTouchedError: _Persistence._raiseRecordNotTouchedError,
  // Inheritance / Scoping privates
  _inheritanceColumn: ModelSchema._inheritanceColumn,
  ensureProperType: _ensureProperType,
  populateWithCurrentScopeAttributes: _populateWithCurrentScopeAttributes,
  // Integration privates
  canUseFastCacheVersion: _canUseFastCacheVersion,
  rawTimestampToCacheVersion: _rawTimestampToCacheVersion,
  // Validations privates
  defaultValidationContext,
  raiseValidationError: _Validations.raiseValidationError,
  performValidations: _Validations.performValidations,
  // AttributeMethods privates and additional instance methods
  _hasAttribute: _privateHasAttribute,
  isAttributeMethod: _isAttributeMethod,
  attributesWithValues: _attributesWithValues,
  attributesForCreate: _attributesForCreate,
  attributesForUpdate: _attributesForUpdate,
  formatForInspect: _formatForInspect,
  pkAttribute: _pkAttribute,
  readAttributeForDatabase: _readAttributeForDatabase,
  attributesBeforeTypeCast: _attributesBeforeTypeCast,
  attributesForDatabase: _attributesForDatabase,
  attributeBeforeTypeCast: _attributeBeforeTypeCast,
  attributeForDatabase: _attributeForDatabase,
  attributeCameFromUser: _attributeCameFromUser,
  queryCastAttribute: _queryCastAttribute,
  // `primary_key_values_present?` and the ID_ATTRIBUTE_METHODS readers arrive
  // with `include(Base, _PrimaryKey)` / `include(Base, _CompositePrimaryKey)`
  // above: the readers are accessor properties, and only those calls copy
  // descriptors — this object literal is read by value and would flatten them.
  isSavedChangeToAttribute: _isSavedChangeToAttribute,
  attributeBeforeLastSave: _attributeBeforeLastSave,
  isWillSaveChangeToAttribute: _isWillSaveChangeToAttribute,
  attributeChangeToBeSaved: _attributeChangeToBeSaved,
  attributeInDatabase: _attributeInDatabase,
  attributeNamesForPartialUpdates: _attributeNamesForPartialUpdates,
  attributeNamesForPartialInserts: _attributeNamesForPartialInserts,
  // isSavedChanges is AR-specific (not on Model); safe to wire.
  isSavedChanges: _isSavedChanges,
  // TouchLater privates — not on Model; safe to wire.
  hasDeferTouchAttrs(this: Base) {
    return TouchLater.hasDeferTouchAttrs(this);
  },
  // savedChanges/hasChangesToSave/changesToSave/changedAttributeNamesToSave/
  // attributesInDatabase are accessor properties, so they arrive with
  // `include(Base, _Dirty)` above — this object literal is read by value and
  // would flatten them into data properties.
  // CounterCache privates
  _foreignKeysEqual: CounterCache._foreignKeysEqual,
  // Associations privates
  isAssociationCached: _isAssociationCached,
  associationInstanceGet: _associationInstanceGet,
  associationInstanceSet: _associationInstanceSet,
  // AutosaveAssociation privates
  computePrimaryKey: _computePrimaryKey,
  _ensureNoDuplicateErrors: _autosaveEnsureNoDuplicateErrors,
  // Transactions instance methods
  committedBang: _committedBang,
  rolledbackBang: _rolledbackBang,
  isTriggerTransactionalCallbacks: _isTriggerTransactionalCallbacks,
  withTransactionReturningStatus: _withTransactionReturningStatus,
  addToTransaction: _addToTransaction,
  hasTransactionalCallbacks: _hasTransactionalCallbacks,
  _newRecordBeforeLastCommit: _txNewRecordBeforeLastCommit,
  _committedAlreadyCalled: _txCommittedAlreadyCalled,
  _triggerUpdateCallback: _txTriggerUpdateCallback,
  _triggerDestroyCallback: _txTriggerDestroyCallback,
  clearTransactionRecordState: _clearTransactionRecordState,
  rememberTransactionRecordState: _rememberTransactionRecordState,
  restoreTransactionRecordState: _restoreTransactionRecordState,
  isTransactionIncludeAnyAction: _isTransactionIncludeAnyAction,
  // TouchLater privates (instance-level) wired here for parity:api credit.
  surreptitiouslyTouch: TouchLater.surreptitiouslyTouch,
  touchDeferredAttributes: TouchLater.touchDeferredAttributes,
});

// Rails layers create_or_update / _create_record / _update_record by include
// order (base.rb:299-316): Timestamp sits above Callbacks, so its body runs
// first and reaches Callbacks' through `super`. Each layer takes that `super`
// as an explicit continuation.
for (const [name, fn] of [
  [
    "createOrUpdate",
    function (this: Base, touch = true, block?: (record: Base) => void): Promise<boolean> {
      return Timestamp.createOrUpdate.call(this as any, touch, () =>
        callbacksCreateOrUpdate.call(this, block),
      );
    },
  ],
  [
    "_createRecord",
    function (this: Base, block?: (record: Base) => void): Promise<boolean> {
      return Timestamp._createRecord.call(this as any, () =>
        callbacksCreateRecord.call(this, block),
      ) as Promise<boolean>;
    },
  ],
  [
    "_updateRow",
    function (this: Base, attributeNames: string[], attemptedAction = "update"): Promise<number> {
      return LockingOptimistic._updateRow.call(
        this as any,
        attributeNames,
        attemptedAction,
        (names: string[], action: string) =>
          _Persistence._updateRow.call(this as any, names, action),
      );
    },
  ],
  [
    "_updateRecord",
    function (this: Base, block?: (record: Base) => void): Promise<boolean> {
      return Timestamp._updateRecord.call(this as any, () =>
        callbacksUpdateRecord.call(this, block),
      ) as Promise<boolean>;
    },
  ],
] as const) {
  Object.defineProperty(Base.prototype, name, {
    value: fn,
    configurable: true,
    writable: true,
    enumerable: false,
  });
}

// Register Model's super methods for the Validations module.
// Breaks the recursion on isValid (Base.isValid → validations.isValid → Model.isValid)
// and on validates (AR's validates routes remaining rules through Model.validates).
_setSuperIsValid(Model.prototype.isValid);
_setSuperValidates(Model.validates);

// Add attributes= setter (Rails: alias for assign_attributes) while preserving
// the existing Model getter. Can't go through include() since object-literal
// setters lose their descriptor; defineProperty merges both halves cleanly.
{
  const modelGetter = Object.getOwnPropertyDescriptor(Model.prototype, "attributes")?.get;
  if (modelGetter) {
    Object.defineProperty(Base.prototype, "attributes", {
      get: modelGetter,
      set(this: Base, attrs: Record<string, unknown>) {
        // A TS `set` accessor cannot await, so a key whose writer reaches the
        // database is parked for `save` to drain; `setAttributes` is the
        // awaitable spelling of the same alias (attribute_assignment.rb:36).
        const pending = this.setAttributes(attrs);
        if (pending) _NestedAttributes.parkNestedReaderLoad(this, pending);
      },
      configurable: true,
      enumerable: false,
    });
  }
}

registerTableNameOptions({
  get tableNamePrefix() {
    return Base._tableNamePrefix;
  },
  get tableNameSuffix() {
    return Base._tableNameSuffix;
  },
  get pluralizeTableNames() {
    return Base.pluralizeTableNames;
  },
  getPrimaryKey(baseName: string) {
    return Base.getPrimaryKey(baseName) as string;
  },
});

registerMigrationArConfig({
  get tableNamePrefix() {
    return Base._tableNamePrefix;
  },
  get tableNameSuffix() {
    return Base._tableNameSuffix;
  },
  configurations: () => Base.configurations(),
  connectionHandler: () => Base.connectionHandler,
  databaseTasks: () => DatabaseTasks,
});

// Side-effect import (currently no-op); kept so future globalid hooks can
// register here without callers needing to re-add it.
import "@blazetrails/globalid/wire";

import { type LocatorModel as _LocatorModel } from "@blazetrails/globalid";
// Compile-time wire: AR's static `Base.unscoped(block)` is the
// `LocatorModel.unscoped` implementation that GlobalID's `UnscopedLocator`
// invokes — wrapping lookups in `klass.unscoped { ... }` so default scopes
// don't hide rows being located by GID. `Base.unscoped` is wired statically
// via `extend(Base, { unscoped: _unscoped })` above; this assertion fails
// the build if a future refactor removes or renames it.
type _ARBaseUnscopedWire =
  typeof Base extends Pick<Required<_LocatorModel>, "unscoped"> ? true : never;
const _arBaseUnscopedWire: _ARBaseUnscopedWire = true;
void _arBaseUnscopedWire;

setCurrentAdapterResolver(() => Base);

// Wire Base into DatabaseTasks so migrationConnection() works synchronously
// without waiting for an async method to capture _baseClass first.
// Registered before runLoadHooks so that any on_load(:active_record) callback
// can call migrationConnection() and find it wired.
DatabaseTasks._registerBase(Base);

// Mirrors `ActiveSupport.run_load_hooks(:active_record, Base)` at the
// bottom of `activerecord/lib/active_record/base.rb`. Lets railtie
// initializers register `on_load(:active_record)` consumers that need a
// fully-defined `Base` class (timezone, filter attributes, ...).
runLoadHooks("active_record", Base);

// Mirrors: `ActiveSupport.on_load(:active_record) { Arel::Table.engine = self }`
// (active_record.rb:562-564) — `self` there is Base. Rails can register that
// consumer from the entrypoint because requiring `active_record` is the only
// way to reach `Base`; here many modules and tests deep-import `base.js`
// directly and never evaluate `index.ts`, so the assignment rides the same
// module as the hook run to keep `Table.engine` set on every load path.
//
// Rails assigns `Base` itself and reaches the visitor via
// `engine.with_connection` (arel/nodes/node.rb:150). trails' `withConnection` is
// async, and `to_sql` is synchronous in Rails and at every call site here, so
// the engine must expose a *synchronous* connection. Assigning bare `Base` would
// route through `Base.connection`, which is deprecated: under
// `ActiveRecord.permanentConnectionCheckout = "disallowed"` it raises
// (connection-handling.ts:461-463), so every `toSql()` in the app would throw —
// something Rails' `with_connection`-based `to_sql` never does. This delegates
// to the pool's non-deprecated sync surface instead: the already-checked-out
// connection when there is one, else a sync lease — the same connection
// `Base.connection` would return, without the deprecation gate.
Table.engine = {
  get connection(): DatabaseAdapter {
    const pool = Base.connectionPool();
    return pool.activeConnection ?? pool.leaseConnectionSync();
  },
};

// Rails resolves `ActiveRecord::Base` at call time through autoload, so none of
// these modules `require` base.rb. In ESM a value import is a load-time edge,
// and an edge back into base.ts would make base.ts a cycle member — deciding,
// purely by the graph's entry point, whether the mixin wiring above reads
// initialized bindings or hits a TDZ ReferenceError. Consumers that only need
// `Base` at call time take it from here instead.

_registerBaseWithQueryCache(Base);
_registerBaseWithSchemaMigration(Base);
_registerBaseWithInternalMetadata(Base);
_registerBaseWithSchemaDumper(Base);
_registerBaseWithNamedScoping(Base);
_registerBaseWithConnectionHandler(Base);
_registerBaseWithAsynchronousQueriesTracker(Base);
_registerBaseWithDatabaseStatements(Base);

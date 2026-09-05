import { Temporal } from "@blazetrails/date";
import "./i18n.js";
import {
  Locator as _Locator,
  GlobalID as _GlobalIDCtor,
  SignedGlobalID as _SignedGlobalIDType,
} from "@blazetrails/globalid";

interface ToSgidOptions {
  app?: string;
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
  AttributeMethods as AMAttributeMethods,
  AttributeMethodPattern,
  type AttributeMethodsClassHalf,
  AttributeRegistration,
  type AttributeRegistrationClassHalf,
  Dirty as AMDirty,
  JSONSerializer,
  Model,
  ValueType,
  type AttributeOptions,
  type CallbackConditions,
  type CallbackObject,
  ValidationsCallbacks,
} from "@blazetrails/activemodel";
import { setCurrentAdapterResolver } from "./type.js";
import { Table, DeleteManager, Nodes } from "@blazetrails/arel";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { Relation } from "./relation.js";
import "./relation.js";
import { generatedRelationMethods as _generatedRelationMethods } from "./relation/delegation.js";
import { _setBase } from "./base-slot.js";
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
  resetDefaultAttributes as _resetDefaultAttributes,
} from "./attributes.js";
import * as Timestamp from "./timestamp.js";
import * as TouchLater from "./touch-later.js";
import { Association as AssociationInstance } from "./associations/association.js";
import {
  AssociationCache,
  type AssociationCache as _AssociationCache,
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
  InstanceMethods as CallbacksInstanceMethods,
} from "./callbacks.js";
import {
  sanitizeForMassAssignment,
  isMassAssignmentEmpty,
  assertAssignedSynchronously,
  type DirtyOptions,
  dirtyInitAttributes,
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
  registerGeneratedTokenVerifierSink as _registerGeneratedTokenVerifierSink,
  withFetch as _withFetch,
  generatesTokenFor as _generatesTokenFor,
  generateTokenFor as _generateTokenFor,
  findByTokenFor as _findByTokenFor,
  findByTokenForBang as _findByTokenForBang,
} from "./token-for.js";
import type { TokenDefinitionsHash as _TokenDefinitionsHash } from "./token-for.js";
import type { MessageVerifier as _MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import {
  getVerboseQueryLogs as _getVerboseQueryLogs,
  setVerboseQueryLogs as _setVerboseQueryLogs,
  setBaseResolver as _setBaseResolverWithLogSubscriber,
} from "./log-subscriber.js";
import { registerMigrationArConfig } from "./migration/ar-config-source.js";
import { registerTableNameOptions } from "./connection-adapters/abstract/table-name-options.js";
import { DatabaseTasks } from "./tasks/database-tasks.js";
import * as LockingOptimistic from "./locking/optimistic.js";
import * as LockingPessimistic from "./locking/pessimistic.js";
import {
  hookAttributeType as tzHookAttributeType,
  TimeZoneConversion as _TimeZoneConversion,
} from "./attribute-methods/time-zone-conversion.js";
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
  type BenchmarkLogger,
  runLoadHooks,
  type PrependMethod,
  singularize as _singularize,
  type Included,
  type ParameterFilter,
  peekCallbackChain,
  runCallbacks,
  type HashWithIndifferentAccess,
} from "@blazetrails/activesupport";
import {
  hasAttribute as _hasAttribute,
  _hasAttribute as _privateHasAttribute,
  attributePresent as _attributePresent,
  attributeNames as _attributeNames,
  attributes as _attributes,
  accessedFields as _accessedFields,
  attributesForCreate as _attributesForCreate,
  attributesForUpdate as _attributesForUpdate,
  ClassMethods as AttributeMethodsClassMethods,
  isAttributeMethod as _isAttributeMethod,
  defineAttributeMethods as _defineAttributeMethods,
  aliasAttribute as _aliasAttribute,
  undefineAttributeMethods as _undefineAttributeMethods,
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
  isSavedChangeToAttribute as _isSavedChangeToAttribute,
  savedChangeToAttribute as _savedChangeToAttribute,
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
  defineMethodAttribute as _defineMethodAttribute,
  Read as _Read,
} from "./attribute-methods/read.js";
import {
  setDefineMethodAttribute as _setDefineMethodAttribute,
  writeAttribute as _writeAttributeMethod,
  _writeAttribute as _writeAttributeLowLevel,
  Write as _Write,
} from "./attribute-methods/write.js";
import {
  BeforeTypeCast as _BeforeTypeCast,
  attributeCameFromUser as _attributeCameFromUser,
} from "./attribute-methods/before-type-cast.js";
import { Query as _Query } from "./attribute-methods/query.js";
import { Serialization as _AttrSerialization } from "./attribute-methods/serialization.js";
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
import type { WhereChain } from "./relation/query-methods.js";
import {
  ScopeRegistry,
  scopeRegistry as _scopeRegistry,
  setCurrentScope as _setCurrentScope,
  globalCurrentScope as _globalCurrentScope,
  setGlobalCurrentScope as _setGlobalCurrentScope,
  scopeAttributes,
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
  InstanceMethods as TransactionsInstanceMethods,
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
  initializeDup as _associationsInitializeDup,
} from "./associations.js";
import * as _AttributeAssignment from "./attribute-assignment.js";
import * as _NestedAttributes from "./nested-attributes.js";
import {
  hasSecureToken as _hasSecureToken,
  generateUniqueSecureToken as _generateUniqueSecureToken,
} from "./secure-token.js";
import { authenticateBy as _authenticateBy } from "./secure-password.js";
import {
  ClassMethods as _StoreClassMethods,
  localStoredAttributes as _localStoredAttributes,
  storedAttributes as _storedAttributes,
  readStoreAttribute as _readStoreAttribute,
  writeStoreAttribute as _writeStoreAttribute,
  storeAccessorFor as _storeAccessorFor,
} from "./store.js";
import { respondToMissing } from "./dynamic-matchers.js";

import { extractMultiparameterCallstack } from "./multiparameter-attribute-assignment.js";

export type PrimaryKeyScalar = string | number | bigint | null | undefined;

export type PrimaryKeyValue = PrimaryKeyScalar | PrimaryKeyScalar[];

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
      throw new ArgumentError(
        `You are passing an array of ActiveRecord::Base instances to \`${
          bang ? "update!" : "update"
        }\`. Please pass the ids of the objects by calling \`pluck(:id)\` or \`map(&:id)\`.`,
      );
    }
    const isParallel = this.compositePrimaryKey ? Array.isArray(idOrAttrs[0]) : true;
    if (!isParallel) {
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

function _shouldApplyScopeAttributes(ctor: typeof Base): boolean {
  return ctor.isScopeAttributes();
}

/**
 * Source-text of every `before`/`around` callback registered for `event` whose
 * filter is a plain function (so it can be introspected via
 * `Function.prototype.toString`). `opaque` is true when any before/around entry
 * is an object/method-name filter whose body cannot be read from here.
 *
 * @noRailsEquivalent CONVERGEABLE: Rails loads a `belongs_to` target lazily, at
 *   the moment a callback body dereferences it; trails has to decide up front
 *   which targets to await, and reads the registered filter bodies to narrow
 *   that set. See `_preloadBelongsToForDestroyCallbacks`. Not exported.
 */
function beforeOrAroundCallbackSources(
  proto: object,
  event: string,
): { sources: string[]; opaque: boolean } {
  const chain = peekCallbackChain(proto, event);
  if (!chain) return { sources: [], opaque: false };
  const sources: string[] = [];
  let opaque = false;
  for (const e of chain.entries) {
    if (e.kind !== "before" && e.kind !== "around") continue;
    if (typeof e.filter !== "function") {
      opaque = true;
      continue;
    }
    const src = e.filter.toString();
    if (src.includes("[native code]")) opaque = true;
    else sources.push(src);
  }
  return { sources, opaque };
}

function referencesAssociationName(sources: string[], name: string): boolean {
  const pattern = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  return sources.some((src) => pattern.test(src));
}

function expandCallbackSourcesWithHelpers(
  sources: string[],
  ctor: typeof Base,
  record?: InstanceType<typeof Base>,
): string[] {
  const methods = new Map<string, string>();
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
    const assocPending = _extractAssociationAttrs(ctor, toApply);
    const rest = assocPending ? assocPending.rest : toApply;
    if (Object.keys(rest).length > 0) {
      assertAssignedSynchronously((record as any)._assignAttributes(rest), "Model.new");
    }
    if (assocPending) _dispatchAssociationAttrs(record as unknown as Base, assocPending.assocs);
  }
}

/** @internal */
interface _AssociationDefLike {
  name: string;
  macro: string;
}

/** @internal */
interface _PendingAssociationAttr {
  name: string;
  value: unknown;
  assoc: _AssociationDefLike;
  idsKey: boolean;
}

/** @internal */
function _collectionIdsKeyOwner(
  defs: _AssociationDefLike[],
  key: string,
): _AssociationDefLike | undefined {
  if (!key.endsWith("Ids")) return undefined;
  return defs.find(
    (a) =>
      (a.macro === "hasMany" || a.macro === "hasAndBelongsToMany") &&
      `${_singularize(a.name)}Ids` === key,
  );
}

/** @internal */
function _extractAssociationAttrs(
  ctor: typeof Base | undefined,
  attrs: Record<string, unknown>,
): {
  rest: Record<string, unknown>;
  assocs: _PendingAssociationAttr[];
} | null {
  const reflections = (ctor as { _reflections?: Record<string, _AssociationDefLike> } | undefined)
    ?._reflections;
  if (!reflections) return null;
  const defs = Object.values(reflections);
  if (defs.length === 0) return null;
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
  const rest = Object.create(null) as Record<string, unknown>;
  const assocNames = new Set(assocs.map((a) => a.name));
  for (const [k, v] of Object.entries(attrs)) {
    if (!assocNames.has(k)) rest[k] = v;
  }
  return { rest, assocs };
}

/** @internal */
function _dispatchAssociationAttrs(record: Base, assocs: _PendingAssociationAttr[]): void {
  for (const { value, assoc, idsKey } of assocs) {
    const proxy = (
      record as unknown as { association(n: string): _ConstructorAssociationWriter | null }
    ).association(assoc.name);
    if (!proxy) continue;
    if (idsKey) {
      proxy.syncIdsWrite?.(value as unknown[]);
    } else if (assoc.macro === "hasMany" || assoc.macro === "hasAndBelongsToMany") {
      proxy.syncWrite?.(value as unknown[]);
    } else if (assoc.macro === "hasOne") {
      proxy.syncWrite?.(value);
    } else if (assoc.macro === "belongsTo") {
      proxy.writer?.(value);
    }
  }
}

/** @internal */
interface _ConstructorAssociationWriter {
  writer?: (v: unknown) => void;
  syncWrite?: (v: unknown) => void;
  syncIdsWrite?: (v: unknown[]) => void;
}

let _dbWarningsIgnore: (string | RegExp)[] = [];

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Base extends Model {
  declare static includeRootInJson: boolean | string;

  declare static beforeValidation: (typeof ValidationsCallbacks.ClassMethods)["beforeValidation"];
  declare static afterValidation: (typeof ValidationsCallbacks.ClassMethods)["afterValidation"];

  declare static normalizes: (...args: NormalizesArgs) => void;
  declare static normalizeValueFor: (name: string, value: unknown) => unknown;
  declare static normalizedAttributes: Set<string>;

  declare static lookupAncestors: typeof Translation.lookupAncestors;

  declare static sanitizeSql: typeof Sanitization.ClassMethods.sanitizeSql;
  declare static sanitizeSqlArray: typeof Sanitization.ClassMethods.sanitizeSqlArray;
  declare static sanitizeSqlLike: typeof Sanitization.sanitizeSqlLike;
  declare static sanitizeSqlForConditions: typeof Sanitization.ClassMethods.sanitizeSqlForConditions;
  declare static sanitizeSqlForAssignment: typeof Sanitization.ClassMethods.sanitizeSqlForAssignment;
  declare static sanitizeSqlForOrder: typeof Sanitization.ClassMethods.sanitizeSqlForOrder;
  declare static sanitizeSqlHashForAssignment: typeof Sanitization.ClassMethods.sanitizeSqlHashForAssignment;
  declare static disallowRawSqlBang: typeof Sanitization.disallowRawSqlBang;

  declare static belongsTo: typeof _Associations.belongsTo;
  declare static hasOne: typeof _Associations.hasOne;
  declare static hasMany: typeof _Associations.hasMany;
  declare static hasAndBelongsToMany: typeof _Associations.hasAndBelongsToMany;
  static get i18nScope(): string {
    return Translation.i18nScope.call(this);
  }

  static _tableName: string | null = null;
  declare static _primaryKey?: string | string[];
  static readonly _isActiveRecordBase = true;

  /** @internal */
  declare static _registryKeys: string[];

  static get dbWarningsIgnore(): (string | RegExp)[] {
    return _dbWarningsIgnore;
  }

  static set dbWarningsIgnore(value: (string | RegExp)[]) {
    _dbWarningsIgnore = value;
  }

  static writingRole = WRITING_ROLE;
  static readingRole = READING_ROLE;

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
  /** @internal */
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
  static _protectedEnvironments: string[] = ["production"];
  static _lockingColumn: string = "lock_version";

  declare static timeZoneAwareAttributes: boolean;

  declare static skipTimeZoneConversionForAttributes: string[];

  declare static timeZoneAwareTypes: string[];

  static get protectedEnvironments(): string[] {
    return ModelSchema.protectedEnvironments.call(this);
  }

  static set protectedEnvironments(envs: string[]) {
    ModelSchema.protectedEnvironments.call(this, envs);
  }

  declare static abstractClass: boolean;

  declare static signedIdVerifier: _MessageVerifier;

  declare static signedIdVerifierSecret: string | (() => string | null | undefined) | null;

  static _requireConcreteClass(): void {
    if ((this.abstractClass || this === Base) && !this._suppressAbstractCheck) {
      // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/inheritance.rb:58
      throw new NotImplementedError(
        `${this.name} is an abstract class and cannot be instantiated.`,
      );
    }
  }

  static get connectionClass(): boolean {
    return Object.prototype.hasOwnProperty.call(this, "_connectionClass")
      ? this._connectionClass
      : false;
  }

  static set connectionClass(value: boolean) {
    this._connectionClass = value;
  }

  static connectionClassQ(): boolean {
    return !!this.connectionClass;
  }

  static primaryClassQ(): boolean {
    return this === Base || this.applicationRecordClassQ();
  }

  static asynchronousQueriesSession(): Session {
    return _Core.asynchronousQueriesSession();
  }

  static asynchronousQueriesTracker(): AsynchronousQueriesTracker {
    return _Core.asynchronousQueriesTracker();
  }

  static currentPreventingWrites(): boolean {
    return _Core.currentPreventingWrites.call(this);
  }

  static currentRole(): string {
    return _Core.currentRole.call(this);
  }

  static currentShard(): string {
    return _Core.currentShard.call(this);
  }

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

  declare static tableNamePrefix: string;

  declare static tableNameSuffix: string;

  static get tableName(): string {
    return ModelSchema.tableName.call(this);
  }

  static set tableName(name: string) {
    ModelSchema.tableName.call(this, name);
  }

  static get primaryKey(): string | string[] {
    return _getPrimaryKeyAttr.call(this) as string | string[];
  }

  static set primaryKey(key: string | string[]) {
    _setPrimaryKeyAttr.call(this, key);
  }

  declare static lockingColumn: string;

  declare static lockOptimistically: boolean;

  declare static lockingEnabled: boolean;

  static get compositePrimaryKey(): boolean {
    return _isCompositePrimaryKey.call(this);
  }

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

  static attribute(
    name: string,
    typeName?: string | ValueType | AttributeOptions,
    options?: AttributeOptions,
  ): void {
    if (!Object.prototype.hasOwnProperty.call(this, "_generatedAttributeMethods")) {
      _initializeGeneratedModules.call(this as never);
    }
    if (
      typeName !== undefined &&
      typeof typeName !== "string" &&
      !(typeName instanceof ValueType)
    ) {
      options = typeName;
      typeName = undefined;
    }
    AttributeRegistration.ClassMethods.attribute.call(this as never, name, typeName, options);
    ModelSchema.clearAttributeNamesMemo(this as never);
    if (name === "id" && Object.prototype.hasOwnProperty.call(this.prototype, "id")) {
      delete (this.prototype as any).id;
    }
    encryptionHooks.applyPendingEncryptions(this);
  }

  /** @internal */
  static hookAttributeType(name: string, type: ValueType): ValueType {
    const tzType = tzHookAttributeType.call(this as any, name, type);
    return LockingOptimistic.hookAttributeType.call(this as any, name, tzType);
  }

  static typeForAttribute(name: string, block?: () => ValueType): ValueType | null {
    (ModelSchema.loadSchema as any).call(this);
    const resolved = (this as any).attributeAliases?.[name] ?? name;
    if (block) {
      const attributeTypes = this.attributeTypes();
      return Object.hasOwn(attributeTypes, resolved) ? attributeTypes[resolved] : block();
    }
    return this.attributeTypes()[resolved];
  }

  static get arelTable(): Table {
    return _Core.arelTable.call(this);
  }

  static typeCaster = _Core.typeCaster;

  static get predicateBuilder(): import("./relation/predicate-builder.js").PredicateBuilder {
    return _Core.predicateBuilder.call(this);
  }

  static set adapter(adapter: DatabaseAdapter) {
    if (this._adapter === adapter) {
      return;
    }
    if (this !== Base && this.name) {
      registerModelConstant(this.name, this);
    }
    this._adapter = adapter;

    const invalidate = (klass: typeof Base) => {
      (ModelSchema.resetColumnInformation as any).call(klass);
      (klass as unknown as { _schemaLoadPromise?: Promise<void> })._schemaLoadPromise = undefined;
    };
    invalidate(this);
    for (const descendant of this.descendants) {
      if (!Object.prototype.hasOwnProperty.call(descendant, "_adapter")) {
        invalidate(descendant);
      }
    }
  }

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
   * Reflect the schema from the configured adapter the first time the
   * query/persistence path needs it — the async analogue of Rails' synchronous
   * `method_missing` schema load (activemodel/attribute_methods.rb:474-486).
   * Every declaration reaching here is a user `attribute()`; whether it also
   * names a real column is decided by `columns_hash`, which is DB-sourced
   * (model_schema.rb:437-441), so nothing has to be classified first.
   *
   * The residual gap is attribute access on a record that was never queried and
   * never loaded (e.g. `new User().handle` before any DB hit), which a getter
   * can't await without wrapping instances in a `Proxy`.
   *
   * @internal
   * @noRailsEquivalent CONVERGEABLE the schema load Ruby performs synchronously from method_missing (active_model/attribute_methods.rb:507-486); async here, so callers must await it.
   */
  static ensureSchemaLoaded(this: typeof Base): Promise<void> {
    return this.loadSchema();
  }

  /** @deprecated */
  static get adapter(): DatabaseAdapter {
    return this.connection;
  }

  static get connectionHandler(): ConnectionHandler {
    return _Core.connectionHandler.call(this);
  }

  static async establishConnection(
    configOrEnv?:
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
    return ConnectionHandling.establishConnection(this, configOrEnv);
  }

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

  declare static decorateAttributes: AttributeRegistrationClassHalf["decorateAttributes"];
  declare static attributeTypes: AttributeRegistrationClassHalf["attributeTypes"];
  /** @internal */
  declare static pendingAttributeModifications: AttributeRegistrationClassHalf["pendingAttributeModifications"];
  /** @internal */
  declare static resetDefaultAttributesBang: AttributeRegistrationClassHalf["resetDefaultAttributesBang"];
  /** @internal */
  declare static resolveAttributeName: AttributeRegistrationClassHalf["resolveAttributeName"];

  declare static attributeAliases: Record<string, string>;
  declare static isAttributeAliases: boolean;
  declare static attributeMethodPatterns: AttributeMethodPattern[];
  declare static isAttributeMethodPatterns: boolean;
  declare static attributeMethodPrefix: AttributeMethodsClassHalf["attributeMethodPrefix"];
  declare static attributeMethodSuffix: AttributeMethodsClassHalf["attributeMethodSuffix"];
  declare static attributeMethodAffix: AttributeMethodsClassHalf["attributeMethodAffix"];
  declare static generateAliasAttributeMethods: AttributeMethodsClassHalf["generateAliasAttributeMethods"];
  declare static isAttributeAlias: AttributeMethodsClassHalf["isAttributeAlias"];
  declare static attributeAlias: AttributeMethodsClassHalf["attributeAlias"];
  declare static defineAttributeMethod: AttributeMethodsClassHalf["defineAttributeMethod"];
  declare static defineAttributeMethodPattern: AttributeMethodsClassHalf["defineAttributeMethodPattern"];
  declare static isInstanceMethodAlreadyImplemented: AttributeMethodsClassHalf["isInstanceMethodAlreadyImplemented"];
  /** @internal */
  declare static _aliasesByAttributeName: Map<string, string[]>;
  /** @internal */
  declare static generatedAttributeMethods: AttributeMethodsClassHalf["generatedAttributeMethods"];
  /** @internal */
  declare static attributeMethodPatternsCache: AttributeMethodsClassHalf["attributeMethodPatternsCache"];
  /** @internal */
  declare static attributeMethodPatternsMatching: AttributeMethodsClassHalf["attributeMethodPatternsMatching"];
  /** @internal */
  declare static defineProxyCall: AttributeMethodsClassHalf["defineProxyCall"];
  /** @internal */
  declare static buildMangledName: AttributeMethodsClassHalf["buildMangledName"];
  /** @internal */
  declare static defineCall: AttributeMethodsClassHalf["defineCall"];

  declare static defineAttribute: typeof _defineAttribute;
  declare static initializeGeneratedModules: typeof _initializeGeneratedModules;
  /** @internal */
  declare static _generatedAttributeMethods?: GeneratedAttributeMethods;
  declare static defineAttributeMethods: typeof _defineAttributeMethods;
  declare static undefineAttributeMethods: typeof _undefineAttributeMethods;
  declare static aliasAttribute: typeof _aliasAttribute;
  declare static generateAliasAttributes: typeof _generateAliasAttributes;
  declare static _defaultAttributes: typeof _arDefaultAttributes;
  /** @internal */
  declare static resolveTypeName: typeof _resolveTypeName;
  /** @internal */
  declare static resetDefaultAttributes: typeof _resetDefaultAttributes;
  /** @internal */
  declare static reloadSchemaFromCache: () => void;

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

  static isBaseClass(): boolean {
    return _isBaseClass(this);
  }

  static primaryAbstractClass(): void {
    primaryAbstractClass(this);
  }

  /**
   * @internal
   * Mirrors: ActiveRecord::Core::ClassMethods#application_record_class?
   * @noRailsEquivalent CONVERGEABLE Core::ClassMethods#application_record_class? (core.rb:121) surfaced on Base as well as in inheritance.ts; one of the two should go.
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

  static _logger: BenchmarkLogger | null = null;

  static get logger(): BenchmarkLogger | null {
    return this._logger;
  }

  static set logger(log: BenchmarkLogger | null) {
    this._logger = log;
  }

  static benchmark = benchmarkable;

  static _recordTimestamps = true;

  static get recordTimestamps(): boolean {
    return this._recordTimestamps;
  }

  static set recordTimestamps(value: boolean) {
    this._recordTimestamps = value;
  }

  declare static partialUpdates: boolean;
  declare static partialInserts: boolean;

  static async noTouching<R>(fn: () => R | Promise<R>): Promise<R> {
    return _noTouchingBlock(this, fn);
  }

  declare isNoTouching: () => boolean;

  static _sequenceName: string | null = null;

  static get sequenceName(): string | null {
    return ModelSchema.sequenceName.call(this);
  }

  static set sequenceName(name: string | null) {
    ModelSchema.sequenceName.call(this, name);
  }

  static _ignoredColumns: string[] = [];

  static get ignoredColumns(): string[] {
    return ModelSchema.ignoredColumns.call(this);
  }

  static set ignoredColumns(columns: string[]) {
    ModelSchema.ignoredColumns.call(this, columns);
  }

  static _suppressInitializeCallback = false;

  static _suppressAbstractCheck = false;

  declare static attrReadonly: typeof ReadonlyAttributes.attrReadonly;
  declare static readonlyAttributeQ: typeof ReadonlyAttributes.readonlyAttributeQ;

  static get readonlyAttributes(): string[] {
    return ReadonlyAttributes.readonlyAttributes.call(this);
  }

  declare static nestedAttributesOptions: Record<
    string,
    import("./nested-attributes.js").NestedAttributeOptions
  >;

  static acceptsNestedAttributesFor(
    associationName: string,
    options?: Parameters<typeof _NestedAttributes.acceptsNestedAttributesFor>[2],
  ): void {
    _NestedAttributes.acceptsNestedAttributesFor(this, associationName, options);
  }

  static get verboseQueryLogs(): boolean {
    return _getVerboseQueryLogs();
  }

  static set verboseQueryLogs(value: boolean) {
    _setVerboseQueryLogs(value);
  }

  declare static tokenDefinitions: _TokenDefinitionsHash;

  declare static generatedTokenVerifier: _MessageVerifier | null;

  static encrypts(...args: Array<string | EncryptsOptions>): void {
    encryptionHooks.encrypts(this, ...args);
  }

  /** @internal */
  encryptedAttribute(attributeName: string): boolean {
    return encryptionHooks.encryptedAttribute(this, attributeName);
  }

  /** @internal */
  ciphertextFor(attributeName: string): unknown {
    return encryptionHooks.ciphertextFor(this, attributeName);
  }

  /** @internal */
  async encrypt(): Promise<void> {
    return encryptionHooks.encrypt(this);
  }

  /** @internal */
  async decrypt(): Promise<void> {
    return encryptionHooks.decrypt(this);
  }

  static async suppress<R>(fn: () => R | Promise<R>): Promise<R> {
    return _suppressBlock(this, fn);
  }

  static get registry(): Record<string, true | undefined> {
    return _suppressorRegistry();
  }

  declare static encryptedAttributes: Set<string> | undefined;
  declare static readonly isEncryptedAttributes: boolean;
  declare static _attrReadonly: string[];
  declare static defaultScopes: import("./scoping/default.js").DefaultScope[];
  declare static defaultScopeOverride: boolean | null;
  declare static _reflections: Record<string, _Reflection.AssociationReflection>;
  declare static aggregateReflections: Record<string, _Reflection.AggregateReflection>;
  declare static _reflectOnAssociation: typeof _Reflection.ClassMethods._reflectOnAssociation;
  declare static reflections: typeof _Reflection.ClassMethods.reflections;
  declare static normalizedReflections: typeof _Reflection.ClassMethods.normalizedReflections;
  declare static reflectOnAssociation: typeof _Reflection.ClassMethods.reflectOnAssociation;
  declare static reflectOnAllAssociations: typeof _Reflection.ClassMethods.reflectOnAllAssociations;
  declare static reflectOnAllAggregations: typeof _Reflection.ClassMethods.reflectOnAllAggregations;
  declare static reflectOnAggregation: typeof _Reflection.ClassMethods.reflectOnAggregation;
  declare static reflectOnAllAutosaveAssociations: typeof _Reflection.ClassMethods.reflectOnAllAutosaveAssociations;

  declare static validates: typeof Model.validates;
  declare static validatesAssociated: typeof _Validations.validatesAssociated;

  static _enums: Map<string, Record<string, number | string | boolean | null>> = new Map();

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

  declare static collectingQueriesForExplain: typeof _collectingQueriesForExplain;

  declare static execExplain: typeof _execExplain;

  /** @internal */
  declare static renderBind: typeof _renderBind;

  /** @internal */
  declare static buildExplainClause: typeof _buildExplainClause;

  static delegatedType(
    role: string,
    options: import("./delegated-type.js").DelegatedTypeOptions,
  ): void {
    _delegatedType(this, role, options);
  }

  /** @internal */
  static defineDelegatedTypeMethods(
    role: string,
    {
      types,
      options,
    }: {
      types: string[];
      options: Omit<import("./delegated-type.js").DelegatedTypeOptions, "types">;
    },
  ): void {
    _defineDelegatedTypeMethods(this, role, {
      types,
      options: options as import("./delegated-type.js").DelegatedTypeOptions,
    });
  }

  declare static store: typeof _StoreClassMethods.store;

  declare static storeAccessor: typeof _StoreClassMethods.storeAccessor;

  declare static _storeAccessorsModule: typeof _StoreClassMethods._storeAccessorsModule;

  static authenticateBy = _authenticateBy;

  static hasSecureToken = _hasSecureToken;

  static generateUniqueSecureToken = _generateUniqueSecureToken;

  static generatesTokenFor = _generatesTokenFor;

  static findByTokenFor = _findByTokenFor;

  static findByTokenForBang = _findByTokenForBang;

  declare static defaultColumnSerializer: unknown;

  declare static serialize: (
    attribute: string,
    options?: AttributeOptions & {
      coder?: unknown;
      type?: "Array" | "Hash" | (new (...args: any[]) => any);
    },
  ) => void;

  declare static localStoredAttributes: typeof _localStoredAttributes;

  static storedAttributes = _storedAttributes;

  static _scopes: Map<string, (this: any, ...args: any[]) => any> = new Map();

  declare static defaultScope: typeof _defaultScope;
  declare static unscoped: typeof _unscoped;

  /** @internal */
  static _allForPreload(): any {
    return this.defaultScoped();
  }

  /** @internal */
  static relation(): any {
    const relation = Relation.create(this);

    if (isFinderNeedsTypeCondition(this) && !isIgnoreDefaultScope.call(this)) {
      if (this.inheritanceColumn === null) return relation;
      return relation.whereBang(typeCondition(this));
    } else {
      return relation;
    }
  }

  declare static scope: typeof NamedScoping.scope;
  declare static scopeForAssociation: typeof NamedScoping.scopeForAssociation;
  declare static defaultScoped: typeof NamedScoping.defaultScoped;
  declare static defaultExtensions: typeof NamedScoping.defaultExtensions;

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
    return typeof optionsOrFn === "function"
      ? rel.scoping(optionsOrFn)
      : rel.scoping(optionsOrFn, maybeFn);
  }

  static currentScope(skipInheritedScope = false): any | null {
    return ScopeRegistry.currentScope(this, skipInheritedScope);
  }

  static setCurrentScope = _setCurrentScope;

  static globalCurrentScope = _globalCurrentScope;

  static setGlobalCurrentScope = _setGlobalCurrentScope;

  static scopeRegistry = _scopeRegistry;

  static isScopeAttributes = _isScopeAttributes;

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

  declare static initializeFindByCache: typeof _Core.initializeFindByCache;
  declare static cachedFindByStatement: typeof _Core.cachedFindByStatement;
  declare static _findByStatementCache?: Map<boolean, Map<string, unknown>>;

  declare static configurations: typeof _Core.configurations;

  declare static findByBang: <T extends typeof Base>(
    this: T,
    conditions: Record<string, unknown> | string,
    ...rest: unknown[]
  ) => Promise<InstanceType<T>>;

  static respondToMissing = respondToMissing;

  static async findSoleBy<T extends typeof Base>(
    this: T,
    ...conditions: unknown[]
  ): Promise<InstanceType<T>> {
    return (this.all().where as any)(...conditions).sole();
  }

  static all<T extends typeof Base>(
    this: T,
    options?: { allQueries?: boolean | null },
  ): Relation<InstanceType<T>> {
    const scope = this.currentScope();
    if (scope) {
      if (scope._model === this) {
        return scope.clone();
      }
      return this.relation().mergeBang(scope);
    }
    return this.defaultScoped({ allQueries: options?.allQueries });
  }

  static where<T extends typeof Base>(this: T): WhereChain<Relation<InstanceType<T>>>;
  static where<T extends typeof Base>(
    this: T,
    conditions: Record<string, unknown>,
  ): Relation<InstanceType<T>>;
  static where<T extends typeof Base>(
    this: T,
    conditions: Map<unknown, unknown>,
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
    conditionsOrSql?:
      | Record<string, unknown>
      | Map<unknown, unknown>
      | string
      | string[]
      | unknown[]
      | Nodes.Node,
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
    if (
      Array.isArray(conditionsOrSql) &&
      rest.length > 0 &&
      conditionsOrSql.every((c) => typeof c === "string")
    ) {
      if (rest.length !== 1 || !Array.isArray(rest[0])) {
        throw new ArgumentError(
          `${(this as { name?: string }).name ?? "Model"}.where(cols, tuples): composite-key form requires a tuples argument as an array of arrays`,
        );
      }
      return this.all().where(conditionsOrSql as string[], rest[0] as unknown[][]);
    }
    if (Array.isArray(conditionsOrSql)) {
      return this.all().where(conditionsOrSql as unknown[]);
    }
    return this.all().where(conditionsOrSql as Record<string, unknown>);
  }

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
    return performClassUpdate.call(this, idOrAttrs, attrs, false) as Promise<
      InstanceType<T> | InstanceType<T>[]
    >;
  }

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
    return performClassUpdate.call(this, idOrAttrs, attrs, true) as Promise<
      InstanceType<T> | InstanceType<T>[]
    >;
  }

  declare static touchAll: typeof Timestamp.touchAll;

  static createOrFindBy<T extends typeof Base>(
    this: T,
    conditions: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): Promise<InstanceType<T>> {
    return this.all().createOrFindBy(conditions, extra);
  }

  static createOrFindByBang<T extends typeof Base>(
    this: T,
    conditions: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): Promise<InstanceType<T>> {
    return this.all().createOrFindByBang(conditions, extra);
  }

  /** @noRailsEquivalent PERMANENT */
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

  static instantiate<T extends typeof Base>(
    this: T,
    attributes: Record<string, unknown>,
    columnTypes?: Record<string, unknown>,
    block?: (record: InstanceType<T>) => void,
  ): InstanceType<T> {
    return _Persistence.instantiate.call(this, attributes, columnTypes, block);
  }

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
  declare static destroy: typeof Querying.destroy;
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

  declare static incrementCounter: typeof CounterCache.incrementCounter;
  declare static decrementCounter: typeof CounterCache.decrementCounter;
  declare static updateCounters: typeof CounterCache.updateCounters;
  declare static resetCounters: typeof CounterCache.resetCounters;
  declare static isCounterCacheColumn: typeof CounterCache.isCounterCacheColumn;
  declare static _counterCacheColumns: string[];
  declare static counterCachedAssociationNames: string[];

  static _instantiate<T extends typeof Base>(
    this: T,
    row: Record<string, unknown>,
    block?: (record: InstanceType<T>) => void,
    columnTypes?: Record<string, { deserialize(value: unknown): unknown }>,
    overrideTypes?: Record<string, { deserialize(value: unknown): unknown }>,
  ): InstanceType<T> {
    const klass = discriminateClassForRecord(this, row);
    if (klass !== this) {
      return klass._instantiate(
        row,
        block as ((record: Base) => void) | undefined,
        columnTypes,
        overrideTypes,
      ) as InstanceType<T>;
    }

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
    const additionalTypes = { ...(columnTypes ?? {}), ...(overrideTypes ?? {}) };
    (record as any).initWithAttributes(
      (this as any).attributesBuilder().buildFromDatabase(row, additionalTypes),
    );
    defineDynamicSelectReaders(record as unknown as Base);
    record._newRecord = false;
    record.changesApplied();
    if (this._strictLoadingByDefault) {
      record._strictLoading = true;
    }
    block?.(record);
    void runCallbacks(record, "find", undefined, { strict: "sync" });
    void runCallbacks(record, "initialize", undefined, { strict: "sync" });
    return record;
  }

  _newRecord = true;
  _destroyed = false;
  _destroyCallbackAlreadyCalled = false;
  _readonly = false;
  _previouslyNewRecord = false;
  private _destroyedByAssociation: unknown = null;
  _transactionAction: "create" | "update" | "destroy" | undefined = undefined;
  _strictLoadingBypassCount = 0;

  /** @internal */
  _associationCache(name: string): { target?: Base | Base[] | null } | undefined {
    const instance = this._associationInstances.get(name) as
      | (AssociationInstance & {
          target?: Base | Base[] | null;
        })
      | undefined;
    if (instance?.isLoaded() && !instance.isCollection()) return instance;
    const proxy = this._collectionProxies.get(name) as
      | { loaded?: boolean; target?: Base[] }
      | undefined;
    if (
      proxy &&
      (proxy.loaded === true || (Array.isArray(proxy.target) && proxy.target.length > 0))
    ) {
      return proxy;
    }
    if (
      instance?.isCollection() === true &&
      (instance.isLoaded() === true ||
        (Array.isArray(instance.target) && instance.target.length > 0))
    ) {
      return instance;
    }
    return undefined;
  }

  /** @internal */
  _resetAssociationCaches(): void {
    if (this._associationCacheStore === undefined) {
      this._associationCacheStore = new AssociationCache();
      this._collectionProxies = this._associationCacheStore.proxies;
      this._associationInstances = this._associationCacheStore.instances as Map<
        string,
        AssociationInstance
      >;
      return;
    }
    this._associationCacheStore.clear();
  }

  /** @missingRailsCall init_internals — CONVERGEABLE base-constructor-calls-init-internals-not-activemodel */
  constructor(attrs: Record<string, unknown> = {}, initBlock?: (record: Base) => void) {
    (new.target as typeof Base | undefined)?._requireConcreteClass();
    attrs ??= {};
    if (!isMassAssignmentEmpty(attrs)) {
      attrs = sanitizeForMassAssignment(attrs);
    }
    if (
      (new.target as (typeof Base & { _suppressStiNewDispatch?: unknown }) | undefined)
        ?._suppressStiNewDispatch !== new.target
    ) {
      const stiTarget = subclassFromAttributesForNew(new.target, attrs);
      if (stiTarget && stiTarget !== new.target) {
        return new stiTarget(attrs, initBlock);
      }
    }
    let assocPending = _extractAssociationAttrs(new.target, attrs);
    if (assocPending) attrs = assocPending.rest;
    const ctor = new.target;
    const suppressor = ctor as typeof ctor & { _suppressInitializeCallback?: boolean };
    const hadOwn = Object.prototype.hasOwnProperty.call(suppressor, "_suppressInitializeCallback");
    const wasSuppressed = suppressor._suppressInitializeCallback;
    suppressor._suppressInitializeCallback = true;
    try {
      super(attrs);
    } finally {
      if (hadOwn) {
        suppressor._suppressInitializeCallback = wasSuppressed;
      } else {
        delete (suppressor as { _suppressInitializeCallback?: boolean })
          ._suppressInitializeCallback;
      }
    }
    if (!wasSuppressed) {
      inheritanceInitializeInternalsCallback.call(this as any);
      if (_shouldApplyScopeAttributes(ctor)) {
        const { multiparams, regular } = extractMultiparameterCallstack(attrs);
        _applyScopeAttributes(
          ctor,
          this as any,
          new Set([...Object.keys(multiparams), ...Object.keys(regular)]),
        );
      }
      if (assocPending) {
        _dispatchAssociationAttrs(this as unknown as Base, assocPending.assocs);
        assocPending = null;
      }
      initBlock?.(this as unknown as Base);
      void runCallbacks(this, "initialize", undefined, { strict: "sync" });
    }
    if (assocPending) {
      _dispatchAssociationAttrs(this as unknown as Base, assocPending.assocs);
    }
  }

  declare isNewRecord: typeof _Persistence.isNewRecord;
  declare isPersisted: typeof _Persistence.isPersisted;
  declare isDestroyed: typeof _Persistence.isDestroyed;
  declare isPreviouslyNewRecord: typeof _Persistence.isPreviouslyNewRecord;
  declare isPreviouslyPersisted: typeof _Persistence.isPreviouslyPersisted;

  declare isReadonly: typeof _Core.isReadonly;
  declare readonlyBang: typeof _Core.readonlyBang;
  declare isStrictLoading: typeof _Core.isStrictLoading;
  declare strictLoadingBang: typeof _Core.strictLoadingBang;
  declare strictLoadingMode: typeof _Core.strictLoadingMode;
  declare isStrictLoadingAll: typeof _Core.isStrictLoadingAll;
  declare isStrictLoadingNPlusOneOnly: typeof _Core.isStrictLoadingNPlusOneOnly;
  declare isFrozen: typeof _Core.isFrozen;
  declare freeze: () => this;

  get destroyedByAssociation(): unknown {
    return this._destroyedByAssociation;
  }

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

  declare static validatesUniquenessOf: typeof _Validations.validatesUniquenessOf;

  private async _createOrUpdate(block?: (record: this) => void): Promise<boolean> {
    const ctor = this.constructor as typeof Base;
    let saved = false;
    let wasNewRecord = false;

    const saveOk = await runCallbacks(this, "save", async () => {
      wasNewRecord = this._newRecord;
      if (wasNewRecord) {
        const createOk = await this._createRecord(undefined, block);
        if (createOk) saved = true;
        else saved = false;
      } else {
        const result = await this._updateRecord(undefined, block);
        saved = result !== false;
      }

      if (saved) {
        this._transactionAction = wasNewRecord ? "create" : "update";
        (this as any)._newRecordBeforeLastCommit = wasNewRecord;
      }

      return saved;
    });

    if (!saveOk) return false;

    if (saved) {
      await flushPendingReplaces(this);
    }

    return saved;
  }

  private _touchRecord: boolean | null = null;
  private _instanceRecordTimestamps: boolean | null = null;

  get recordTimestamps(): boolean {
    return this._instanceRecordTimestamps ?? (this.constructor as typeof Base).recordTimestamps;
  }

  set recordTimestamps(value: boolean) {
    this._instanceRecordTimestamps = value;
  }

  /** @internal */
  private async _preloadBelongsToForDestroyCallbacks(): Promise<void> {
    const ctor = this.constructor as typeof Base;
    if (typeof (this as any).association !== "function") return;
    const { sources, opaque } = beforeOrAroundCallbackSources(ctor.prototype, "destroy");
    if (!opaque && sources.length === 0) return;
    const expanded = opaque ? sources : expandCallbackSourcesWithHelpers(sources, ctor, this);
    const useSavepoint = _currentTransactionPublic().isOpen();
    for (const ref of ctor.reflectOnAllAssociations("belongsTo")) {
      if (!opaque && !referencesAssociationName(expanded, ref.name)) continue;
      let assoc: any;
      try {
        assoc = (this as any).association(ref.name);
        if (!assoc || assoc.isLoaded()) continue;
        if (useSavepoint) {
          await _transaction(ctor, () => assoc.loadTarget(), { requiresNew: true });
        } else {
          await assoc.loadTarget();
        }
      } catch {
        assoc?.setTarget?.(null);
      }
    }
  }

  /** @internal */
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

    await this._preloadBelongsToForDestroyCallbacks();

    let didDelete = false;
    const destroyResult = await runCallbacks(this, "destroy", async () => {
      await (this as any).destroyAssociations();

      const table = ctor.arelTable;
      if (this.isPersisted()) {
        const dm = new DeleteManager()
          .from(table)
          .where(
            ctor._buildQueryConstraintsWhereNode(
              _Persistence._queryConstraintsHash.call(this as any),
            ),
          );
        const lockCol = ctor.lockingColumn;
        if (ctor.lockingEnabled) {
          const lockAttr = this._attributes.getAttribute(lockCol);
          const lockWhereValue = this.isWillSaveChangeToAttribute(lockCol)
            ? lockAttr.valueForDatabase
            : lockAttr.originalValueForDatabase();
          if (lockWhereValue == null) {
            dm.where(table.get(lockCol).eq(null));
          } else {
            dm.where(table.get(lockCol).eq(Number(lockWhereValue) || 0));
          }
        }
        _Persistence.applyDefaultAndGlobalConstraints(dm as any, ctor);

        const adapter = ConnectionHandling.threadedConnectionFor(ctor) ?? ctor.connection;
        const affected = await adapter.delete(dm, `${ctor.name} Destroy`);
        if (ctor.lockingEnabled && affected !== 1) {
          throw new StaleObjectError(this, "destroy");
        }
        didDelete = (await CounterCache.destroyRow.call(this as any, async () => affected)) > 0;
      }

      this._destroyed = true;
      this._previouslyNewRecord = false;
      this.freeze();
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

  static async delete(id: unknown): Promise<number> {
    if (id === null || id === undefined || (Array.isArray(id) && id.length === 0)) {
      return 0;
    }
    const pk = this.primaryKey;
    if (Array.isArray(pk)) {
      if (!Array.isArray(id)) {
        throw new ArgumentError(
          `${this.name}.delete expects a tuple (or array of tuples) matching the composite primary key [${pk.join(", ")}]`,
        );
      }
      const arr = id as unknown[];
      const tuples: unknown[][] = Array.isArray(arr[0]) ? (arr as unknown[][]) : [arr];
      for (const tuple of tuples) {
        if (!Array.isArray(tuple) || tuple.length !== pk.length) {
          throw new ArgumentError(
            `${this.name}.delete tuple length ${Array.isArray(tuple) ? tuple.length : "<scalar>"} does not match composite primary key arity ${pk.length}`,
          );
        }
      }
      return this.all().where(pk, tuples).deleteAll();
    }
    return this.all()
      .where({ [pk]: id as unknown })
      .deleteAll();
  }

  declare lockBang: typeof LockingPessimistic.lockBang;
  declare withLock: typeof LockingPessimistic.withLock;

  declare toParam: () => string | null;

  declare inspect: () => string;
  declare prettyPrint: typeof _Core.prettyPrint;
  declare attributeForInspect: (attrName: string) => string;

  toGid(
    options?: import("@blazetrails/globalid").GlobalIDOptions,
  ): import("@blazetrails/globalid").GlobalID {
    return this.toGlobalId(options);
  }

  toSgid(options?: ToSgidOptions): SignedGlobalIDType {
    const verifier = (this.constructor as typeof Base).signedIdVerifier;
    return _SignedGlobalIDCtor.create(this as GlobalIDModel, { ...options, verifier });
  }

  toSgidParam(options?: Parameters<Base["toSgid"]>[0]): string {
    return this.toSgid(options).toParam();
  }

  toGlobalId(
    options?: import("@blazetrails/globalid").GlobalIDOptions,
  ): import("@blazetrails/globalid").GlobalID {
    return _GlobalIDCtor.create(this as unknown as GlobalIDModel, options);
  }

  toGidParam(options?: import("@blazetrails/globalid").GlobalIDOptions): string {
    return this.toGlobalId(options).toParam();
  }

  toSignedGlobalId(options?: Parameters<Base["toSgid"]>[0]): SignedGlobalIDType {
    return this.toSgid(options);
  }

  static findGlobalId(
    input: string | import("@blazetrails/globalid").GlobalID,
    options?: import("@blazetrails/globalid").LocateOptions,
  ): Promise<unknown | null> {
    return _Locator.locate(input, options);
  }

  static async findSignedGlobalId(
    input: string | _SignedGlobalIDType,
    options?: Omit<import("@blazetrails/globalid").LocateSignedOptions, "verifier">,
  ): Promise<unknown | null> {
    const verifier = this.signedIdVerifier;
    return _Locator.locateSigned(input, { ...options, verifier });
  }

  static async findSignedGlobalIdBang(
    input: string | _SignedGlobalIDType,
    options?: Omit<import("@blazetrails/globalid").LocateSignedOptions, "verifier">,
  ): Promise<unknown> {
    const found = await this.findSignedGlobalId(input, options);
    if (found == null) throw new RecordNotFound("Couldn't find SignedGlobalID");
    return found;
  }

  declare touch: typeof TouchLater.touch;
  declare touchLater: typeof TouchLater.touchLater;
  declare beforeCommittedBang: typeof TouchLater.beforeCommittedBang;

  declare hasAttribute: (attrName: string) => boolean;
  declare attributePresent: (attrName: string) => boolean;
  declare readAttributeBeforeTypeCast: (attrName: string) => unknown;
  declare attributesBeforeTypeCast: () => Record<string, unknown>;
  declare typeForAttribute: (name: string, block?: () => ValueType) => ValueType | null;
  declare columnForAttribute: (name: string) => any;
  declare toKey: () => unknown[] | null;
  declare accessedFields: () => string[];
  declare queryAttribute: (attrName: string) => boolean;
  declare _queryAttribute: (attrName: string) => boolean;
  declare readAttribute: (name: string, block?: (name: string) => unknown) => unknown;
  declare get: (attrName: string) => unknown;
  declare set: (attrName: string, value: unknown) => void;
  /** @internal */
  declare _readAttribute: (name: string) => unknown;
  declare _writeAttribute: (name: string, value: unknown) => void;
  declare readStoreAttribute: (storeAttribute: string, key: string) => unknown;
  declare writeStoreAttribute: (storeAttribute: string, key: string, value: unknown) => void;
  /** @internal */
  declare storeAccessorFor: (storeAttribute: string) => typeof import("./store.js").HashAccessor;

  attributeNames(): string[] {
    return _attributeNames.call(this as any);
  }

  static attributeNames(): string[] {
    return AttributeMethodsClassMethods.attributeNames.call(this);
  }

  /** @internal */
  static _hasAttribute(attrName: string): boolean {
    return AttributeMethodsClassMethods._hasAttribute.call(this as never, attrName);
  }

  static get columnDefaults(): Record<string, unknown> {
    return ModelSchema.columnDefaults.call(this as any);
  }

  static _strictLoadingByDefault = false;

  static get strictLoadingByDefault(): boolean {
    return this._strictLoadingByDefault;
  }

  static set strictLoadingByDefault(value: boolean) {
    this._strictLoadingByDefault = value;
  }

  static _strictLoadingMode: _Core.StrictLoadingMode = "all";

  static get strictLoadingMode(): _Core.StrictLoadingMode {
    return this._strictLoadingMode;
  }

  static set strictLoadingMode(value: _Core.StrictLoadingMode) {
    this._strictLoadingMode = value;
  }

  static _storeFullStiClass = true;

  static get storeFullStiClass(): boolean {
    return this._storeFullStiClass;
  }

  static set storeFullStiClass(value: boolean) {
    this._storeFullStiClass = value;
  }

  static _storeFullClassName = true;

  static get storeFullClassName(): boolean {
    return this._storeFullClassName;
  }

  static set storeFullClassName(value: boolean) {
    this._storeFullClassName = value;
  }

  static _runCommitCallbacksOnFirstSavedInstancesInTransaction = true;

  static get runCommitCallbacksOnFirstSavedInstancesInTransaction(): boolean {
    return this._runCommitCallbacksOnFirstSavedInstancesInTransaction;
  }

  static set runCommitCallbacksOnFirstSavedInstancesInTransaction(value: boolean) {
    this._runCommitCallbacksOnFirstSavedInstancesInTransaction = value;
  }

  static get defaultConnectionHandler(): ConnectionHandler {
    return this._connectionHandler;
  }

  static set defaultConnectionHandler(value: ConnectionHandler) {
    this._connectionHandler = value;
  }

  static defaultRole: string = WRITING_ROLE;

  static belongsToRequiredByDefault = false;

  static enumerateColumnsInSelectStatements = false;

  static shardSelector: unknown = null;

  static _destroyAssociationAsyncJob: unknown = null;

  static destroyAssociationAsyncJob = _Core.destroyAssociationAsyncJob;

  static destroyAssociationAsyncBatchSize: number | null = null;

  static primaryKeyPrefixType: string | null = null;

  static getPrimaryKey = _getPrimaryKey;

  static resetPrimaryKey = _resetPrimaryKey;

  static implicitOrderColumn: string | null = null;

  static pluralizeTableNames = true;

  static schemaMigrationsTableName = "schema_migrations";

  static internalMetadataTableName = "ar_internal_metadata";

  static immutableStringsByDefault = false;

  static isDescendsFromActiveRecord = _isDescendsFromActiveRecord;

  /** @internal */
  static usingSingleTableInheritance = _usingSingleTableInheritance;

  /** @internal */
  static generateAssociationWriter = _NestedAttributes.generateAssociationWriter;

  /** @internal */
  static generatedRelationMethods = _generatedRelationMethods;

  static polymorphicName(): string {
    return inheritancePolymorphicName(this);
  }

  static stiName(): string {
    return stiName(this);
  }

  signedId(options?: {
    purpose?: string;
    expiresIn?: number;
    expiresAt?: Temporal.Instant;
  }): string {
    return _signedId(this, options);
  }

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

  static combineSignedIdPurposes(purpose?: string): string {
    return SignedId.combineSignedIdPurposes(this, purpose);
  }

  declare equals: (other: unknown) => boolean;

  declare compare: (other: unknown) => number | undefined;

  declare hash: () => unknown;

  async transaction<R>(
    fn: (tx: any) => Promise<R>,
    options?: { isolation?: string; requiresNew?: boolean; joinable?: boolean },
  ): Promise<R | undefined> {
    return (this.constructor as typeof Base).transaction(fn, options);
  }

  static transaction<R>(
    this: typeof Base,
    fn: (tx: any) => Promise<R>,
    options?: { isolation?: string; requiresNew?: boolean; joinable?: boolean },
  ): Promise<R | undefined> {
    return _transaction(this, fn, options);
  }

  static currentTransaction() {
    return _currentTransactionPublic();
  }

  declare static afterInitialize: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  declare static afterFind: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  declare static afterTouch: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  declare static beforeSave: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  declare static beforeCreate: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  declare static beforeUpdate: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  declare static beforeDestroy: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  declare static afterSave: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  declare static afterCreate: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  declare static afterUpdate: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  declare static afterDestroy: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  declare static aroundSave: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>, proceed: () => void | Promise<void>) => void | Promise<void>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  declare static aroundCreate: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>, proceed: () => void | Promise<void>) => void | Promise<void>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  declare static aroundUpdate: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>, proceed: () => void | Promise<void>) => void | Promise<void>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  declare static aroundDestroy: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>, proceed: () => void | Promise<void>) => void | Promise<void>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  static beforeCommit = _beforeCommit;

  static afterCommit = _afterCommit;

  static afterSaveCommit = _afterSaveCommit;

  static afterCreateCommit = _afterCreateCommit;

  static afterUpdateCommit = _afterUpdateCommit;

  static afterDestroyCommit = _afterDestroyCommit;

  static afterRollback = _afterRollback;

  static override setCallback = _txSetCallback;

  override async isValid(context?: ValidationContextArg): Promise<boolean> {
    const effectiveContext =
      context ?? this._validationContext ?? defaultValidationContext.call(this);
    const output = await validationsIsValid.call(this, effectiveContext);
    return this.errors.empty && output;
  }

  declare isPresent: () => boolean;
  declare isBlank: () => boolean;

  static async tableExists(): Promise<boolean> {
    return ModelSchema.tableExists.call(this);
  }

  static inspect(): string {
    const name = this.name;
    if (this === Base) {
      return name;
    } else if (this.abstractClass) {
      return `${name}(abstract)`;
    } else if (!ModelSchema.isSchemaLoaded.call(this as never) && !this.connectedQ()) {
      return `${name} (call '${name}.load_schema' to load schema informations)`;
    }
    const columns = this.columnsHash();
    if (Object.keys(columns).length === 0) {
      return `${name}(Table doesn't exist)`;
    }
    const attrList = Object.entries(this.attributeTypes())
      .map(([attr, type]) => `${attr}: ${type!.type() ?? ""}`)
      .join(", ");
    return `${name}(${attrList})`;
  }

  static hasAttribute(attrName: string): boolean {
    attrName = String(attrName);
    attrName = this.attributeAliases[attrName] ?? attrName;
    return Object.hasOwn(this.attributeTypes(), attrName);
  }

  generateTokenFor(purpose: string): string {
    return _generateTokenFor.call(this, purpose);
  }
}

_setBase(Base);

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Base extends Included<typeof AutosaveAssociation>, JSONSerializer, AMDirty {
  normalizeAttribute(name: string): void;
  /** @internal */
  normalizeChangedInPlaceAttributes(): void;

  /** @internal */
  _strictLoading: boolean;
  /** @internal */
  _strictLoadingMode?: _Core.StrictLoadingMode;
  /** @internal */
  _associationCacheStore: _AssociationCache;
  /** @internal */
  _collectionProxies: Map<string, unknown>;
  /** @internal */
  _associationInstances: Map<string, AssociationInstance>;
  association(name: string): AssociationInstance;
  /** @noRailsEquivalent PERMANENT */
  loadBelongsTo(name: string): Promise<Base | null>;
  /** @noRailsEquivalent PERMANENT */
  loadHasOne(name: string): Promise<Base | null>;
  readonly savedChanges: Record<string, [unknown, unknown]>;
  readonly hasChangesToSave: boolean;
  readonly changesToSave: Record<string, [unknown, unknown]>;
  readonly changedAttributeNamesToSave: string[];
  readonly attributesInDatabase: Record<string, unknown>;
  readonly idInDatabase: unknown;
  isSavedChanges(): boolean;
  isSavedChangeToAttribute(attr: string, options?: DirtyOptions): boolean;
  attributeBeforeLastSave(attr: string): unknown;
  isWillSaveChangeToAttribute(attr: string, options?: DirtyOptions): boolean;
  attributeChangeToBeSaved(attr: string): [unknown, unknown] | null;
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
  _createRecord(attributeNames?: string[], block?: (record: this) => void): Promise<boolean>;
  /** @internal */
  _updateRecord(attributeNames?: string[], block?: (record: this) => void): Promise<unknown>;
  slice(...keys: string[]): HashWithIndifferentAccess<unknown>;
  valuesAt(...keys: string[]): unknown[];
  assignAttributes(attrs: Record<string, unknown>): void;
  setAttributes(attrs: Record<string, unknown>): Promise<void> | void;
  updateAttribute(name: string, value: unknown): Promise<boolean | undefined>;
  updateAttributeBang(name: string, value: unknown): Promise<true | undefined>;
  updateColumn(name: string, value: unknown): Promise<boolean>;
  updateColumns(attrs: Record<string, unknown>): Promise<boolean>;
  clone(): this;
  becomes<K extends typeof Base>(klass: K): InstanceType<K>;
  becomesBang<K extends typeof Base>(klass: K): InstanceType<K>;
}

extend(Base, ConnectionHandling.ClassMethods);
extend(Base, Inheritance.ClassMethods);
extend(Base, LockingOptimistic.ClassMethods);
extend(Base, SignedId.ClassMethods);
extend(Base, QueryCacheClassMethods.ClassMethods);

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
Object.assign(Base, {
  AssociatedValidator: _Validations.AssociatedValidator,
  UniquenessValidator: _Validations.UniquenessValidator,
  PresenceValidator: _Validations.PresenceValidator,
  AbsenceValidator: _Validations.AbsenceValidator,
  LengthValidator: _Validations.LengthValidator,
  NumericalityValidator: _Validations.NumericalityValidator,
});
include(Base, CallbacksInstanceMethods);
include(Base, TransactionsInstanceMethods);
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
classAttribute.call(Base, "_reflections", { instanceWriter: false, default: {} });
classAttribute.call(Base, "aggregateReflections", { instanceWriter: false, default: {} });
classAttribute.call(Base, "_counterCacheColumns", { instanceAccessor: false, default: [] });
classAttribute.call(Base, "_attrReadonly", { instanceAccessor: false, default: [] });
classAttribute.call(Base, "defaultScopes", {
  instanceWriter: false,
  instancePredicate: false,
  default: [],
});
classAttribute.call(Base, "defaultScopeOverride", {
  instanceWriter: false,
  instancePredicate: false,
  default: null,
});
classAttribute.call(Base, "nestedAttributesOptions", { instanceWriter: false, default: {} });
classAttribute.call(Base, "encryptedAttributes");
classAttribute.call(Base, "tokenDefinitions", {
  instanceAccessor: false,
  instancePredicate: false,
  default: _withFetch({}),
});
classAttribute.call(Base, "generatedTokenVerifier", {
  instanceAccessor: false,
  instancePredicate: false,
});
classAttribute.call(Base, "counterCachedAssociationNames", {
  instanceWriter: false,
  default: [],
});
let _bootTokenVerifier: _MessageVerifier | null = null;
_registerGeneratedTokenVerifierSink((verifier) => {
  if (Base.generatedTokenVerifier != null && Base.generatedTokenVerifier !== _bootTokenVerifier) {
    return;
  }
  _bootTokenVerifier = verifier;
  Base.generatedTokenVerifier = verifier;
});
extend(Base, {
  defaultScope: _defaultScope,
  unscoped: _unscoped,
});
extend(Base, ModelSchema.ClassMethods);
include(Base, AttributeRegistration);
include(Base, AMAttributeMethods.AttributeMethods);

extend(Base, {
  defineAttribute: _defineAttribute,
  defineAttributeMethods: _defineAttributeMethods,
  undefineAttributeMethods: _undefineAttributeMethods,
  aliasAttribute: _aliasAttribute,
  initializeGeneratedModules: _initializeGeneratedModules,
  generateAliasAttributes: _generateAliasAttributes,
  eagerlyGenerateAliasAttributeMethods: _eagerlyGenerateAliasAttributeMethods,
  _defaultAttributes: _arDefaultAttributes,
  resolveTypeName: _resolveTypeName,
  resetDefaultAttributes: _resetDefaultAttributes,
  reloadSchemaFromCache: Timestamp.reloadSchemaFromCache,
});
extend(Base, { isDangerousAttributeMethod: _pkIsDangerousAttributeMethod });
extend(Base, { isInstanceMethodAlreadyImplemented: _pkIsInstanceMethodAlreadyImplemented });
extend(Base, {
  defineMethodAttribute: _defineMethodAttribute,
  setDefineMethodAttribute: _setDefineMethodAttribute,
});
extend(Base, {
  resolveConfigForConnection: ConnectionHandling.resolveConfigForConnection,
  localStoredAttributes: _localStoredAttributes,
});

extend(Base, _StoreClassMethods);

include(Base, JSONSerializer);
Base.includeRootInJson = false;

include(Base, {
  writeAttribute: _writeAttributeMethod,
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
  clone: _Persistence.clone,
  becomes: _Persistence.becomes,
  becomesBang: _Persistence.becomesBang,
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
  isNoTouching: _isNoTouching,
  toParam: _toParam,
  cacheKey: _cacheKey,
  cacheKeyWithVersion: _cacheKeyWithVersion,
  cacheVersion: _cacheVersion,
  serializableHash: Serialization.serializableHash,
  readAttributeBeforeTypeCast: _readAttributeBeforeTypeCast,
  hasAttribute: _hasAttribute,
  attributePresent: _attributePresent,
  accessedFields: _accessedFields,
  get: _get,
  set: _set,
  _writeAttribute: _writeAttributeLowLevel,
  "attribute=": _writeAttributeLowLevel,
  toKey: _toKey,
  readStoreAttribute: _readStoreAttribute,
  writeStoreAttribute: _writeStoreAttribute,
  storeAccessorFor: _storeAccessorFor,
});
include(Base, ModelSchema.InstanceMethods);
include(Base, _Read);
include(Base, _Write);
include(Base, _BeforeTypeCast);
include(Base, _Query);
include(Base, _PrimaryKey);
include(Base, _CompositePrimaryKey);
include(Base, ModelSchema.ModelSchema);
include(Base, _TimeZoneConversion);
include(Base, AMDirty);
include(Base, _Dirty);
include(Base, _AttrSerialization);
include(Base, LockingPessimistic.InstanceMethods);
include(Base, LockingOptimistic.InstanceMethods);
include(Base, Timestamp.InstanceMethods);
include(Base, TouchLater.InstanceMethods);
include(Base, _AttributeAssignment.InstanceMethods);
include(Base, AutosaveAssociation);
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
prepend(Base.prototype, { initializeDup: _Core.initializeDup as PrependMethod });
prepend(Base.prototype, { initializeDup: Inheritance.initializeDup as PrependMethod });
prepend(Base.prototype, { initializeDup: LockingOptimistic.initializeDup as PrependMethod });
prepend(Base.prototype, { initializeDup: Timestamp.initializeDup as PrependMethod });
prepend(Base.prototype, { initializeDup: _associationsInitializeDup as PrependMethod });
_registerAssociationBuilderExtension(AssociationBuilder.extensions);
{
  const inheritedReload = (Base.prototype as any).reload as (
    this: Base,
    options?: { lock?: boolean | string; unscoped?: boolean },
  ) => Promise<Base>;
  Object.defineProperty(Base.prototype, "reload", {
    value: function (
      this: Base,
      options?: { lock?: boolean | string; unscoped?: boolean },
    ): Promise<Base> {
      return _autosaveReload.call(this, options, inheritedReload);
    },
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
include(Base, {
  initWithAttributes: _Core.initWithAttributes,
  initAttributes: _Core.initAttributes,
  fullInspect: _Core.fullInspect,
  destroyAssociationAsyncJob: _Core.destroyAssociationAsyncJob,
  initializeInternalsCallback: _Core.initializeInternalsCallback,
  isCustomInspectMethodDefined: _Core.isCustomInspectMethodDefined,
  inspectWithAttributes: _Core.inspectWithAttributes,
  attributesForInspect: _Core.attributesForInspect,
  allAttributesForInspect: _Core.allAttributesForInspect,
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
  _inheritanceColumn: ModelSchema._inheritanceColumn,
  ensureProperType: _ensureProperType,
  populateWithCurrentScopeAttributes: _populateWithCurrentScopeAttributes,
  canUseFastCacheVersion: _canUseFastCacheVersion,
  rawTimestampToCacheVersion: _rawTimestampToCacheVersion,
  defaultValidationContext,
  raiseValidationError: _Validations.raiseValidationError,
  performValidations: _Validations.performValidations,
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
  isSavedChangeToAttribute: _isSavedChangeToAttribute,
  isWillSaveChangeToAttribute: _isWillSaveChangeToAttribute,
  savedChangeToAttribute: _savedChangeToAttribute,
  attributeBeforeLastSave: _attributeBeforeLastSave,
  attributeChangeToBeSaved: _attributeChangeToBeSaved,
  attributeInDatabase: _attributeInDatabase,
  attributeNamesForPartialUpdates: _attributeNamesForPartialUpdates,
  attributeNamesForPartialInserts: _attributeNamesForPartialInserts,
  isSavedChanges: _isSavedChanges,
  hasDeferTouchAttrs(this: Base) {
    return TouchLater.hasDeferTouchAttrs(this);
  },
  _foreignKeysEqual: CounterCache._foreignKeysEqual,
  isAssociationCached: _isAssociationCached,
  associationInstanceGet: _associationInstanceGet,
  associationInstanceSet: _associationInstanceSet,
  computePrimaryKey: _computePrimaryKey,
  _ensureNoDuplicateErrors: _autosaveEnsureNoDuplicateErrors,
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
  surreptitiouslyTouch: TouchLater.surreptitiouslyTouch,
  touchDeferredAttributes: TouchLater.touchDeferredAttributes,
});

prepend(Base.prototype, { initAttributes: dirtyInitAttributes as PrependMethod });

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
    function (
      this: Base,
      attributeNames?: string[],
      block?: (record: Base) => void,
    ): Promise<boolean> {
      return Timestamp._createRecord.call(this as any, () =>
        callbacksCreateRecord.call(this, attributeNames, block),
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
    function (
      this: Base,
      attributeNames?: string[],
      block?: (record: Base) => void,
    ): Promise<unknown> {
      return Timestamp._updateRecord.call(this as any, () =>
        callbacksUpdateRecord.call(this, attributeNames, block),
      );
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

_setSuperIsValid(Model.prototype.isValid);

{
  Object.defineProperty(Base.prototype, "attributes", {
    get(this: Base): Record<string, unknown> {
      return _attributes.call(this as unknown as ThisParameterType<typeof _attributes>);
    },
    set(this: Base, attrs: Record<string, unknown>) {
      assertAssignedSynchronously(this.setAttributes(attrs), "attributes=");
    },
    configurable: true,
    enumerable: false,
  });
}

registerTableNameOptions({
  get tableNamePrefix() {
    return Base.tableNamePrefix;
  },
  get tableNameSuffix() {
    return Base.tableNameSuffix;
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
    return Base.tableNamePrefix;
  },
  get tableNameSuffix() {
    return Base.tableNameSuffix;
  },
  configurations: () => Base.configurations(),
  connectionHandler: () => Base.connectionHandler,
  databaseTasks: () => DatabaseTasks,
});

import "@blazetrails/globalid/wire";

import { type LocatorModel as _LocatorModel } from "@blazetrails/globalid";
type _ARBaseUnscopedWire =
  typeof Base extends Pick<Required<_LocatorModel>, "unscoped"> ? true : never;
const _arBaseUnscopedWire: _ARBaseUnscopedWire = true;
void _arBaseUnscopedWire;

setCurrentAdapterResolver(() => Base);

DatabaseTasks._registerBase(Base);

runLoadHooks("active_record", Base);

Table.engine = {
  get connection(): DatabaseAdapter {
    const pool = Base.connectionPool();
    return pool.activeConnection ?? pool.leaseConnectionSync();
  },
};

_registerBaseWithQueryCache(Base);
_registerBaseWithSchemaMigration(Base);
_registerBaseWithInternalMetadata(Base);
_registerBaseWithSchemaDumper(Base);
_registerBaseWithNamedScoping(Base);
_registerBaseWithConnectionHandler(Base);
_registerBaseWithAsynchronousQueriesTracker(Base);
_registerBaseWithDatabaseStatements(Base);
_setBaseResolverWithLogSubscriber(() => Base);

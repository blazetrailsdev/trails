import { Temporal } from "@blazetrails/activesupport/temporal";
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
  Model,
  type Type,
  typeRegistry,
  pushPendingDecorator,
  type TransactionalCallbackConditions,
} from "@blazetrails/activemodel";
import "./type.js"; // Register AR type overrides into AM's type registry
import {
  Table,
  quoteArrayLiteral,
  InsertManager,
  UpdateManager,
  DeleteManager,
  Nodes,
  sql as arelSql,
  setToSqlVisitor,
} from "@blazetrails/arel";
import type { DatabaseAdapter, ExplainOption } from "./adapter.js";
import type { Relation } from "./relation.js";
import {
  getInheritanceColumn,
  isStiSubclass,
  getStiBase,
  instantiateSti,
  computeType as inheritanceComputeType,
  subclasses as inheritanceSubclasses,
  descendants as inheritanceDescendants,
  isFinderNeedsTypeCondition,
  primaryAbstractClass,
  applicationRecordClassQ as _applicationRecordClassQ,
  stiClassFor,
  polymorphicClassFor,
  initializeInternalsCallback as inheritanceInitializeInternalsCallback,
  baseClass as _inheritanceBaseClass,
  getAbstractClass as _getAbstractClass,
  setAbstractClass as _setAbstractClass,
  isBaseClass as _isBaseClass,
  ensureProperType as _ensureProperType,
  narrowToProjectedColumns,
} from "./inheritance.js";
import { NotImplementedError, RecordNotFound, StaleObjectError } from "./errors.js";
import {
  AutosaveAssociation,
  flushPendingReplaces,
  computePrimaryKey as _computePrimaryKey,
  _ensureNoDuplicateErrors as _autosaveEnsureNoDuplicateErrors,
} from "./autosave-association.js";
import {
  isValid as validationsIsValid,
  defaultValidationContext,
  _setSuperIsValid,
  _setSuperValidates,
  type ValidationContextArg,
  UniquenessValidator,
} from "./validations.js";
import * as _Validations from "./validations.js";
import { encryptionHooks } from "./encryption-hooks.js";
import type { EncryptsOptions } from "./encryption.js";
import * as CounterCache from "./counter-cache.js";
import * as ReadonlyAttributes from "./readonly-attributes.js";
import {
  defineAttribute as _defineAttribute,
  _defaultAttributes as _arDefaultAttributes,
} from "./attributes.js";
import * as Timestamp from "./timestamp.js";
import * as TouchLater from "./touch-later.js";
import { Association as AssociationInstance } from "./associations/association.js";
import { ConnectionHandler } from "./connection-adapters/abstract/connection-handler.js";
import * as ConnectionHandling from "./connection-handling.js";
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
} from "@blazetrails/activemodel";
import { SignedGlobalID as _SignedGlobalIDCtor } from "@blazetrails/globalid/signed-global-id";
import {
  signedId as _signedId,
  signedIdVerifier as _signedIdVerifier,
  findSigned as _findSigned,
  findSignedBang as _findSignedBang,
} from "./signed-id.js";
import { registerMigrationArConfig } from "./migration.js";
import * as LockingOptimistic from "./locking/optimistic.js";
import * as LockingPessimistic from "./locking/pessimistic.js";
import { hookAttributeType as tzHookAttributeType } from "./attribute-methods/time-zone-conversion.js";
import * as Translation from "./translation.js";
import * as Sanitization from "./sanitization.js";
import * as Serialization from "./serialization.js";
import * as Querying from "./querying.js";
import {
  include,
  extend,
  benchmark as benchmarkable,
  runLoadHooks,
  type Included,
  type ParameterFilter,
  type BenchmarkLogger,
} from "@blazetrails/activesupport";
import {
  hasAttribute as _hasAttribute,
  _hasAttribute as _privateHasAttribute,
  attributePresent as _attributePresent,
  attributeNamesList as _attributeNamesList,
  accessedFields as _accessedFields,
  attributesForCreate as _attributesForCreate,
  attributesForUpdate as _attributesForUpdate,
  attributeNames as _attributeNames,
  isAttributeMethod as _isAttributeMethod,
  attributesWithValues as _attributesWithValues,
  formatForInspect as _formatForInspect,
  pkAttribute as _pkAttribute,
  readAttributeForDatabase as _readAttributeForDatabase,
  attributesForDatabase as _attributesForDatabase,
  attributeBeforeTypeCast as _attributeBeforeTypeCast,
  attributeForDatabase as _attributeForDatabase,
  queryCastAttribute as _queryCastAttribute,
  isPrimaryKeyValuesPresent as _isPrimaryKeyValuesPresent,
  idWas as _idWas,
  idInDatabase as _idInDatabase,
  idForDatabase as _idForDatabase,
  isSavedChangeToAttribute as _isSavedChangeToAttribute,
  attributeBeforeLastSave as _attributeBeforeLastSave,
  isWillSaveChangeToAttribute as _isWillSaveChangeToAttribute,
  attributeChangeToBeSaved as _attributeChangeToBeSaved,
  attributeInDatabase as _attributeInDatabase,
  attributeNamesForPartialUpdates as _attributeNamesForPartialUpdates,
  attributeNamesForPartialInserts as _attributeNamesForPartialInserts,
  idBeforeTypeCast as _idBeforeTypeCast,
  isSavedChanges as _isSavedChanges,
} from "./attribute-methods.js";
import { normalizeChangedInPlaceAttributes as _normalizeChangedInPlaceAttributesFn } from "./normalization.js";
import {
  toKey as _toKey,
  getId as _getId,
  setId as _setId,
  getPrimaryKeyAttr as _getPrimaryKeyAttr,
  setPrimaryKeyAttr as _setPrimaryKeyAttr,
  isCompositePrimaryKey as _isCompositePrimaryKey,
} from "./attribute-methods/primary-key.js";
import { _readAttribute as _readAttributeFn } from "./attribute-methods/read.js";
import { isAttributeCameFromUser as _isAttributeCameFromUser } from "./attribute-methods/before-type-cast.js";
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
import {
  noTouching as _noTouchingBlock,
  isAppliedTo as _isNoTouchingApplied,
} from "./no-touching.js";
import {
  suppress as _suppressBlock,
  isSuppressed as _isSuppressed,
  registry as _suppressorRegistry,
} from "./suppressor.js";
import {
  inspect as _inspect,
  attributeForInspect as _attributeForInspect,
  isEqual as _isEqual,
  isPresent as _isPresent,
  isBlank as _isBlank,
  filterAttributes as _coreFilterAttributes,
} from "./core.js";
import * as _Core from "./core.js";
import * as _Persistence from "./persistence.js";
import * as _Aggregations from "./aggregations.js";
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
import {
  ScopeRegistry,
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
  synthOnCondition as _synthOnCondition,
  afterSaveCommitMethod as _afterSaveCommitMethod,
  afterCreateCommitMethod as _afterCreateCommitMethod,
  afterUpdateCommitMethod as _afterUpdateCommitMethod,
  afterDestroyCommitMethod as _afterDestroyCommitMethod,
} from "./transactions.js";

import {
  Default as DefaultScoping,
  defaultScope as _defaultScope,
  unscoped as _unscoped,
} from "./scoping/default.js";
import * as NamedScoping from "./scoping/named.js";
import {
  Associations as _Associations,
  updateCounterCaches,
  isAssociationCached as _isAssociationCached,
  associationInstanceGet as _associationInstanceGet,
  associationInstanceSet as _associationInstanceSet,
  type AssociationDefinition,
} from "./associations.js";
import * as _AttributeAssignment from "./attribute-assignment.js";
import * as _NestedAttributes from "./nested-attributes.js";
import {
  store as _storeFunction,
  storeAccessor as _storeAccessorFunction,
  registerSerializeFn as _registerSerializeFn,
  localStoredAttributesMethod as _localStoredAttributesMethod,
  readStoreAttributeMethod as _readStoreAttributeMethod,
  writeStoreAttributeMethod as _writeStoreAttributeMethod,
  storeAccessorForMethod as _storeAccessorForMethod,
} from "./store.js";
import { serialize as _serializeAttribute } from "./serialize.js";

// Break store→serialize→json→store circular dep by injecting serialize into store at init.
_registerSerializeFn(_serializeAttribute as any);
import {
  hasMultiparameterKeys,
  extractMultiparameterCallstack,
  executeMultiparameterAssignment,
} from "./multiparameter-attribute-assignment.js";

/** @internal */
export function quoteSqlValue(v: unknown, asArray = false): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  // boundary: defensive SQL literal quoting fallback for legacy callers.
  // Invalid (NaN) Date short-circuits to SQL NULL — toISOString() would throw
  // a RangeError, and the generic object fallthrough would JSON-stringify it
  // to the misleading string 'null'.
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? "NULL" : `'${v.toISOString()}'`;
  }
  if (asArray && Array.isArray(v)) {
    const arrayLiteral = quoteArrayLiteral(v);
    return `'${arrayLiteral.replace(/'/g, "''")}'`;
  }
  if (!asArray && typeof v === "object") {
    let json: string | undefined;
    try {
      json = JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? val.toString() : val));
    } catch {
      // circular structures or other non-serializable objects — fall through to NULL
    }
    if (json === undefined) return "NULL";
    return `'${json.replace(/'/g, "''")}'`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

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

// Late-bound Relation constructor to break circular dependency.
// Set by relation.ts when it loads.
//
// `var` (rather than `let`) with no initializer is deliberate: these are
// assigned from other modules' top-level code (relation.ts's
// `_setRelationCtor(Relation)` call runs during module init). With
// `extends Relation` chains, base.ts's own imports can trigger that
// call before base.ts reaches this line. `let` would throw TDZ; `var
// x = null` would hoist then RESET the value back to null; `var x;`
// hoists as `undefined` without clobbering a later-set value.
// eslint-disable-next-line no-var
var _RelationCtor: (new (modelClass: typeof Base) => any) | undefined;
// eslint-disable-next-line no-var
var _wrapWithScopeProxy: ((rel: any) => any) | undefined;

/** @internal Called by relation.ts to register itself. */
export function _setRelationCtor(ctor: new (modelClass: typeof Base) => any): void {
  _RelationCtor = ctor;
}

/** @internal Called by relation.ts to register the scope proxy wrapper. */
export function _setScopeProxyWrapper(wrapper: (rel: any) => any): void {
  _wrapWithScopeProxy = wrapper;
}

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
      throw argumentError(
        "update: attributes must be a plain object (missing or invalid attrs for the :all / nil form)",
      );
    }
    const records = (await this.all().toArray()) as InstanceType<typeof Base>[];
    for (const r of records) await run(r, candidate);
    return records;
  }

  if (Array.isArray(idOrAttrs)) {
    if (idOrAttrs.some((i) => i instanceof Base)) {
      throw argumentError(
        "You are passing an instance of ActiveRecord::Base to `update`. Please pass the id of the object by calling `.id`.",
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
        throw argumentError(
          `${this.name}.update: parallel updates for composite PKs require an array-of-tuples first arg, e.g. update([[k1a,k2a],[k1b,k2b]], [attrsA, attrsB])`,
        );
      }
      if (!isPlainObject(attrs)) {
        throw argumentError(`${this.name}.update: attributes must be a plain object`);
      }
      const record = (await this.find(idOrAttrs)) as InstanceType<typeof Base>;
      await run(record, attrs);
      return record;
    }
    // Empty ids list is a no-op (Rails behaves this way; Base.find([]) would
    // otherwise raise RecordNotFound "empty list of ids").
    if (idOrAttrs.length === 0) return [];
    const attrsArr = attrs as Record<string, unknown>[];
    if (!Array.isArray(attrsArr) || attrsArr.length !== idOrAttrs.length) {
      throw argumentError("update(ids, attrs): ids and attrs must be arrays of the same length");
    }
    for (const a of attrsArr) {
      if (!isPlainObject(a)) {
        throw argumentError(`${this.name}.update: every attrs entry must be a plain object`);
      }
    }
    // Single `find([...ids])` call, then reorder by input-id to zip with
    // attrsArr. Rails' AR builds an OR predicate that doesn't guarantee
    // DB-return order, so rely on a stable id-key lookup. Use
    // String()-joined keys so bigint PKs don't crash JSON.stringify and
    // so numeric / string-cast ids (e.g. "1" vs 1 after predicate cast)
    // hash to the same slot.
    const stableIdKey = (id: unknown): string =>
      Array.isArray(id) ? id.map((part) => String(part)).join("\x1f") : String(id);
    const found = (await this.find(idOrAttrs as unknown[])) as
      | InstanceType<typeof Base>
      | InstanceType<typeof Base>[];
    const foundArr = Array.isArray(found) ? found : [found];
    const byKey = new Map<string, InstanceType<typeof Base>>();
    for (const r of foundArr) byKey.set(stableIdKey(r.id), r);
    const records: InstanceType<typeof Base>[] = [];
    for (let i = 0; i < idOrAttrs.length; i++) {
      const record = byKey.get(stableIdKey(idOrAttrs[i]));
      if (!record) {
        throw new RecordNotFound(
          `Couldn't find ${this.name} with id=${stableIdKey(idOrAttrs[i])}`,
          this.name,
        );
      }
      await run(record, attrsArr[i]);
      records.push(record);
    }
    return records;
  }

  if (idOrAttrs instanceof Base) {
    throw argumentError(
      "You are passing an instance of ActiveRecord::Base to `update`. Please pass the id of the object by calling `.id`.",
    );
  }

  if (!isPlainObject(attrs)) {
    throw argumentError(`${this.name}.update: attributes must be a plain object`);
  }
  const record = (await this.find(idOrAttrs)) as InstanceType<typeof Base>;
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
function _applyScopeAttributes(
  ctor: typeof Base,
  record: InstanceType<typeof Base>,
  explicitKeys: Set<string>,
): void {
  const scope = (ctor as any).currentScope;
  if (!scope) return;
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
    (record as any).assignAttributes(toApply);
  }
}

/**
 * @internal
 * Pull constructor-form association assignments (e.g. `new Owner({items:
 * [...], profile: p})`) out of the regular attribute bag. Returns null
 * when no key matches a declared association so the hot path allocates
 * nothing.
 */
function _extractAssociationAttrs(
  ctor: typeof Base | undefined,
  attrs: Record<string, unknown>,
): {
  rest: Record<string, unknown>;
  assocs: Array<{ name: string; value: unknown }>;
} | null {
  const defs = (ctor as { _associations?: Array<{ name: string; type: string }> } | undefined)
    ?._associations;
  if (!defs || defs.length === 0) return null;
  // Common case: models that declare associations but receive only regular
  // attrs at construction (`new Post({title})`). First pass detects whether
  // any key matches an association; only then do we allocate `rest` and
  // copy entries. Avoids per-construction overhead for the hot path.
  let assocs: Array<{ name: string; value: unknown }> | null = null;
  for (const k of Object.keys(attrs)) {
    if (defs.find((a) => a.name === k)) {
      (assocs ??= []).push({ name: k, value: attrs[k] });
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

/** @internal */
function _dispatchAssociationAttrs(
  record: Base,
  assocs: Array<{ name: string; value: unknown }>,
): void {
  for (const { name, value } of assocs) {
    _AttributeAssignment.assignAssociationIfMatch(
      record as unknown as { constructor?: unknown; association?: (name: string) => unknown },
      name,
      value,
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Base extends Model {
  // --- Translation mixin (wired via extend() after class) ---
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
  static _primaryKey: string | string[] = "id";
  static readonly _isActiveRecordBase = true;

  /** @internal */
  declare static _associations: AssociationDefinition[];
  /** @internal */
  declare static _registryKeys: string[];

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
  static _modelsByName: Map<string, typeof Base> = new Map();
  static _connectionHandler: ConnectionHandler = new ConnectionHandler();
  static _configPath: string | null = null;
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

  static get abstractClass(): boolean {
    return _getAbstractClass.call(this);
  }

  static set abstractClass(value: boolean) {
    _setAbstractClass.call(this, value);
  }

  static _requireConcreteClass(): void {
    if (this.abstractClass && !this._suppressAbstractCheck) {
      // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/inheritance.rb:58
      throw new NotImplementedError(
        `${this.name} is an abstract class and cannot be instantiated.`,
      );
    }
  }

  /**
   * Whether this class is a connection class (owns its own connection pool).
   * Per-class via hasOwnProperty — does not inherit from parent.
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

  static currentPreventingWrites(): boolean {
    return _Core.currentPreventingWrites.call(this);
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
    return _getPrimaryKeyAttr.call(this);
  }

  static set primaryKey(key: string | string[]) {
    _setPrimaryKeyAttr.call(this, key);
  }

  /**
   * The column used for optimistic locking. Defaults to "lock_version".
   *
   * Mirrors: ActiveRecord::Locking::Optimistic.locking_column
   */
  static get lockingColumn(): string {
    return LockingOptimistic.lockingColumn(this);
  }

  static set lockingColumn(col: string) {
    LockingOptimistic.setLockingColumn(this, col);
  }

  static get lockingEnabled(): boolean {
    return LockingOptimistic.lockingEnabled(this);
  }

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

  /**
   * Override attribute() to prevent generating an accessor for "id"
   * (Base defines id getter/setter with CPK support) and to apply
   * any pending encryption decorations (matching Rails' deferred
   * PendingDecorator pattern).
   */
  static attribute(
    name: string,
    typeName: string,
    options?: {
      default?: unknown;
      virtual?: boolean;
      userProvidedDefault?: boolean;
      limit?: number | null;
    },
  ): void {
    // STI subclasses share the base's `_attributeDefinitions` — matching
    // Rails' `ActiveRecord::Inheritance` where `attribute_types` is a
    // shared `class_attribute`. Route the registration through the STI
    // base so `Circle.attribute("radius", ...)` lands on `Shape._attributeDefinitions`
    // instead of forking a subclass-local map that later schema
    // reflection on the base wouldn't see.
    if (isStiSubclass(this)) {
      const stiBase = getStiBase(this);
      stiBase.attribute(name, typeName, options);
      return;
    }
    super.attribute(name, typeName, options);
    // Apply hookAttributeType decorators (TZ conversion, locking) to the
    // just-registered type so user-declared datetime attributes are wrapped.
    // Patch _attributeDefinitions immediately (read path) and also push a
    // PendingDecorator so _defaultAttributes() replay sees the hooked type
    // after the PendingType for this attribute.
    const def = this._attributeDefinitions.get(name);
    if (def) {
      const hooked = this.hookAttributeType(name, def.type);
      if (hooked !== def.type) {
        this._attributeDefinitions.set(name, { ...def, type: hooked });
        pushPendingDecorator(this, [name], (_n: string, _t: Type) => hooked);
      }
    }
    // If we just defined an "id" accessor on a subclass prototype, remove it
    // so Base.prototype.id (which handles CPK) is used instead.
    if (name === "id" && Object.prototype.hasOwnProperty.call(this.prototype, "id")) {
      delete (this.prototype as any).id;
    }
    encryptionHooks.applyPendingEncryptions(this);
  }

  /**
   * Chains time-zone-conversion and optimistic-locking type decoration.
   *
   * @internal Rails-private helper.
   * Mirrors: ActiveRecord::Base#hook_attribute_type (composed via module includes)
   */
  static override hookAttributeType(name: string, type: Type): Type {
    const tzType = tzHookAttributeType.call(this as any, name, type) as Type;
    return LockingOptimistic.hookAttributeType.call(this as any, name, tzType);
  }

  /**
   * Returns the type object for a named attribute.
   *
   * Mirrors: ActiveRecord::ModelSchema::ClassMethods#type_for_attribute
   */
  static override typeForAttribute(name: string): Type {
    (ModelSchema.loadSchema as any).call(this);
    return (this._attributeDefinitions as any)?.get(name)?.type ?? typeRegistry.lookup("value");
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
    this._adapter = adapter;
    // Sync the global Arel visitor so Node#toSql() / TreeManager#toSql()
    // produce dialect-correct SQL for code paths that lack adapter context.
    // Long-term those callers should migrate to connection.visitor.compile().
    const visitor = (adapter as { visitor?: object }).visitor;
    if (visitor) {
      setToSqlVisitor(
        (visitor as object).constructor as new () => { compile(node: Nodes.Node): string },
      );
    }
    if (this !== Base && this.name) Base._modelsByName.set(this.name, this as typeof Base);

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
    if (!state._schemaLoadPromise) {
      state._schemaLoadPromise = (ModelSchema.loadSchemaFromAdapter as any).call(this);
    }
    try {
      await state._schemaLoadPromise;
    } catch (e) {
      state._schemaLoadPromise = undefined;
      throw e;
    }
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
      | {
          adapter?: string;
          url?: string;
          database?: string;
          host?: string;
          port?: number;
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
  declare static isConnectedQ: typeof ConnectionHandling.isConnectedQ;
  declare static isConnected: typeof ConnectionHandling.isConnected;
  declare static readonly connection: DatabaseAdapter;
  declare static isPrimaryClass: typeof ConnectionHandling.isPrimaryClass;
  declare static adapterClass: typeof ConnectionHandling.adapterClass;
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
  declare static _defaultAttributes: typeof _arDefaultAttributes;

  // Mirrors: ActiveRecord::ModelSchema::ClassMethods
  declare static columnNames: typeof ModelSchema.columnNames;
  declare static hasAttributeDefinition: typeof ModelSchema.hasAttributeDefinition;
  declare static columnsHash: typeof ModelSchema.columnsHash;
  declare static contentColumns: typeof ModelSchema.contentColumns;
  declare static deriveJoinTableName: typeof ModelSchema.deriveJoinTableName;
  declare static quotedTableName: typeof ModelSchema.quotedTableName;
  declare static resetTableName: typeof ModelSchema.resetTableName;
  declare static fullTableNamePrefix: typeof ModelSchema.fullTableNamePrefix;
  declare static fullTableNameSuffix: typeof ModelSchema.fullTableNameSuffix;
  declare static resetSequenceName: typeof ModelSchema.resetSequenceName;
  declare static isPrefetchPrimaryKey: typeof ModelSchema.isPrefetchPrimaryKey;
  declare static nextSequenceValue: typeof ModelSchema.nextSequenceValue;
  declare static attributesBuilder: typeof ModelSchema.attributesBuilder;
  declare static columns: typeof ModelSchema.columns;
  declare static attributeSetCoder: typeof ModelSchema.attributeSetCoder;
  declare static columnForAttribute: typeof ModelSchema.columnForAttribute;
  declare static symbolColumnToString: typeof ModelSchema.symbolColumnToString;
  declare static resetColumnInformation: typeof ModelSchema.resetColumnInformation;

  /**
   * Return the STI inheritance column name, if STI is enabled.
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

  // Mirrors: ActiveRecord::AttributeMethods::Dirty — class_attribute :partial_updates/:partial_inserts, default: true
  static partialUpdates = true;
  static partialInserts = true;

  static async noTouching<R>(fn: () => R | Promise<R>): Promise<R> {
    return _noTouchingBlock(this, fn);
  }

  static get isTouchingSuppressed(): boolean {
    return _isNoTouchingApplied(this);
  }

  // -- Sequence name --
  static _sequenceName: string | null = null;

  static get sequenceName(): string | null {
    return ModelSchema.sequenceName.call(this);
  }

  static set sequenceName(name: string | null) {
    ModelSchema.sequenceName.call(this, name);
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
  declare static isReadonlyAttribute: typeof ReadonlyAttributes.readonlyAttributeQ;

  /**
   * Return the list of readonly attribute names.
   *
   * Mirrors: ActiveRecord::Base.readonly_attributes
   */
  static get readonlyAttributes(): string[] {
    return ReadonlyAttributes.readonlyAttributes.call(this);
  }

  // -- Encrypted attributes --

  /**
   * Declare attributes as encrypted.
   * Reads decrypt, writes encrypt transparently.
   *
   * Mirrors: ActiveRecord::Encryption.encrypts
   */
  static encrypts(...args: Array<string | EncryptsOptions>): void {
    // Route through the STI base for the same reason `attribute()`
    // does: Rails' `encrypts` lands on the shared attribute_types map.
    // Without this, a subclass `encrypts()` would record pending
    // encryptions on the subclass while the attribute def lives on
    // the base — the type wrapper would never apply, or
    // `applyPendingEncryptions` would fork `_attributeDefinitions` on
    // the subclass and reintroduce the shadowing the STI-routing fix
    // is trying to eliminate.
    const target = isStiSubclass(this) ? (getStiBase(this) as typeof Base) : this;
    encryptionHooks.encrypts(target, ...args);
  }

  /**
   * Returns true if the attribute is currently stored as encrypted ciphertext.
   * Mirrors: ActiveRecord::Encryption::EncryptableRecord#encrypted_attribute?
   *
   * @internal
   */
  encryptedAttribute(attributeName: string): boolean {
    return encryptionHooks.encryptedAttributeQ(this, attributeName);
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
    return encryptionHooks.encryptRecord(this);
  }

  /**
   * Decrypts all encryptable attributes and persists via update_columns.
   * Mirrors: ActiveRecord::Encryption::EncryptableRecord#decrypt
   *
   * @internal
   */
  async decrypt(): Promise<void> {
    return encryptionHooks.decryptRecord(this);
  }

  static async suppress<R>(fn: () => R | Promise<R>): Promise<R> {
    return _suppressBlock(this, fn);
  }

  static get isSuppressed(): boolean {
    return _isSuppressed(this);
  }

  static get registry(): Record<string, true | undefined> {
    return _suppressorRegistry();
  }

  // --- Reflection::ClassMethods (wired via extend() after class body) ---
  declare static _reflectOnAssociation: typeof _Reflection.ClassMethods._reflectOnAssociation;
  declare static reflections: typeof _Reflection.ClassMethods.reflections;
  declare static normalizedReflections: typeof _Reflection.ClassMethods.normalizedReflections;
  declare static reflectOnAssociation: typeof _Reflection.ClassMethods.reflectOnAssociation;
  declare static reflectOnAllAssociations: typeof _Reflection.ClassMethods.reflectOnAllAssociations;
  declare static reflectOnAllAggregations: typeof _Reflection.ClassMethods.reflectOnAllAggregations;
  declare static reflectOnAggregation: typeof _Reflection.ClassMethods.reflectOnAggregation;
  declare static reflectOnAllAutosaveAssociations: typeof _Reflection.ClassMethods.reflectOnAllAutosaveAssociations;

  // --- Validations::ClassMethods (wired via extend() after class body) ---
  declare static validates: typeof _Validations.validates;
  declare static validatesAssociated: typeof _Validations.validatesAssociated;

  // -- Enums (wired via extend() after class body) --
  static _enums: Map<string, Record<string, number>> = new Map();

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

  // -- Explain --

  /** @internal */
  declare static collectingQueriesForExplain: typeof _collectingQueriesForExplain;

  /** @internal */
  static execExplain(
    queries: [string, unknown[]][],
    options: ExplainOption[] = [],
  ): Promise<string> {
    return _execExplain(this, queries, options);
  }

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

  /**
   * Declare that an attribute should be serialized using the given coder.
   *
   * Mirrors: ActiveRecord::Base.serialize
   */
  static serialize(
    attribute: string,
    options?: { coder?: unknown; type?: "Array" | "Hash" },
  ): void {
    _serializeAttribute(this, attribute, options as any);
  }

  /** Mirrors: ActiveRecord::Store::ClassMethods#local_stored_attributes */
  declare static localStoredAttributes: typeof _localStoredAttributesMethod;

  // -- Scopes registry (used by Relation) --
  static _scopes: Map<string, (rel: any, ...args: any[]) => any> = new Map();
  /** Accumulated default_scope declarations. @internal */
  static defaultScopes: import("./scoping/default.js").DefaultScope[] = [];

  // --- Default scope (wired via extend() after class body) ---
  declare static defaultScope: typeof _defaultScope;
  declare static unscoped: typeof _unscoped;

  /** @internal Like all() but skips currentScope — used by the preloader. */
  static _allForPreload(): any {
    return this._buildDefaultRelation();
  }

  /** @internal Build a scope-proxy-wrapped Relation with no default scope
   *  applied. Used by `unscoped()` in scoping/default.ts. Mirrors Rails'
   *  `relation` (core.rb:431-435): `unscoped` bypasses the default scope but
   *  STILL applies the STI `type_condition` for `finder_needs_type_condition?`
   *  classes, so callers like `AssociationScope` get a type-filtered base
   *  without re-adding the condition themselves. */
  static _buildUnscopedRelation(): any {
    if (!_RelationCtor) {
      throw new Error("Relation not loaded. Import relation.ts first.");
    }
    const rel = new _RelationCtor(this);
    return this._applyStiTypeCondition(_wrapWithScopeProxy ? _wrapWithScopeProxy(rel) : rel);
  }

  /** @internal Re-apply the STI `type_condition` WHERE for subclasses.
   *  Rails bakes this into `relation()` so both `unscoped` and the
   *  default-scoped path carry it; we layer it onto the base relation. */
  private static _applyStiTypeCondition(rel: any): any {
    if (isStiSubclass(this)) {
      const col = getInheritanceColumn(getStiBase(this));
      if (col) {
        const stiNames = [this.name, ...this.descendants.map((d: typeof Base) => d.name)];
        return rel.where({ [col]: stiNames.length === 1 ? stiNames[0] : stiNames });
      }
    }
    return rel;
  }

  private static _buildDefaultRelation(): any {
    if (!_RelationCtor) {
      throw new Error("Relation not loaded. Import relation.ts first.");
    }
    const buildBase = () => {
      const r = new _RelationCtor!(this);
      return _wrapWithScopeProxy ? _wrapWithScopeProxy(r) : r;
    };
    const rel = DefaultScoping.buildDefaultScope(this, buildBase) ?? buildBase();
    return this._applyStiTypeCondition(rel);
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
  static async scoping<R>(rel: any, fn: () => R | Promise<R>): Promise<R> {
    const prev = ScopeRegistry.currentScope(this);
    ScopeRegistry.setCurrentScope(this, rel);
    try {
      return await fn();
    } finally {
      ScopeRegistry.setCurrentScope(this, prev);
    }
  }

  /**
   * Return the current scope if set, or null.
   *
   * Mirrors: ActiveRecord::Base.current_scope
   */
  static get currentScope(): any | null {
    return ScopeRegistry.currentScope(this);
  }

  // -- Finders (class methods) --

  /** @internal Cast a value through an attribute's type, with parseInt fallback for the default PK. */
  static _castAttributeValue(key: string, value: unknown): unknown {
    if (typeof value !== "string") return value;
    const def = this._attributeDefinitions.get(key);
    if (def) return def.type.cast(value);
    if (typeof this.primaryKey === "string" && key === this.primaryKey) {
      const parsed = parseInt(value, 10);
      if (!isNaN(parsed)) return parsed;
    }
    return value;
  }

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

  declare static findByBang: <T extends typeof Base>(
    this: T,
    conditions: Record<string, unknown>,
  ) => Promise<InstanceType<T>>;

  /**
   * Dynamic finder by a single attribute name.
   * e.g., User.findByName("Alice") → User.findBy({ name: "Alice" })
   *
   * Mirrors: ActiveRecord::Base.find_by_* dynamic finders
   */
  static async findByAttribute<T extends typeof Base>(
    this: T,
    attribute: string,
    value: unknown,
  ): Promise<InstanceType<T> | null> {
    return this.findBy({ [attribute]: value });
  }

  /**
   * Check if a dynamic finder method name is valid.
   *
   * Mirrors: ActiveRecord::Base.respond_to_missing?
   */
  static respondToMissingFinder(methodName: string): boolean {
    if (!methodName.startsWith("findBy")) return false;
    const attrPart = methodName.slice(6); // remove "findBy"
    if (!attrPart) return false;
    // Convert camelCase to snake_case: findByFirstName → first_name
    const attr = attrPart
      .replace(/^./, (c) => c.toLowerCase())
      .replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    return this._attributeDefinitions.has(attr);
  }

  /**
   * Find the sole record matching conditions.
   * Raises RecordNotFound if none, SoleRecordExceeded if more than one.
   *
   * Mirrors: ActiveRecord::Base.find_sole_by
   */
  static async findSoleBy<T extends typeof Base>(
    this: T,
    conditions: Record<string, unknown>,
  ): Promise<InstanceType<T>> {
    return this.all().where(conditions).sole();
  }

  /**
   * Return all records as a Relation.
   *
   * Mirrors: ActiveRecord::Base.all
   */
  static all<T extends typeof Base>(this: T): Relation<InstanceType<T>> {
    const scope = this.currentScope;
    if (scope) {
      return scope._clone();
    }
    return this._buildDefaultRelation();
  }

  /**
   * Shorthand for all().where(conditions).
   *
   * Mirrors: ActiveRecord::Base.where
   */
  static where<T extends typeof Base>(
    this: T,
    conditions: Record<string, unknown>,
  ): Relation<InstanceType<T>>;
  static where<T extends typeof Base>(
    this: T,
    sql: string,
    ...binds: unknown[]
  ): Relation<InstanceType<T>>;
  static where<T extends typeof Base>(
    this: T,
    cols: string[],
    tuples: unknown[][],
  ): Relation<InstanceType<T>>;
  static where<T extends typeof Base>(
    this: T,
    conditionsOrSql: Record<string, unknown> | string | string[],
    ...rest: unknown[]
  ): Relation<InstanceType<T>> {
    if (typeof conditionsOrSql === "string") {
      return this.all().where(conditionsOrSql, ...rest);
    }
    if (Array.isArray(conditionsOrSql) && conditionsOrSql.every((c) => typeof c === "string")) {
      // Fast-fail: composite-key form requires exactly one extra
      // argument that is an array of tuples. Without this, a stray
      // `Model.where(['a','b'])` would fall through to the hash path
      // and treat the array as a record (numeric keys), producing
      // nonsense.
      if (rest.length !== 1 || !Array.isArray(rest[0])) {
        throw argumentError(
          `${(this as { name?: string }).name ?? "Model"}.where(cols, tuples): composite-key form requires a tuples argument as an array of arrays`,
        );
      }
      return this.all().where(conditionsOrSql, rest[0] as unknown[][]);
    }
    return this.all().where(conditionsOrSql as Record<string, unknown>);
  }

  static whereNot<T extends typeof Base>(
    this: T,
    conditions: Record<string, unknown>,
  ): Relation<InstanceType<T>>;
  static whereNot<T extends typeof Base>(
    this: T,
    cols: string[],
    tuples: unknown[][],
  ): Relation<InstanceType<T>>;
  static whereNot<T extends typeof Base>(
    this: T,
    conditions: Record<string, unknown> | string[],
    tuples?: unknown[][],
  ): Relation<InstanceType<T>> {
    if (Array.isArray(conditions) && conditions.every((c) => typeof c === "string")) {
      // Same fast-fail as Base.where: composite-key form requires
      // a tuples argument as an array of arrays. Without this guard
      // a stray `Model.whereNot(['c'])` would forward only the cols
      // and Relation#whereNot's matching guard would throw — same
      // outcome but the error message would mention Relation, not Model.
      if (!Array.isArray(tuples)) {
        throw argumentError(
          `${(this as { name?: string }).name ?? "Model"}.whereNot(cols, tuples): composite-key form requires a tuples argument as an array of arrays`,
        );
      }
      return this.all().whereNot(conditions, tuples);
    }
    return this.all().whereNot(conditions as Record<string, unknown>);
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
    return this.all().createOrFindBy(conditions, extra) as Promise<InstanceType<T>>;
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
    return this.all().createOrFindByBang(conditions, extra) as Promise<InstanceType<T>>;
  }

  /**
   * Instantiate a new record (not yet saved).
   *
   * Rails: `Base.new(attributes = nil, &block)` — recurses on arrays and
   * yields each record to the block before returning.
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
      return attrs.map((a) => (this as T).new(a, block));
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
    return Array.isArray(attrs) ? (this as T).new(attrs, block) : (this as T).new(attrs, block);
  }

  /**
   * Create a record and save it to the database.
   *
   * Rails: `Base.create(attributes = nil, &block)` — recurses on arrays
   * and yields each record to the block before save.
   */
  private static _mergeCurrentScopeAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
    const scope = this.currentScope;
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
  declare static findOrInitializeBy: typeof Querying.findOrInitializeBy;
  declare static isAny: typeof Querying.isAny;
  declare static isMany: typeof Querying.isMany;
  declare static isOne: typeof Querying.isOne;
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
  declare static counterCachedAssociationNames: typeof CounterCache.getCounterCachedAssociationNames;

  /**
   * Instantiate a model from a database row (marks it as persisted).
   */
  static _instantiate<T extends typeof Base>(
    this: T,
    row: Record<string, unknown>,
  ): InstanceType<T> {
    // If STI is enabled, delegate to the correct subclass
    const stiBase = getStiBase(this);
    const inheritanceCol = getInheritanceColumn(stiBase);
    if (inheritanceCol && row[inheritanceCol] && row[inheritanceCol] !== this.name) {
      return instantiateSti(stiBase, row) as InstanceType<T>;
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
    // Load DB values through deserialize (not cast) so encrypted types decrypt
    for (const [key, value] of Object.entries(row)) {
      record._attributes.writeFromDatabase(key, value);
    }
    // A SELECT that projects only a subset of columns yields a row with just
    // those keys, so hasAttribute() must reflect what was loaded rather than
    // the full schema. Mirrors Rails' attributes_builder narrowing (see
    // narrowToProjectedColumns). Shared with the STI path in inheritance.ts.
    narrowToProjectedColumns(this as unknown as typeof Base, record as unknown as Base, row);
    record._newRecord = false;
    (record as any)._dirty.snapshot(record._attributes);
    record.changesApplied();
    // Apply strict_loading_by_default
    if (this._strictLoadingByDefault) {
      record._strictLoading = true;
    }
    cbRunAfter(this.prototype, "find", record, { strict: "sync" });
    cbRunAfter(this.prototype, "initialize", record, { strict: "sync" });
    return record;
  }

  // -- Instance state --

  _newRecord = true;
  _destroyed = false;
  _readonly = false;
  _previouslyNewRecord = false;
  private _destroyedByAssociation: unknown = null;
  _transactionAction: "create" | "update" | "destroy" | undefined = undefined;
  _strictLoading = false;
  _strictLoadingMode?: _Core.StrictLoadingMode;
  _strictLoadingBypassCount = 0;
  _preloadedAssociations: Map<string, unknown> = new Map();
  _collectionProxies: Map<string, unknown> = new Map();
  _associationInstances: Map<string, AssociationInstance> = new Map();
  /** @internal */
  _cachedAssociations?: Map<string, Base | Base[] | null>;

  constructor(attrs: Record<string, unknown> = {}) {
    (new.target as typeof Base | undefined)?._requireConcreteClass();
    // Split out constructor-form association values (e.g. `new Owner({items:
    // [...]})`) so super() never sees them as plain attributes. Dispatched
    // after super() so the association proxy exists on `this`.
    let assocPending = _extractAssociationAttrs(new.target as typeof Base, attrs);
    if (assocPending) attrs = assocPending.rest;
    if (hasMultiparameterKeys(attrs)) {
      // Mirrors Rails: Base#initialize calls assign_attributes which handles
      // multiparameter keys. We split: regular attrs go through the Model
      // constructor for setup, mp attrs are assembled after.
      //
      // Suppress after_initialize so it fires after ALL attrs are present
      // (not just the regular subset), and re-snapshot dirty state so mp
      // attrs appear clean (part of initial construction, not changes).
      const ctor = new.target as typeof Base;
      const suppressor = ctor as typeof ctor & { _suppressInitializeCallback?: boolean };
      const hadOwnSuppressor = Object.prototype.hasOwnProperty.call(
        suppressor,
        "_suppressInitializeCallback",
      );
      const wasSuppressed = suppressor._suppressInitializeCallback;
      suppressor._suppressInitializeCallback = true;
      const { multiparams, regular } = extractMultiparameterCallstack(attrs);
      try {
        super(regular);
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
      executeMultiparameterAssignment(this as any, multiparams);
      // Re-snapshot so mp attrs are part of the initial clean state.
      (this as any)._dirty.snapshot((this as any)._attributes);
      if (!wasSuppressed) {
        // Mirrors Rails' initialize_internals_callback chain order:
        //   populate_with_current_scope_attributes (scoping) → ensure_proper_type (STI)
        // Guard on currentScope before allocating the Set — the no-scope case is the hot path.
        if ((ctor as any).currentScope) {
          _applyScopeAttributes(
            ctor,
            this as any,
            new Set([...Object.keys(multiparams), ...Object.keys(regular)]),
          );
        }
        inheritanceInitializeInternalsCallback.call(this as any);
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
        cbRunAfter(ctor.prototype, "initialize", this, { strict: "sync" });
      }
    } else {
      // For the regular (non-multiparameter) path, mirror the multiparameter
      // pattern: suppress after_initialize during super() so we can call
      // initialize_internals_callback first, then fire after_initialize.
      // This matches Rails' Core#initialize order:
      //   init_internals → initialize_internals_callback → super → after_initialize
      const ctor2 = new.target as typeof Base;
      const suppressor2 = ctor2 as typeof ctor2 & { _suppressInitializeCallback?: boolean };
      const hadOwn2 = Object.prototype.hasOwnProperty.call(
        suppressor2,
        "_suppressInitializeCallback",
      );
      const wasSuppressed2 = suppressor2._suppressInitializeCallback;
      suppressor2._suppressInitializeCallback = true;
      try {
        super(attrs);
      } finally {
        if (hadOwn2) {
          suppressor2._suppressInitializeCallback = wasSuppressed2;
        } else {
          delete (suppressor2 as { _suppressInitializeCallback?: boolean })
            ._suppressInitializeCallback;
        }
      }
      if (!wasSuppressed2) {
        // Mirrors Rails' initialize_internals_callback chain order:
        //   populate_with_current_scope_attributes (scoping) → ensure_proper_type (STI)
        // Guard on currentScope before allocating the Set — the no-scope case is the hot path.
        if ((ctor2 as any).currentScope) {
          _applyScopeAttributes(ctor2, this as any, new Set(Object.keys(attrs)));
        }
        inheritanceInitializeInternalsCallback.call(this as any);
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
        cbRunAfter(ctor2.prototype, "initialize", this, { strict: "sync" });
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

  declare writeAttribute: typeof ReadonlyAttributes.writeAttribute;

  get id(): PrimaryKeyValue {
    return _getId.call(this) as PrimaryKeyValue;
  }

  set id(value: PrimaryKeyValue) {
    _setId.call(this, value);
  }

  // increment/decrement/toggle + bang variants wired via include() below;
  // signatures live on the merged `interface Base` at the bottom of this file.

  /**
   * Run async validations (like uniqueness).
   */
  private async _runAsyncValidations(): Promise<boolean> {
    const ctor = this.constructor as typeof Base;
    const asyncValidators: Array<{ attribute: string; options: any }> =
      (ctor as any)._asyncValidations ?? [];

    for (const { attribute, options } of asyncValidators) {
      const value = this.readAttribute(attribute);
      if (value === null || value === undefined) continue;
      const validator = new UniquenessValidator({ ...options, attributes: attribute, class: ctor });
      validator.validateEach(this, attribute, value);
    }

    // Await per-instance async validation promises (pushed by UniquenessValidator.validateEach)
    const instancePromises = (this as any)._asyncValidationPromises as
      | Promise<unknown>[]
      | undefined;
    if (instancePromises?.length) {
      try {
        await Promise.all(instancePromises);
      } finally {
        (this as any)._asyncValidationPromises = [];
      }
    }

    return this.errors.empty;
  }

  /**
   * Register a uniqueness validation.
   *
   * Mirrors: validates uniqueness: true
   */
  declare static validatesUniqueness: typeof _Validations.validatesUniqueness;

  // save / saveBang extracted to persistence.ts; wired via include() below.

  /**
   * The persistence half of save — runs callbacks, performs INSERT or UPDATE,
   * autosaves children, and touches parents. Called by save() inside a
   * transaction wrapper.
   *
   * Mirrors: ActiveRecord::Persistence#save (the super that Transactions#save calls)
   */
  private async _createOrUpdate(): Promise<boolean> {
    const ctor = this.constructor as typeof Base;
    let saved = false;
    let wasNewRecord = false;

    // Rails: Callbacks#create_or_update wraps super in run_callbacks(:save) { ... }.
    // Around_save callbacks correctly wrap the _createRecord/_updateRecord calls which
    // themselves run their own run_callbacks(:create/:update) { ... } chains.
    const saveOk = await cbRunAll(ctor.prototype, "save", this, async () => {
      wasNewRecord = this._newRecord;
      if (wasNewRecord) {
        const createOk = await this._createRecord();
        if (createOk) saved = true;
        else saved = false;
      } else {
        const updateOk = await this._updateRecord();
        if (updateOk) saved = true;
        else saved = false;
      }

      if (saved) {
        this._transactionAction = wasNewRecord ? "create" : "update";
        (this as any)._newRecordBeforeLastCommit = wasNewRecord;
        (this as any)._triggerUpdateCallback = !wasNewRecord;
      }
    });

    this._skipTouch = false;
    if (!saveOk) return false;

    if (saved) {
      if (wasNewRecord) {
        await updateCounterCaches(this, "increment");
      }

      await flushPendingReplaces(this);
    }

    return saved;
  }

  private _pendingOperation: Promise<void> | null = null;
  private _skipTouch = false;
  private _instanceRecordTimestamps: boolean | null = null;

  // Mirrors: ActiveRecord class_attribute :record_timestamps instance-level override
  get recordTimestamps(): boolean {
    return this._instanceRecordTimestamps ?? (this.constructor as typeof Base).recordTimestamps;
  }

  set recordTimestamps(value: boolean) {
    this._instanceRecordTimestamps = value;
  }

  private _performInsert(): void {
    const ctor = this.constructor as typeof Base;

    // If suppressed, skip the actual insert but update record state
    if (_isSuppressed(ctor)) {
      this._newRecord = false;
      (this as any)._dirty.snapshot(this._attributes);
      this.changesApplied();
      return;
    }

    const table = ctor.arelTable;

    // Auto-populate timestamps (unless touch: false or recordTimestamps disabled)
    if (!this._skipTouch && this.recordTimestamps !== false) {
      const now = Timestamp.currentTimeFromProperTimezone();
      for (const col of Timestamp.allTimestampAttributesInModel.call(ctor)) {
        if (ctor._attributeDefinitions.has(col) && this._readAttribute(col) == null) {
          this._writeAttribute(col, now);
        }
      }
    }

    const attrs = this._attributes.valuesForDatabase();
    // Rails: attribute_names = attributes_for_create(self.attribute_names)
    const allNames = Object.keys(attrs).filter((k) => ctor._attributeDefinitions.has(k));
    const columns = _attributesForCreate.call(this, allNames);
    const values: unknown[] = columns.map((k) => attrs[k]);

    let sql: string;
    if (columns.length === 0) {
      const emptyValue = ctor.connection.emptyInsertStatementValue();
      sql = `INSERT INTO ${ctor.connection.quoteTableName(table.name)} ${emptyValue}`;
    } else {
      const im = new InsertManager(table);
      const insertValues: [InstanceType<typeof Nodes.Node>, unknown][] = columns.map((c, i) => {
        const def = ctor._attributeDefinitions.get(c);
        const isArray = def?.type?.name === "array";
        const raw = values[i];
        const val = isArray ? arelSql(quoteSqlValue(raw, true)) : raw;
        return [table.get(c), val];
      });
      im.insert(insertValues);
      const imVisitor = ctor.connection.visitor;
      sql = imVisitor ? imVisitor.compile(im.ast) : im.toSql();
    }
    this._pendingOperation = ctor.connection
      .execInsert(sql, `${ctor.name} Create`)
      .then((rawId) => {
        // Adapters with RETURNING support (PG) may return a Result-like object
        // instead of the bare id — extract via adapter.lastInsertedId when available.
        const insertedId =
          rawId !== null &&
          typeof rawId === "object" &&
          "rows" in rawId &&
          typeof (ctor.connection as any).lastInsertedId === "function"
            ? (ctor.connection as any).lastInsertedId(rawId)
            : rawId;
        if (!Array.isArray(ctor.primaryKey) && this.id === null) {
          this._attributes.set(ctor.primaryKey, insertedId);
        } else if (
          Array.isArray(ctor.primaryKey) &&
          insertedId != null &&
          (ctor.connection as any).supportsInsertReturning?.()
        ) {
          // For composite-PK models with IDENTITY columns on adapters that use
          // RETURNING (PG with use_insert_returning? = true), write back the
          // DB-generated value to the first null PK column.
          //
          // Rails does this via _returning_columns_for_insert + _create_record
          // write-back using named RETURNING columns. Our executeMutation
          // always appends `RETURNING id`, so this only works when the IDENTITY
          // column in the composite PK is named "id". A proper follow-up should
          // implement _returningColumnsForInsert and pass explicit returning:
          // column names to execInsert so the result can be mapped by name.
          for (const pkCol of ctor.primaryKey) {
            if (this._readAttribute(pkCol) == null) {
              this._attributes.set(pkCol, insertedId);
              break;
            }
          }
        }
        // After INSERT, reset lock_version to a FromDatabase attribute carrying the
        // actual serialized value (e.g. 0). This mirrors Rails' behavior: during INSERT
        // @value_for_database is memoized to 0, so changes_applied! → forgetting_assignment
        // produces from_database(0), not from_database(nil). Without this, freshly-created
        // records are indistinguishable from NULL-in-DB records when building the WHERE
        // clause for subsequent UPDATE/DELETE.
        if (ctor.lockingEnabled) {
          const lockCol = ctor.lockingColumn;
          const writtenLockValue = attrs[lockCol] ?? null;
          this._attributes.writeFromDatabase(lockCol, writtenLockValue);
        }
      });
  }

  private _performUpdate(): void {
    const ctor = this.constructor as typeof Base;

    // If suppressed, skip the actual update
    if (_isSuppressed(ctor)) {
      (this as any)._dirty.snapshot(this._attributes);
      this.changesApplied();
      return;
    }

    const table = ctor.arelTable;

    // Auto-populate update timestamps (unless touch: false or recordTimestamps disabled)
    if (!this._skipTouch && this.recordTimestamps !== false) {
      const now = Timestamp.currentTimeFromProperTimezone();
      for (const col of Timestamp.timestampAttributesForUpdateInModel.call(ctor)) {
        if (ctor._attributeDefinitions.has(col) && !this.willSaveChangeToAttribute(col)) {
          this._writeAttribute(col, now);
        }
      }
    }

    const changedAttrs = { ...this.changes };
    this._attributes.forEach((attr, name) => {
      if (!Object.hasOwn(changedAttrs, name) && attr.type.isMutable() && attr.changedInPlace()) {
        changedAttrs[name] = [attr.originalValue, attr.value];
      }
    });

    if (Object.keys(changedAttrs).length === 0) return;

    const dbValues = this._attributes.valuesForDatabase();
    // Rails: attribute_names = attributes_for_update(attribute_names)
    const candidateNames = Object.keys(changedAttrs).filter((key) =>
      ctor._attributeDefinitions.has(key),
    );
    const declaredChanges = _attributesForUpdate.call(this, candidateNames);

    if (declaredChanges.length === 0) return;

    const updateValues: [InstanceType<typeof Nodes.Node>, unknown][] = declaredChanges.map(
      (key) => {
        const val = dbValues[key];
        const def = ctor._attributeDefinitions.get(key);
        const isArray = def?.type?.name === "array";
        return [table.get(key), isArray ? arelSql(quoteSqlValue(val, true)) : val];
      },
    );

    // Optimistic locking: include lock column in WHERE and increment it.
    // Remove any user-supplied lock column entry from the SET list first —
    // it will be replaced with the auto-incremented value to avoid a
    // "multiple assignments to same column" error on PostgreSQL.
    const lockCol = ctor.lockingColumn;
    let lockAttributeWas: import("@blazetrails/activemodel").Attribute | null = null;
    let lockWhereValue: unknown;
    if (ctor.lockingEnabled) {
      const rawVersion = this.readAttribute(lockCol);
      const currentVersion = rawVersion == null ? 0 : Number(rawVersion) || 0;
      // Mirrors Rails _lock_value_for_database:
      // - User explicitly changed lock_version (e.g. person.lock_version = 42):
      //   use valueForDatabase so WHERE = 42. DB has 0 → StaleObjectError.
      // - Normal auto-increment path: use originalValueForDatabase() so
      //   NULL-in-DB records generate IS NULL, freshly-created records generate = 0.
      // Must be read BEFORE mutating _attributes below.
      const lockAttr = this._attributes.getAttribute(lockCol);
      lockAttributeWas = lockAttr; // snapshot for stale restore (mirrors Rails lock_attribute_was)
      if (this.willSaveChangeToAttribute(lockCol)) {
        lockWhereValue = lockAttr.valueForDatabase;
      } else {
        lockWhereValue = lockAttr.originalValueForDatabase();
      }
      const lockIdx = declaredChanges.indexOf(lockCol);
      if (lockIdx !== -1) updateValues.splice(lockIdx, 1);
      this._attributes.set(lockCol, currentVersion + 1);
      updateValues.push([table.get(lockCol), currentVersion + 1]);
    }

    const um = new UpdateManager()
      .table(table)
      .set(updateValues)
      .where(ctor._buildPkWhereNode(this.id));
    if (ctor.lockingEnabled) {
      if (lockWhereValue == null) {
        um.where(table.get(lockCol).isNull());
      } else {
        um.where(table.get(lockCol).eq(Number(lockWhereValue) || 0));
      }
    }
    _Persistence.applyDefaultAndGlobalConstraints(um as any, ctor);

    const umVisitor = ctor.connection.visitor;
    this._pendingOperation = ctor.connection
      .execUpdate(umVisitor ? umVisitor.compile(um.ast) : um.toSql(), `${ctor.name} Update`)
      .then((affected) => {
        if (ctor.lockingEnabled && affected === 0) {
          // Mirrors Rails _update_row rescue Exception: restore attribute snapshot so
          // NULL-in-DB records don't lose their original null valueBeforeTypeCast.
          if (lockAttributeWas !== null) this._attributes.set(lockCol, lockAttributeWas);
          throw new StaleObjectError(this, "update");
        }
      });
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
  private async _destroyRow(): Promise<boolean> {
    const ctor = this.constructor as typeof Base;

    let didDelete = false;
    const destroyResult = await cbRunAll(ctor.prototype, "destroy", this, async () => {
      const table = ctor.arelTable;
      const pk = this.id;
      if (!(Array.isArray(pk) ? pk.every((v) => v == null) : pk == null)) {
        const dm = new DeleteManager().from(table).where(ctor._buildPkWhereNode(pk));
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
            dm.where(table.get(lockCol).isNull());
          } else {
            dm.where(table.get(lockCol).eq(Number(lockWhereValue) || 0));
          }
        }
        _Persistence.applyDefaultAndGlobalConstraints(dm as any, ctor);

        const affected = await ctor.connection.execDelete(dm.toSql(), `${ctor.name} Destroy`);
        if (ctor.lockingEnabled && affected === 0) {
          throw new StaleObjectError(this, "destroy");
        }
        didDelete = affected > 0;
      }

      this._destroyed = true;
      // Rails' destroy ends with a `freeze` call. Delegate to it so we
      // pick up the clone-and-freeze semantics on `_attributes`.
      this.freeze();
      this._collectionProxies.clear();
      this._preloadedAssociations.clear();
      this._associationInstances.clear();
    });

    if (!destroyResult) return false;

    if (didDelete) {
      this._transactionAction = "destroy";
      (this as any)._triggerDestroyCallback = true;
      (this as any)._newRecordBeforeLastCommit = false;
      (this as any)._triggerUpdateCallback = false;
      await updateCounterCaches(this, "decrement");
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
    const verifier = _signedIdVerifier(this.constructor as typeof Base);
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
   * Mirrors: ActiveRecord::Base.find_global_id (via GlobalID::Locator.locate)
   */
  static findGlobalId(
    input: string | import("@blazetrails/globalid").GlobalID,
    options?: import("@blazetrails/globalid").LocateOptions,
  ): Promise<unknown | null> {
    return _Locator.locate(input, options);
  }

  /** Mirrors: ActiveRecord::Base.find_signed_global_id — uses signedIdVerifier(this). */
  static async findSignedGlobalId(
    input: string | _SignedGlobalIDType,
    options?: Omit<import("@blazetrails/globalid").LocateSignedOptions, "verifier">,
  ): Promise<unknown | null> {
    const verifier = _signedIdVerifier(this);
    return _Locator.locateSigned(input, { ...options, verifier });
  }

  /** Mirrors: ActiveRecord::Base.find_signed_global_id! — throws on miss. */
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
  declare toKey: () => unknown[] | null;
  declare accessedFields: () => string[];
  declare queryAttribute: (name: string) => boolean;
  declare _queryAttribute: (name: string) => boolean;
  declare readAttribute: (name: string) => unknown;
  /** @internal */
  declare _readAttribute: (name: string) => unknown;
  declare _writeAttribute: (name: string, value: unknown) => void;
  /** @internal */
  declare cameFromUser: (name: string) => boolean;
  /** @internal */
  declare readStoreAttribute: (storeAttribute: string, key: string) => unknown;
  /** @internal */
  declare writeStoreAttribute: (storeAttribute: string, key: string, value: unknown) => void;
  /** @internal */
  declare storeAccessorFor: (storeAttribute: string) => typeof import("./store.js").HashAccessor;

  get attributeNamesList(): string[] {
    return _attributeNamesList.call(this as any);
  }

  static attributeNames(): string[] {
    return _attributeNames.call(this);
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
    return _findSigned(this, signedId, options);
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
    return _findSignedBang(this, signedId, options);
  }

  /**
   * Compare two records for equality based on class and primary key.
   *
   * Mirrors: ActiveRecord::Core#==
   */
  declare isEqual: (other: unknown) => boolean;

  /**
   * Return a string suitable for use as a URL slug.
   * Override in subclasses for friendly URLs.
   *
   * Mirrors: ActiveRecord::Base#to_param
   */
  toSlug(): string | null {
    return this.toParam();
  }

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

  /**
   * Mirrors: ActiveRecord::Transactions::ClassMethods#set_callback
   *
   * Intercepts `on:` before it reaches the activemodel chain, synthesizing it
   * into an `if:` predicate that closes over `isTransactionIncludeAnyAction`.
   * Rails does the same in transactions.rb#set_callback (lines 304–319).
   */
  static override afterCommit<T extends typeof Model>(
    this: T,
    fn: ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>) | object,
    conditions?: TransactionalCallbackConditions<InstanceType<T>>,
  ): void {
    super.afterCommit(
      fn,
      _synthOnCondition(conditions as Record<string, unknown>) as TransactionalCallbackConditions<
        InstanceType<T>
      >,
    );
  }

  /**
   * Mirrors: ActiveRecord::Transactions::ClassMethods#set_callback (rollback variant)
   *
   * Same `on:` synthesis as afterCommit.
   */
  static override afterRollback<T extends typeof Model>(
    this: T,
    fn: ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>) | object,
    conditions?: TransactionalCallbackConditions<InstanceType<T>>,
  ): void {
    super.afterRollback(
      fn,
      _synthOnCondition(conditions as Record<string, unknown>) as TransactionalCallbackConditions<
        InstanceType<T>
      >,
    );
  }

  static afterSaveCommit = _afterSaveCommitMethod;
  static afterCreateCommit = _afterCreateCommitMethod;
  static afterUpdateCommit = _afterUpdateCommitMethod;
  static afterDestroyCommit = _afterDestroyCommitMethod;

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
  override isValid(context?: ValidationContextArg): boolean {
    const effectiveContext =
      context ?? this._validationContext ?? defaultValidationContext.call(this);
    const result = validationsIsValid.call(this, effectiveContext);
    return result && !this.errors.any;
  }

  // validate / customValidationContext: wired via include() below.

  declare isPresent: () => boolean;
  declare isBlank: () => boolean;

  equals(other: unknown): boolean {
    return this.isEqual(other);
  }

  // Associations instance methods wired via include() below;
  // signatures declared on the merged `interface Base` at the bottom
  // of this file so subclass-variance rules treat them as methods
  // (bivariant) rather than properties (invariant).

  static async tableExists(): Promise<boolean> {
    return ModelSchema.tableExists.call(this);
  }

  static hasAttribute(name: string): boolean {
    return this.hasAttributeDefinition(name);
  }

  // --- TokenFor instance methods (token-for.ts, wired at runtime via generatesTokenFor) ---
  // Rails' TokenFor module is included in Base; these are its instance methods.
  // Declared here so api:compare credits them to base.ts. No eager import — token-for.ts
  // pulls in node:crypto and is intentionally excluded from the main barrel (BC-3).
  declare generateTokenFor: (purpose: string) => string;
  /** @internal */
  declare fullPurpose: () => string;
  /** @internal */
  declare messageVerifier: () => unknown;
  /** @internal */
  declare payloadFor: (model: Base) => unknown[];
  /** @internal */
  declare generateToken: (model: Base) => string;
  /** @internal */
  declare resolveToken: (
    token: string,
    finder: (id: unknown) => Promise<Base | null>,
  ) => Promise<Base | null>;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Base extends Included<typeof AutosaveAssociation> {
  association(name: string): AssociationInstance;
  loadBelongsTo(name: string): Promise<Base | null>;
  loadHasOne(name: string): Promise<Base | null>;
  readAttributeForValidation(attribute: string): unknown;
  validate(context?: ValidationContextArg): boolean;
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
  toggleBang(attribute: string): Promise<boolean>;
  save(options?: { validate?: boolean; touch?: boolean }): Promise<boolean>;
  saveBang(): Promise<true>;
  destroy(): Promise<this | false>;
  destroyBang(): Promise<this>;
  update(attrs: Record<string, unknown>): Promise<boolean>;
  updateBang(attrs: Record<string, unknown>): Promise<true>;
  delete(): Promise<this>;
  reload(): Promise<this>;
  initializeDup(other: unknown): void;
  /** @internal */
  initInternals(): void;
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
  _createRecord(): Promise<boolean>;
  /** @internal */
  _updateRecord(): Promise<boolean>;
  slice(...keys: string[]): Record<string, unknown>;
  valuesAt(...keys: string[]): unknown[];
  assignAttributes(attrs: Record<string, unknown>): void;
  updateAttribute(name: string, value: unknown): Promise<boolean>;
  updateAttributeBang(name: string, value: unknown): Promise<true>;
  updateColumn(name: string, value: unknown): Promise<void>;
  updateColumns(attrs: Record<string, unknown>): Promise<void>;
  dup(): this;
  clone(): this;
  becomes<K extends typeof Base>(klass: K): InstanceType<K>;
  becomesBang<K extends typeof Base>(klass: K): InstanceType<K>;
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
extend(Base, Timestamp.ClassMethods);
extend(Base, NamedScoping.ClassMethods);
extend(Base, _Validations.ClassMethods);
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
  // execExplain is a static wrapper (passes `this`) — not in extend()
  renderBind: _renderBind,
  buildExplainClause: _buildExplainClause,
});
extend(Base, _Reflection.ClassMethods);
extend(Base, {
  defaultScope: _defaultScope,
  unscoped: _unscoped,
});
extend(Base, ModelSchema.ClassMethods);
extend(Base, {
  defineAttribute: _defineAttribute,
  _defaultAttributes: _arDefaultAttributes,
});
extend(Base, {
  // ConnectionHandling.ClassMethods does not include resolveConfigForConnection
  // (it's a standalone export, not in the ClassMethods object), so wire it here.
  resolveConfigForConnection: ConnectionHandling.resolveConfigForConnection,
  localStoredAttributes: _localStoredAttributesMethod,
});

include(Base, {
  // ReadonlyAttributes
  writeAttribute: ReadonlyAttributes.writeAttribute,
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
  assignAttributes: _Persistence.assignAttributes,
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
  attributeForInspect: _attributeForInspect,
  isEqual: _isEqual,
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
  // Integration
  toParam: _toParam,
  cacheKey: _cacheKey,
  cacheKeyWithVersion: _cacheKeyWithVersion,
  cacheVersion: _cacheVersion,
  // Serialization
  serializableHash: Serialization.serializableHash,
  // AttributeMethods
  hasAttribute: _hasAttribute,
  attributePresent: _attributePresent,
  accessedFields: _accessedFields,
  queryAttribute: _queryAttribute,
  _queryAttribute: _queryAttributeFn,
  _readAttribute: _readAttributeFn,
  _writeAttribute: ReadonlyAttributes._writeAttribute,
  cameFromUser: _isAttributeCameFromUser,
  // PrimaryKey
  toKey: _toKey,
  // Store (private instance helpers)
  readStoreAttribute: _readStoreAttributeMethod,
  writeStoreAttribute: _writeStoreAttributeMethod,
  storeAccessorFor: _storeAccessorForMethod,
});
include(Base, LockingPessimistic.InstanceMethods);
include(Base, LockingOptimistic.InstanceMethods);
include(Base, Timestamp.InstanceMethods);
include(Base, TouchLater.InstanceMethods);
include(Base, _Aggregations.InstanceMethods);
// Aggregations#reload must override Persistence#reload (include() won't replace).
(Base.prototype as any).reload = _Aggregations.reload;
include(Base, _AttributeAssignment.InstanceMethods);
include(Base, AutosaveAssociation);
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
// Wire private/internal helpers onto Base so api:compare credits them to base.rb.
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
  attributesForDatabase: _attributesForDatabase,
  attributeBeforeTypeCast: _attributeBeforeTypeCast,
  attributeForDatabase: _attributeForDatabase,
  isAttributeCameFromUser: _isAttributeCameFromUser,
  queryCastAttribute: _queryCastAttribute,
  isPrimaryKeyValuesPresent: _isPrimaryKeyValuesPresent,
  idWas: _idWas,
  idInDatabase: _idInDatabase,
  idForDatabase: _idForDatabase,
  isSavedChangeToAttribute: _isSavedChangeToAttribute,
  attributeBeforeLastSave: _attributeBeforeLastSave,
  isWillSaveChangeToAttribute: _isWillSaveChangeToAttribute,
  attributeChangeToBeSaved: _attributeChangeToBeSaved,
  attributeInDatabase: _attributeInDatabase,
  attributeNamesForPartialUpdates: _attributeNamesForPartialUpdates,
  attributeNamesForPartialInserts: _attributeNamesForPartialInserts,
  // idBeforeTypeCast is AR-specific (not on Model); safe to wire.
  idBeforeTypeCast: _idBeforeTypeCast,
  // isSavedChanges is AR-specific (not on Model); safe to wire.
  isSavedChanges: _isSavedChanges,
  // TouchLater privates — not on Model; safe to wire.
  hasDeferTouchAttrs(this: Base) {
    return TouchLater.hasDeferTouchAttrs(this);
  },
  // normalizeChangedInPlaceAttributes is not on Model; safe to wire.
  normalizeChangedInPlaceAttributes(this: Base) {
    return _normalizeChangedInPlaceAttributesFn(this);
  },
  // normalizeAttribute lives on Model.prototype (inherited). Wire via direct
  // prototype reference so api:compare credits it to base.ts without shadowing
  // Model's implementation via a wrapper that would create a circular call.
  normalizeAttribute: Model.prototype.normalizeAttribute,
  // readAttributeBeforeTypeCast/attributesBeforeTypeCast — inherited from Model.prototype
  // (readAttributeBeforeTypeCast is a method, attributesBeforeTypeCast is a getter).
  // The re-exports in before-type-cast.ts call record.<methodName>(), so wiring
  // them would create cycles. Category A: inherited, extractor limitation.
  // savedChanges/hasChangesToSave/changesToSave/changedAttributeNamesToSave/
  // attributesInDatabase — getters on Model.prototype; wiring via include() replaces
  // the getter descriptor with a data property and breaks behavior. Category A.
  // savedChangeToAttribute — on Model (returns boolean); AR version returns [T,T]|null
  // pair — overriding breaks tests. Category A: resolved via Model inheritance.
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
  // TouchLater privates (instance-level) wired here for api:compare credit.
  surreptitiouslyTouch: TouchLater.surreptitiouslyTouch,
  touchDeferredAttributes: TouchLater.touchDeferredAttributes,
});

for (const [name, fn] of [
  ["createOrUpdate", callbacksCreateOrUpdate],
  ["_createRecord", callbacksCreateRecord],
  ["_updateRecord", callbacksUpdateRecord],
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
        this.assignAttributes(attrs);
      },
      configurable: true,
      enumerable: false,
    });
  }
}

registerMigrationArConfig({
  get tableNamePrefix() {
    return Base._tableNamePrefix;
  },
  get tableNameSuffix() {
    return Base._tableNameSuffix;
  },
});

// Side-effect import (currently no-op); kept so future globalid hooks can
// register here without callers needing to re-add it.
import "@blazetrails/globalid/wire";

// Register globalid's model finder. Base._modelsByName is populated by the
// adapter setter (every AR model receives an adapter), so any class that
// behaves as an AR model is reachable here. modelRegistry from associations
// covers the explicit registerModel(name, klass) form for models registered
// under aliases.
import {
  setModelFinder as _setGlobalIdModelFinder,
  type LocatorModel as _LocatorModel,
} from "@blazetrails/globalid";
import { modelRegistry as _gidModelRegistry } from "./associations.js";
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
_setGlobalIdModelFinder((name: string) => {
  const fromBase = Base._modelsByName.get(name);
  if (fromBase) return fromBase as unknown as _LocatorModel;
  const fromAssoc = _gidModelRegistry.get(name);
  if (fromAssoc) return fromAssoc as unknown as _LocatorModel;
  // STI subclasses inherit their parent's adapter, so they don't trigger the
  // adapter setter. registerSubclass(klass) attaches them to their direct
  // parent's _subclasses, not to Base — so we walk descendants of every
  // model in _modelsByName, not just Base.descendants. Cache for O(1) repeat.
  for (const root of Base._modelsByName.values()) {
    for (const klass of root.descendants) {
      if (klass.name === name) {
        Base._modelsByName.set(name, klass as typeof Base);
        return klass as unknown as _LocatorModel;
      }
    }
  }
  return undefined;
});

// Mirrors `ActiveSupport.run_load_hooks(:active_record, Base)` at the
// bottom of `activerecord/lib/active_record/base.rb`. Lets railtie
// initializers register `on_load(:active_record)` consumers that need a
// fully-defined `Base` class (timezone, filter attributes, ...).
runLoadHooks("active_record", Base);

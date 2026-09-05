import { ArgumentError, hasKey } from "@blazetrails/ruby-compat";
import { getApplicationRecordClass } from "./inheritance.js";
import {
  NameError,
  RecordNotFound,
  StatementInvalid,
  StrictLoadingViolationError,
} from "./errors.js";
import { ActiveRecord } from "./ar-config.js";
import { WRITING_ROLE } from "./roles.js";
import {
  DatabaseConfigurations,
  configurationsStore,
  setConfigurationsStore,
  type RawConfigurations,
} from "./database-configurations.js";
import type { HashConfig } from "./database-configurations/hash-config.js";
import {
  Notifications,
  IsolatedExecutionState,
  ParameterFilter,
  isPlainObject,
  constantize,
  pluralize,
} from "@blazetrails/activesupport";
import { AsynchronousQueriesTracker, type Session } from "./asynchronous-queries-tracker.js";
import { _reflectOnAssociation, reflectOnAggregation } from "./reflection.js";
import { compactUniqIds, compactUniqTuples } from "./relation/compact-uniq-ids.js";
import { PredicateBuilder } from "./relation/predicate-builder.js";
import { TableMetadata } from "./table-metadata.js";
import { formatForInspect } from "./attribute-inspection.js";
import type { PrettyPrinter } from "./pretty-print.js";
import { Table, Nodes } from "@blazetrails/arel";
import { Map as TypeCasterMap } from "./type-caster/map.js";
import { buildPkWhereNode, columnsHash } from "./model-schema.js";
import { StatementCache } from "./statement-cache.js";
import { withConnection } from "./connection-handling.js";
import { RangeError as ActiveModelRangeError } from "@blazetrails/activemodel";
import { runCallbacks } from "@blazetrails/activesupport";

export interface Core {
  inspect(): string;
  attributeForInspect(attr: string): string;
  equals(other: unknown): boolean;
  freeze(): this;
  isFrozen(): boolean;
  compare(other: unknown): number | undefined;
  isPresent(): boolean;
  isBlank(): boolean;
  isReadonly(): boolean;
  readonlyBang(): this;
  isStrictLoading(): boolean;
  strictLoadingBang(value?: boolean, options?: { mode?: StrictLoadingMode }): this;
  strictLoadingMode(): StrictLoadingMode;
  isStrictLoadingAll(): boolean;
  isStrictLoadingNPlusOneOnly(): boolean;
}

export { InspectionMask } from "./attribute-inspection.js";
import { inspectionFilter as _inspectionFilterImpl } from "./attribute-inspection.js";
import { _Base } from "./base-slot.js";

interface CoreRecord {
  id: unknown;
  _attributes: Iterable<[string, unknown]>;
  _newRecord: boolean;
  readAttribute(name: string): unknown;
  isPersisted(): boolean;
}

export function inspect(this: CoreRecord): string {
  return inspectWithAttributes.call(this as any, attributesForInspect.call(this));
}

export function attributeForInspect(this: CoreRecord, attr: string): string {
  const raw = this.readAttribute(attr);
  return formatForInspect.call(this, attr, raw);
}

export async function prettyPrint(
  this: CoreRecord & { _attributes: any; constructor: { prototype: object } },
  pp: PrettyPrinter,
): Promise<void> {
  if (isCustomInspectMethodDefined.call(this)) {
    pp.text((this as unknown as { inspect(): string }).inspect());
    return;
  }
  await pp.objectAddressGroup(this as object, async () => {
    if (!this._attributes) {
      pp.breakable(" ");
      pp.text("not initialized");
      return;
    }
    const knownKeys = new Set<string>(
      Array.from(this._attributes as Iterable<[string, unknown]>).map(([k]) => k),
    );
    const attrNames = attributesForInspect.call(this).filter((name) => knownKeys.has(name));
    await pp.seplist(
      attrNames,
      () => pp.text(","),
      async (attrName) => {
        pp.breakable(" ");
        await pp.group(1, "", "", () => {
          pp.text(attrName);
          pp.text(":");
          pp.breakable();
          pp.text(
            (this as unknown as { attributeForInspect(attr: string): string }).attributeForInspect(
              attrName,
            ),
          );
        });
      },
    );
  });
}

export function equals(this: CoreRecord, other: unknown): boolean {
  if (this === other) return true;
  if (other === null || other === undefined) return false;
  if (typeof other !== "object") return false;
  if (this.constructor !== (other as any).constructor) return false;
  if (!(this as unknown as { isPrimaryKeyValuesPresent(): boolean }).isPrimaryKeyValuesPresent())
    return false;
  return primaryKeyValuesEqual(this.id, (other as CoreRecord).id);
}

const identityHashKeys = new WeakMap<object, symbol>();

const constructorHashTokens = new WeakMap<object, number>();
let nextConstructorToken = 0;

function constructorToken(ctor: object): number {
  let token = constructorHashTokens.get(ctor);
  if (token === undefined) {
    token = nextConstructorToken++;
    constructorHashTokens.set(ctor, token);
  }
  return token;
}

function serializeIdForHash(id: unknown): string {
  if (Array.isArray(id)) {
    return `A${id.map((el) => lengthPrefixed(serializeIdForHash(el))).join("")}`;
  }
  return `S${typeof id}:${String(id)}`;
}

function lengthPrefixed(value: string): string {
  return `${value.length}:${value}`;
}

export function hash(this: CoreRecord): unknown {
  if ((this as unknown as { isPrimaryKeyValuesPresent(): boolean }).isPrimaryKeyValuesPresent()) {
    return `${constructorToken(this.constructor)}#${serializeIdForHash(this.id)}`;
  }
  let key = identityHashKeys.get(this);
  if (key === undefined) {
    key = Symbol("record-hash");
    identityHashKeys.set(this, key);
  }
  return key;
}

function primaryKeyValuesEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((value, index) => value === b[index]);
  }
  return a === b;
}

export function freeze<T extends FrozenRecord>(this: T): T {
  this._attributes = this._attributes.deepDup().freeze();
  return this;
}

export function isFrozen(this: FrozenRecord): boolean {
  return Object.isFrozen(this._attributes);
}

export function compare(this: CoreRecord, otherObject: unknown): number | undefined {
  if (otherObject instanceof (this.constructor as new (...args: never[]) => unknown)) {
    return compareKeys(
      (this as unknown as ComparableRecord).toKey(),
      (otherObject as ComparableRecord).toKey(),
    );
  }
  return equals.call(this, otherObject) ? 0 : undefined;
}

interface ComparableRecord {
  toKey(): unknown[] | null;
}

function compareKeys(a: unknown[] | null, b: unknown[] | null): number | undefined {
  if (a === null || b === null) return a === null && b === null ? 0 : undefined;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const cmp = compareValues(a[i], b[i]);
    if (cmp !== 0) return cmp;
  }
  return Math.sign(a.length - b.length);
}

function compareValues(a: unknown, b: unknown): number | undefined {
  if (typeof a !== typeof b) return undefined;
  if (typeof a === "number" || typeof a === "bigint" || typeof a === "string") {
    return a === (b as typeof a) ? 0 : a < (b as typeof a) ? -1 : 1;
  }
  return a === b ? 0 : undefined;
}

export function isPresent(this: CoreRecord): boolean {
  return this.isPersisted();
}

export function isBlank(this: CoreRecord): boolean {
  return !isPresent.call(this);
}

interface ReadonlyFields {
  _readonly: boolean;
}

interface StrictLoadingFields {
  _strictLoading: boolean;
  _strictLoadingMode?: StrictLoadingMode;
}

export type StrictLoadingMode = "all" | "n_plus_one_only";

interface FrozenRecord {
  _attributes: import("@blazetrails/activemodel").AttributeSet;
}

export function isReadonly(this: ReadonlyFields): boolean {
  return this._readonly;
}

export function readonlyBang<T extends ReadonlyFields>(this: T): T {
  this._readonly = true;
  return this;
}

export function isStrictLoading(this: StrictLoadingFields): boolean {
  return this._strictLoading;
}

export function strictLoadingBang<T extends StrictLoadingFields>(
  this: T,
  value: boolean = true,
  options: { mode?: StrictLoadingMode } = {},
): T {
  const mode = options.mode ?? "all";
  if (mode !== "all" && mode !== "n_plus_one_only") {
    throw new ArgumentError(
      `The :mode option must be one of ["all", "n_plus_one_only"] but ${JSON.stringify(mode)} was provided.`,
    );
  }
  this._strictLoadingMode = mode;
  this._strictLoading = value;
  return this;
}

export function initWithAttributes(
  this: CoreRecord & { _attributes: any; _newRecord: boolean },
  attributes: any,
  newRecord = false,
): void {
  this._newRecord = newRecord;
  this._attributes = attributes;
}

export function initAttributes(
  this: CoreRecord & { _attributes: any; constructor: { primaryKey?: string | string[] } },
  _: unknown,
): any {
  const attrs = this._attributes.deepDup();
  const primaryKey = this.constructor.primaryKey;
  if (Array.isArray(primaryKey)) {
    for (const key of primaryKey) attrs.reset(key);
  } else if (primaryKey != null) {
    attrs.reset(primaryKey);
  }
  return attrs;
}

type StrictLoadingModeHost = CoreRecord & { _strictLoadingMode?: StrictLoadingMode };

export function strictLoadingMode(this: StrictLoadingModeHost): StrictLoadingMode {
  return this._strictLoadingMode ?? "all";
}

export function isStrictLoadingNPlusOneOnly(this: StrictLoadingModeHost): boolean {
  return strictLoadingMode.call(this) === "n_plus_one_only";
}

export function isStrictLoadingAll(this: StrictLoadingModeHost): boolean {
  return strictLoadingMode.call(this) === "all";
}

export function fullInspect(this: CoreRecord): string {
  return inspectWithAttributes.call(this as any, allAttributesForInspect.call(this));
}

interface CoreHost {
  name: string;
  tableName?: string;
  primaryKey?: string | string[];
  compositePrimaryKey?: boolean;
  _filterAttributes?: (string | RegExp | ((key: string, value: unknown) => unknown))[];
  _inspectionFilter?: any;
  _connectionClass?: boolean;
  _connectionHandler?: any;
  _destroyAssociationAsyncJob?: any;
  _findByStatementCache?: Map<boolean, Map<string, any>>;
  _generatedAssociationMethods?: Set<string>;
  _predicateBuilder?: any;
  arelTable?: any;
  prototype: any;
  all(): any;
  isScopeAttributes(): boolean;
  typeForAttribute(name: string): { cast(value: unknown): unknown } | null;
  ensureSchemaLoaded(): Promise<void>;
}

function parentClass(klass: CoreHost): CoreHost | null {
  const proto = Object.getPrototypeOf(klass);
  return typeof proto === "function" ? (proto as CoreHost) : null;
}

export function destroyAssociationAsyncJob(this: CoreHost, value?: any): any {
  if (value !== undefined) {
    this._destroyAssociationAsyncJob = value;
    return this._destroyAssociationAsyncJob;
  }
  if (typeof this._destroyAssociationAsyncJob === "string") {
    try {
      this._destroyAssociationAsyncJob = constantize(this._destroyAssociationAsyncJob);
    } catch (error) {
      if (!(error instanceof NameError)) throw error;
      throw new NameError(`Unable to load destroy_association_async_job: ${error.message}`);
    }
  }
  return this._destroyAssociationAsyncJob ?? null;
}

export function configurations(
  config?: RawConfigurations | DatabaseConfigurations | HashConfig[],
): DatabaseConfigurations {
  if (config !== undefined) {
    setConfigurationsStore(
      config instanceof DatabaseConfigurations ? config : new DatabaseConfigurations(config),
    );
  }
  return configurationsStore();
}

export function isApplicationRecordClass(this: CoreHost): boolean {
  const explicit = getApplicationRecordClass();
  if (explicit) return (this as unknown) === explicit;
  return (this as unknown) === (globalThis as Record<string, unknown>)["ApplicationRecord"];
}

export type ConnectedToEntry = {
  role?: string;
  shard?: string;
  klasses: any[];
  preventWrites?: boolean;
};

const CONNECTED_TO_STACK_KEY = Symbol.for("ar_connected_to_stack");

/** @missingRailsCall new — PERMANENT */
export function connectedToStack(): ConnectedToEntry[] {
  return IsolatedExecutionState.fetch<ConnectedToEntry[]>(CONNECTED_TO_STACK_KEY, () => []);
}

export function withIsolatedConnectionState<T>(fn: () => T): T {
  return IsolatedExecutionState.scope(CONNECTED_TO_STACK_KEY, [] as ConnectedToEntry[], fn);
}

function isBase(klass: any): boolean {
  return (
    typeof klass === "function" &&
    Object.prototype.hasOwnProperty.call(klass, "_isActiveRecordBase")
  );
}

export function currentRole(this: CoreHost): string {
  const stack = connectedToStack();
  for (let i = stack.length - 1; i >= 0; i--) {
    const hash = stack[i];
    if (hash.role && hash.klasses.some(isBase)) return hash.role;
    if (hash.role && hash.klasses.includes(connectionClassForSelf.call(this))) return hash.role;
  }

  return (this as CoreHost & { defaultRole?: string }).defaultRole ?? WRITING_ROLE;
}

export function currentShard(this: CoreHost): string {
  const stack = connectedToStack();
  for (let i = stack.length - 1; i >= 0; i--) {
    const hash = stack[i];
    if (hash.shard && hash.klasses.some(isBase)) return hash.shard;
    if (hash.shard && hash.klasses.includes(connectionClassForSelf.call(this))) return hash.shard;
  }

  return (connectionClassForSelf.call(this) as any)._defaultShard ?? "default";
}

export function currentPreventingWrites(this: CoreHost): boolean {
  const stack = connectedToStack();
  for (let i = stack.length - 1; i >= 0; i--) {
    const hash = stack[i];
    if (hash.preventWrites !== undefined && hash.klasses.some(isBase)) return hash.preventWrites;
    if (
      hash.preventWrites !== undefined &&
      hash.klasses.includes(connectionClassForSelf.call(this))
    )
      return hash.preventWrites;
  }

  return false;
}

/** @missingRailsCall include? — PERMANENT */
export function isPreventingWrites(className?: string): boolean {
  const stack = connectedToStack();
  for (let i = stack.length - 1; i >= 0; i--) {
    const hash = stack[i];
    if (hash.preventWrites !== undefined && hash.klasses.some(isBase)) return hash.preventWrites;
    if (
      hash.preventWrites !== undefined &&
      hash.klasses.some((klass) => typeof klass === "function" && klass.name === className)
    )
      return hash.preventWrites;
  }

  return false;
}

export function connectionClass(this: CoreHost, value?: boolean): boolean {
  if (value !== undefined) {
    this._connectionClass = value;
  }
  return this._connectionClass ?? false;
}

export function isConnectionClass(this: CoreHost): boolean {
  return connectionClass.call(this);
}

export function connectionClassForSelf(this: CoreHost): CoreHost {
  let klass: CoreHost | null = this;
  while (klass) {
    if (Object.prototype.hasOwnProperty.call(klass, "_connectionClass") && klass._connectionClass)
      return klass;
    if ((klass as unknown) === _Base) return klass;
    klass = parentClass(klass);
  }
  return this;
}

export function asynchronousQueriesTracker(): AsynchronousQueriesTracker {
  return IsolatedExecutionState.fetch<AsynchronousQueriesTracker>(
    ASYNCHRONOUS_QUERIES_TRACKER_KEY,
    () => new AsynchronousQueriesTracker(),
  );
}

const ASYNCHRONOUS_QUERIES_TRACKER_KEY = "active_record_asynchronous_queries_tracker";

export function asynchronousQueriesSession(): Session {
  return asynchronousQueriesTracker().currentSession;
}

export function strictLoadingViolationBang({
  owner,
  reflection,
}: {
  owner: unknown;
  reflection: { name: string; strictLoadingViolationMessage(owner: unknown): string };
}): void {
  switch (ActiveRecord.actionOnStrictLoadingViolation) {
    case "raise": {
      const message = reflection.strictLoadingViolationMessage(owner);
      throw new StrictLoadingViolationError(message);
    }
    case "log": {
      const name = "strict_loading_violation.active_record";
      Notifications.instrument(name, { owner, reflection });
    }
  }
}

export function initializeFindByCache(this: CoreHost): void {
  this._findByStatementCache = new Map();
  this._findByStatementCache.set(true, new Map());
  this._findByStatementCache.set(false, new Map());
}

export function initializeGeneratedModules(this: CoreHost): void {
  generatedAssociationMethods.call(this);
}

/** @missingRailsCall include — PERMANENT */
export function generatedAssociationMethods(this: CoreHost): Set<string> {
  if (!this._generatedAssociationMethods) {
    this._generatedAssociationMethods = new Set();
  }
  return this._generatedAssociationMethods;
}

export function filterAttributes(
  this: CoreHost,
  value?: (string | RegExp | ((key: string, value: unknown) => unknown))[],
): (string | RegExp | ((key: string, value: unknown) => unknown))[] {
  if (value !== undefined) {
    this._filterAttributes = value;
    this._inspectionFilter = null;
  }
  if (Object.prototype.hasOwnProperty.call(this, "_filterAttributes"))
    return this._filterAttributes!;
  const parent = parentClass(this);
  if (parent) return filterAttributes.call(parent);
  return [];
}

export function predicateBuilder(this: CoreHost): PredicateBuilder {
  if (Object.prototype.hasOwnProperty.call(this, "_predicateBuilder") && this._predicateBuilder)
    return this._predicateBuilder;
  this._predicateBuilder = new PredicateBuilder(new TableMetadata(this as any, this.arelTable));
  return this._predicateBuilder;
}

export function typeCaster(this: CoreHost): TypeCasterMap {
  return new TypeCasterMap(this);
}

export function cachedFindByStatement(
  this: CoreHost,
  connection: any,
  key: string,
  block: (params: any) => any,
): any {
  if (
    !Object.prototype.hasOwnProperty.call(this, "_findByStatementCache") ||
    !this._findByStatementCache
  ) {
    initializeFindByCache.call(this);
  }
  const prepared = connection?.preparedStatements ?? true;
  const cache = this._findByStatementCache!.get(prepared)!;
  if (!cache.has(key)) {
    cache.set(key, StatementCache.create(connection, block));
  }
  return cache.get(key);
}

export function inspectionFilter(this: CoreHost): ParameterFilter {
  return _inspectionFilterImpl.call(this);
}

export function connectionHandler(this: CoreHost, value?: any): any {
  if (value !== undefined) {
    this._connectionHandler = value;
    return value;
  }
  return this._connectionHandler;
}

export function arelTable(this: CoreHost): Table {
  return new Table((this as any).tableName, { klass: this as any });
}

/** @internal */
export function initInternals(
  this: CoreRecord & {
    _attributes: import("@blazetrails/activemodel").AttributeSet;
    _newRecord: boolean;
    _readonly: boolean;
    _previouslyNewRecord: boolean;
    _destroyed: boolean;
    _markedForDestruction: boolean;
    _destroyedByAssociation: unknown;
    _startTransactionState: unknown;
    _strictLoading: boolean;
    _strictLoadingMode?: StrictLoadingMode;
    _primaryKey?: string | string[] | null;
  },
  super_: () => void,
): void {
  this._newRecord = true;
  this._attributes = (
    this.constructor as unknown as {
      _defaultAttributes(): import("@blazetrails/activemodel").AttributeSet;
    }
  )
    ._defaultAttributes()
    .deepDup();

  super_();
  this._readonly = false;
  this._previouslyNewRecord = false;
  this._destroyed = false;
  this._markedForDestruction = false;
  this._destroyedByAssociation = null;
  this._startTransactionState = null;
  const klass = this.constructor as any;
  this._primaryKey = klass.primaryKey;
  this._strictLoading = klass.strictLoadingByDefault ?? false;
  this._strictLoadingMode = klass.strictLoadingMode;

  klass.defineAttributeMethods();
}

export function initializeDup(
  this: CoreRecord & {
    _attributes: any;
    _newRecord: boolean;
    _previouslyNewRecord: boolean;
    _destroyed: boolean;
    _startTransactionState: unknown;
  },
  super_: (other: unknown) => void,
  other: unknown,
): void {
  this._attributes = (
    this as unknown as { initAttributes(other: unknown): unknown }
  ).initAttributes(other);
  super_(other);
  void runCallbacks(this, "initialize", undefined, { strict: "sync" });
  this._newRecord = true;
  this._previouslyNewRecord = false;
  this._destroyed = false;
  this._startTransactionState = null;
}

/** @internal */
export function initializeInternalsCallback(this: unknown): void {}

/** @internal */
export function isCustomInspectMethodDefined(this: {
  constructor: { prototype: object };
}): boolean {
  return Object.prototype.hasOwnProperty.call(this.constructor.prototype, "inspect");
}

/** @internal */
export function inspectWithAttributes(
  this: CoreRecord & { _attributes: any },
  attributesToList: string[],
): string {
  const ctor = this.constructor as { name: string };
  if (!this._attributes) return `#<${ctor.name} not initialized>`;
  const knownKeys = new Set<string>(
    Array.from(this._attributes as Iterable<[string, unknown]>).map(([k]) => k),
  );
  const parts = attributesToList
    .filter((name) => knownKeys.has(name))
    .map(
      (name) =>
        `${name}: ${(this as unknown as { attributeForInspect(attr: string): string }).attributeForInspect(name)}`,
    );
  return `#<${ctor.name} ${parts.join(", ")}>`;
}

export function attributesForInspect(this: CoreRecord): string[] {
  const klass = this.constructor as any;
  const forInspect = klass.attributesForInspect;
  if (forInspect === "all" || forInspect == null) return allAttributesForInspect.call(this);
  return Array.isArray(forInspect) ? forInspect : allAttributesForInspect.call(this);
}

/** @internal */
export function allAttributesForInspect(this: CoreRecord): string[] {
  if (!this._attributes) return [];
  return Array.from(this._attributes).map(([k]) => k);
}

/** @internal */
function relation(this: CoreHost): any {
  return (this as any).all();
}

function pkMatchKey(value: unknown): unknown {
  return typeof value === "bigint" || typeof value === "number" ? String(value) : value;
}

function raiseCouldntFindAll(
  name: string,
  pk: string,
  ids: unknown[],
  payload: unknown,
  resultSize: number,
  expectedSize: number,
): never {
  throw new RecordNotFound(
    `Couldn't find all ${pluralize(name)} with '${pk}': ` +
      `(${ids.flat(Infinity).join(", ")}) ` +
      `(found ${resultSize} results, but was looking for ${expectedSize}).`,
    name,
    pk,
    payload,
  );
}

export async function find(this: CoreHost, ...ids: unknown[]): Promise<any> {
  await this.ensureSchemaLoaded();
  if (ids.length === 0) {
    throw new RecordNotFound(
      `Couldn't find ${this.name} without an ID`,
      this.name,
      String(this.primaryKey),
    );
  }
  if (
    ids.length === 1 &&
    !this.isScopeAttributes() &&
    this.primaryKey != null &&
    !this.compositePrimaryKey &&
    !Array.isArray(ids[0]) &&
    !StatementCache.unsupportedValue(ids[0])
  ) {
    const pk = this.primaryKey as string;
    const record = await cachedFindBy.call(this, [pk], [ids[0]]);
    if (record) return record;
    throw new RecordNotFound(
      `Couldn't find ${this.name} with '${pk}'=${String(ids[0])}`,
      this.name,
      pk,
      ids[0],
    );
  }
  if (ids.length > 1) {
    if (this.compositePrimaryKey && ids.some((i) => !Array.isArray(i))) {
      throw new ArgumentError(
        `${this.name} has a composite primary key (${String(this.primaryKey)}); ` +
          `call find([...tuple]) or find([[...], [...]]) rather than variadic scalars.`,
      );
    }
    if (this.compositePrimaryKey) {
      const expectsArray = Array.isArray((ids[0] as unknown[])[0]);
      const tuples = compactUniqTuples(ids);
      if (tuples.length === 1 && !expectsArray) {
        return (this as any).find(tuples[0]);
      }
      return (this as any).find(tuples);
    }
    return (this as any).find(ids);
  }
  const id = ids[0];

  if (this.compositePrimaryKey && Array.isArray(id)) {
    if (Array.isArray(id[0])) {
      const tuples = compactUniqTuples(id) as unknown[][];
      const whereNodes = tuples.map((tuple) => buildPkWhereNode.call(this as any, tuple));
      const orCondition = whereNodes.reduce((left, right) => new Nodes.Or([left, right]));
      const records = await this.all().where(new Nodes.Grouping(orCondition)).toArray();
      if (records.length !== tuples.length) {
        raiseCouldntFindAll(
          this.name,
          String(this.primaryKey),
          tuples,
          id,
          records.length,
          tuples.length,
        );
      }
      return records;
    }
    const pk = this.primaryKey as string[];
    const whereConditions: Record<string, unknown> = {};
    pk.forEach((col, i) => {
      whereConditions[col] = (id as unknown[])[i];
    });
    const record = await this.all().where(whereConditions).first();
    if (!record) {
      raiseCouldntFindAll(this.name, String(this.primaryKey), id as unknown[], id, 0, 1);
    }
    return record;
  }

  if (Array.isArray(id)) {
    if (id.length === 0) {
      return [];
    }
    const compactedIds = compactUniqIds(id);
    if (compactedIds.length === 0) {
      throw new RecordNotFound(
        `Couldn't find ${this.name} without an ID`,
        this.name,
        String(this.primaryKey),
      );
    }
    if (compactedIds.length === 1) {
      const single = compactedIds[0];
      const record = await this.all()
        .where({ [this.primaryKey as string]: single })
        .first();
      if (!record) {
        throw new RecordNotFound(
          `Couldn't find ${this.name} with '${String(this.primaryKey)}'=${String(single)}`,
          this.name,
          String(this.primaryKey),
          single,
        );
      }
      return [record];
    }
    const records = await this.all()
      .where({ [this.primaryKey as string]: compactedIds })
      .toArray();
    const pkType = this.typeForAttribute(this.primaryKey as string);
    const castIds = compactedIds.map((i) => pkType!.cast(i));
    const idToRecord = new Map<unknown, any>();
    for (const r of records) idToRecord.set(pkMatchKey(r.id), r);
    if (records.length !== castIds.length) {
      raiseCouldntFindAll(
        this.name,
        String(this.primaryKey),
        compactedIds,
        compactedIds,
        records.length,
        compactedIds.length,
      );
    }
    return castIds.map((cid) => idToRecord.get(pkMatchKey(cid))!);
  }
  const record = await this.all()
    .where({ [this.primaryKey as string]: id })
    .first();
  if (!record) {
    throw new RecordNotFound(
      `Couldn't find ${this.name} with '${String(this.primaryKey)}'=${String(id)}`,
      this.name,
      String(this.primaryKey),
      id,
    );
  }
  return record;
}

export async function findBy(this: CoreHost, ...args: any[]): Promise<any> {
  const conditions = args[0];
  if (this.isScopeAttributes()) {
    return this.all().findBy(...args);
  }
  if (!isPlainObject(conditions)) {
    return this.all().findBy(...args);
  }
  const keys = Object.keys(conditions);
  if (keys.length === 0) return this.all().findBy(conditions);
  await this.ensureSchemaLoaded();
  const aliases: Record<string, string> = (this as any).attributeAliases ?? {};
  const resolvedKeys: string[] = [];
  const values: unknown[] = [];

  for (const rawKey of keys) {
    let key = aliases[rawKey] ?? rawKey;
    let value = conditions[rawKey];

    if (reflectOnAggregation(this as any, key)) return this.all().findBy(conditions);

    const reflection = _reflectOnAssociation(this as any, key);

    if (!reflection) {
      if (respondsToId(value)) value = (value as any).id;
    } else if (reflection.belongsTo() && !reflection.isPolymorphic()) {
      const fk = reflection.joinForeignKey;
      const pkey = reflection.joinPrimaryKey();
      if (Array.isArray(fk) || Array.isArray(pkey)) return this.all().findBy(conditions);
      key = fk;
      if (respondsTo(value, pkey)) value = (value as any)[pkey];
    }

    if (!hasKey(columnsHash.call(this as any), key) || StatementCache.unsupportedValue(value)) {
      return this.all().findBy(conditions);
    }

    resolvedKeys.push(key);
    values.push(value);
  }

  return cachedFindBy.call(this, resolvedKeys, values);
}

function respondsToId(value: unknown): boolean {
  return respondsTo(value, "id");
}

function respondsTo(value: unknown, name: string): boolean {
  return value != null && typeof value === "object" && name in value;
}

/** @internal */
async function cachedFindBy(this: CoreHost, keys: string[], values: unknown[]): Promise<any> {
  return withConnection.call(this as any, async (connection: any) => {
    const cacheKey = JSON.stringify(keys);
    const statement = cachedFindByStatement.call(this, connection, cacheKey, (params: any) => {
      const wheres: Record<string, unknown> = {};
      for (const key of keys) wheres[key] = params.bind();
      return (this as any).where(wheres).limit(1);
    });
    try {
      const records = await statement.execute(values, connection, { allowRetry: true });
      return records[0] ?? null;
    } catch (e) {
      if (e instanceof ActiveModelRangeError) return null;
      if (e instanceof TypeError) throw new StatementInvalid(e.message);
      throw e;
    }
  });
}

export async function findByBang(this: CoreHost, ...args: any[]): Promise<any> {
  return (
    (await findBy.call(this, ...args)) ??
    this.all()
      .where(...args)
      .raiseRecordNotFoundExceptionBang()
  );
}

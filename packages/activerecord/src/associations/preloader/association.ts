import type { Base } from "../../base.js";
import type { Table } from "@blazetrails/arel";
import type { AssociationReflection, ThroughReflection } from "../../reflection.js";
import { ConnectionNotDefined } from "../../errors.js";

type AssociationLikeReflection = AssociationReflection | ThroughReflection;

/**
 * Handles preloading a single association for a group of records.
 * Queries the database, maps results to owners by key, and associates
 * the loaded records to each owner's association target.
 *
 * Mirrors: ActiveRecord::Associations::Preloader::Association
 */
export class Association {
  readonly klass: typeof Base;
  /** @internal */
  readonly owners: Base[];
  /** @internal */
  readonly reflection: AssociationLikeReflection;
  /** @internal */
  protected _preloadScope: any;
  /** @internal */
  protected _reflectionScope: any;
  private _associate: boolean;
  private _model: typeof Base | null;
  private _run: boolean;
  private _recordsByOwner: Map<Base, Base[]> | undefined;
  private _preloadedRecords: Base[] | undefined;
  private _ownersByKey: Map<unknown, Base[]> | undefined;
  private _scope: any;
  private _keyConversionRequired: boolean | undefined;

  constructor(
    klass: typeof Base,
    owners: Base[],
    reflection: AssociationLikeReflection,
    preloadScope?: any,
    reflectionScope?: any,
    associateByDefault: boolean = true,
  ) {
    this.klass = klass;
    this.owners = this._uniqueOwners(owners);
    this.reflection = reflection;
    this._preloadScope = preloadScope ?? null;
    this._reflectionScope = reflectionScope ?? null;
    this._associate = associateByDefault || preloadScope == null;
    this._model = owners.length > 0 ? (owners[0].constructor as typeof Base) : null;
    this._run = false;
  }

  get tableName(): string {
    return this.klass.tableName;
  }

  futureClasses(): (typeof Base)[] {
    if (this.isRun()) return [];
    return [this.klass];
  }

  runnableLoaders(): Association[] {
    return [this];
  }

  isRun(): boolean {
    return this._run;
  }

  async run(): Promise<this> {
    if (this.isRun()) return this;
    this._run = true;

    const records = await this.recordsByOwner();

    if (this._associate) {
      for (const owner of this.owners) {
        this._associateRecordsToOwner(owner, records.get(owner) ?? []);
      }
    }

    return this;
  }

  async recordsByOwner(): Promise<Map<Base, Base[]>> {
    if (this._recordsByOwner === undefined) {
      await this.loadRecords();
    }
    return this._recordsByOwner!;
  }

  get preloadedRecords(): Base[] {
    return this._preloadedRecords ?? [];
  }

  get associationKeyName(): string | string[] {
    return (this.reflection as any).joinPrimaryKey;
  }

  loaderQuery(): LoaderQuery {
    return new LoaderQuery(this.scope, this.associationKeyName);
  }

  get ownersByKey(): Map<unknown, Base[]> {
    if (this._ownersByKey !== undefined) return this._ownersByKey;

    this._ownersByKey = new Map();
    for (const owner of this.owners) {
      const key = this._deriveKey(owner, this._ownerKeyName);
      if (key == null) continue;
      const existing = this._ownersByKey.get(key);
      if (existing) {
        existing.push(owner);
      } else {
        this._ownersByKey.set(key, [owner]);
      }
    }
    return this._ownersByKey;
  }

  isLoaded(owner: Base): boolean {
    try {
      return (owner as any).association(this.reflection.name).loaded;
    } catch {
      return false;
    }
  }

  targetFor(owner: Base): Base[] {
    try {
      const target = (owner as any).association(this.reflection.name).target;
      if (target == null) return [];
      return Array.isArray(target) ? target : [target];
    } catch {
      return [];
    }
  }

  get scope(): any {
    if (this._scope !== undefined) return this._scope;
    this._scope = this._buildScope();
    return this._scope;
  }

  setInverse(record: Base): void {
    const key = this._deriveKey(record, this.associationKeyName);
    const owners = this.ownersByKey.get(key);
    if (owners && owners.length > 0) {
      try {
        const association = (owners[0] as any).association(this.reflection.name);
        association.setInverseInstance(record);
      } catch {
        // Ignore if association doesn't exist
      }
    }
  }

  async loadRecords(rawRecords?: Base[]): Promise<void> {
    this._recordsByOwner = new Map();

    if (!rawRecords) {
      const lq = this.loaderQuery();
      rawRecords = await lq.loadRecordsForKeys([...this.ownersByKey.keys()]);
    }

    for (const record of rawRecords) {
      this.setInverse(record);
    }

    this._preloadedRecords = rawRecords.filter((record) => {
      let assignments = false;
      const key = this._deriveKey(record, this.associationKeyName);
      const owners = this.ownersByKey.get(key);

      if (owners) {
        for (const owner of owners) {
          let entries = this._recordsByOwner!.get(owner);
          if (!entries) {
            entries = [];
            this._recordsByOwner!.set(owner, entries);
          }

          if ((this.reflection as any).isCollection?.() || entries.length === 0) {
            entries.push(record);
            assignments = true;
          }
        }
      }
      return assignments;
    });
  }

  associateRecordsFromUnscoped(unscopedRecords: Base[] | undefined): void {
    if (!unscopedRecords || unscopedRecords.length === 0) return;
    if (this._reflectionScope != null) return;
    if (this._preloadScope != null) return;
    if ((this.reflection as any).isCollection?.()) return;

    for (const record of unscopedRecords) {
      const key = this._deriveKey(record, this.associationKeyName);
      if (key == null) continue;

      const owners = this.ownersByKey.get(key);
      if (!owners) continue;

      for (let i = 0; i < owners.length; i++) {
        const owner = owners[i];
        try {
          const association = (owner as any).association(this.reflection.name);
          association.setTarget(record);
          if (i === 0) {
            association.setInverseInstance(record);
          }
          if (!(owner as any)._preloadedAssociations) {
            (owner as any)._preloadedAssociations = new Map();
          }
          (owner as any)._preloadedAssociations.set(this.reflection.name, record);
        } catch {
          // Ignore
        }
      }
    }
  }

  private get _ownerKeyName(): string | string[] {
    return (this.reflection as any).joinForeignKey;
  }

  private _associateRecordsToOwner(owner: Base, records: Base[]): void {
    if (this.isLoaded(owner)) return;

    const association = (owner as any).association(this.reflection.name);
    const isCollection = (this.reflection as any).isCollection?.() ?? false;
    let value: Base | Base[] | null;
    if (isCollection) {
      const currentTarget: Base[] = Array.isArray(association.target) ? association.target : [];
      const notPersistedRecords = currentTarget.filter((r) => !(r as any).isPersisted());
      value = [...records, ...notPersistedRecords];
      association.setTarget(value);
    } else {
      value = records[0] ?? null;
      association.setTarget(value);
    }

    // Shadow-map bridge: many readers in `associations.ts` still consult
    // `_preloadedAssociations`. Migrating them to read from the real proxy
    // is a follow-up PR; keep the cache in sync for now.
    if (!(owner as any)._preloadedAssociations) {
      (owner as any)._preloadedAssociations = new Map();
    }
    (owner as any)._preloadedAssociations.set(this.reflection.name, value);

    // Route through `reflection.inverseName()` so automatic inverse detection
    // (via `automaticInverseOf()`, made functional by C1) fires for non-rich
    // reflections too — not just when `inverseOf` is explicitly configured.
    // Mirrors Rails' `Preloader::Association#associate_records_to_owner`, which
    // consults `reflection.inverse_of` (→ `inverse_name`).
    let inverseName: string | undefined;
    try {
      inverseName =
        (this.reflection as any).inverseName?.() ?? (this.reflection as any).options?.inverseOf;
    } catch {
      inverseName = (this.reflection as any).options?.inverseOf;
    }
    if (inverseName) {
      for (const child of records) {
        if (!(child as any)._cachedAssociations) {
          (child as any)._cachedAssociations = new Map();
        }
        (child as any)._cachedAssociations.set(inverseName, owner);
      }
    }
  }

  private _deriveKey(record: Base, key: string | string[]): unknown {
    if (Array.isArray(key)) {
      return JSON.stringify(key.map((k) => this._convertKey((record as any)._readAttribute(k))));
    }
    return this._convertKey((record as any)._readAttribute(key));
  }

  private _convertKey(key: unknown): unknown {
    if (key == null) return key;
    return this._isKeyConversionRequired() ? String(key) : key;
  }

  private _isKeyConversionRequired(): boolean {
    if (this._keyConversionRequired !== undefined) return this._keyConversionRequired;
    const assocKeys = Array.isArray(this.associationKeyName)
      ? this.associationKeyName
      : [this.associationKeyName];
    const ownerKeys = Array.isArray(this._ownerKeyName) ? this._ownerKeyName : [this._ownerKeyName];
    this._keyConversionRequired = false;
    for (let i = 0; i < Math.min(assocKeys.length, ownerKeys.length); i++) {
      const assocType = this._attributeTypeName(this.klass, assocKeys[i]);
      const ownerType = this._attributeTypeName(this._model, ownerKeys[i]);
      if (assocType != null && ownerType != null && assocType !== ownerType) {
        this._keyConversionRequired = true;
        break;
      }
    }
    return this._keyConversionRequired;
  }

  private _attributeTypeName(model: typeof Base | null, key: string): string | null {
    if (!model) return null;
    const at = (model as any).attributeTypes;
    const types = typeof at === "function" ? at.call(model) : at;
    if (!types) return null;
    const type = types[key];
    if (!type) return null;
    if (typeof type === "string") return type;
    if (typeof type.type === "function") return type.type();
    return type.name ?? null;
  }

  private _buildScope(): any {
    // Mirror Rails' build_scope `scope = klass.scope_for_association`. It bases
    // on the pristine relation (ignoring any enclosing current_scope) and
    // applies the target model's default_scope unless current_scope is itself
    // an empty scope.
    let scope = (this.klass as any).scopeForAssociation();

    const type = (this.reflection as any).type;
    if (type && !(this.reflection as any).isThroughReflection?.()) {
      scope = scope.where({
        [type]: (this._model as any)?.polymorphicName?.() ?? this._model?.name,
      });
    }

    // Merge reflection scope: use the pre-computed scope from Branch if available,
    // otherwise apply the raw scope function directly
    if (this._reflectionScope != null) {
      scope = scope.merge(this._reflectionScope);
    } else if (this.reflection.scope) {
      const scopeResult = this.reflection.scope(scope);
      if (scopeResult) scope = scopeResult;
    }

    if (this._preloadScope && !this._preloadScope.isEmptyScope) {
      scope = scope.merge(this._preloadScope);
    }

    return this._cascadeStrictLoading(scope);
  }

  /**
   * Propagate strict loading from the preload scope onto a derived scope.
   *
   * Mirrors: ActiveRecord::Associations::Preloader::Association#cascade_strict_loading
   * @internal
   */
  protected _cascadeStrictLoading(scope: any): any {
    return this._preloadScope?.isStrictLoading ? (scope.strictLoading?.() ?? scope) : scope;
  }

  private _uniqueOwners(owners: Base[]): Base[] {
    const seen = new Set<Base>();
    return owners.filter((o) => {
      if (seen.has(o)) return false;
      seen.add(o);
      return true;
    });
  }
}

/**
 * Wraps a scope and association key name for batch loading.
 * Loaders with equivalent LoaderQuery can be batched together.
 *
 * Mirrors: ActiveRecord::Associations::Preloader::Association::LoaderQuery
 */
export class LoaderQuery {
  readonly scope: any;
  readonly associationKeyName: string | string[];

  constructor(scope: any, associationKeyName: string | string[]) {
    this.scope = scope;
    this.associationKeyName = associationKeyName;
  }

  eql(other: LoaderQuery): boolean {
    const keysMatch =
      this.associationKeyName === other.associationKeyName ||
      (Array.isArray(this.associationKeyName) &&
        Array.isArray(other.associationKeyName) &&
        this.associationKeyName.length === other.associationKeyName.length &&
        this.associationKeyName.every((k, i) => k === (other.associationKeyName as string[])[i]));
    return (
      keysMatch &&
      this._scopeAdapterId() === other._scopeAdapterId() &&
      this._scopeTableName() === other._scopeTableName() &&
      this._valuesForQueries() === other._valuesForQueries()
    );
  }

  hashKey(): string {
    const keyName = Array.isArray(this.associationKeyName)
      ? this.associationKeyName.join(",")
      : this.associationKeyName;
    return `${keyName}::${this._scopeAdapterId()}::${this._scopeTableName()}::${this._valuesForQueries()}`;
  }

  private _scopeTableName(): string {
    return this.scope?._modelClass?.tableName ?? this.scope?.tableName ?? "";
  }

  // Mirrors Rails' `scope.model.connection_specification_name` in
  // Preloader::Association::LoaderQuery#hash/#eql?. The adapter getter may
  // check out a connection on first call, but in practice the preloader runs
  // after records are loaded so the adapter is already cached on the class.
  private _scopeAdapterId(): string {
    const klass = this.scope?._modelClass;
    if (klass == null) return "";
    const spec = klass.connectionSpecificationName ?? "";
    let adapter: object;
    try {
      adapter = klass.connection;
    } catch (e) {
      if (e instanceof ConnectionNotDefined) return spec;
      throw e;
    }
    let id = LoaderQuery._adapterIds.get(adapter);
    if (id == null) {
      id = ++LoaderQuery._idCounter;
      LoaderQuery._adapterIds.set(adapter, id);
    }
    return `${spec}:${id}`;
  }

  private static _adapterIds = new WeakMap<object, number>();
  private static _idCounter = 0;

  private _valuesForQueries(): string {
    if (typeof this.scope?.valuesForQueries === "function") {
      return JSON.stringify(this.scope.valuesForQueries());
    }
    // Stable fallback: serialize where/order/limit values if available
    const where =
      this.scope?._whereClause?.predicates?.length ??
      this.scope?.whereClause?.predicates?.length ??
      0;
    const order = this.scope?._orderValues?.length ?? this.scope?.orderValues?.length ?? 0;
    if (where === 0 && order === 0) return "";
    return this.scope?.toSql?.() ?? "";
  }

  async loadRecordsForKeys(keys: unknown[]): Promise<Base[]> {
    if (keys.length === 0) return [];

    if (Array.isArray(this.associationKeyName)) {
      const conditions: Record<string, Set<unknown>> = {};
      for (const values of keys) {
        // Composite keys arrive JSON-stringified because JS Map lacks the
        // structural array equality Ruby Hash uses in Rails' equivalent
        // (Preloader::Association#derive_key returns the raw array there).
        const valArr = (typeof values === "string" ? JSON.parse(values) : values) as unknown[];
        for (let i = 0; i < this.associationKeyName.length; i++) {
          const keyName = this.associationKeyName[i];
          if (!conditions[keyName]) conditions[keyName] = new Set();
          conditions[keyName].add(valArr[i]);
        }
      }
      const whereObj: Record<string, unknown[]> = {};
      for (const [k, v] of Object.entries(conditions)) {
        whereObj[k] = [...v];
      }
      return this.scope.where(whereObj).toArray();
    }

    return this.scope.where({ [this.associationKeyName as string]: keys }).toArray();
  }

  recordsFor(loaders: Association[]): Promise<Base[]> {
    return new LoaderRecords(loaders, this).records();
  }

  async loadRecordsInBatch(loaders: Association[]): Promise<void> {
    const rawRecords = await this.recordsFor(loaders);

    for (const loader of loaders) {
      await loader.loadRecords(rawRecords);
    }
  }
}

/**
 * Manages loading records while checking for already-loaded ones.
 *
 * Mirrors: ActiveRecord::Associations::Preloader::Association::LoaderRecords
 */
export class LoaderRecords {
  /** @internal */
  readonly loaders: Association[];
  readonly loaderQuery: LoaderQuery;

  constructor(loaders: Association[], loaderQuery: LoaderQuery) {
    this.loaders = loaders;
    this.loaderQuery = loaderQuery;
  }

  async records(): Promise<Base[]> {
    const keysToLoad = new Set<unknown>();
    const alreadyLoadedByKey = new Map<unknown, Base[]>();

    for (const loader of this.loaders) {
      for (const [key, owners] of loader.ownersByKey) {
        const loadedOwner = owners.find((owner) => loader.isLoaded(owner));
        if (loadedOwner) {
          alreadyLoadedByKey.set(key, loader.targetFor(loadedOwner));
        } else {
          keysToLoad.add(key);
        }
      }
    }

    for (const key of alreadyLoadedByKey.keys()) {
      keysToLoad.delete(key);
    }

    const loaded = await this.loaderQuery.loadRecordsForKeys([...keysToLoad]);

    return [...loaded, ...Array.from(alreadyLoadedByKey.values()).flat()];
  }
}

// Private helpers mirroring Rails' PreloaderAssociation private methods
/** @internal */
function owners(assoc: Association): Base[] {
  return assoc.owners;
}

/** @internal */
function reflection(assoc: Association): unknown {
  return assoc.reflection;
}

/** @internal */
function preloadScope(assoc: Association): unknown {
  return (assoc as any)._preloadScope;
}

/** @internal */
function model(assoc: Association): unknown {
  return (assoc as any)._model;
}

/** @internal */
function ownerKeyName(assoc: Association): string | string[] {
  return (assoc as any)._ownerKeyName;
}

/** @internal */
function associateRecordsToOwner(assoc: Association, owner: Base, records: Base[]): void {
  (assoc as any)._associateRecordsToOwner(owner, records);
}

/** @internal */
function isKeyConversionRequired(assoc: Association): boolean {
  return (assoc as any)._isKeyConversionRequired();
}

/** @internal */
function deriveKey(assoc: Association, record: Base, key: string | string[]): unknown {
  return (assoc as any)._deriveKey(record, key);
}

/** @internal */
function convertKey(assoc: Association, key: unknown): unknown {
  return (assoc as any)._convertKey(key);
}

/** @internal */
function associationKeyType(assoc: Association): string | null {
  // Rails: `@klass.type_for_attribute(association_key_name).type`. We reuse the
  // class's attribute-type lookup; for composite keys mirror Rails by inspecting
  // the first key name.
  const key = assoc.associationKeyName;
  return (assoc as any)._attributeTypeName(assoc.klass, Array.isArray(key) ? key[0] : key);
}

/** @internal */
function ownerKeyType(assoc: Association): string | null {
  // Rails: `@model.type_for_attribute(owner_key_name).type`.
  const key = (assoc as any)._ownerKeyName;
  return (assoc as any)._attributeTypeName(
    (assoc as any)._model,
    Array.isArray(key) ? key[0] : key,
  );
}

/** @internal */
function reflectionScope(assoc: Association): unknown {
  // Rails: reflection.join_scopes(klass.arel_table, klass.predicate_builder, klass).inject(&:merge!)
  // Our implementation memoizes this as _reflectionScope; the arel_table is accessed internally.
  const table: Table | undefined = (assoc as any)._model?.arelTable;
  void table; // used by Rails to build scopes; our preloader memoizes the result
  return (assoc as any)._reflectionScope;
}

/** @internal */
function buildScope(assoc: Association): unknown {
  return (assoc as any)._buildScope();
}

/** @internal */
function cascadeStrictLoading(assoc: Association, scope: unknown): unknown {
  return (assoc as any)._cascadeStrictLoading(scope);
}

import { isPresent, wrap } from "@blazetrails/activesupport";
import { first, Hash, rbEqual, rbHash, toS, zip } from "@blazetrails/ruby-compat";
import type { Base } from "../../base.js";
import type { AssociationReflection, ThroughReflection } from "../../reflection.js";

type AssociationLikeReflection = AssociationReflection | ThroughReflection;

export class Association {
  readonly klass: typeof Base;
  /** @internal */
  readonly owners: Base[];
  /** @internal */
  readonly reflection: AssociationLikeReflection;
  /** @internal */
  protected preloadScope: any;
  private _reflectionScope: any;
  private _associate: boolean;
  private _model: typeof Base | null;
  private _run: boolean;
  /** @internal */
  protected _recordsByOwner: Map<Base, Base[]> | undefined;
  private _preloadedRecords: Base[] | undefined;
  private _ownersByKey: Hash<unknown, Base[]> | undefined;
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
    this.preloadScope = preloadScope ?? null;
    this._reflectionScope = reflectionScope ?? null;
    this._associate = associateByDefault || preloadScope == null || preloadScope.isEmptyScope;
    this._model = owners.length > 0 ? (owners[0].constructor as typeof Base) : null;
    this._run = false;
  }

  get tableName(): string | null {
    return this.klass.tableName;
  }

  async futureClasses(): Promise<(typeof Base)[]> {
    if (this.isRun()) return [];
    return [this.klass];
  }

  async runnableLoaders(): Promise<Association[]> {
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
        this.associateRecordsToOwner(owner, records.get(owner) ?? []);
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

  async preloadedRecords(): Promise<Base[]> {
    if (this._preloadedRecords === undefined) {
      await this.loadRecords();
    }
    return this._preloadedRecords!;
  }

  get associationKeyName(): string | string[] {
    return (this.reflection as any).joinPrimaryKey(this.klass);
  }

  loaderQuery(): LoaderQuery {
    return new LoaderQuery(this.scope, this.associationKeyName);
  }

  get ownersByKey(): Hash<unknown, Base[]> {
    this._ownersByKey ??= (() => {
      const result = new Hash<unknown, Base[]>();
      for (const owner of this.owners) {
        const key = this.deriveKey(owner, this.ownerKeyName);
        if (key != null) (result.get(key) ?? result.set(key, []).get(key)!).push(owner);
      }
      return result;
    })();
    return this._ownersByKey;
  }

  isLoaded(owner: Base): boolean {
    return (owner as any).association(this.reflection.name).isLoaded();
  }

  targetFor(owner: Base): Base[] {
    return wrap((owner as any).association(this.reflection.name).target);
  }

  get scope(): any {
    this._scope ??= this.buildScope();
    return this._scope;
  }

  setInverse(record: Base): void {
    const owners = this.ownersByKey.get(this.deriveKey(record, this.associationKeyName));
    if (owners != null) {
      const association = (first(owners) as any).association(this.reflection.name);
      association.setInverseInstance(record);
    }
  }

  async loadRecords(rawRecords?: Base[]): Promise<void> {
    this._recordsByOwner = new Hash<Base, Base[]>().compareByIdentity();

    rawRecords ||= await this.loaderQuery().recordsFor([this]);

    this._preloadedRecords = rawRecords.filter((record) => {
      let assignments = false;
      const key = this.deriveKey(record, this.associationKeyName);
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
    if (!this.reflectionScope.isEmptyScope) return;
    if (this.preloadScope && !this.preloadScope.isEmptyScope) return;
    if ((this.reflection as any).isCollection?.()) return;

    const associationKeyName = this.associationKeyName as string;
    for (const record of unscopedRecords.filter((r) =>
      isPresent((r as any).readAttribute(associationKeyName)),
    )) {
      const owners = this.ownersByKey.get(this.deriveKey(record, this.associationKeyName));
      owners?.forEach((owner, i) => {
        const association = (owner as any).association(this.reflection.name);
        association.target = record;

        if (i === 0) {
          association.setInverseInstance(record);
        }
      });
    }
  }

  private get model(): typeof Base | null {
    return this._model;
  }

  private get ownerKeyName(): string | string[] {
    return (this.reflection as any).joinForeignKey;
  }

  private associateRecordsToOwner(owner: Base, records: Base[]): void {
    if (this.isLoaded(owner)) return;

    const association = (owner as any).association(this.reflection.name);
    if (this.reflection.isCollection()) {
      const notPersistedRecords = (association.target as Base[]).filter((r) => !r.isPersisted());
      association.target = records.concat(notPersistedRecords);
    } else {
      association.target = records[0] ?? null;
    }
  }

  private deriveKey(owner: Base, key: string | string[]): unknown {
    if (Array.isArray(key)) {
      return key.map((k) => this.convertKey((owner as any)._readAttribute(k)));
    } else {
      return this.convertKey((owner as any)._readAttribute(key));
    }
  }

  private convertKey(key: unknown): unknown {
    if (this.isKeyConversionRequired()) {
      return toS(key);
    } else {
      return key;
    }
  }

  private isKeyConversionRequired(): boolean {
    if (this._keyConversionRequired === undefined) {
      this._keyConversionRequired = this.associationKeyType() !== this.ownerKeyType();
    }

    return this._keyConversionRequired;
  }

  private associationKeyType(): string | undefined {
    return this.klass.typeForAttribute(this.associationKeyName as string)!.type();
  }

  private ownerKeyType(): string | undefined {
    return this.model!.typeForAttribute(this.ownerKeyName as string)!.type();
  }

  /** @internal */
  protected get reflectionScope(): any {
    this._reflectionScope ??= (this.reflection as any)
      .joinScopes((this.klass as any).arelTable, (this.klass as any).predicateBuilder, this.klass)
      .reduce((acc: any, s: any) => acc.merge(s), (this.klass as any).unscoped());
    return this._reflectionScope;
  }

  private buildScope(): any {
    let scope = (this.klass as any).scopeForAssociation();

    const type = (this.reflection as any).type;
    if (type && !(this.reflection as any).isThroughReflection?.()) {
      scope = scope.where({
        [type]: (this.model as any)?.polymorphicName?.() ?? this.model?.name,
      });
    }

    if (!this.reflectionScope.isEmptyScope) {
      scope = scope.merge(this.reflectionScope);
    }

    if (this.preloadScope && !this.preloadScope.isEmptyScope) {
      scope = scope.merge(this.preloadScope);
    }

    return this.cascadeStrictLoading(scope);
  }

  /** @internal */
  protected cascadeStrictLoading(scope: any): any {
    return this.preloadScope?.strictLoadingValue ? (scope.strictLoading?.() ?? scope) : scope;
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

export class LoaderQuery {
  readonly scope: any;
  readonly associationKeyName: string | string[];

  constructor(scope: any, associationKeyName: string | string[]) {
    this.scope = scope;
    this.associationKeyName = associationKeyName;
  }

  eql(other: LoaderQuery): boolean {
    return (
      rbEqual(this.associationKeyName, other.associationKeyName) &&
      this.scope.tableName === other.scope.tableName &&
      this.scope.model.connectionSpecificationName ===
        other.scope.model.connectionSpecificationName &&
      rbEqual(this.scope.valuesForQueries(), other.scope.valuesForQueries())
    );
  }

  hash(): number {
    return rbHash([
      this.associationKeyName,
      this.scope.model.tableName,
      this.scope.model.connectionSpecificationName,
      this.scope.valuesForQueries(),
    ]);
  }

  async loadRecordsForKeys(keys: Set<unknown>, block?: (record: Base) => void): Promise<Base[]> {
    if (keys.size === 0) return [];

    if (Array.isArray(this.associationKeyName)) {
      const queryConstraints = new Hash<string, Set<unknown>>(
        (hsh, key) => hsh.set(key, new Set()).get(key)!,
      );

      for (const valuesSet of keys) {
        for (const [keyName, value] of zip(this.associationKeyName, valuesSet as unknown[])) {
          queryConstraints.get(keyName as string)!.add(value);
        }
      }

      return (await this.scope.where(Object.fromEntries(queryConstraints)).load(block)).toArray();
    } else {
      return (await this.scope.where({ [this.associationKeyName]: keys }).load(block)).toArray();
    }
  }

  recordsFor(loaders: Association[]): Promise<Base[]> {
    return new LoaderRecords(loaders, this).records();
  }

  async loadRecordsInBatch(loaders: Association[]): Promise<void> {
    const rawRecords = await this.recordsFor(loaders);

    for (const loader of loaders) {
      await loader.loadRecords(rawRecords);
      await loader.run();
    }
  }
}

export class LoaderRecords {
  /** @internal */
  readonly loaderQuery: LoaderQuery;
  /** @internal */
  readonly loaders: Association[];
  /** @internal */
  readonly keysToLoad: Set<unknown>;
  /** @internal */
  readonly alreadyLoadedRecordsByKey: Hash<unknown, Base[]>;

  constructor(loaders: Association[], loaderQuery: LoaderQuery) {
    this.loaderQuery = loaderQuery;
    this.loaders = loaders;
    this.keysToLoad = new Set();
    this.alreadyLoadedRecordsByKey = new Hash();

    this.populateKeysToLoadAndAlreadyLoadedRecords();
  }

  async records(): Promise<Base[]> {
    return [...(await this.loadRecords()), ...this.alreadyLoadedRecords()];
  }

  /** @internal */
  populateKeysToLoadAndAlreadyLoadedRecords(): void {
    for (const loader of this.loaders) {
      for (const [key, owners] of loader.ownersByKey) {
        const loadedOwner = owners.find((owner) => loader.isLoaded(owner));
        if (loadedOwner != null) {
          this.alreadyLoadedRecordsByKey.set(key, loader.targetFor(loadedOwner));
        } else {
          this.keysToLoad.add(key);
        }
      }
    }

    for (const key of this.alreadyLoadedRecordsByKey.keys()) {
      this.keysToLoad.delete(key);
    }
  }

  /** @internal */
  loadRecords(): Promise<Base[]> {
    return this.loaderQuery.loadRecordsForKeys(this.keysToLoad, (record) => {
      for (const l of this.loaders) l.setInverse(record);
    });
  }

  /** @internal */
  alreadyLoadedRecords(): Base[] {
    return [...this.alreadyLoadedRecordsByKey.values()].flat();
  }
}

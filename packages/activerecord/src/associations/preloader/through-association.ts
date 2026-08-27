import type { Nodes } from "@blazetrails/arel";
import type { Base } from "../../base.js";
import type { AssociationReflection, ThroughReflection } from "../../reflection.js";
import { Association } from "./association.js";
import { Preloader } from "../preloader.js";
import { WhereClause } from "../../relation/where-clause.js";
import { pluralize, singularize } from "@blazetrails/activesupport";

type AssociationLikeReflection = AssociationReflection | ThroughReflection;

function merge(acc: Map<Base, Base[]>, recordsByOwner: Map<Base, Base[]>): Map<Base, Base[]> {
  return new Map([...acc, ...recordsByOwner]);
}

export class ThroughAssociation extends Association {
  private _sourcePreloaders: Association[] | undefined;
  private _throughPreloaders: Association[] | undefined;
  private _sourceRecordsByOwner: Map<Base, Base[]> | undefined;
  private _throughRecordsByOwner: Map<Base, Base[]> | undefined;
  private _throughPreloadedRecords: Base[] | undefined;
  private _preloadIndex: Map<Base, number> | undefined;

  constructor(
    klass: typeof Base,
    owners: Base[],
    reflection: AssociationLikeReflection,
    preloadScope?: any,
    reflectionScope?: any,
    associateByDefault: boolean = true,
  ) {
    super(klass, owners, reflection, preloadScope, reflectionScope, associateByDefault);
  }

  async preloadedRecords(): Promise<Base[]> {
    if (this._throughPreloadedRecords !== undefined) return this._throughPreloadedRecords;
    const records: Base[] = [];
    for (const loader of await this.sourcePreloaders()) {
      records.push(...(await loader.preloadedRecords()));
    }
    this._throughPreloadedRecords = records;
    return this._throughPreloadedRecords;
  }

  /**
   * @missingRailsCall any? — PERMANENT
   * @missingRailsCall first — PERMANENT
   */
  async recordsByOwner(): Promise<Map<Base, Base[]>> {
    if (this._recordsByOwner !== undefined) return this._recordsByOwner;

    const result = new Map<Base, Base[]>();

    for (const owner of this.owners) {
      if (this.isLoaded(owner)) {
        result.set(owner, this.targetFor(owner));
        continue;
      }

      let throughRecords = (await this.throughRecordsByOwner()).get(owner) ?? [];

      if (this.owners[0].association(this.throughReflection!.name).loaded) {
        const sourceType = this.reflection.options.sourceType;
        if (sourceType) {
          throughRecords = throughRecords.filter(
            (record) => record.readAttribute(this.reflection.foreignType!) === sourceType,
          );
        }
      }

      const sourceRecordsByOwner = await this.sourceRecordsByOwner();
      let records = throughRecords.flatMap((record) => sourceRecordsByOwner.get(record) ?? []);

      records = records.filter((record) => record != null);
      if (this.scope?.orderValues?.length > 0) {
        const preloadIndex = await this.preloadIndex();
        records.sort((a, b) => (preloadIndex.get(a) ?? 0) - (preloadIndex.get(b) ?? 0));
      }
      if (this.scope?.distinctValue) {
        const seen = new Set<Base>();
        records = records.filter((rhs) => {
          if (seen.has(rhs)) return false;
          seen.add(rhs);
          return true;
        });
      }
      result.set(owner, records);
    }

    this._recordsByOwner = result;
    return result;
  }

  async runnableLoaders(): Promise<Association[]> {
    if (await this.dataAvailable()) {
      return [this];
    }

    const throughPreloaders = await this.throughPreloaders();
    if (throughPreloaders.every((l) => l.isRun())) {
      const runnable: Association[] = [];
      for (const loader of await this.sourcePreloaders()) {
        runnable.push(...(await loader.runnableLoaders()));
      }
      return runnable;
    }

    const runnable: Association[] = [];
    for (const loader of throughPreloaders) {
      runnable.push(...(await loader.runnableLoaders()));
    }
    return runnable;
  }

  async futureClasses(): Promise<(typeof Base)[]> {
    if (this.isRun()) return [];

    const throughPreloaders = await this.throughPreloaders();
    if (throughPreloaders.every((l) => l.isRun())) {
      const sourceClasses: (typeof Base)[] = [];
      for (const loader of await this.sourcePreloaders()) {
        sourceClasses.push(...(await loader.futureClasses()));
      }
      const seen = new Set<typeof Base>();
      return sourceClasses.filter((k) => {
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }

    const throughClasses: (typeof Base)[] = [];
    for (const loader of throughPreloaders) {
      throughClasses.push(...(await loader.futureClasses()));
    }
    const sourceRefl = this.sourceReflection;
    const sourceClasses: (typeof Base)[] = [];
    if (sourceRefl) {
      try {
        for (const chainRefl of sourceRefl.chain) {
          if (!(chainRefl as any).isPolymorphic?.()) {
            try {
              sourceClasses.push(chainRefl.klass);
            } catch {}
          }
        }
      } catch {}
    }

    const seen = new Set<typeof Base>();
    return [...throughClasses, ...sourceClasses].filter((k) => {
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  private async dataAvailable(): Promise<boolean> {
    return (
      this.owners.every((owner) => this.isLoaded(owner)) ||
      ((await this.throughPreloaders()).every((l) => l.isRun()) &&
        (await this.sourcePreloaders()).every((l) => l.isRun()))
    );
  }

  private async sourcePreloaders(): Promise<Association[]> {
    if (this._sourcePreloaders !== undefined) return this._sourcePreloaders;

    const middleRecords = await this.middleRecords();
    const sourceRefl = this.sourceReflection;
    if (!sourceRefl || middleRecords.length === 0) {
      return [];
    }

    const preloader = new Preloader({
      records: middleRecords,
      associations: [sourceRefl.name],
      scope: this.scope,
      associateByDefault: false,
    });
    this._sourcePreloaders = await preloader.loaders();
    return this._sourcePreloaders;
  }

  private async throughPreloaders(): Promise<Association[]> {
    if (this._throughPreloaders !== undefined) return this._throughPreloaders;

    const throughRefl = this.throughReflection;
    if (!throughRefl) {
      this._throughPreloaders = [];
      return this._throughPreloaders;
    }

    const preloader = new Preloader({
      records: this.owners,
      associations: [throughRefl.name],
      scope: this.throughScope(),
      associateByDefault: false,
    });
    this._throughPreloaders = await preloader.loaders();
    return this._throughPreloaders;
  }

  private async middleRecords(): Promise<Base[]> {
    return [...(await this.throughRecordsByOwner()).values()].flat();
  }

  private async sourceRecordsByOwner(): Promise<Map<Base, Base[]>> {
    this._sourceRecordsByOwner ??= (
      await Promise.all((await this.sourcePreloaders()).map((l) => l.recordsByOwner()))
    ).reduce(merge, new Map<Base, Base[]>());
    return this._sourceRecordsByOwner;
  }

  private async throughRecordsByOwner(): Promise<Map<Base, Base[]>> {
    this._throughRecordsByOwner ??= (
      await Promise.all((await this.throughPreloaders()).map((l) => l.recordsByOwner()))
    ).reduce(merge, new Map<Base, Base[]>());
    return this._throughRecordsByOwner;
  }

  private async preloadIndex(): Promise<Map<Base, number>> {
    if (this._preloadIndex !== undefined) return this._preloadIndex;
    this._preloadIndex = new Map();
    (await this.preloadedRecords()).forEach((record, index) => {
      this._preloadIndex!.set(record, index);
    });
    return this._preloadIndex;
  }

  private throughScope(): any {
    const throughRefl = this.throughReflection;
    if (!throughRefl) return undefined;

    let throughKlass: typeof Base;
    try {
      throughKlass = throughRefl.klass;
    } catch {
      return undefined;
    }

    let scope = (throughKlass as any).unscoped?.() ?? (throughKlass as any)._allForPreload();
    const options = (this.reflection as any).options ?? {};

    if (options.disableJoins) return scope;

    const reflScope = this.reflectionScope;

    const annotations: string[] = reflScope?.annotateValues ?? [];
    if (annotations.length > 0) {
      scope = scope.annotate(...annotations);
    }

    const whereClause = reflScope?.whereClause;
    if (options.sourceType) {
      const foreignType = (this.reflection as any).foreignType;
      if (foreignType) {
        scope = scope.where({ [foreignType]: options.sourceType });
      }
    } else if (reflScope != null && whereClause != null && !whereClause.isEmpty()) {
      const sourceRefl = this.sourceReflection;
      if (sourceRefl) {
        scope.whereClause = new WhereClause([
          ...scope.whereClause.predicates,
          ...whereClause.predicates,
        ]);
        const sourceName = `:${sourceRefl.name}`;
        const nestedIncludes: any[] = reflScope?.includesValues ?? [];
        if (nestedIncludes.length > 0) {
          scope = scope.includes({ [sourceName]: nestedIncludes });
        } else {
          scope = scope.includes(sourceName);
        }

        const refs: Array<string | Nodes.SqlLiteral> = reflScope?.referencesValues ?? [];
        if (refs.length > 0) {
          scope = scope.references(...refs);
        } else {
          scope = scope.references(sourceRefl.klass.tableName);
        }

        const nestedJoins: any[] = reflScope?.joinsValues ?? [];
        if (nestedJoins.length > 0) {
          scope = scope.joins({ [sourceName]: nestedJoins });
        }

        const nestedLeftOuter: any[] = reflScope?.leftOuterJoinsValues ?? [];
        if (nestedLeftOuter.length > 0) {
          scope = scope.leftOuterJoins({ [sourceName]: nestedLeftOuter });
        }

        const orderClauses: any[] = reflScope?.orderValues ?? [];
        if (orderClauses.length > 0) {
          scope.orderValues = [...scope.orderValues, ...orderClauses];
        }
      }
    }

    return this.cascadeStrictLoading(scope);
  }

  private get throughReflection(): AssociationLikeReflection | null {
    const refl = (this.reflection as any).throughReflection;
    if (refl) return refl;

    const model = (this.reflection as any).activeRecord;
    const assocDef = model?._reflectOnAssociation?.(this.reflection.name);
    if (assocDef?.options?.through) {
      return model._reflectOnAssociation(
        assocDef.options.through,
      ) as AssociationLikeReflection | null;
    }
    return null;
  }

  private get sourceReflection(): AssociationLikeReflection | null {
    const refl = (this.reflection as any).sourceReflection;
    if (refl && refl !== this.reflection) return refl;

    const throughRefl = this.throughReflection;
    if (!throughRefl) return null;
    const model = (this.reflection as any).activeRecord;
    const assocDef = model?._reflectOnAssociation?.(this.reflection.name);
    const sourceNames: string[] = assocDef?.options?.source
      ? [assocDef.options.source as string]
      : ((this.reflection as any).sourceReflectionNames?.() ?? []);
    if (sourceNames.length > 0) {
      let throughKlass: typeof Base | null = null;
      try {
        throughKlass = throughRefl.klass;
      } catch {}
      if (throughKlass) {
        for (const sourceName of sourceNames) {
          if (!sourceName) continue;
          const candidates = [sourceName, pluralize(sourceName), singularize(sourceName)];
          for (const name of candidates) {
            const r = throughKlass._reflectOnAssociation(name) as AssociationLikeReflection | null;
            if (r) return r;
          }
        }
      }
    }
    return null;
  }
}

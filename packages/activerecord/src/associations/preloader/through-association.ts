import type { Base } from "../../base.js";
import type { AssociationReflection, ThroughReflection } from "../../reflection.js";
import { Association } from "./association.js";
import { Associations } from "../../namespaces.js";
import { any } from "@blazetrails/activesupport";
import {
  Hash,
  first,
  isEmpty,
  rbObjRespondTo,
  reduce,
  union,
  uniq,
} from "@blazetrails/ruby-compat";

type AssociationLikeReflection = AssociationReflection | ThroughReflection;

export class ThroughAssociation extends Association {
  private _sourcePreloaders: Association[] | undefined;
  private _throughPreloaders: Association[] | undefined;
  private _sourceRecordsByOwner: Map<Base, Base[]> | undefined;
  private _throughRecordsByOwner: Map<Base, Base[]> | undefined;
  private _throughPreloadedRecords: Base[] | undefined;
  private _preloadIndex: Map<Base, number> | undefined;

  async preloadedRecords(): Promise<Base[]> {
    return (this._throughPreloadedRecords ??= await (async () => {
      const records: Base[] = [];
      for (const l of await this.sourcePreloaders()) records.push(...(await l.preloadedRecords()));
      return records;
    })());
  }

  async recordsByOwner(): Promise<Map<Base, Base[]>> {
    if (this._recordsByOwner !== undefined) return this._recordsByOwner;

    const result = new Hash<Base, Base[]>();

    for (const owner of this.owners) {
      if (this.isLoaded(owner)) {
        result.set(owner, this.targetFor(owner));
        continue;
      }

      let throughRecords = (await this.throughRecordsByOwner()).get(owner) ?? [];

      if (first(this.owners)!.association(this.throughReflection.name).loaded) {
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
      if (any(this.scope.orderValues)) {
        const preloadIndex = await this.preloadIndex();
        records.sort((a, b) => (preloadIndex.get(a) ?? 0) - (preloadIndex.get(b) ?? 0));
      }
      if (this.scope.distinctValue) records = uniq(records);
      result.set(owner, records);
    }

    this._recordsByOwner = result;
    return result;
  }

  async runnableLoaders(): Promise<Association[]> {
    if (await this.dataAvailable()) {
      return [this];
    } else if ((await this.throughPreloaders()).every((l) => l.isRun())) {
      const runnable: Association[] = [];
      for (const l of await this.sourcePreloaders()) runnable.push(...(await l.runnableLoaders()));
      return runnable;
    } else {
      const runnable: Association[] = [];
      for (const l of await this.throughPreloaders()) runnable.push(...(await l.runnableLoaders()));
      return runnable;
    }
  }

  async futureClasses(): Promise<(typeof Base)[]> {
    if (this.isRun()) {
      return [];
    } else if ((await this.throughPreloaders()).every((l) => l.isRun())) {
      const sourceClasses: (typeof Base)[] = [];
      for (const l of await this.sourcePreloaders())
        sourceClasses.push(...(await l.futureClasses()));
      return uniq(sourceClasses);
    } else {
      const throughClasses: (typeof Base)[] = [];
      for (const l of await this.throughPreloaders())
        throughClasses.push(...(await l.futureClasses()));
      const sourceClasses = this.sourceReflection.chain
        .filter(
          (reflection) =>
            !(rbObjRespondTo(reflection, "isPolymorphic") && reflection.isPolymorphic()),
        )
        .map((reflection) => reflection.klass);
      return uniq([...throughClasses, ...sourceClasses]);
    }
  }

  private async dataAvailable(): Promise<boolean> {
    return (
      this.owners.every((owner) => this.isLoaded(owner)) ||
      ((await this.throughPreloaders()).every((l) => l.isRun()) &&
        (await this.sourcePreloaders()).every((l) => l.isRun()))
    );
  }

  private async sourcePreloaders(): Promise<Association[]> {
    return (this._sourcePreloaders ??= await Associations.Preloader.new({
      records: await this.middleRecords(),
      associations: this.sourceReflection.name,
      scope: this.scope,
      associateByDefault: false,
    }).loaders());
  }

  private async throughPreloaders(): Promise<Association[]> {
    return (this._throughPreloaders ??= await Associations.Preloader.new({
      records: this.owners,
      associations: this.throughReflection.name,
      scope: this.throughScope(),
      associateByDefault: false,
    }).loaders());
  }

  private async middleRecords(): Promise<Base[]> {
    return [...(await this.throughRecordsByOwner()).values()].flat();
  }

  /** @missingRailsCall map — CONVERGEABLE preloader-through-records-by-owner-map-awaits-each-loader */
  private async sourceRecordsByOwner(): Promise<Map<Base, Base[]>> {
    return (this._sourceRecordsByOwner ??= await (async () => {
      const recordsByOwner: Map<Base, Base[]>[] = [];
      for (const l of await this.sourcePreloaders()) recordsByOwner.push(await l.recordsByOwner());
      return reduce(recordsByOwner, ":merge") as Map<Base, Base[]>;
    })());
  }

  /** @missingRailsCall map — CONVERGEABLE preloader-through-records-by-owner-map-awaits-each-loader */
  private async throughRecordsByOwner(): Promise<Map<Base, Base[]>> {
    return (this._throughRecordsByOwner ??= await (async () => {
      const recordsByOwner: Map<Base, Base[]>[] = [];
      for (const l of await this.throughPreloaders()) recordsByOwner.push(await l.recordsByOwner());
      return reduce(recordsByOwner, ":merge") as Map<Base, Base[]>;
    })());
  }

  private async preloadIndex(): Promise<Map<Base, number>> {
    return (this._preloadIndex ??= await (async () => {
      const result = new Map<Base, number>();
      (await this.preloadedRecords()).forEach((record, index) => {
        result.set(record, index);
      });
      return result;
    })());
  }

  private throughScope(): any {
    let scope: any = this.throughReflection.klass.unscoped();
    const options = this.reflection.options;

    if (options.disableJoins) return scope;

    const values = this.reflectionScope.values();
    const annotations = values.annotate;
    if (annotations != null) {
      scope.annotateBang(...annotations);
    }

    if (options.sourceType != null) {
      scope.whereBang({ [this.reflection.foreignType!]: options.sourceType });
    } else if (!this.reflectionScope.whereClause.isEmpty()) {
      scope.whereClause = this.reflectionScope.whereClause;

      const includes = values.includes;
      if (includes != null) {
        scope.includesBang({ [`:${this.sourceReflection.name}`]: includes });
      } else {
        scope.includesBang(`:${this.sourceReflection.name}`);
      }

      if (values.references != null && !isEmpty(values.references)) {
        scope.referencesValues = union(scope.referencesValues, values.references);
      } else {
        scope.referencesBang(this.sourceReflection.tableName);
      }

      const joins = values.joins;
      if (joins != null) {
        scope.joinsBang({ [`:${this.sourceReflection.name}`]: joins });
      }

      const leftOuterJoins = values.leftOuterJoins;
      if (leftOuterJoins != null) {
        scope.leftOuterJoinsBang({ [`:${this.sourceReflection.name}`]: leftOuterJoins });
      }

      const orderValues = values.order;
      if (scope.isEagerLoading && orderValues != null) {
        scope = scope.order(orderValues);
      }
    }

    return this.cascadeStrictLoading(scope);
  }

  private get throughReflection(): AssociationLikeReflection {
    return this.reflection.throughReflection!;
  }

  private get sourceReflection(): AssociationLikeReflection {
    return this.reflection.sourceReflection!;
  }
}

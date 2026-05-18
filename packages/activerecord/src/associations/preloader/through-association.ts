import type { Base } from "../../base.js";
import type { AssociationReflection, ThroughReflection } from "../../reflection.js";
import { Association } from "./association.js";
import { Preloader } from "../preloader.js";
import { pluralize, singularize } from "@blazetrails/activesupport";

type AssociationLikeReflection = AssociationReflection | ThroughReflection;

/**
 * Handles preloading through associations by first loading the
 * intermediate (through) records, then loading the source records
 * from those intermediates.
 *
 * Mirrors: ActiveRecord::Associations::Preloader::ThroughAssociation
 */
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

  get preloadedRecords(): Base[] {
    if (this._throughPreloadedRecords !== undefined) return this._throughPreloadedRecords;
    this._throughPreloadedRecords = this._getSourcePreloaders().flatMap((l) => l.preloadedRecords);
    return this._throughPreloadedRecords;
  }

  async recordsByOwner(): Promise<Map<Base, Base[]>> {
    const result = new Map<Base, Base[]>();
    const throughRecordsByOwner = await this._getThroughRecordsByOwner();
    const sourceRecordsByOwner = await this._getSourceRecordsByOwner();

    const throughRefl = this._throughReflection;
    const firstOwner = this.owners[0] as any;
    const throughLoadedOnFirst =
      throughRefl != null &&
      firstOwner != null &&
      ((firstOwner._preloadedAssociations?.has(throughRefl.name) ?? false) ||
        (() => {
          try {
            return !!firstOwner.association?.(throughRefl.name)?.loaded;
          } catch {
            return false;
          }
        })());

    for (const owner of this.owners) {
      if (this.isLoaded(owner)) {
        result.set(owner, this.targetFor(owner));
        continue;
      }

      let throughRecords = throughRecordsByOwner.get(owner) ?? [];

      // Mirror Rails: when the through reflection is already loaded on the
      // owners, narrow through_records by source_type. (Identity preservation
      // for the polymorphic+sourceType path is handled up-front in
      // _getThroughRecordsByOwner / _getMiddleRecords.)
      if (throughLoadedOnFirst) {
        const sourceType = (this.reflection as any).options?.sourceType;
        const foreignType =
          (this.reflection as any).foreignType ?? (this._sourceReflection as any)?.foreignType;
        if (sourceType && foreignType) {
          throughRecords = throughRecords.filter(
            (record) => (record as any)._readAttribute(foreignType) === sourceType,
          );
        }
      }

      let records = throughRecords.flatMap((tr) => sourceRecordsByOwner.get(tr) ?? []);
      records = records.filter((r) => r != null);

      // Preserve scope ordering via preload index
      if (this.scope?.orderValues?.length > 0) {
        const index = this._getPreloadIndex();
        records.sort((a, b) => (index.get(a) ?? 0) - (index.get(b) ?? 0));
      }

      // Apply distinct
      if (this.scope?.distinctValue) {
        const seen = new Set<Base>();
        records = records.filter((r) => {
          if (seen.has(r)) return false;
          seen.add(r);
          return true;
        });
      }

      result.set(owner, records);
    }

    return result;
  }

  runnableLoaders(): Association[] {
    if (this._dataAvailable()) {
      return [this];
    }

    const throughPreloaders = this._getThroughPreloaders();
    if (throughPreloaders.every((l) => l.isRun())) {
      return this._getSourcePreloaders().flatMap((l) => l.runnableLoaders());
    }

    return throughPreloaders.flatMap((l) => l.runnableLoaders());
  }

  futureClasses(): (typeof Base)[] {
    if (this.isRun()) return [];

    const throughPreloaders = this._getThroughPreloaders();
    if (throughPreloaders.every((l) => l.isRun())) {
      const seen = new Set<typeof Base>();
      return this._getSourcePreloaders()
        .flatMap((l) => l.futureClasses())
        .filter((k) => {
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
    }

    const throughClasses = throughPreloaders.flatMap((l) => l.futureClasses());
    const sourceRefl = this._sourceReflection;
    const sourceClasses: (typeof Base)[] = [];
    if (sourceRefl) {
      try {
        for (const chainRefl of sourceRefl.chain) {
          if (!(chainRefl as any).isPolymorphic?.()) {
            try {
              sourceClasses.push(chainRefl.klass);
            } catch {
              /* polymorphic */
            }
          }
        }
      } catch {
        /* chain resolution may fail */
      }
    }

    const seen = new Set<typeof Base>();
    return [...throughClasses, ...sourceClasses].filter((k) => {
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  private _dataAvailable(): boolean {
    return (
      this.owners.every((owner) => this.isLoaded(owner)) ||
      (this._getThroughPreloaders().every((l) => l.isRun()) &&
        this._getSourcePreloaders().every((l) => l.isRun()))
    );
  }

  private _getSourcePreloaders(): Association[] {
    if (this._sourcePreloaders !== undefined) return this._sourcePreloaders;

    const middleRecords = this._getMiddleRecords();
    const sourceRefl = this._sourceReflection;
    if (!sourceRefl || middleRecords.length === 0) {
      return [];
    }

    // Apply the per-owner reflection scope to source record loading so
    // instance-dependent scopes filter the final target (e.g. only comments
    // mentioning the owner). Merge the user-supplied preload scope on top so
    // it is not silently dropped when _reflectionScope is set.
    let sourceScope = this._reflectionScope ?? null;
    if (sourceScope != null && this._preloadScope != null) {
      sourceScope = (sourceScope as any).merge(this._preloadScope);
    } else if (sourceScope == null) {
      sourceScope = this._preloadScope;
    }
    const preloader = new Preloader({
      records: middleRecords,
      associations: [sourceRefl.name],
      scope: sourceScope,
      associateByDefault: false,
    });
    this._sourcePreloaders = preloader.loaders;
    return this._sourcePreloaders;
  }

  private _getThroughPreloaders(): Association[] {
    if (this._throughPreloaders !== undefined) return this._throughPreloaders;

    const throughRefl = this._throughReflection;
    if (!throughRefl) {
      this._throughPreloaders = [];
      return this._throughPreloaders;
    }

    const preloader = new Preloader({
      records: this.owners,
      associations: [throughRefl.name],
      scope: this._buildThroughScope(),
      associateByDefault: false,
    });
    this._throughPreloaders = preloader.loaders;
    return this._throughPreloaders;
  }

  private _getMiddleRecords(): Base[] {
    const loaded = this._alreadyLoadedThroughByOwner();
    if (loaded) {
      const seen = new Set<Base>();
      const out: Base[] = [];
      for (const arr of loaded.values()) {
        for (const r of arr) {
          if (!seen.has(r)) {
            seen.add(r);
            out.push(r);
          }
        }
      }
      return out;
    }
    return this._getThroughPreloaders().flatMap((l) => l.preloadedRecords);
  }

  /**
   * Identity-preservation gate for the polymorphic-source + `sourceType` path.
   *
   * Rails' `records_by_owner` filter (`owners.first.association(through).loaded?`,
   * preloader/through_association.rb:20) is mirrored verbatim in the
   * `recordsByOwner` loop above. This helper is the stricter intercept that
   * runs *before* the through preloader fetches: it only fires when the
   * reflection has a `sourceType` AND **every** owner already has the through
   * preloaded — that combination is the empty-result gap, and the
   * `every`-gate keeps mixed loaded/unloaded preloads on the standard
   * LoaderRecords merge path (see "preload through records with already
   * loaded middle record" in associations.test.ts). Reusing the loaded
   * through records keeps middleRecords and throughRecordsByOwner referencing
   * the same instances so the source preloader's identity-keyed lookups
   * succeed.
   * @internal
   */
  private _alreadyLoadedThroughByOwner(): Map<Base, Base[]> | null {
    const throughRefl = this._throughReflection;
    if (!throughRefl || this.owners.length === 0) return null;

    // Conservative gate: only intercept when the through reflection is a
    // polymorphic source with a `sourceType` filter AND every owner already has
    // the through association preloaded. This is the Rails-source-mirrored
    // empty-result gap (records re-fetched by a separate preloader run no
    // longer identity-match the source preloader's middle records). Mixed
    // loaded/unloaded owners stay on the standard LoaderRecords path so it
    // can merge already-loaded keys with newly queried ones.
    const sourceType = (this.reflection as any).options?.sourceType;
    if (!sourceType) return null;
    let foreignType: string | null | undefined = (this.reflection as any).foreignType;
    if (!foreignType) {
      foreignType = (this._sourceReflection as any)?.foreignType ?? null;
    }
    if (!foreignType) return null;

    const throughName = throughRefl.name;
    const loadedForOwner = (owner: any): boolean => {
      if (owner._preloadedAssociations?.has(throughName)) return true;
      try {
        return !!owner.association?.(throughName)?.loaded;
      } catch {
        return false;
      }
    };
    if (!this.owners.every(loadedForOwner)) return null;

    const map = new Map<Base, Base[]>();
    for (const owner of this.owners) {
      let recs: any = (owner as any)._preloadedAssociations?.get(throughName);
      if (recs == null) {
        try {
          recs = (owner as any).association?.(throughName)?.target;
        } catch {
          recs = null;
        }
      }
      const arr: Base[] = Array.isArray(recs) ? [...recs] : recs != null ? [recs] : [];
      const filtered = arr.filter(
        (record) => (record as any)._readAttribute(foreignType!) === sourceType,
      );
      map.set(owner, filtered);
    }
    return map;
  }

  private async _getSourceRecordsByOwner(): Promise<Map<Base, Base[]>> {
    if (this._sourceRecordsByOwner !== undefined) return this._sourceRecordsByOwner;
    const maps = await Promise.all(this._getSourcePreloaders().map((l) => l.recordsByOwner()));
    this._sourceRecordsByOwner = new Map();
    for (const map of maps) {
      for (const [k, v] of map) {
        const existing = this._sourceRecordsByOwner.get(k);
        if (existing) {
          existing.push(...v);
        } else {
          this._sourceRecordsByOwner.set(k, [...v]);
        }
      }
    }
    return this._sourceRecordsByOwner;
  }

  private async _getThroughRecordsByOwner(): Promise<Map<Base, Base[]>> {
    if (this._throughRecordsByOwner !== undefined) return this._throughRecordsByOwner;
    const loaded = this._alreadyLoadedThroughByOwner();
    if (loaded) {
      this._throughRecordsByOwner = loaded;
      return this._throughRecordsByOwner;
    }
    const maps = await Promise.all(this._getThroughPreloaders().map((l) => l.recordsByOwner()));
    this._throughRecordsByOwner = new Map();
    for (const map of maps) {
      for (const [k, v] of map) {
        const existing = this._throughRecordsByOwner.get(k);
        if (existing) {
          existing.push(...v);
        } else {
          this._throughRecordsByOwner.set(k, [...v]);
        }
      }
    }
    return this._throughRecordsByOwner;
  }

  private _getPreloadIndex(): Map<Base, number> {
    if (this._preloadIndex !== undefined) return this._preloadIndex;
    this._preloadIndex = new Map();
    this.preloadedRecords.forEach((record, index) => {
      this._preloadIndex!.set(record, index);
    });
    return this._preloadIndex;
  }

  private _buildThroughScope(): any {
    const throughRefl = this._throughReflection;
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

    // source_type: filter through records by polymorphic type column
    if (options.sourceType) {
      const foreignType = (this.reflection as any).foreignType;
      if (foreignType) {
        scope = scope.where({ [foreignType]: options.sourceType });
      }
    }

    return scope;
  }

  private get _throughReflection(): AssociationLikeReflection | null {
    const refl = (this.reflection as any).throughReflection;
    if (refl) return refl;

    const model = (this.reflection as any).activeRecord;
    const assocDef = model?._associations?.find((a: any) => a.name === this.reflection.name);
    if (assocDef?.options?.through) {
      return model._reflectOnAssociation(
        assocDef.options.through,
      ) as AssociationLikeReflection | null;
    }
    return null;
  }

  private get _sourceReflection(): AssociationLikeReflection | null {
    const refl = (this.reflection as any).sourceReflection;
    if (refl && refl !== this.reflection) return refl;

    const throughRefl = this._throughReflection;
    if (!throughRefl) return null;
    const model = (this.reflection as any).activeRecord;
    const assocDef = model?._associations?.find((a: any) => a.name === this.reflection.name);
    const sourceName = assocDef?.options?.source ?? (this.reflection as any).source;
    if (sourceName) {
      let throughKlass: typeof Base | null = null;
      try {
        throughKlass = throughRefl.klass;
      } catch {
        // klass resolution may fail for polymorphic reflections
      }
      if (throughKlass) {
        const candidates = [sourceName, pluralize(sourceName), singularize(sourceName)];
        for (const name of candidates) {
          const r = throughKlass._reflectOnAssociation(name) as AssociationLikeReflection | null;
          if (r) return r;
        }
      }
    }
    return null;
  }
}

/** @internal */
function isDataAvailable(assoc: ThroughAssociation): boolean {
  return (assoc as any)._dataAvailable();
}

/** @internal */
function sourcePreloaders(assoc: ThroughAssociation): unknown[] {
  return (assoc as any)._sourcePreloaders ?? [];
}

/** @internal */
function middleRecords(assoc: ThroughAssociation): unknown[] {
  return (assoc as any)._getMiddleRecords?.() ?? [];
}

/** @internal */
function throughPreloaders(assoc: ThroughAssociation): unknown[] {
  return (assoc as any)._throughPreloaders ?? [];
}

/** @internal */
function throughReflection(assoc: ThroughAssociation): unknown {
  return (assoc as any)._throughReflection;
}

/** @internal */
function sourceReflection(assoc: ThroughAssociation): unknown {
  return (assoc as any)._sourceReflection;
}

/** @internal */
function sourceRecordsByOwner(assoc: ThroughAssociation): Map<unknown, unknown[]> {
  return (assoc as any)._sourceRecordsByOwner ?? new Map();
}

/** @internal */
function throughRecordsByOwner(assoc: ThroughAssociation): Map<unknown, unknown[]> {
  return (assoc as any)._throughRecordsByOwner ?? new Map();
}

/** @internal */
function preloadIndex(assoc: ThroughAssociation): Map<unknown, number> {
  return (assoc as any)._preloadIndex ?? new Map();
}

/** @internal */
function throughScope(assoc: ThroughAssociation): unknown {
  return (assoc as any)._buildThroughScope?.() ?? null;
}

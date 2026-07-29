import type { Base } from "../../base.js";
import type { AssociationReflection, ThroughReflection } from "../../reflection.js";
import { Association } from "./association.js";
import { Preloader } from "../preloader.js";
import { WhereClause } from "../../relation/where-clause.js";
import { pluralize, singularize } from "@blazetrails/activesupport";

type AssociationLikeReflection = AssociationReflection | ThroughReflection;

/** @internal */
function mergeRecordsByOwner(loaders: Association[]): Map<Base, Base[]> {
  const merged = new Map<Base, Base[]>();
  for (const loader of loaders) {
    const map = (loader as any)._recordsByOwner as Map<Base, Base[]> | undefined;
    if (map === undefined) continue;
    for (const [owner, records] of map) {
      merged.set(owner, records);
    }
  }
  return merged;
}

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
    if (this._recordsByOwner === undefined) {
      this._recordsByOwner = this._computeRecordsByOwner();
    }
    return this._recordsByOwner;
  }

  private _computeRecordsByOwner(): Map<Base, Base[]> {
    const result = new Map<Base, Base[]>();

    // When every owner already carries this association loaded — e.g. an outer
    // through query eager-loaded this source sub-chain via `includes!`/
    // `references!`, so the middle records arrive with their source association
    // populated — return those targets directly. This is the hoisted
    // loop-invariant of Rails' `records_by_owner`
    // (preloader/through_association.rb:11-15): if every owner is loaded, every
    // iteration takes the early `next`, so `through_records_by_owner` /
    // `source_records_by_owner` are never forced and no fetch happens. The
    // per-owner `isLoaded` check inside our loop only avoids re-associating, not
    // the unconditional fetch above it, so the guard must be hoisted here.
    if (this.owners.length > 0 && this.owners.every((owner) => this.isLoaded(owner))) {
      for (const owner of this.owners) {
        result.set(owner, this.targetFor(owner));
      }
      return result;
    }

    const throughRecordsByOwner = this._getThroughRecordsByOwner();
    const sourceRecordsByOwner = this._getSourceRecordsByOwner();

    const throughRefl = this._throughReflection;
    const firstOwner = this.owners[0] as any;
    const throughLoadedOnFirst =
      throughRefl != null &&
      firstOwner != null &&
      (() => {
        try {
          return !!firstOwner.association?.(throughRefl.name)?.loaded;
        } catch {
          return false;
        }
      })();

    for (const owner of this.owners) {
      if (this.isLoaded(owner)) {
        result.set(owner, this.targetFor(owner));
        continue;
      }

      let throughRecords = throughRecordsByOwner.get(owner) ?? [];

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

    // Mirror Rails' `source_preloaders`, which spawns a fresh Preloader on
    // `source_reflection.name` passing this preloader's built `scope`
    // (through_association.rb:70-71). Rails passes the full built scope
    // (reflection_scope merged, `preloader/association.rb:294-304`); trails empties
    // the source where_clause ONLY when `_buildThroughScope` already resolved it
    // by copying the FULL where_clause onto the through query and eager-loading the
    // source there (the `!where_clause.empty?` branch, for every source kind). In
    // that case the middle records arrive with their source association already
    // loaded, so this stage issues no query and re-applying the where would
    // reference the through / intermediate table this source query never joins
    // (e.g. `no such column: memberships.favorite`). What the source query keeps is
    // the non-where structure — `order`, `select`, `distinct` — so
    // `orderedPostComments`' `order(id: :desc)` still orders the source query in
    // the fallthrough where the reflection where_clause was empty (no eager-load).
    //
    // The `source_type` branch of `_buildThroughScope` (rb:115-116) applies ONLY
    // the source_type filter and does NOT copy the reflection where_clause onto
    // the through query, so the source is genuinely queried here and MUST keep the
    // reflection scope's (source-table) predicates — otherwise a scoped
    // polymorphic-through loses them. So empty the where only when NOT a
    // source_type reflection.
    //
    // For a nested source (source is itself a through), carry nothing: the
    // sub-chain re-derives its own scope (including order) at its own recursive
    // preload stage, and carrying the flattened chain scope's joins/select here
    // would duplicate the middle records.
    let sourceScope = null;
    const sourceIsNested = (sourceRefl as any).isThroughReflection?.() ?? false;
    const hasSourceType = !!(this.reflection as any).options?.sourceType;
    if (!sourceIsNested && this._reflectionScope != null) {
      sourceScope = this._reflectionScope._clone();
      if (!hasSourceType) {
        sourceScope._whereClause = new WhereClause([]);
      }
    }
    if (sourceScope != null && this._preloadScope != null) {
      sourceScope = sourceScope.merge(this._preloadScope);
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
    return [...this._getThroughRecordsByOwner().values()].flat();
  }

  private _getSourceRecordsByOwner(): Map<Base, Base[]> {
    if (this._sourceRecordsByOwner === undefined) {
      this._sourceRecordsByOwner = mergeRecordsByOwner(this._getSourcePreloaders());
    }
    return this._sourceRecordsByOwner;
  }

  private _getThroughRecordsByOwner(): Map<Base, Base[]> {
    if (this._throughRecordsByOwner === undefined) {
      this._throughRecordsByOwner = mergeRecordsByOwner(this._getThroughPreloaders());
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

  /**
   * Build the through (intermediate) query's scope, mirroring Rails'
   * `Preloader::ThroughAssociation#through_scope`
   * (vendor/rails/activerecord/lib/active_record/associations/preloader/through_association.rb:104-146).
   *
   * When the reflection scope carries a where-clause, EVERY source kind (to-one
   * belongs_to/has_one, collection has_many, or nested through) takes the SAME
   * Rails-faithful branch: the whole reflection-scope `where_clause` is copied
   * onto the through query and the source reflection is eager-loaded via
   * `includes!`/`references!` (a LEFT OUTER JOIN through the JoinDependency), so
   * every column — through-table, source-table, or a scope-joined nested table —
   * resolves in ONE query with no per-predicate table attribution. The
   * JoinDependency instantiates distinct parents by primary key, so a to-many
   * source no longer fans the middle records out, and a to-one source (e.g. a
   * HABTM's belongs_to on the anonymous `HABTM_*` join model) joins the same way.
   * The through query carries no LIMIT/OFFSET, so its composite-PK base
   * (HABTM join model, or a real composite-PK through model) applies the eager
   * JoinDependency — `Relation#_eagerLoadBypassesJoinDependency` bypasses a
   * composite PK only on the LIMIT+collection `_materializeLimitedIds` path,
   * which this query never takes. `disable_joins` and polymorphic `source_type`
   * keep their own paths.
   */
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

    // Rails returns the bare unscoped relation before annotate/where/join when
    // the association opts out of joins (through_association.rb:108).
    if (options.disableJoins) return scope;

    const reflScope = this._reflectionScope;

    // values[:annotate] → scope.annotate!(*annotations) (through_association.rb:111-113)
    const annotations: string[] = reflScope?._annotations ?? [];
    if (annotations.length > 0) {
      scope = scope.annotate(...annotations);
    }

    const whereClause = reflScope?._whereClause;
    if (options.sourceType) {
      // scope.where!(reflection.foreign_type => source_type) (rb:115-116)
      const foreignType = (this.reflection as any).foreignType;
      if (foreignType) {
        scope = scope.where({ [foreignType]: options.sourceType });
      }
    } else if (reflScope != null && whereClause != null && !whereClause.isEmpty()) {
      // elsif !reflection_scope.where_clause.empty? (rb:117-143): copy the FULL
      // where_clause onto the through query and JOIN the source reflection so
      // every referenced column resolves in this single query.
      const sourceRefl = this._sourceReflection;
      if (sourceRefl) {
        // Mirror Rails' `through_scope` eager-load branch exactly for EVERY
        // source kind (to-one, collection, nested through).
        // Copy the FULL reflection-scope where_clause and `includes!(source)` +
        // `references!(source.table_name)`, promoting the source reflection to a
        // LEFT OUTER JOIN eager-load on this through query. Unlike a bare
        // `leftOuterJoins`, the eager-load runs through the JoinDependency, which
        // instantiates distinct parents by primary key — so a to-many source (or
        // a to-many nested include such as the canonical `tag` source's own
        // `includes(:tagging)`) no longer fans the middle records out. The
        // instantiated middle records carry their source association already
        // loaded, so the recursive `_getSourcePreloaders` stage finds it loaded
        // and issues no further query — collapsing authors+posts+taggings+tags
        // to two queries. Every referenced column (through-table, source-table,
        // or sub-chain intermediate) resolves in this one join, closing the
        // latent gap where an outer predicate qualified a sub-chain table no
        // single trails stage joined.
        scope._whereClause = new WhereClause([
          ...scope._whereClause.predicates,
          ...whereClause.predicates,
        ]);
        const sourceName = sourceRefl.name;
        const nestedIncludes: any[] = reflScope?._includesAssociations ?? [];
        if (nestedIncludes.length > 0) {
          scope = scope.includes({ [sourceName]: nestedIncludes });
        } else {
          scope = scope.includes(sourceName);
        }

        // references!(source.table_name) (rb:127-130): unless the scope already
        // carries explicit references, reference the source table so `includes`
        // promotes to the eager JOIN. Rails reads `source_reflection.table_name`
        // unguarded here and raises for an unresolvable / polymorphic source
        // (you can't get a static klass off a polymorphic belongs_to without an
        // instance) — so this is intentionally NOT wrapped: it must fail loudly
        // the way Rails does rather than silently degrade to an unreferenced
        // `includes` (a differently-shaped query). This branch is a direct port.
        const refs: string[] = reflScope?._referencesValues ?? [];
        if (refs.length > 0) {
          scope = scope.references(...refs);
        } else {
          scope = scope.references(sourceRefl.klass.tableName);
        }

        // joins!(source_reflection.name => joins) (rb:132-134): Rails applies the
        // whole flattened `values[:joins]` bucket ONCE, nested under the source
        // reflection name. trails splits that bucket into `_namedInnerJoins`
        // (symbol association joins) and `_joinValues` (raw string / Arel-node
        // joins), so their UNION is Rails' single `values[:joins]` — applied here
        // exactly once. A raw string / Arel join anywhere in the FLATTENED chain
        // scope raises `ConfigurationError` in Rails (`JoinDependency` rejects the
        // bogus association name symbolized from the raw string), regardless of
        // the collection/nested strategy — nesting it under the source reflection
        // name makes trails' join builder raise identically. This branch is
        // already gated on the flattened `where_clause` being non-empty (the same
        // `elsif !reflection_scope.where_clause.empty?` gate, rb:117), so matching
        // Rails means raising here too — a raw join declared only on a deeper
        // sub-chain link is NOT deferred to its own recursive stage (verified
        // against a live Rails nested-through repro).
        const nestedRawJoinValues: any[] = reflScope?._joinValues ?? [];
        const nestedJoins: any[] = reflScope?._namedInnerJoins ?? [];
        if (nestedRawJoinValues.length > 0 || nestedJoins.length > 0) {
          scope = scope.joins({ [sourceName]: [...nestedRawJoinValues, ...nestedJoins] });
        }

        // left_outer_joins!(source_reflection.name => left_outer_joins) (rb:136-137).
        const nestedLeftOuter: any[] = reflScope?._leftOuterJoinsValues ?? [];
        if (nestedLeftOuter.length > 0) {
          scope = scope.leftOuterJoins({ [sourceName]: nestedLeftOuter });
        }

        // scope.eager_loading? && order (rb:139-141): true here since we always
        // includes! the source above.
        const orderClauses: any[] = reflScope?._orderClauses ?? [];
        const rawOrderClauses: string[] = reflScope?._rawOrderClauses ?? [];
        if (orderClauses.length > 0 || rawOrderClauses.length > 0) {
          scope._orderClauses = [...scope._orderClauses, ...orderClauses];
          scope._rawOrderClauses = [...scope._rawOrderClauses, ...rawOrderClauses];
        }
      }
    }

    // cascade_strict_loading: a strict-loading preload scope propagates to the
    // through query so intermediate records inherit the constraint (rb:145).
    return this._cascadeStrictLoading(scope);
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

/**
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

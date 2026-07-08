import type { Base } from "../../base.js";
import type { AssociationReflection, ThroughReflection } from "../../reflection.js";
import { Association } from "./association.js";
import { Preloader } from "../preloader.js";
import { WhereClause } from "../../relation/where-clause.js";
import { pluralize, singularize } from "@blazetrails/activesupport";
import { Nodes, relationName } from "@blazetrails/arel";

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

    // Mirror Rails' `source_preloaders`, which spawns a fresh Preloader on
    // `source_reflection.name` passing this preloader's built `scope`
    // (through_association.rb:71). The reflection scope's WHERE predicates are
    // already applied by `_buildThroughScope` — copied onto the through query
    // with the source JOIN so every referenced column resolves there — so we do
    // NOT re-apply them at the source stage (they would reference the through /
    // intermediate table that this source query never joins, e.g.
    // `no such column: memberships.favorite`). For a nested source (source is
    // itself a through), the sub-chain's own predicates are re-derived at its
    // own recursive preload stage, not carried here. What the source query DOES
    // need from the reflection scope is its non-where structure — `order`,
    // `select`, `distinct` — so `orderedPostComments`' `order(id: :desc)` still
    // orders the source (comments) query.
    //
    //   - Single-query JOIN case (to-one, non-through source): the through query
    //     copied the FULL where_clause and joined the source, so the source
    //     query re-applies NO predicates — empty its where_clause (keeping order
    //     / select). This also avoids re-applying a through-table condition (e.g.
    //     `favoriteClub`'s `memberships.favorite`) that the source query can't
    //     resolve.
    //   - Collection two-step case: the through query only carried through-table
    //     predicates, so the source query keeps the reflection scope's remaining
    //     (source-table) predicates — e.g. `goodRatings`' `ratings.value > 5`.
    //   - Nested source (source is itself a through): carry nothing; the
    //     sub-chain re-derives its own scope (including order) at its own
    //     recursive preload stage, and carrying the flattened chain scope's
    //     joins/select here would duplicate the middle records.
    let sourceScope = null;
    const sourceIsThrough = (sourceRefl as any)?.isThroughReflection?.() ?? false;
    const sourceIsCollection = (sourceRefl as any)?.isCollection?.() ?? false;
    if (!sourceIsThrough && this._reflectionScope != null) {
      sourceScope = this._reflectionScope._clone();
      if (!sourceIsCollection) {
        sourceScope._whereClause = new WhereClause([]);
      } else {
        const throughTable = this._throughTableName();
        const wc = this._reflectionScope._whereClause;
        const sourcePredicates =
          throughTable != null && wc != null
            ? wc.predicates.filter((p: any) => !predicateReferencesTable(p, throughTable))
            : (wc?.predicates ?? []);
        sourceScope._whereClause = new WhereClause(sourcePredicates);
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
      try {
        return !!owner.association?.(throughName)?.loaded;
      } catch {
        return false;
      }
    };
    if (!this.owners.every(loadedForOwner)) return null;

    const map = new Map<Base, Base[]>();
    for (const owner of this.owners) {
      let recs: any = null;
      try {
        recs = (owner as any).association?.(throughName)?.target;
      } catch {
        recs = null;
      }
      const arr: Base[] = Array.isArray(recs) ? [...recs] : recs != null ? [recs] : [];
      const filtered = arr.filter(
        (record) => (record as any)._readAttribute(foreignType) === sourceType,
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

  /**
   * Build the through (intermediate) query's scope, mirroring Rails'
   * `Preloader::ThroughAssociation#through_scope`
   * (vendor/rails/activerecord/lib/active_record/associations/preloader/through_association.rb:104-146).
   *
   * For a to-one, non-through source this is Rails' single-query strategy: the
   * whole reflection-scope `where_clause` is copied onto the through query and
   * the source reflection is JOINed (Rails `includes!`/`references!`, a LEFT
   * OUTER JOIN), so every column — through-table, source-table, or a
   * scope-joined nested table — resolves in ONE query with no per-predicate
   * table attribution.
   *
   * A collection (has_many) source or a nested (through) source can't be JOINed
   * without fanning the through rows out (trails collects raw rows; Rails' eager
   * JoinDependency dedups by PK), so those keep the two-step: only the
   * reflection scope's through-table predicates are copied here (to constrain
   * the intermediate rows), and the source / sub-chain predicates and order ride
   * the recursive source-preloader stage (see `_getSourcePreloaders`).
   * `disable_joins` and polymorphic `source_type` keep their own paths.
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
      // The single-query JOIN is only safe when the source reflection is a
      // to-ONE, non-through association. A collection source (has_many) or a
      // nested through source joined onto the through query fans the
      // intermediate rows out across the source/sub-chain join tables,
      // duplicating the middle records — Rails avoids that because its through
      // query is an eager-load whose JoinDependency instantiates distinct
      // parents by primary key, but trails' preloader collects raw rows. For
      // those cases trails recurses per reflection stage (Rails'
      // `source_preloaders`): the source/sub-chain predicates and order are
      // applied at the source-preloader stage (see `_getSourcePreloaders`), and
      // only the reflection scope's THROUGH-table predicates are copied here to
      // constrain which intermediate rows this through query selects.
      const sourceIsThrough = (sourceRefl as any)?.isThroughReflection?.() ?? false;
      const sourceIsCollection = (sourceRefl as any)?.isCollection?.() ?? false;
      if (sourceRefl && !sourceIsThrough && !sourceIsCollection) {
        scope._whereClause = new WhereClause([
          ...scope._whereClause.predicates,
          ...whereClause.predicates,
        ]);
        const sourceName = sourceRefl.name;
        const nestedJoins: any[] = reflScope?._namedInnerJoins ?? [];
        const nestedLeftOuter: any[] = reflScope?._leftOuterJoinsValues ?? [];
        // Raw string / Arel-node joins the reflection scope carries in its own
        // `_joinValues` bucket (`.joins("INNER JOIN …")` or `.joins(<Arel node>)`).
        // Rails passes the scope's FULL `joins_values` — symbols AND raw strings
        // / Arel nodes — to `joins!(source_reflection.name => joins)`
        // (rb:132-134). `JoinDependency.walk_tree` symbolizes a raw string into a
        // bogus association name and `find_reflection` raises
        // `ActiveRecord::ConfigurationError` — real Rails raises on preload here,
        // it does not silently carry the raw join. Nesting it under the source
        // reflection name makes trails' join builder raise the same error.
        const nestedRawJoinValues: any[] = reflScope?._joinValues ?? [];

        // Rails `includes!(source_reflection.name)` + `references!(...)` promotes
        // to a LEFT OUTER JOIN of the source reflection. `values[:includes]`
        // (the reflection SCOPE's explicit `.includes`) is empty for the through
        // scopes we support — trails' `_includesAssociations` bucket is polluted
        // with derived inverse associations (e.g. the source's own inverse
        // `tagging`), which would fan the through query out — so we do NOT carry
        // it; the bare source join matches Rails' `includes!(source)`. A scope's
        // explicit `.left_joins(source => nested)` lives in
        // `_leftOuterJoinsValues` and IS nested so a deeper table its predicate
        // qualifies is joined too (rb:120-138).
        if (nestedLeftOuter.length > 0) {
          scope = scope.leftOuterJoins({ [sourceName]: nestedLeftOuter });
        } else {
          scope = scope.leftOuterJoins(sourceName);
        }

        // joins!(source_reflection.name => joins): symbol-association joins are
        // carried as an inner join; raw string / Arel joins raise as above.
        if (nestedRawJoinValues.length > 0) {
          scope = scope.joins({ [sourceName]: [...nestedRawJoinValues] });
        }
        if (nestedJoins.length > 0) {
          scope = scope.joins({ [sourceName]: nestedJoins });
        }

        // Rails carries `order` only when `scope.eager_loading?` (rb:140). In
        // this branch Rails always `includes!(source)` + `references!(...)`, so
        // `eager_loading?` is true whenever the branch runs — our source join
        // above is the analogue, so carry the order unconditionally here.
        const orderClauses: any[] = reflScope?._orderClauses ?? [];
        const rawOrderClauses: string[] = reflScope?._rawOrderClauses ?? [];
        if (orderClauses.length > 0 || rawOrderClauses.length > 0) {
          scope._orderClauses = [...scope._orderClauses, ...orderClauses];
          scope._rawOrderClauses = [...scope._rawOrderClauses, ...rawOrderClauses];
        }
      } else if (sourceRefl) {
        // Collection or nested source: the single-query JOIN cannot cover it
        // (fan-out), so the source / sub-chain predicates ride the recursive
        // source-preloader stages instead. But a THROUGH-table predicate the
        // reflection scope carries (e.g. `miscPostFirstBlueTags_2`'s
        // `posts.title IN (…)`, whose through reflection is `posts`) must still
        // constrain which intermediate rows this through query selects — the
        // recursion can't apply it because it filters the through table, not the
        // source. So copy just the predicates that reference the through table,
        // detected precisely from their Arel attributes (no raw-SQL text scan).
        // Source / sub-chain predicates stay for the recursion.
        const throughTable = throughKlass.tableName;
        const throughPreds = whereClause.predicates.filter((p: any) =>
          predicateReferencesTable(p, throughTable),
        );
        if (throughPreds.length > 0) {
          scope._whereClause = new WhereClause([...scope._whereClause.predicates, ...throughPreds]);
        }
      }
    }

    // cascade_strict_loading: a strict-loading preload scope propagates to the
    // through query so intermediate records inherit the constraint (rb:145).
    return this._cascadeStrictLoading(scope);
  }

  /** @internal */
  private _throughTableName(): string | null {
    const throughRefl = this._throughReflection;
    if (!throughRefl) return null;
    try {
      return (throughRefl.klass as any)?.tableName ?? null;
    } catch {
      return null;
    }
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
 * True when any Arel attribute in `node` references `tableName`. Used only for a
 * NESTED through source (where the single-query JOIN can't be used) to copy the
 * reflection scope's through-table predicates onto the through query. This is a
 * precise Arel-attribute walk — NOT the raw-SQL text scan removed with this
 * convergence — so a raw-string predicate carries no attributes and is left for
 * the recursive source stage.
 * @internal
 */
function predicateReferencesTable(node: any, tableName: string): boolean {
  let found = false;
  node.fetchAttribute?.((attr: any) => {
    if (attr instanceof Nodes.Attribute && relationName(attr.relation.name) === tableName) {
      found = true;
      return false;
    }
    return true;
  });
  if (!found && node instanceof Nodes.Not) {
    return predicateReferencesTable((node as any).expr, tableName);
  }
  return found;
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

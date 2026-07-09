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
    const strategy = this._throughScopeStrategy();
    if (strategy !== "nested" && this._reflectionScope != null) {
      sourceScope = this._reflectionScope._clone();
      if (strategy === "join") {
        sourceScope._whereClause = new WhereClause([]);
      } else {
        const throughTable = this._throughTableName();
        const wc = this._reflectionScope._whereClause;
        // Keep every predicate except the ones the through query fully resolves
        // (through-table-only). A predicate mixing the through table with another
        // table stays here — it is not through-only, so it is not copied there.
        const sourcePredicates =
          throughTable != null && wc != null
            ? wc.predicates.filter((p: any) => !predicateIsThroughOnly(p, throughTable))
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
   * How this preload realizes Rails' `through_scope` where-copy branch, given
   * what trails' row-collecting preloader can do without Rails' PK-deduping
   * eager JoinDependency:
   *
   *   - `"join"` — the source is a to-one, non-through association, so JOINing it
   *     onto the through query can't fan the through rows out (a to-one join
   *     adds no rows). This is Rails' single-query strategy: copy the full
   *     where_clause and join the source, carrying every nested scope
   *     join/include unconditionally.
   *   - `"twoStep"` — the source is a collection, OR a collection target's scope
   *     carries a fan-out-prone nested join/include (one reaching a to-many
   *     association) whose table a copied predicate may reference. Either would
   *     duplicate the middle records if joined onto the through query, so keep
   *     the two-step: copy only the reflection scope's through-table predicates
   *     here; source-table predicates, order, and the scope's includes/joins ride
   *     the recursive source stage (a per-record-keyed query, so the join filters
   *     without fanning the through rows out).
   *   - `"nested"` — the source is itself a through; its sub-chain re-derives its
   *     own scope at its own recursive stage. Same through-query handling as
   *     `"twoStep"`, but the source stage carries nothing.
   * @internal
   */
  private _throughScopeStrategy(): "join" | "twoStep" | "nested" {
    const sourceRefl = this._sourceReflection;
    if (!sourceRefl) return "twoStep";
    if ((sourceRefl as any).isThroughReflection?.()) return "nested";
    if ((sourceRefl as any).isCollection?.() ?? false) return "twoStep";
    // A has_one target keeps only the first row, so it tolerates a fanning nested
    // join; a collection target does not — and dropping just the include would
    // orphan any predicate on that table (copied with the full where_clause) onto
    // an unjoined table, so route the whole preload to the two-step instead.
    const targetIsCollection = (this.reflection as any).isCollection?.() ?? false;
    if (targetIsCollection && this._scopeHasFanOutJoin(sourceRefl)) return "twoStep";
    return "join";
  }

  /**
   * True when the reflection scope carries a nested join/include
   * (`.includes` / `.left_joins` / `.joins(<symbol>)`) that reaches a to-many
   * association from the source klass — i.e. one the single-query JOIN can't nest
   * onto the through query without fanning the middle records out. Raw-SQL /
   * Arel-node joins (`_joinValues`) are excluded here: Rails raises on those
   * regardless, which the two-step would not reproduce, so they must stay on the
   * `"join"` path (see the raw-join tests).
   * @internal
   */
  private _scopeHasFanOutJoin(sourceRefl: AssociationLikeReflection): boolean {
    const reflScope = this._reflectionScope;
    if (reflScope == null) return false;
    const specs: any[] = [
      ...(reflScope._includesAssociations ?? []),
      ...(reflScope._leftOuterJoinsValues ?? []),
      ...(reflScope._namedInnerJoins ?? []),
    ];
    if (specs.length === 0) return false;
    let sourceKlass: typeof Base | undefined;
    try {
      sourceKlass = (sourceRefl as any).klass;
    } catch {
      return false;
    }
    if (sourceKlass == null) return false;
    return specs.some((spec) => this._includeSpecFansOut(sourceKlass, spec));
  }

  /**
   * True when the include/join spec reaches an association that can multiply the
   * through rows when JOINed. Only a `belongs_to` join is truly 1:1 (a foreign
   * key referencing a unique primary key); a `has_one`/`has_many` join can return
   * several rows when the row has multiple children — `has_one` is a Rails-level
   * "keep the first", not a SQL uniqueness — so both are treated as fan-out.
   * Rails tolerates the fan-out via its PK-deduping eager JoinDependency; trails'
   * row-collecting preloader can't, so for a collection target a fan-out-prone
   * nested include is dropped. Walks nested hash/array specs, resolving each key
   * against the current klass; an unresolvable (e.g. polymorphic) association is
   * treated as fan-out (conservative). A has_one target tolerates fan-out anyway
   * since it keeps only the first row, so this gate is applied only for a
   * collection target.
   * @internal
   */
  private _includeSpecFansOut(klass: typeof Base, spec: any): boolean {
    if (spec == null) return false;
    if (Array.isArray(spec)) return spec.some((s) => this._includeSpecFansOut(klass, s));
    const step = (name: string, child: any): boolean => {
      let r: any;
      try {
        r = (klass as any)._reflectOnAssociation?.(name);
      } catch {
        return true;
      }
      if (!r) return true;
      if (!(r.isBelongsTo?.() ?? false)) return true;
      if (child == null) return false;
      let nextKlass: typeof Base | undefined;
      try {
        nextKlass = r.klass;
      } catch {
        return true;
      }
      return nextKlass ? this._includeSpecFansOut(nextKlass, child) : true;
    };
    if (typeof spec === "string") return step(spec, null);
    if (typeof spec === "object") return Object.keys(spec).some((key) => step(key, spec[key]));
    return false;
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
      const strategy = this._throughScopeStrategy();
      if (sourceRefl && strategy === "join") {
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
        // Read from the FLATTENED `reflection_scope` (`join_scopes.inject(&:merge!)`,
        // preloader/association.rb:290): Rails nests the whole flattened
        // `values[:joins]` — sub-chain raw joins included — so a raw join
        // declared on a deeper link in a nested chain raises here too.
        const nestedRawJoinValues: any[] = reflScope?._joinValues ?? [];

        // Rails `includes!(source_reflection.name => values[:includes])` (bare
        // when the scope has no `.includes`) + `references!(...)` promotes to a
        // LEFT OUTER JOIN of the source reflection and its nested includes
        // (rb:120-124). trails carries the scope's explicit `.includes`
        // (`_includesAssociations`) the same way — nested under the source
        // reflection — so a has_one-through scope like
        // `includes(:category).where(categories: { … })` joins `categories` on
        // this through query and the predicate resolves. `.left_joins(source =>
        // nested)` (`_leftOuterJoinsValues`) is carried likewise. Carried
        // unconditionally here: `_throughScopeStrategy` already diverted the only
        // unsafe case (a collection target whose scope reaches a to-many nested
        // table) to the two-step, so nothing copied here references an unjoined
        // table.
        const nestedIncludes: any[] = reflScope?._includesAssociations ?? [];
        const nestedOuter = [...nestedLeftOuter, ...nestedIncludes];
        if (nestedOuter.length > 0) {
          scope = scope.leftOuterJoins({ [sourceName]: nestedOuter });
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
        // Collection source/target ("twoStep") or nested through source
        // ("nested"): mirror Rails' `through_scope` eager-load branch exactly.
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
        // `includes` (a differently-shaped query). The sibling `.klass` guards in
        // `_scopeHasFanOutJoin` / `_includeSpecFansOut` are internal routing
        // heuristics with no Rails counterpart; this branch is a direct port.
        const refs: string[] = reflScope?._referencesValues ?? [];
        if (refs.length > 0) {
          scope = scope.references(...refs);
        } else {
          scope = scope.references(sourceRefl.klass.tableName);
        }

        // joins!(source => joins) / left_outer_joins!(source => …) (rb:132-137).
        const nestedRawJoinValues: any[] = reflScope?._joinValues ?? [];
        const nestedJoins: any[] = reflScope?._namedInnerJoins ?? [];
        if (nestedRawJoinValues.length > 0 || nestedJoins.length > 0) {
          scope = scope.joins({ [sourceName]: [...nestedRawJoinValues, ...nestedJoins] });
        }
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

        // A raw string / Arel-node join anywhere in the FLATTENED chain scope
        // (`.joins("INNER JOIN …")`, held in `_joinValues`) raises
        // `ConfigurationError` in Rails regardless of the collection/nested
        // strategy — `through_scope` passes the whole flattened `values[:joins]`
        // to `joins!(source_reflection.name => joins)` (rb:132-134) and
        // `JoinDependency` rejects the bogus association name. This branch is
        // already gated on the flattened `where_clause` being non-empty (the
        // same `elsif !reflection_scope.where_clause.empty?` gate, rb:117), so
        // matching Rails means raising here too — a raw join declared only on a
        // deeper sub-chain link is NOT deferred to its own recursive stage
        // (verified against a live Rails nested-through repro). Nest it under the
        // source reflection name so trails' join builder raises identically.
        const rawJoinValues: any[] = reflScope?._joinValues ?? [];
        if (rawJoinValues.length > 0) {
          scope = scope.joins({ [sourceRefl.name]: [...rawJoinValues] });
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
 * True when `node` references `tableName`. Used for a collection (has_many) or
 * nested (through) source — the cases the single-query JOIN can't cover without
 * fanning the through rows out — to route the reflection scope's through-table
 * predicates onto the through query (and keep them off the source query, which
 * never joins the through table). Rails' `through_scope` assigns the FULL
 * `reflection_scope.where_clause` before adding the source join
 * (through_association.rb:117-130), so a raw-SQL through-table predicate must be
 * honored too, not just a hash/Arel one — hence the raw-SQL qualifier scan
 * alongside the precise Arel walk.
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
  // Raw-SQL predicates (e.g. `where("posts.title = ?", "x")`) carry no Arel
  // Attribute nodes, so `fetchAttribute` never visits them. Scan the raw SQL
  // text for a `<table>.` qualifier so a string condition on the through table
  // is routed like a hash/Arel one.
  if (!found && rawSqlReferencesTable(node, tableName)) {
    found = true;
  }
  return found;
}

/**
 * True when a raw-SQL predicate node's text qualifies a column with `tableName.`.
 * Handles SqlLiteral / BoundSqlLiteral and a single Grouping wrapper. String
 * literals are blanked first (see `stripSqlStringLiterals`) so a `<table>.`
 * qualifier inside quoted text — e.g. `where("body = 'see posts.title'")` — is
 * not a false positive. Hash/Arel predicates take the precise `fetchAttribute`
 * path above and never reach here.
 * @internal
 */
function rawSqlReferencesTable(node: any, tableName: string): boolean {
  if (node instanceof Nodes.Grouping) {
    return rawSqlReferencesTable((node as any).expr, tableName);
  }
  let sql: string | undefined;
  if (node instanceof Nodes.BoundSqlLiteral) sql = (node as any).sqlWithPlaceholders;
  else if (node instanceof Nodes.SqlLiteral) sql = (node as any).value;
  if (typeof sql !== "string") return false;
  sql = stripSqlStringLiterals(sql);
  const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\w.])${escaped}\\.`).test(sql);
}

/**
 * Blank single-quoted SQL string literals (preserving length) so the read-only
 * `<table>.` qualifier scan in `rawSqlReferencesTable` does not match a table
 * name embedded in literal text. Consumes both SQL-standard doubled quotes
 * (`''`) and backslash-escaped quotes (`\'`, MySQL/MariaDB default). The result
 * is never executed as SQL.
 * @internal
 */
function stripSqlStringLiterals(sql: string): string {
  // eslint-disable-next-line blazetrails/no-raw-sql
  return sql.replace(/'(?:[^'\\]|''|\\.)*'/g, (lit) => " ".repeat(lit.length));
}

/**
 * True when `node` qualifies a column with some table OTHER than `tableName`.
 * Used together with `predicateReferencesTable` to decide whether a single
 * predicate can ride the two-step's through query: only a predicate that
 * references the through table AND no other table is fully resolvable there
 * (the two-step through query joins nothing beyond the through table). A mixed
 * predicate — e.g. `posts.title = ? OR categorizations.author_id = ?` — is not,
 * so it must NOT be routed to the through query (nor stripped from the source
 * scope). Mirrors the precise Arel walk plus raw-SQL qualifier scan.
 * @internal
 */
function predicateReferencesOtherTable(node: any, tableName: string): boolean {
  let other = false;
  node.fetchAttribute?.((attr: any) => {
    if (attr instanceof Nodes.Attribute && relationName(attr.relation.name) !== tableName) {
      other = true;
      return false;
    }
    return true;
  });
  if (other) return true;
  if (node instanceof Nodes.Not) {
    return predicateReferencesOtherTable((node as any).expr, tableName);
  }
  return rawSqlReferencesOtherTable(node, tableName);
}

/**
 * True when a raw-SQL predicate node's text qualifies a column with any table
 * other than `tableName`. Mirrors `rawSqlReferencesTable`'s node unwrapping and
 * literal blanking, then extracts every `<word>.` qualifier.
 * @internal
 */
function rawSqlReferencesOtherTable(node: any, tableName: string): boolean {
  if (node instanceof Nodes.Grouping) {
    return rawSqlReferencesOtherTable((node as any).expr, tableName);
  }
  let sql: string | undefined;
  if (node instanceof Nodes.BoundSqlLiteral) sql = (node as any).sqlWithPlaceholders;
  else if (node instanceof Nodes.SqlLiteral) sql = (node as any).value;
  if (typeof sql !== "string") return false;
  sql = stripSqlStringLiterals(sql);
  const qualifierRe = /(^|[^\w.])(\w+)\s*\./g;
  let match: RegExpExecArray | null;
  while ((match = qualifierRe.exec(sql)) !== null) {
    if (match[2] !== tableName) return true;
  }
  return false;
}

/**
 * True when `node` references the through table `tableName` and NO other table,
 * so the two-step's through query (which joins nothing beyond the through table)
 * can fully resolve it. Predicates that reference only source/other tables, or
 * mix the through table with another, are left on the source scope instead.
 * @internal
 */
function predicateIsThroughOnly(node: any, tableName: string): boolean {
  return (
    predicateReferencesTable(node, tableName) && !predicateReferencesOtherTable(node, tableName)
  );
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

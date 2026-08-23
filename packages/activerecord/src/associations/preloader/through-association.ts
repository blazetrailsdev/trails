import type { Nodes } from "@blazetrails/arel";
import type { Base } from "../../base.js";
import type { AssociationReflection, ThroughReflection } from "../../reflection.js";
import { Association } from "./association.js";
import { Preloader } from "../preloader.js";
import { WhereClause } from "../../relation/where-clause.js";
import { pluralize, singularize } from "@blazetrails/activesupport";

type AssociationLikeReflection = AssociationReflection | ThroughReflection;

/** `Hash#merge`, the block `reduce(:merge)` names (through_association.rb:89, :93). */
function merge(acc: Map<Base, Base[]>, recordsByOwner: Map<Base, Base[]>): Map<Base, Base[]> {
  return new Map([...acc, ...recordsByOwner]);
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

  /** Mirrors: Preloader::ThroughAssociation#preloaded_records
   *  (`preloader/through_association.rb:7-9`). */
  async preloadedRecords(): Promise<Base[]> {
    if (this._throughPreloadedRecords !== undefined) return this._throughPreloadedRecords;
    const records: Base[] = [];
    for (const loader of await this.sourcePreloaders()) {
      records.push(...(await loader.preloadedRecords()));
    }
    this._throughPreloadedRecords = records;
    return this._throughPreloadedRecords;
  }

  /** Mirrors: Preloader::ThroughAssociation#records_by_owner
   *
   * @missingRailsCall any? — PERMANENT: Verified per-site (RFC 0106 wave 4g):
   *   `scope.order_values.any?` (preloader/through_association.rb:33) —
   *   `Enumerable#any?` without a block on a Ruby Array, spelled
   *   `this.scope?.orderValues?.length > 0` (through-association.ts:82). A
   *   `.length` read emits no callee, so no TS call can credit the Ruby one (RFC
   *   0092, JS_ENUMERABLE_ALIASES).
   * @missingRailsCall first — PERMANENT: Verified per-site (RFC 0106 wave 4g):
   *   `owners.first.association(through_reflection.name).loaded?`
   *   (preloader/through_association.rb:20) is index-0 access on a Ruby Array,
   *   spelled `this.owners[0].association(...)` (through-association.ts:69).
   *   `Array#first` is a positional idiom with no JS call form (RFC 0092).
   *  (`preloader/through_association.rb:11-37`). */
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

  private async dataAvailable(): Promise<boolean> {
    return (
      this.owners.every((owner) => this.isLoaded(owner)) ||
      ((await this.throughPreloaders()).every((l) => l.isRun()) &&
        (await this.sourcePreloaders()).every((l) => l.isRun()))
    );
  }

  /** Mirrors: `preloader/through_association.rb:70-72`. */
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

  /** Mirrors: `preloader/through_association.rb:88-90`. */
  private async sourceRecordsByOwner(): Promise<Map<Base, Base[]>> {
    this._sourceRecordsByOwner ??= (
      await Promise.all((await this.sourcePreloaders()).map((l) => l.recordsByOwner()))
    ).reduce(merge, new Map<Base, Base[]>());
    return this._sourceRecordsByOwner;
  }

  /** Mirrors: `preloader/through_association.rb:92-94`. */
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

    // Rails returns the bare unscoped relation before annotate/where/join when
    // the association opts out of joins (through_association.rb:108).
    if (options.disableJoins) return scope;

    const reflScope = this.reflectionScope;

    // values[:annotate] → scope.annotate!(*annotations) (through_association.rb:111-113)
    const annotations: string[] = reflScope?.annotateValues ?? [];
    if (annotations.length > 0) {
      scope = scope.annotate(...annotations);
    }

    const whereClause = reflScope?.whereClause;
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
      const sourceRefl = this.sourceReflection;
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
        // loaded, so the recursive `sourcePreloaders` stage finds it loaded
        // and issues no further query — collapsing authors+posts+taggings+tags
        // to two queries. Every referenced column (through-table, source-table,
        // or sub-chain intermediate) resolves in this one join, closing the
        // latent gap where an outer predicate qualified a sub-chain table no
        // single trails stage joined.
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

        // references!(source.table_name) (rb:127-130): unless the scope already
        // carries explicit references, reference the source table so `includes`
        // promotes to the eager JOIN. Rails reads `source_reflection.table_name`
        // unguarded here and raises for an unresolvable / polymorphic source
        // (you can't get a static klass off a polymorphic belongs_to without an
        // instance) — so this is intentionally NOT wrapped: it must fail loudly
        // the way Rails does rather than silently degrade to an unreferenced
        // `includes` (a differently-shaped query). This branch is a direct port.
        const refs: Array<string | Nodes.SqlLiteral> = reflScope?.referencesValues ?? [];
        if (refs.length > 0) {
          scope = scope.references(...refs);
        } else {
          scope = scope.references(sourceRefl.klass.tableName);
        }

        // joins!(source_reflection.name => joins) (rb:132-134): Rails applies the
        // whole flattened `values[:joins]` bucket ONCE, nested under the source
        // reflection name — trails reads the same single `joins_values` store, in
        // insertion order. A raw string / Arel join anywhere in the FLATTENED chain
        // scope raises `ConfigurationError` in Rails (`JoinDependency` rejects the
        // bogus association name symbolized from the raw string), regardless of
        // the collection/nested strategy — nesting it under the source reflection
        // name makes trails' join builder raise identically. This branch is
        // already gated on the flattened `where_clause` being non-empty (the same
        // `elsif !reflection_scope.where_clause.empty?` gate, rb:117), so matching
        // Rails means raising here too — a raw join declared only on a deeper
        // sub-chain link is NOT deferred to its own recursive stage (verified
        // against a live Rails nested-through repro).
        const nestedJoins: any[] = reflScope?.joinsValues ?? [];
        if (nestedJoins.length > 0) {
          scope = scope.joins({ [sourceName]: nestedJoins });
        }

        // left_outer_joins!(source_reflection.name => left_outer_joins) (rb:136-137).
        const nestedLeftOuter: any[] = reflScope?.leftOuterJoinsValues ?? [];
        if (nestedLeftOuter.length > 0) {
          scope = scope.leftOuterJoins({ [sourceName]: nestedLeftOuter });
        }

        // scope.eager_loading? && order (rb:139-141): true here since we always
        // includes! the source above.
        const orderClauses: any[] = reflScope?.orderValues ?? [];
        if (orderClauses.length > 0) {
          scope.orderValues = [...scope.orderValues, ...orderClauses];
        }
      }
    }

    // cascade_strict_loading: a strict-loading preload scope propagates to the
    // through query so intermediate records inherit the constraint (rb:145).
    return this.cascadeStrictLoading(scope);
  }

  private get throughReflection(): AssociationLikeReflection | null {
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

  private get sourceReflection(): AssociationLikeReflection | null {
    const refl = (this.reflection as any).sourceReflection;
    if (refl && refl !== this.reflection) return refl;

    const throughRefl = this.throughReflection;
    if (!throughRefl) return null;
    const model = (this.reflection as any).activeRecord;
    const assocDef = model?._associations?.find((a: any) => a.name === this.reflection.name);
    // `source_reflection_names` (reflection.rb:1108-1110) is the candidate list
    // Rails scans. Unlike `source_reflection_name` it never touches
    // `through_reflection.klass`, so it cannot raise NameError while the model
    // registry is still filling — which is what this whole fallback exists for.
    const sourceNames: string[] = assocDef?.options?.source
      ? [assocDef.options.source as string]
      : ((this.reflection as any).sourceReflectionNames?.() ?? []);
    if (sourceNames.length > 0) {
      let throughKlass: typeof Base | null = null;
      try {
        throughKlass = throughRefl.klass;
      } catch {
        // klass resolution may fail for polymorphic reflections
      }
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

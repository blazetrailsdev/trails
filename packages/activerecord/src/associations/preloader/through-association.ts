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
  private _reflectionWherePartition:
    | { throughPredicates: Nodes.Node[]; sourcePredicates: Nodes.Node[]; sourceScope: any }
    | undefined;

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

    // Apply the per-owner reflection scope to source record loading so
    // instance-dependent scopes filter the final target (e.g. only comments
    // mentioning the owner). Merge the user-supplied preload scope on top so
    // it is not silently dropped when _reflectionScope is set. Predicates that
    // reference the THROUGH table are stripped here and applied to the through
    // query instead (see _buildThroughScope / _partitionReflectionWhere).
    let sourceScope = this._partitionReflectionWhere().sourceScope;
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

    // Carry the through reflection's own scope `annotate(...)` comments onto the
    // through query. Mirrors Rails' through_scope, which reads
    // `reflection_scope.values[:annotate]` before applying source_type
    // (preloader/through_association.rb). Without this, custom SQL annotations
    // on the intermediate association are silently dropped.
    const reflScope = this._reflectionScope;
    const annotations: string[] = reflScope?._annotations ?? [];
    if (annotations.length > 0) {
      scope = scope.annotate(...annotations);
    }

    // source_type: filter through records by polymorphic type column
    if (options.sourceType) {
      const foreignType = (this.reflection as any).foreignType;
      if (foreignType) {
        scope = scope.where({ [foreignType]: options.sourceType });
      }
    } else {
      // Rails' `elsif !reflection_scope.where_clause.empty?` branch copies the
      // reflection scope's WHERE onto the through query and joins/includes the
      // source reflection so source-table columns resolve there too
      // (through_association.rb:117-129). We approximate that per-predicate.
      const { throughPredicates, sourcePredicates } = this._partitionReflectionWhere();
      const throughTable = this._throughTableName();
      const sourceTable = this._sourceTableName();
      const isCollection = (this.reflection as any).isCollection?.() ?? false;

      if (isCollection) {
        // has_many through: it collects every matching target at the source stage,
        // so the through query only needs the through-table predicates to select
        // intermediate rows. Source/target predicates stay at the source-preloader
        // stage (see `_getSourcePreloaders`); adding a source join here would only
        // risk fanning out through rows.
        if (throughPredicates.length > 0) {
          scope._whereClause = new WhereClause([
            ...scope._whereClause.predicates,
            ...throughPredicates,
          ]);
        }
      } else {
        // has_one through: the through preloader materializes only the FIRST
        // through record per owner (Preloader::Association#load_records keeps one
        // row for a non-collection). A source-table condition deferred to the
        // source-preloader stage can then filter out that lone record's target,
        // nilling the has_one even though a different through record's target
        // would match — and which row is "first" depends on unstable PG/MariaDB
        // ordering. So we copy every reflection-scope predicate the through query
        // can resolve and add the source join when any of them needs it, so the
        // condition constrains which through row wins (Rails' through_scope).
        //
        // "Can resolve" = references no table beyond the through/source pair. A
        // predicate reaching a further (nested) table the scope joins via its own
        // `.joins` stays at the source-preloader stage, where the full reflection
        // scope (with those joins) is applied — pushing it here without the deeper
        // join would produce `no such column: <nested>.<col>`. This admits both
        // source-qualified and unqualified predicates, and mixed through/source
        // predicates (e.g. `memberships.favorite = ? OR clubs.name = ?`), which
        // land in the throughPredicates bucket but still need the source join.
        // Mirroring Rails' nested-join carry-over (through_association.rb:117-142)
        // is a separate convergence no current has_one-through scope exercises.
        const allowed = [throughTable, sourceTable].filter((t): t is string => t != null);
        const copyable = [...throughPredicates, ...sourcePredicates].filter(
          (pred) => !predicateReferencesForeignTable(pred, allowed),
        );
        if (copyable.length > 0) {
          // Rails' branch unconditionally includes!/references! the source
          // reflection whenever it copies the where_clause — the join is not
          // gated on any predicate referencing the source table. Add it whenever
          // we copy predicates so an UNQUALIFIED source condition (e.g.
          // `where("name = ?")`) resolves against the joined source rather than
          // binding to the through table. leftOuterJoins (not an inner join)
          // mirrors Rails' LEFT OUTER JOIN: it never drops a through row for a
          // null source, so a mixed OR predicate can still select a through row
          // via its through-table arm while the WHERE filters the source arm.
          const sourceRefl = this._sourceReflection;
          if (sourceRefl) scope = scope.leftOuterJoins(sourceRefl.name);
          scope._whereClause = new WhereClause([...scope._whereClause.predicates, ...copyable]);
        }
      }
    }

    // cascade_strict_loading: a strict-loading preload scope propagates to the
    // through query so intermediate records inherit the constraint
    // (preloader/through_association.rb:145, Association#cascade_strict_loading).
    return this._cascadeStrictLoading(scope);
  }

  /**
   * Split `_reflectionScope`'s WHERE predicates by referenced table: those that
   * reference the through table go onto the through query, the rest (source /
   * target table, unqualified) stay on the source preloader. Mirrors the intent
   * of Rails' `through_scope` `reflection_scope.where_clause` copy
   * (preloader/through_association.rb:117) without the single-query JOIN.
   * @internal
   */
  private _partitionReflectionWhere(): {
    throughPredicates: Nodes.Node[];
    sourcePredicates: Nodes.Node[];
    sourceScope: any;
  } {
    if (this._reflectionWherePartition !== undefined) return this._reflectionWherePartition;

    const reflScope = this._reflectionScope ?? null;
    let result: {
      throughPredicates: Nodes.Node[];
      sourcePredicates: Nodes.Node[];
      sourceScope: any;
    } = {
      throughPredicates: [],
      sourcePredicates: [],
      sourceScope: reflScope,
    };

    const wc = reflScope?._whereClause;
    const throughTable = this._throughTableName();
    if (reflScope != null && wc != null && !wc.isEmpty()) {
      const throughPredicates: Nodes.Node[] = [];
      const sourcePredicates: Nodes.Node[] = [];
      for (const pred of wc.predicates) {
        if (throughTable != null && predicateReferencesTable(pred, throughTable))
          throughPredicates.push(pred);
        else sourcePredicates.push(pred);
      }
      // Only re-scope the source preloader when a through predicate is peeled off
      // — otherwise leave the full reflection scope so the source stage keeps
      // applying every (source-table) condition exactly as before.
      let sourceScope = reflScope;
      if (throughPredicates.length > 0) {
        sourceScope = reflScope._clone();
        sourceScope._whereClause = new WhereClause(sourcePredicates);
      }
      result = { throughPredicates, sourcePredicates, sourceScope };
    }

    this._reflectionWherePartition = result;
    return result;
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

  /** @internal */
  private _sourceTableName(): string | null {
    const sourceRefl = this._sourceReflection;
    if (!sourceRefl) return null;
    try {
      return (sourceRefl.klass as any)?.tableName ?? null;
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
 * True when any attribute in `node` references `tableName`. Used to route a
 * reflection-scope predicate to either the through query or the source query.
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
  // Raw-SQL predicates (e.g. `where("memberships.favorite = ?", true)`) carry no
  // Arel Attribute nodes, so `fetchAttribute` never visits them. Inspect the raw
  // SQL text for a `<table>.` reference so a string condition on the through
  // table is relocated to the through query just like a hash/Arel condition.
  if (!found && rawSqlReferencesTable(node, tableName)) {
    found = true;
  }
  return found;
}

/**
 * True when a raw-SQL predicate node's text qualifies a column with `tableName.`.
 * Handles SqlLiteral / BoundSqlLiteral and a single Grouping wrapper.
 *
 * Heuristic: this scans the raw SQL for a `<table>.` qualifier token; it does
 * NOT parse the SQL, so a qualifier appearing inside a string literal (e.g.
 * `where("note = 'see memberships.x'")`) would be a false positive and relocate
 * a source-table predicate onto the through query. No current scope hits this;
 * raw-SQL through conditions are simple table-qualified comparisons. Arel/hash
 * predicates take the precise `fetchAttribute` path above and never reach here.
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
  const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\w.])${escaped}\\.`).test(sql);
}

/**
 * True when `node` qualifies a column with some table NOT in `allowedTables`.
 * Used to decide whether a reflection-scope predicate can ride the has_one-through
 * query, which selects the through table and joins the immediate source: a
 * predicate qualifying only those (or unqualified) is safe (return false), but one
 * reaching a further nested table the through query never joins is not (true).
 *
 * Uses the same Arel `fetchAttribute` walk as `predicateReferencesTable` for
 * precise hash/Arel conditions, and the same raw-SQL qualifier scan as
 * `rawSqlReferencesTable` — extracting every `<word>.` qualifier and flagging any
 * not in `allowedTables`. The raw-SQL scan is a heuristic (a qualifier inside a
 * string literal would be a false positive); no current scope hits that, and hash
 * predicates take the exact Arel path.
 * @internal
 */
function predicateReferencesForeignTable(node: any, allowedTables: string[]): boolean {
  const allowed = new Set(allowedTables);
  let foreign = false;
  node.fetchAttribute?.((attr: any) => {
    if (attr instanceof Nodes.Attribute && !allowed.has(relationName(attr.relation.name))) {
      foreign = true;
      return false;
    }
    return true;
  });
  if (foreign) return true;
  if (node instanceof Nodes.Not) {
    return predicateReferencesForeignTable((node as any).expr, allowedTables);
  }
  return rawSqlReferencesForeignTable(node, allowed);
}

/**
 * True when a raw-SQL predicate node's text qualifies a column with any table
 * not in `allowed`. Mirrors `rawSqlReferencesTable`'s node unwrapping.
 * @internal
 */
function rawSqlReferencesForeignTable(node: any, allowed: Set<string>): boolean {
  if (node instanceof Nodes.Grouping) {
    return rawSqlReferencesForeignTable((node as any).expr, allowed);
  }
  let sql: string | undefined;
  if (node instanceof Nodes.BoundSqlLiteral) sql = (node as any).sqlWithPlaceholders;
  else if (node instanceof Nodes.SqlLiteral) sql = (node as any).value;
  if (typeof sql !== "string") return false;
  const qualifierRe = /(^|[^\w.])(\w+)\s*\./g;
  let match: RegExpExecArray | null;
  while ((match = qualifierRe.exec(sql)) !== null) {
    if (!allowed.has(match[2])) return true;
  }
  return false;
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

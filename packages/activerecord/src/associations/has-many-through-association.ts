import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import { association, _buildAssociationInstance } from "./instance-methods.js";
import { HasManyAssociation } from "./has-many-association.js";
import { underscore, singularize, pluralize, camelize, isBlank } from "@blazetrails/activesupport";
import {
  resolveAssocClass,
  association as collectionProxyFor,
  applyAssociationScope,
  _hmtNotFound,
  _canRouteThroughViaDisableJoinsAssociationScope,
  _loadThroughViaDisableJoinsScope,
} from "../associations.js";
import {
  ThroughAssociation,
  sourceReflection,
  staleStateImpl as throughStaleState,
  throughBuildRecord,
  throughTargetScope,
} from "./through-association.js";
import { associationKeysEqual } from "./key-normalization.js";
import { isThenable } from "./collection-association.js";
import { runAllCallbacks } from "@blazetrails/activemodel";

function safeKlass(refl: { klass?: unknown } | null | undefined): any {
  try {
    return refl?.klass ?? null;
  } catch {
    return null;
  }
}

/**
 * Mirrors: ActiveRecord::Associations::HasManyThroughAssociation
 */
export class HasManyThroughAssociation extends HasManyAssociation {
  constructor(owner: Base, definition: AssociationDefinition) {
    super(owner, definition);
  }

  /**
   * Rails' ThroughAssociation / HasManyThroughAssociation instance methods,
   * installed onto the prototype at the bottom of this file (the trails mixin
   * idiom) so each is called on `this` with Rails' own argument list.
   *
   * @internal
   */
  declare buildThroughRecord: (record: Base) => Base | null;
  /** @internal */
  declare throughScope: () => unknown;
  /** @internal */
  declare throughScopeAttributes: () => Record<string, unknown>;
  /** @internal */
  declare saveThroughRecord: (record: Base) => Promise<boolean>;
  /** @internal */
  declare throughRecordsFor: (record: Base) => Base[];
  /** @internal */
  declare deleteThroughRecords: (records: Base[]) => void;
  /** @internal */
  declare throughReflection: () => unknown;
  /** @internal */
  declare throughAssociation: () => unknown;
  /** @internal */
  declare constructJoinAttributes: (...records: Base[]) => Record<string, unknown>;
  /** @internal */
  declare ensureMutable: () => void;
  /** @internal */
  declare ensureNotNested: () => void;

  /**
   * Mirrors: ActiveRecord::Associations::HasManyThroughAssociation#find_target
   * (has_many_through_association.rb:225) — reads owner and reflection off
   * `this`, exactly as Rails does, and delegates the query itself to
   * `HasManyAssociation#findTarget` (Rails' `super`).
   *
   * `target_reflection_has_associated_record?` gates every arm, as it does in
   * Rails (`return [] unless ...`, :227) — including the JOIN-routable one,
   * which the flat loader used to reach without it.
   *
   * Rails' `return scope.to_a if disable_joins` is trails'
   * `_loadThroughViaDisableJoinsScope`: `scope()`'s own `disable_joins` branch
   * (association.rb:302) builds the DisableJoinsAssociationScope relation, and
   * that loader is what runs it. The routing predicate stays the single one
   * `HasManyAssociation`'s loader consults, so the branch here and the branch
   * there agree by construction rather than by two copies of the gate.
   *
   * The `_queryExecutor` arm is a diverged CollectionProxy running its own
   * mutated Relation, which the through routing would discard —
   * `HasManyAssociation#findTarget` is where that executor is honored.
   */
  protected override async findTarget(): Promise<Base[]> {
    if (this._queryExecutor) return super.findTarget();
    if (!this.targetReflectionHasAssociatedRecord()) return [];
    const reflection = (this.owner.constructor as typeof Base)._reflectOnAssociation?.(
      this.reflection.name,
    );
    if (_canRouteThroughViaDisableJoinsAssociationScope(reflection, this.reflection.options)) {
      return _loadThroughViaDisableJoinsScope(this.owner, reflection, this.reflection.options);
    }
    return super.findTarget();
  }

  /**
   * trails' two-step through loader: the through step is loaded first and its
   * records drive a second query, for the shapes AssociationScope cannot build
   * a single JOIN for. Rails has no counterpart — its `find_target` is always
   * `scope.to_a` — so this is not `find_target` itself but the arm
   * `HasManyAssociation#findTarget` routes to when
   * `_routeThroughViaAssociationScope` says no.
   * @internal
   */
  protected loadHasManyThrough(): Promise<Base[]> {
    return loadHasManyThrough(this.owner, this.reflection.name, this.reflection);
  }

  /**
   * Mirrors: HasManyThroughAssociation#target_reflection_has_associated_record?
   * (has_many_through_association.rb:121).
   */
  protected targetReflectionHasAssociatedRecord(): boolean {
    const associations: AssociationDefinition[] =
      (this.owner.constructor as typeof Base)._associations ?? [];
    const throughAssoc = associations.find((a) => a.name === this.reflection.options.through);
    // A missing through reflection is Rails' `check_validity!` failure, not
    // this predicate's: leave it to the loader below, which raises
    // HasManyThroughAssociationNotFoundError with the Rails message.
    if (!throughAssoc) return true;
    return targetReflectionHasAssociatedRecord(this.owner, throughAssoc);
  }

  /**
   * Multiset difference: each occurrence of a record in `b` cancels at most one
   * occurrence in `a`, so `[person, person] - [person]` keeps one `person` and
   * the replace path creates the second join row.
   *
   * Mirrors: ActiveRecord::Associations::HasManyThroughAssociation#difference
   */
  protected override difference(a: Base[], b: Base[]): Base[] {
    const distribution = this.distribution(b);
    return a.filter((record) => !this.markOccurrence(distribution, record));
  }

  /**
   * Multiset intersection — the `select` counterpart of {@link difference}.
   *
   * Mirrors: ActiveRecord::Associations::HasManyThroughAssociation#intersection
   */
  protected override intersection(a: Base[], b: Base[]): Base[] {
    const distribution = this.distribution(b);
    return a.filter((record) => this.markOccurrence(distribution, record));
  }

  /**
   * Mirrors: ActiveRecord::Associations::HasManyThroughAssociation#mark_occurrence
   * (has_many_through_association.rb:189-191).
   */
  protected markOccurrence(distribution: Occurrences, record: Base): boolean {
    return markOccurrence(distribution, record);
  }

  /**
   * Mirrors: ActiveRecord::Associations::HasManyThroughAssociation#distribution
   * (has_many_through_association.rb:193-197).
   */
  protected distribution(array: Base[]): Occurrences {
    return distribution(array);
  }

  /**
   * Mirrors Rails' `delegate :source_reflection, to: :reflection`
   * (ThroughAssociation, mixed into HasManyThroughAssociation).
   */
  sourceReflection(): unknown {
    return sourceReflection(this);
  }

  /**
   * Mirrors Rails' `HasManyThroughAssociation#concat_records`
   * (has_many_through_association.rb:37-49):
   *
   *   ensure_not_nested
   *   records = super(records, true)
   *   if owner.new_record? && records
   *     records.flatten.each { |record| build_through_record(record) }
   *   end
   *   records
   *
   * When the owner is unsaved, `super` only adds the targets to the in-memory
   * collection (no INSERT). Pre-building the through rows here primes the
   * `@through_records` cache so the owner's `after_create` autosave creates
   * the join rows alongside the owner.
   * @internal
   */
  protected override concatRecords(records: Base[], _raise = false): Promise<Base[]> | Base[] {
    this.ensureNotNested();
    const concatenated = super.concatRecords(records, true);
    const buildThroughRecords = (added: Base[]): Base[] => {
      if (this.owner.isNewRecord() && added) {
        for (const record of added.flat()) {
          this.buildThroughRecord(record);
        }
      }
      return added;
    };
    return isThenable(concatenated)
      ? concatenated.then(buildThroughRecords)
      : buildThroughRecords(concatenated);
  }

  /**
   * Mirrors Rails' `ThroughAssociation#target_scope` override.
   * @internal
   */
  protected override targetScope(): unknown {
    return throughTargetScope(this, super["targetScope"]());
  }

  protected override staleState(): unknown {
    const vals = throughStaleState(this);
    if (!vals) return null;
    return vals.length === 1 ? vals[0] : JSON.stringify(vals);
  }

  /**
   * Resolve the record's key by the association's `association_primary_key`
   * (for a through reflection this delegates to
   * `sourceReflection.associationPrimaryKey`, `reflection.ts:1723-1724`), not
   * the target model's own `klass.primaryKey`. Converges the delete/find
   * comparison paths in `CollectionAssociation` onto the same resolution
   * `idsReader` uses via the shared `associationPrimaryKey()` helper, so a
   * composite (array) source PK compares by every source-key column instead of
   * falling back to the target model's PK.
   */
  protected override primaryKeyValue(record: Base): unknown {
    const pk = this.associationPrimaryKey();
    const read = (key: string) =>
      typeof (record as any)._readAttribute === "function"
        ? (record as any)._readAttribute(key)
        : (record as any)[key];
    return Array.isArray(pk) ? pk.map(read) : read(pk);
  }

  /**
   * Mirrors Rails' HasManyThroughAssociation#insert_record
   * (has_many_through_association.rb:24-34):
   *
   *   ensure_not_nested
   *   if record.new_record? || record.has_changes_to_save?
   *     return unless super
   *   end
   *   save_through_record(record)
   *   record
   *
   * Saves the target via `super` (HasManyAssociation#insertRecord — which
   * no-ops setOwnerAttributes for through and just calls `record.save`),
   * then creates/saves the join row via the through association.
   */
  override async insertRecord(
    record: Base,
    validate = true,
    raise = false,
    block?: (record: Base) => void,
  ): Promise<boolean> {
    this.ensureNotNested();
    const needsTargetSave = record.isNewRecord() || record.hasChangesToSave;
    if (needsTargetSave) {
      const saved = await super.insertRecord(record, validate, raise, block);
      if (!saved) return false;
    }
    return this.saveThroughRecord(record);
  }

  /**
   * Mirrors Rails' HasManyThroughAssociation#build_record
   * (has_many_through_association.rb:90-114):
   *
   *   ensure_not_nested
   *   @through_scope = scope
   *   record = super
   *   inverse = source_reflection.polymorphic? ?
   *     source_reflection.polymorphic_inverse_of(record.class) :
   *     source_reflection.inverse_of
   *   if inverse
   *     if inverse.collection?
   *       record.send(inverse.name) << build_through_record(record)
   *     elsif inverse.has_one?
   *       record.send("#{inverse.name}=", build_through_record(record))
   *     end
   *   end
   *   record
   * ensure
   *   @through_scope = nil
   *
   * Builds the target via `super`, then — when the source reflection has an
   * inverse on the built record's class — pre-builds the through join row and
   * wires it onto that inverse so the join is created alongside the target.
   *
   * @internal
   */
  override buildRecord(
    attributes?: Record<string, unknown>,
    block?: (record: Base) => void,
  ): Base | null {
    this.ensureNotNested();
    // Rails captures `scope` here inside the caller's `scoping` block, so a
    // scoped build (`post.people.where(readers: { skimmer: true }).create`)
    // sees the relation's values. trails carries that relation on the owner's
    // proxy as `_pendingThroughScope` (association-relation.ts:153) instead of
    // a current-scope stack, so prefer it when one is in flight.
    const pendingThroughScope = (
      this.owner._collectionProxies.get(this.reflection.name) as
        | { _pendingThroughScope?: unknown }
        | undefined
    )?._pendingThroughScope;
    (this as HasManyThroughAssociation & { _throughScope?: unknown })._throughScope =
      pendingThroughScope ?? (this as unknown as { scope?: () => unknown }).scope?.();
    try {
      // Rails' `super` here lands in `ThroughAssociation#build_record`
      // (through_association.rb:116-129) before `Association#build_record`;
      // trails has no module in the prototype chain, so the through half runs
      // explicitly.
      throughBuildRecord(this, (attributes ??= {}));
      const record = super.buildRecord(attributes, block);
      if (!record) return record;
      const built = buildThroughInverseFor(
        this.owner,
        this.reflection,
        record,
        (this as HasManyThroughAssociation & { _throughScope?: unknown })._throughScope,
      );
      if (built) {
        const inverseAssoc = (
          record as unknown as { association?: (n: string) => any }
        ).association?.(built.inverseName);
        if (inverseAssoc) {
          if (built.isCollection) {
            inverseAssoc.addToTarget?.(built.throughRecord);
          } else if (built.isHasOne) {
            if (typeof inverseAssoc.syncWrite === "function") {
              inverseAssoc.syncWrite(built.throughRecord);
            } else {
              inverseAssoc.target = built.throughRecord;
            }
            inverseAssoc.setInverseInstance?.(built.throughRecord);
          } else if (typeof inverseAssoc.writer === "function") {
            // Rails' build_record covers only the collection and has_one
            // inverses (has_many_through_association.rb:101-107); a belongs_to
            // source inverse gets its foreign key from the through scope in
            // `initialize_attributes`. trails' through scope does not carry it
            // yet, so the writer stands in — tracked as through-scope debt.
            inverseAssoc.writer(built.throughRecord);
          }
        }
      }
      return record;
    } finally {
      (this as HasManyThroughAssociation & { _throughScope?: unknown })._throughScope = null;
    }
  }

  /**
   * Mirrors Rails' `HasManyThroughAssociation#invertible_for?`
   * (has_many_through_association.rb:232-234): through associations never wire
   * an inverse via `inverse_association_for` ("NOTE - not sure that we can
   * actually cope with inverses here"). The join-row inverse wiring HMT does
   * need happens in `buildRecord` via `buildThroughInverseFor`, not here.
   * @internal
   */
  protected override isInvertibleFor(_record: Base): boolean {
    return false;
  }

  /**
   * Mirrors Rails' `HasManyThroughAssociation#remove_records`
   * (has_many_through_association.rb:116-119): generic removal via `super`,
   * then drop the matching join rows from the through target.
   * @internal
   */
  protected override removeRecords(
    existingRecords: Base[],
    records: Base[],
    method: string,
  ): Promise<boolean> | boolean {
    // Rails HMT#remove_records (has_many_through_association.rb:116-118) is
    // `super; delete_through_records(records)` — the method result is
    // `delete_through_records`'s `records.each` (a truthy array), NOT super's
    // return. So a `before_remove` abort inside super (whose `catch(:abort) … ||
    // return` still skips the join-row DELETE in delete_records) does NOT
    // propagate the nil/false the base method uses: the through delete/destroy
    // returns the records on abort, not nil. Discard super's boolean and report
    // truthy so deleteOrDestroy hands back `resolved`; the empty-args guard is
    // the only through path that yields nil.
    const removed = super.removeRecords(existingRecords, records, method);
    if (isThenable(removed)) {
      return removed.then(() => {
        this.deleteThroughRecords(records);
        return true;
      });
    }
    this.deleteThroughRecords(records);
    return true;
  }

  /**
   * Mirrors Rails' `HasManyThroughAssociation#delete_records`
   * (has_many_through_association.rb:140-175): scope the through association to
   * the join rows pairing `owner` with `records`, then destroy/nullify/delete
   * per `method`, and prune the in-memory through target.
   * @internal
   */
  protected override async deleteRecords(records: Base[], method: string): Promise<number> {
    this.ensureNotNested();
    const throughName = this.reflection.options.through;
    const owner = this.owner as unknown as { association?: (n: string) => any };
    const throughAssoc = throughName ? (owner.association?.(throughName) ?? null) : null;
    if (!throughAssoc) return 0;

    let scope: any = throughAssoc.scope();
    scope = scope.where(this.constructJoinAttributes(...records));
    const extra = this.throughScopeAttributes();
    if (Object.keys(extra).length > 0) scope = scope.where(extra);

    // Dispatch on `method` exactly as Rails' `delete_records` case statement:
    // `:destroy` destroys the join rows (or, on a PK-less join model, runs their
    // destroy callbacks then bulk-deletes); `:nullify` nulls the source FK;
    // otherwise (`:delete_all`/canonical `"delete"`) a bulk delete WITHOUT
    // callbacks. The prior code keyed the destroy path off the join model's PK
    // instead of `method`, so `dependent: :delete_all` wrongly fired the join
    // model's destroy callbacks.
    let count = 0;
    if (method === "destroy") {
      if ((scope.model as typeof Base | undefined)?.primaryKey) {
        const destroyed = (await scope.destroyAll()) as Base[];
        count = destroyed.filter((r) => (r as any).isDestroyed?.()).length;
      } else {
        // Rails' no-PK `:destroy` branch (has_many_through_association.rb:152):
        // `scope.each(&:_run_destroy_callbacks)` runs each join row's
        // before/after_destroy callbacks (no row delete) before the bulk
        // `delete_all`, which removes them by matching all non-PK FK columns.
        const recs = (await scope.toArray()) as Base[];
        for (const r of recs) {
          await runAllCallbacks((r.constructor as typeof Base).prototype, "destroy", r as any);
        }
        count = await scope.deleteAll();
      }
    } else if (method === "nullify") {
      count = await scope.updateAll({ [sourceForeignKey(this)]: null });
    } else {
      count = await scope.deleteAll();
    }

    this.deleteThroughRecords(records);

    // Rails' counter-cache tail (has_many_through_association.rb:159-173). Kept
    // inline (rather than in a helper) so the ported `delete_records` body makes
    // the same calls Rails' does — `decrement_counter`, `map`,
    // `update_through_counter?` — for the parity:api call-set ratchet.
    const ctor = this.owner.constructor as {
      _reflectOnAssociation?: (n: string) => RichCounterReflection | undefined;
    };
    const ownRefl = ctor._reflectOnAssociation?.(this.reflection.name);

    // Rails (159-162): when the SOURCE belongs_to (on the join model) declares
    // its own counter_cache, `klass.decrement_counter` on the target rows by id
    // for every method except `:destroy` (whose per-record callbacks handle it).
    // `klass` is the ASSOCIATION's klass (the target model), not the source
    // reflection's — a polymorphic source belongs_to has none, and taggings'
    // `taggable` is exactly such a source. `safeKlass` stays defensive
    // (a polymorphic source has no klass at all).
    const sourceRefl = (ownRefl as { sourceReflection?: SourceCounterReflection } | undefined)
      ?.sourceReflection;
    if (method !== "destroy" && sourceRefl?.options?.counterCache) {
      const counter = sourceRefl.counterCacheColumn?.();
      const klass = safeKlass({ klass: this.klass }) as {
        decrementCounter?: (col: string, ids: unknown) => Promise<unknown>;
      } | null;
      if (typeof counter === "string" && klass?.decrementCounter) {
        await klass.decrementCounter(
          counter,
          records.map((record) => (record as any).id),
        );
      }
    }

    // Rails (169-173): `update_counter(-count, through_reflection)` when the
    // through reflection is a collection and `update_through_counter?` allows,
    // else `update_counter(-count)` on this association's OWN reflection (Rails'
    // `update_counter` defaults its reflection arg to `reflection()`, the
    // has_many :through reflection itself — NOT `source_reflection`). A `:destroy`
    // whose join belongs_to already maintains a counter (taggings' `tags_count`)
    // falls to the own branch, so a distinct own counter (`tags_with_destroy_count`)
    // still decrements.
    if (count > 0) {
      const throughReflection = this.throughReflection() as
        | (AssociationDefinition & RichCounterReflection)
        | null;
      if (throughReflection?.isCollection?.() && updateThroughCounter.call(this, method)) {
        await this.updateCounter(-count, throughReflection);
      } else {
        await this.updateCounter(-count);
      }
    }

    return count;
  }

  /**
   * Mirrors Rails' `HasManyThroughAssociation#delete_or_nullify_all_records`
   * (has_many_through_association.rb:136-138): `delete_records(load_target,
   * method)`. Routes the `delete_all` dispatch through join-row deletion (with
   * the counter-cache callbacks that `deleteRecords` fires) instead of the base
   * bulk `scope.deleteAll`, which can't reach the join table.
   * @internal
   */
  protected override async deleteOrNullifyAllRecords(method?: string): Promise<number> {
    return this.deleteRecords(await this.loadTarget(), method ?? "");
  }
}

/**
 * Resolve the source reflection's foreign key — the join-table column that
 * points at the target — for `nullify` updates.
 *
 * @internal
 */
function sourceForeignKey(assoc: HasManyThroughAssociation): string {
  const ctor = assoc.owner.constructor as { _reflectOnAssociation?: (n: string) => any };
  const refl = ctor._reflectOnAssociation?.(assoc.reflection.name);
  const sourceRefl = refl?.sourceReflection;
  return sourceRefl?.foreignKey ?? `${underscore(singularize(assoc.reflection.name))}_id`;
}

/** Source belongs_to surface the `delete_records` counter tail reads. @internal */
interface SourceCounterReflection {
  options?: { counterCache?: unknown };
  counterCacheColumn?: () => string | null;
  klass?: unknown;
}

/** The pre-built join row and the source reflection's inverse it wires to. */
export interface BuiltThroughInverse {
  inverseName: string;
  isCollection: boolean;
  isHasOne: boolean;
  throughRecord: Base;
}

/**
 * Mirrors the inverse half of Rails'
 * `HasManyThroughAssociation#build_record` (has_many_through_association.rb:96-109):
 * resolve the source reflection's inverse and pre-build the through join row
 * that pairs `record` with `owner`. Returns null when there's no inverse to
 * wire (matching Rails, which only touches the join when `inverse` is set).
 *
 * Lives here (not in collection-proxy) so the join-building logic stays in the
 * Rails-mirroring file; the proxy's `build` path calls in via this helper.
 *
 * @internal
 */
export function buildThroughInverseFor(
  owner: Base,
  reflection: AssociationDefinition,
  record: Base,
  throughScope?: unknown,
): BuiltThroughInverse | null {
  const assoc = {
    owner,
    reflection,
    _throughScope: throughScope,
    ...throughAssociationMethods,
  } as unknown as HasManyThroughAssociation;
  const ctor = owner.constructor as { _reflectOnAssociation?: (n: string) => any };
  const refl = ctor._reflectOnAssociation?.(reflection.name);
  const sourceRefl = refl?.sourceReflection;
  if (!sourceRefl) return null;

  const inverse = sourceRefl.isPolymorphic?.()
    ? sourceRefl.polymorphicInverseOf?.(record.constructor as any)
    : sourceRefl.inverseOf?.();
  if (!inverse?.name) return null;

  const throughRecord = assoc.buildThroughRecord(record);
  if (!throughRecord) return null;

  return {
    inverseName: inverse.name,
    isCollection: !!inverse.isCollection?.(),
    isHasOne: !!inverse.isHasOne?.(),
    throughRecord,
  };
}

/**
 * Mirrors Rails' `HasManyThroughAssociation#build_through_record`
 * (has_many_through_association.rb:51-66):
 *
 *   @through_records[record] ||= begin
 *     ensure_mutable
 *     attributes = through_scope_attributes
 *     attributes[source_reflection.name] = record
 *     through_association.build(attributes).tap { ... source_type ... }
 *   end
 *
 * The join row is cached by target-record identity so the same instance is
 * reused across build → concat → insert. Crucially it sets the source
 * reflection's *association* (`source_reflection.name`) to `record` rather
 * than freezing the FK value, so the join's `belongsTo` autosave follows the
 * target's primary key when both are saved together.
 * @internal
 */
function buildThroughRecord(this: HasManyThroughAssociation, record: Base): Base | null {
  const cache = throughRecordsCache(this);
  const cached = cache.get(record);
  if (cached) return cached;

  const ctor = this.owner.constructor as { _reflectOnAssociation?: (n: string) => any };
  const refl = ctor._reflectOnAssociation?.(this.reflection.name);
  const sourceRefl = refl?.sourceReflection;
  const proxy = throughProxy(this);
  if (!proxy || typeof proxy.build !== "function" || !sourceRefl?.name) return null;

  // When the through is a singular (has_one/belongs_to) association that's already
  // loaded, reuse the existing through record. For singular throughs there is only
  // one possible join row, so the loaded target is always the right one — building
  // a fresh record would wire FK on the new target to null instead of the real PK.
  const existingTarget = proxy.loaded ? proxy.target : undefined;
  if (existingTarget && !Array.isArray(existingTarget)) {
    cache.set(record, existingTarget);
    return existingTarget;
  }

  const attributes = this.throughScopeAttributes();
  if (sourceRefl?.isBelongsTo?.() ?? sourceRefl?.macro === "belongsTo") {
    attributes[sourceRefl.name] = record;
  }
  const newRecord = proxy.build(attributes);
  if (this.reflection.options.sourceType && sourceRefl.foreignType) {
    (newRecord as any).writeAttribute?.(sourceRefl.foreignType, this.reflection.options.sourceType);
  }
  cache.set(record, newRecord);
  return newRecord;
}

/** @internal */
function throughScope(this: HasManyThroughAssociation): unknown {
  // through_scope is set externally by the association's concat/insert path.
  // Return the memoized scope if it was set; otherwise null.
  return (this as any)._throughScope ?? null;
}

/** @internal */
function throughScopeAttributes(this: HasManyThroughAssociation): Record<string, unknown> {
  // Extract WHERE conditions from the through scope for the through model's table.
  const throughName = this.reflection.options.through;
  if (!throughName) return {};
  const throughAssoc = (this.owner as any).association?.(throughName);
  if (!throughAssoc) return {};
  // Rails: `scope = through_scope || self.scope` (hmt:72). The `_throughScope`
  // ivar is set during `buildRecord` (hmt:93) and cleared after; consult it
  // first so a record built within that window picks up the scope captured at
  // build time, then fall back to `self.scope` (the HMT relation). Both are
  // JOIN-aware; `scope()` builds a JOIN-based WHERE that correctly targets the
  // join table FK. The last fallback to the through association's own `scope()`
  // covers the lightweight `{ owner, reflection }` stand-in used by
  // `buildThroughInverseFor` (called from `buildRecord` and
  // `CollectionProxy._buildThrough`). `whereValuesHash(throughTable)` below
  // filters the equality predicates to the through model's table, so
  // target-table predicates carried by any of these relations are dropped
  // rather than leaking into the join row / delete query.
  const scope: any = this.throughScope() ?? (this as any).scope?.() ?? throughAssoc.scope?.();
  if (!scope || typeof scope.whereValuesHash !== "function") return {};
  const throughTable = throughAssoc.klass?.tableName ?? "";
  const attrs = scope.whereValuesHash(throughTable) as Record<string, unknown>;
  // Exclude the FK columns and the STI inheritance column.
  const throughFk = throughAssoc.reflection?.options?.foreignKey ?? "";
  const inheritanceCol = throughAssoc.klass?.inheritanceColumn ?? "type";
  for (const key of [String(throughFk), inheritanceCol]) {
    if (key in attrs) delete attrs[key];
  }
  return attrs;
}

/** @internal */
async function saveThroughRecord(this: HasManyThroughAssociation, record: Base): Promise<boolean> {
  // `build_through_record` constructs the join row synchronously, so the join
  // model's attribute definitions have to be in place first. Ruby reflects
  // columns lazily on first access; trails' reflection is async, and a join
  // model on a secondary connection (HABTM "alternate database") has not been
  // reflected by the time we get here — assigning its FK would raise
  // UnknownAttributeError. No Rails counterpart; purely the async-schema seam.
  const throughKlass = safeKlass(this.throughReflection() as { klass?: unknown } | null);
  if (typeof throughKlass?.ensureSchemaLoaded === "function") {
    await throughKlass.ensureSchemaLoaded();
  }
  try {
    const joinRecord = this.buildThroughRecord(record);
    if (!joinRecord) return true;
    if (!joinRecord.changed) return true;
    await (joinRecord as any).saveBang();
    return true;
  } finally {
    throughRecordsCache(this).delete(record);
  }
}

/**
 * The per-record cache of pre-built through join rows, keyed by target-record
 * identity. Mirrors Rails' `@through_records = {}.compare_by_identity`: a row
 * built during `build_record`/`concat_records` is reused by the subsequent
 * `insert_record`, then evicted once saved.
 *
 * Stored on the owner (keyed by reflection name) rather than the association
 * instance because the build path threads a synthetic `{ owner, reflection }`
 * stand-in through `buildThroughInverseFor`, while save/insert run on the live
 * instance — both must observe the same map.
 *
 * @internal
 */
function throughRecordsCache(assoc: HasManyThroughAssociation): Map<Base, Base> {
  const owner = assoc.owner as unknown as {
    _throughRecordsCaches?: Map<string, Map<Base, Base>>;
  };
  const store = (owner._throughRecordsCaches ??= new Map<string, Map<Base, Base>>());
  let cache = store.get(assoc.reflection.name);
  if (!cache) {
    cache = new Map<Base, Base>();
    store.set(assoc.reflection.name, cache);
  }
  return cache;
}

/** @internal */
function isTargetReflectionHasAssociatedRecord(assoc: HasManyThroughAssociation): boolean {
  const throughRefl = assoc.reflection.options.through;
  if (!throughRefl) return false;
  const throughAssoc = (assoc.owner as any).association?.(throughRefl);
  if (!throughAssoc) return false;
  const fk = throughAssoc.reflection?.foreignKey;
  if (!fk) return true;
  return !!(assoc.owner as any).readAttribute?.(fk as string);
}

/**
 * Rich reflection surface `delete_records` needs for its counter-cache tail.
 * @internal
 */
interface RichCounterReflection {
  isCollection?: () => boolean;
  hasCachedCounter?: () => boolean;
  counterCacheColumn?: () => string | null;
  isInverseUpdatesCounterCache?: () => unknown;
}

/**
 * Mirrors Rails' `HasManyThroughAssociation#update_through_counter?`: `:destroy`
 * updates the through counter only when the through belongs_to does NOT already
 * maintain it (else the destroy callback double-counts); `:nullify` never; any
 * other method always.
 * @internal
 */
function updateThroughCounter(this: HasManyThroughAssociation, method: string): boolean {
  const throughReflection = this.throughReflection() as RichCounterReflection | null;
  if (method === "destroy") return !throughReflection?.isInverseUpdatesCounterCache?.();
  if (method === "nullify") return false;
  return true;
}

/** @internal */
function throughRecordsFor(this: HasManyThroughAssociation, record: Base): Base[] {
  const throughName = this.reflection.options.through;
  if (!throughName) return [];
  const proxy = throughProxy(this);
  if (!proxy) return [];

  // Mirrors Rails `through_records_for`: filter the through target by
  // `construct_join_attributes(record)`, comparing each key with
  // `c.public_send(key) == value`. `construct_join_attributes` returns either a
  // `{ foreign_key => pk_value }` column map or (composite / single-PK branch)
  // a `{ source_reflection_name => record }` association map — the latter is how
  // an in-memory-built join row (whose FK is still nil until the target is
  // saved) is matched by the source *record*, not its yet-unset FK column.
  const joinAttrs = this.constructJoinAttributes(record);
  const candidates: Base[] = Array.isArray(proxy.target)
    ? proxy.target
    : proxy.target
      ? [proxy.target]
      : [];
  return candidates.filter((c) =>
    Object.entries(joinAttrs).every(([key, val]) => {
      // Rails' `c.public_send(key)`: an association-name key reads the join
      // row's association target (identity match on the built record), a column
      // key reads the attribute value.
      const joinRefl = (c.constructor as any)._reflectOnAssociation?.(key);
      if (joinRefl) {
        const target = (c as any).association?.(key)?.target;
        return Array.isArray(target) ? target.includes(val as Base) : target === val;
      }
      const actual =
        typeof (c as any).readAttribute === "function"
          ? (c as any).readAttribute(key)
          : (c as any)[key];
      // A BigInt PK (int8 default under PG bigserial) and a number FK of equal
      // value must match here as Ruby's `Integer ==` does.
      return associationKeysEqual(actual, val);
    }),
  );
}

/** @internal */
function deleteThroughRecords(this: HasManyThroughAssociation, records: Base[]): void {
  // Mirrors Rails `delete_through_records`: prune the matching join rows from
  // the through target, then evict the per-record `@through_records` cache so a
  // built-then-removed target is not re-associated when the owner is saved.
  const throughName = this.reflection.options.through;
  if (!throughName) return;
  const proxy = throughProxy(this);
  const cache = throughRecordsCache(this);
  if (!proxy) return;
  for (const record of records) {
    const toDelete = this.throughRecordsFor(record);
    if (Array.isArray(proxy.target)) {
      for (const r of toDelete) {
        const idx = proxy.target.indexOf(r);
        if (idx !== -1) proxy.target.splice(idx, 1);
      }
    } else if (toDelete.length > 0 && proxy.target === toDelete[0]) {
      (proxy as { target?: Base | null }).target = null;
    }
    cache.delete(record);
  }
}

/**
 * The occurrence buckets Ruby gets from `Hash.new(0)` keyed by the record.
 * @internal
 */
type Occurrences = Array<{ record: Base; count: number }>;

/**
 * `distribution` + `mark_occurrence` (has_many_through_association.rb:187-195)
 * as one occurrence counter. Ruby keys the hash by the record, hashing on
 * AR::Core `hash`/`eql?` (class + id), so the buckets are matched with the same
 * record equality rather than JS identity.
 * @internal
 */
function distribution(array: Base[]): Occurrences {
  const distribution: Occurrences = [];
  for (const record of array) {
    const bucket = distribution.find((b) => b.record.equals(record));
    if (bucket) bucket.count += 1;
    else distribution.push({ record, count: 1 });
  }
  return distribution;
}

/** @internal */
function markOccurrence(distribution: Occurrences, record: Base): boolean {
  const bucket = distribution.find((b) => b.record.equals(record));
  if (!bucket || bucket.count <= 0) return false;
  bucket.count -= 1;
  return true;
}

/**
 * The multiset diff of `HasManyThroughAssociation#difference` / `#intersection`
 * over the same `distribution`/`markOccurrence` pair those methods use, exposed
 * for the `CollectionProxy` replace path (see `setDifference`).
 * @internal
 */
export function multisetDifference(a: Base[], b: Base[]): Base[] {
  const buckets = distribution(b);
  return a.filter((record) => !markOccurrence(buckets, record));
}

/** @internal */
export function multisetIntersection(a: Base[], b: Base[]): Base[] {
  const buckets = distribution(b);
  return a.filter((record) => markOccurrence(buckets, record));
}

/**
 * The user-facing `CollectionProxy` for the join model — the *canonical*
 * in-memory target store for a has_many (RFC 0022: the `HasManyAssociation`
 * mirror in `_associationInstances` is a stale secondary copy). Through-record
 * build / include / delete must operate on this proxy so a join row built in
 * memory (before the owner is saved) is visible to `owner.readers.size()`,
 * autosave (`_loadedAssociation` prefers `proxy.target`), and the delete path
 * alike.
 *
 * @internal
 */
interface ThroughTargetStore {
  build?: (attrs: Record<string, unknown>) => Base;
  loaded?: boolean;
  target?: Base[] | Base | null;
}

function throughProxy(assoc: HasManyThroughAssociation): ThroughTargetStore | null {
  const tr = assoc.throughReflection() as {
    name?: string;
    isCollection?: () => boolean;
    macro?: string;
  } | null;
  if (!tr?.name) return null;
  const isCollection = tr.isCollection?.() ?? tr.macro === "hasMany";
  // A collection through (has_many) keeps its canonical in-memory target on the
  // user-facing CollectionProxy (RFC 0022); build / include / delete must use
  // it. A singular through (has_many :posts through: a belongs_to/has_one
  // :author) has no collection proxy — read the OO holder, exposing the same
  // `build`/`loaded`/`target` surface so the singular-reuse branch still fires.
  if (isCollection) {
    return collectionProxyFor(assoc.owner, tr.name) as unknown as ThroughTargetStore;
  }
  const oo = (assoc.owner as unknown as { association?: (n: string) => any }).association?.(
    tr.name,
  );
  if (!oo) return null;
  return {
    build: typeof oo.build === "function" ? oo.build.bind(oo) : undefined,
    get loaded() {
      return oo.isLoaded?.() ?? false;
    },
    get target() {
      return oo.target;
    },
    set target(v: Base[] | Base | null) {
      oo._writeTargetStore(v);
    },
  };
}

/**
 * Mirrors: HasManyThroughAssociation#target_reflection_has_associated_record?
 * (has_many_through_association.rb:121).
 *
 * @internal
 */
function targetReflectionHasAssociatedRecord(
  record: Base,
  throughAssoc: AssociationDefinition,
): boolean {
  if (throughAssoc.type !== "belongsTo") return true;
  const fk = throughAssoc.options.foreignKey ?? `${underscore(throughAssoc.name)}_id`;
  const columns = Array.isArray(fk) ? fk : [fk];
  return !columns.every((column) => isBlank(record._readAttribute(String(column))));
}

/**
 * Load a has_many target through a freshly built (uncached) holder. The
 * through steps below name an association whose options are *not* the declared
 * ones — a synthesised `sourceType` scope, or an owner that is a through
 * record rather than this association's owner — so they must not reuse (or
 * disturb) the owner's cached holder for that name.
 */
function findHasManyTarget(
  record: Base,
  assocName: string,
  assocDef: Pick<AssociationDefinition, "options" | "scope">,
): Promise<Base[]> {
  const assoc = _buildAssociationInstance.call(record, {
    name: assocName,
    type: "hasMany",
    scope: assocDef.scope,
    options: assocDef.options,
  });
  return (assoc as unknown as { findTarget(): Promise<Base[]> }).findTarget();
}

/**
 * The body of `HasManyThroughAssociation#loadHasManyThrough` — trails' two-step
 * through loader, for the shapes AssociationScope cannot build a JOIN for.
 */
async function loadHasManyThrough(
  record: Base,
  assocName: string,
  assocDef: AssociationDefinition,
): Promise<Base[]> {
  const options = assocDef.options;
  const ctor = record.constructor as typeof Base;
  const associations: AssociationDefinition[] = ctor._associations ?? [];
  const throughAssoc = associations.find((a) => a.name === options.through);
  if (!throughAssoc) {
    throw _hmtNotFound(ctor, assocName, options.through!);
  }
  if (!targetReflectionHasAssociatedRecord(record, throughAssoc)) return [];

  const className = options.className ?? camelize(singularize(assocName));
  const targetModel = resolveAssocClass(record, assocName, className);

  const sourceName = options.source ?? singularize(assocName);

  const throughClassName =
    throughAssoc.options.className ?? camelize(singularize(throughAssoc.name));
  const throughModel = resolveAssocClass(record, throughAssoc.name, throughClassName);
  const throughModelAssocs: AssociationDefinition[] = throughModel._associations ?? [];
  const sourceAssoc =
    throughModelAssocs.find((a) => a.name === sourceName) ??
    throughModelAssocs.find((a) => a.name === pluralize(sourceName));
  const sourceAssocKind = sourceAssoc?.type ?? "belongsTo";

  let throughRecords: Base[];
  if (throughAssoc.type === "hasMany") {
    if (
      options.sourceType &&
      sourceAssoc?.options?.polymorphic &&
      sourceAssocKind === "belongsTo"
    ) {
      const resolvedSourceName = sourceAssoc?.name ?? sourceName;
      const sourceTypeCol = `${underscore(resolvedSourceName)}_type`;
      const originalScope = throughAssoc.scope;
      // `Reflection.create(macro, name, scope, options, model)` keeps the scope
      // beside the options hash rather than in it (association.rb:48-49), so the
      // synthesised `sourceType` scope replaces the definition's own without
      // touching its options.
      const augmentedDefinition = {
        options: throughAssoc.options,
        scope: (rel: any) => {
          let r = rel.where({ [sourceTypeCol]: options.sourceType });
          if (originalScope) r = originalScope(r);
          return r;
        },
      };
      throughRecords = await findHasManyTarget(record, throughAssoc.name, augmentedDefinition);
    } else {
      throughRecords = await findHasManyTarget(record, throughAssoc.name, throughAssoc);
    }
  } else if (throughAssoc.type === "hasOne") {
    const one = (await association.call(record, throughAssoc.name).loadTarget()) as Base | null;
    throughRecords = one ? [one] : [];
  } else if (throughAssoc.type === "belongsTo") {
    const one = (await association.call(record, throughAssoc.name).loadTarget()) as Base | null;
    throughRecords = one ? [one] : [];
  } else {
    throughRecords = [];
  }

  if (throughRecords.length === 0) return [];

  if (sourceAssocKind === "belongsTo") {
    const targetFk = sourceAssoc?.options?.foreignKey ?? `${underscore(sourceName)}_id`;

    const targetIds = throughRecords
      .map((r) => r._readAttribute(targetFk as string))
      .filter((v) => v !== null && v !== undefined);
    if (targetIds.length === 0) return [];
    let rel = targetModel.all().where({ [targetModel.primaryKey as string]: targetIds });
    rel = applyAssociationScope(rel, assocDef.scope, record);
    return rel.toArray();
  } else if (sourceAssoc?.options?.through) {
    const results: Base[] = [];
    for (const tr of throughRecords) {
      const sub = await findHasManyTarget(tr, sourceAssoc.name, sourceAssoc);
      results.push(...sub);
    }
    if (!assocDef.scope) return results;
    const ids = results
      .map((r) => r._readAttribute(targetModel.primaryKey as string))
      .filter((v) => v !== null && v !== undefined);
    if (ids.length === 0) return [];
    const rel = applyAssociationScope(
      targetModel.all().where({ [targetModel.primaryKey as string]: ids }),
      assocDef.scope,
      record,
    );
    return rel.toArray();
  } else {
    const sourceAsName = sourceAssoc?.options?.as;
    const sourceFk = sourceAsName
      ? (sourceAssoc?.options?.foreignKey ?? `${underscore(sourceAsName)}_id`)
      : (sourceAssoc?.options?.foreignKey ?? `${underscore(throughClassName)}_id`);
    const throughIds = throughRecords
      .map((r) => r._readAttribute((r.constructor as typeof Base).primaryKey as string))
      .filter((v) => v !== null && v !== undefined);
    if (throughIds.length === 0) return [];
    const whereConditions: Record<string, unknown> = { [sourceFk as string]: throughIds };
    if (sourceAsName) whereConditions[`${underscore(sourceAsName)}_type`] = throughClassName;
    let rel = targetModel.all().where(whereConditions);
    rel = applyAssociationScope(rel, assocDef.scope, record);
    return rel.toArray();
  }
}

/**
 * Rails' `ThroughAssociation` / `HasManyThroughAssociation` instance methods.
 * Installed on the prototype (Ruby `include`) rather than passed a host
 * argument, so every call site reads exactly as the Ruby does.
 */
const throughAssociationMethods = {
  buildThroughRecord,
  throughScope,
  throughScopeAttributes,
  saveThroughRecord,
  throughRecordsFor,
  deleteThroughRecords,
  ...ThroughAssociation,
};

Object.assign(HasManyThroughAssociation.prototype, throughAssociationMethods);

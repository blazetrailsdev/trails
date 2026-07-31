import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import { association as associationProxy } from "../associations.js";
import { underscore, isAbortSignal } from "@blazetrails/activesupport";
import { Association } from "./association.js";
import { foreignKeyPresentFor, ownerForeignKeyColumns } from "./foreign-association.js";
import { throughForeignKeyPresent } from "./through-association.js";
import type { AssociationReflection } from "../reflection.js";
import { RecordNotSaved, Rollback } from "../errors.js";
import { CollectionIdsAssignmentError, CollectionPersistedAssignmentError } from "./errors.js";
import { raiseNotFoundAll } from "../relation/finder-methods.js";
import { normalizeAssociationKey } from "./key-normalization.js";
import { polymorphicName } from "../inheritance.js";

/**
 * The persisted-owner DB work `replace` defers to its awaitable caller: the
 * assigned collection plus the baseline to diff it against (`wasLoaded` says
 * whether that baseline is trustworthy or must be re-read from the DB).
 */
export interface ReplacePlan {
  newTarget: Base[];
  originalTarget: Base[];
  wasLoaded: boolean;
}

/** @internal */
interface SharedTargetStore {
  _sharedTarget: Base[];
  _sharedLoaded: boolean;
  _sharedReplacedOrAddedTargets: Set<Base>;
}

/**
 * Base class for has_many and has_and_belongs_to_many associations.
 *
 * CollectionAssociation provides common CRUD methods for collections.
 * The actual database interaction is delegated to load functions in
 * associations.ts and the CollectionProxy class.
 *
 * Mirrors: ActiveRecord::Associations::CollectionAssociation
 */
export class CollectionAssociation extends Association {
  // A `null` entry is a placeholder for a rejected new record, preserving the
  // 1:1 ordering with the assigned attributes collection (Rails
  // nested_attributes.rb:487-547).
  nestedAttributesTarget: (Base | null)[] | null = null;
  protected _associationIds: unknown[] | null = null;
  // Whether the most recent `removeRecords` was halted by a `before_remove`
  // abort. Rails leaves `@target` untouched on abort (remove_records exits
  // before `@target -= records`), and for has_many :through the abort-nil is
  // masked by HMT#remove_records' `delete_through_records` return — so the
  // CollectionProxy through-branch reads this to avoid pruning its loaded
  // target when the removal was actually aborted. Read externally by the proxy.
  _lastRemoveAborted = false;
  // trails-specific (RFC 0030): memoized named-scope relations built off the
  // proxy (`things.someScope()`). Rails has NO such cache — `scope :name`
  // rebuilds a fresh relation on every call (named.rb:174-178), so two
  // consecutive `things.someScope()` are distinct objects there. We memoize per
  // scope name so they're identical within one association load, which is what
  // gives `named_scoping_test`'s post-reset `assert_not_same` real teeth. Held
  // on the association (not the proxy) so a reset driven through
  // `owner.association(:things)` clears it; invalidated by `reset` (reset /
  // destroy_all / delete_all / reload / insert / remove). Read/written by
  // `CollectionProxy`.
  _namedScopeRelations?: Map<string, unknown>;

  private _sharedTargetEnabled = false;

  constructor(owner: Base, definition: AssociationDefinition) {
    super(owner, definition);
    this.target = [];
    this._sharedTargetEnabled = true;
  }

  /**
   * A cache *lookup*, never a build: constructing a proxy here would be
   * re-entrant (its constructor resolves through-scopes that read back through
   * this association). Until one exists there is no second store to keep
   * coherent, and `association()` hands the proxy this very array
   * (`_adoptSharedTarget`), so no reference already handed out goes stale.
   */
  private _sharedStore(): SharedTargetStore | null {
    if (!this._sharedTargetEnabled) return null;
    return (
      (this.owner._collectionProxies.get(this.reflection.name) as SharedTargetStore | undefined) ??
      null
    );
  }

  /**
   * Rails' `CollectionProxy` forwards `target`/`loaded` to its `@association`;
   * trails inverts the ownership (RFC 0022 makes the proxy the canonical
   * has_many store) so the association forwards the other way. Either
   * direction gives the one invariant that matters: ONE in-memory target.
   */
  override get target(): Base[] {
    const store = this._sharedStore();
    return store ? store._sharedTarget : (this._targetStore as Base[]);
  }

  override set target(records: Base | Base[] | null) {
    // `Association#reset` assigns `null`; a collection's empty target is `[]`.
    const value = Array.isArray(records) ? records : records == null ? [] : [records];
    const store = this._sharedStore();
    if (store) store._sharedTarget = value;
    else this._targetStore = value;
  }

  override get loaded(): boolean {
    const store = this._sharedStore();
    return store ? store._sharedLoaded : this._loadedStore;
  }

  override set loaded(value: boolean) {
    const store = this._sharedStore();
    if (store) store._sharedLoaded = value;
    else this._loadedStore = value;
  }

  /**
   * Rails' `@replaced_or_added_targets`, the other half of
   * `replace_on_target`'s state — it has to travel with the target, since two
   * sets over one array double-append.
   * @internal
   */
  get _replacedOrAddedTargets(): Set<Base> {
    return this._sharedStore()?._sharedReplacedOrAddedTargets ?? this._replacedOrAddedTargetsStore;
  }

  private _replacedOrAddedTargetsStore = new Set<Base>();

  /**
   * Implements the writer method, e.g. foo.items= for Foo.has_many :items.
   * Replaces the entire collection.
   *
   * Awaitable: mirrors Rails' `CollectionAssociation#writer` → `replace`
   * (collection_association.rb:46-48, :242), which for a *persisted* owner
   * runs the diffed deletes + inserts inline in a transaction. That is DB I/O,
   * so this returns a Promise — the sync property setter cannot reach it and
   * uses {@link syncWrite} instead (RFC 0068).
   */
  async writer(records: Base[]): Promise<void> {
    const plan = this.replace(records);
    if (plan) await this.persistReplacePlan(plan);
  }

  /**
   * Writer for the JS property setter (`owner.items = [...]`,
   * builder/collection-association.ts `defineWriters`) and mass-assignment,
   * neither of which can `await`.
   *
   * - **Unpersisted owner:** in-memory `replace`, exactly as Rails does no I/O
   *   for a new-record owner (the FK isn't known yet); autosave persists at the
   *   owner's first `save()`.
   * - **Persisted owner:** THROW. Rails replaces inline at assignment; JS
   *   cannot do synchronous DB I/O from a property setter, so rather than
   *   deferring the writes to the owner's next `save()` (where a deferred
   *   delete can race an interim insert) we throw and name the awaitable
   *   Rails-named replacement (`await owner.items.replace([...])`).
   */
  syncWrite(records: Base[]): void {
    // Rails' `replace` raises a class mismatch for every element as its very
    // first statement (collection_association.rb:242), before any load or
    // persist — and so before the persisted-owner deviation below. That guard
    // is synchronous, so preserve its ordering even on this non-awaitable
    // path: `firm.clients = [1]` must report `AssociationTypeMismatch`, and
    // `firm.clients = null` must fail here (Rails: NoMethodError from
    // `nil.each`; here: TypeError from iterating null) on BOTH owner arms,
    // ahead of the persisted-owner throw.
    for (const val of records) (this as any).raiseOnTypeMismatchBang(val);
    if ((this.owner as { isPersisted?: () => boolean }).isPersisted?.()) {
      throw new CollectionPersistedAssignmentError(this.reflection.name);
    }
    this.replace(records);
  }

  /**
   * The `#{singular}Ids=` analogue of {@link syncWrite} — and, unlike it,
   * a throw on BOTH owner arms.
   *
   * `syncWrite`'s unpersisted arm is faithful because Rails does no I/O for a
   * new-record owner either. `ids_writer` has no such arm: it resolves the ids
   * to records with a query before replacing
   * (collection_association.rb:61-83), so the new-record path is DB I/O too.
   * The sync setter used to return that promise for it to discard, which made
   * a bad id (`raiseNotFoundAll`) an unhandled rejection instead of a
   * catchable throw and let an immediate `save()` read the target before the
   * in-flight replace landed. Awaitable surfaces exist for both arms —
   * `await owner.update({ itemIds: [...] })` (persistence.ts routes collection
   * keys through `idsWriter`) and `await owner.association(name).idsWriter()`
   * — so this throws loudly and names them. RFC 0068.
   */
  syncIdsWrite(_ids: unknown[]): never {
    throw new CollectionIdsAssignmentError(this.reflection.name);
  }

  /**
   * Implements the ids reader, e.g. foo.item_ids.
   * Returns an array of primary key values from the target.
   */
  async idsReader(): Promise<unknown[]> {
    // Rails `ids_reader` plucks `reflection.association_primary_key` in all
    // three branches. For a plain has_many this is the target model's own
    // primary key, but for a custom-PK target (e.g. `Subscriber.primary_key
    // == "nick"`) or a through association (where it delegates to the source
    // reflection's `association_primary_key`, e.g. `Category.primary_key ==
    // "name"` behind `author.essay_categories`) it is the association's own
    // key. Resolve it off the rich reflection (as `idsWriter` does) rather
    // than reading `klass.primaryKey`.
    const pk = this.associationPrimaryKey();
    const keys = Array.isArray(pk) ? pk : [pk];
    const readKey = (r: Base): unknown => {
      const vals = keys.map((key) =>
        typeof (r as any)._readAttribute === "function"
          ? (r as any)._readAttribute(key)
          : (r as any)[key],
      );
      return vals.length === 1 ? vals[0] : vals;
    };
    if (this.isLoaded()) {
      return this.target.map(readKey);
    }
    if (this.target.length > 0) {
      await this.loadTarget();
      return this.target.map(readKey);
    }
    if (this._associationIds) return this._associationIds;
    // Rails plucks off `scope` here, not `load_target`: `scope().pluck()` must
    // not mark the association loaded, so `record.misc_tag_ids` (a through
    // association) does not preload `record.misc_tags`.
    const rel = this.scope();
    if (rel && typeof rel.pluck === "function") {
      this._associationIds = await rel.pluck(...keys);
      return this._associationIds!;
    }
    return [];
  }

  /**
   * Resolves the association's `association_primary_key` off the rich
   * reflection (as `idsWriter` does), falling back to the target model's
   * primary key. Mirrors `reflection.association_primary_key`.
   */
  protected associationPrimaryKey(): string | string[] {
    const ctor = this.owner.constructor as typeof Base & {
      _reflectOnAssociation?: (
        n: string,
      ) => { associationPrimaryKey?: string | string[] } | undefined;
    };
    const richReflection = ctor._reflectOnAssociation?.(this.reflection.name);
    return richReflection?.associationPrimaryKey ?? (this.klass as any).primaryKey ?? "id";
  }

  /**
   * Implements the ids writer, e.g. `foo.item_ids=`.
   *
   * Mirrors: ActiveRecord::Associations::CollectionAssociation#ids_writer
   * (collection_association.rb). Resolves the child records by their
   * `association_primary_key` (for a plain has_many this is the target
   * model's primary key), mapping each id back to its record so the
   * `values_at(*ids)` order + duplicate semantics are preserved, raises
   * `RecordNotFound` when not every id resolves, then `replace`s.
   */
  async idsWriter(ids: unknown[]): Promise<void> {
    const Klass = this.klass as any;
    // Rails `ids_writer`: `primary_key = reflection.association_primary_key`.
    // For a through/custom-PK association this is the association's own key
    // (e.g. `Category.primary_key == "name"`), not the target model's `id`, so
    // the lookup + not-found message key must come from the rich reflection.
    const pk = this.associationPrimaryKey();
    const filteredIds = (Array.isArray(ids) ? ids : [ids]).filter((id) => id != null && id !== "");

    let records: Base[];
    if (filteredIds.length === 0) {
      records = [];
    } else if (Array.isArray(pk)) {
      // Composite-PK child: resolve each tuple id via a per-column lookup
      // (`klass.where(primary_key => ids)` over an array of tuples). Per-id
      // resolution keeps the original order and duplicates, matching Rails'
      // `index_by … values_at(*ids)`.
      const found = await Promise.all(
        filteredIds.map((id) => {
          const conditions: Record<string, unknown> = {};
          const idParts = Array.isArray(id) ? id : [id];
          pk.forEach((col: string, i: number) => {
            conditions[col] = idParts[i];
          });
          return Klass.findBy(conditions) as Promise<Base | null>;
        }),
      );
      records = found.filter((r): r is Base => r != null);
    } else {
      // Simple PK: one query, then index_by PK and map each id back to its
      // record (Rails' `where(pk => ids).index_by { … }.values_at(*ids)`).
      const rows: Base[] = await Klass.where({ [pk]: filteredIds }).toArray();
      const byKey = new Map<string, Base>(
        rows.map((r) => [String((r as any)._readAttribute(pk)), r]),
      );
      records = filteredIds.map((id) => byKey.get(String(id))).filter((r): r is Base => r != null);
    }

    // Rails: `if records.size != ids.size … raise_record_not_found_exception!`.
    // Reuse the shared "Couldn't find all" builder (also used by performFind)
    // so there is a single not-found message source.
    if (records.length !== filteredIds.length) {
      // Rails `ids_writer` (collection_association.rb:79-81):
      //   found_ids = records.map { |r| r._read_attribute(primary_key) }
      //   not_found_ids = ids - found_ids
      //   klass.all.raise_record_not_found_exception!(ids, records.size, ids.size, primary_key, not_found_ids)
      // The `not_found_ids` sentence is appended to the message.
      const keyFor = (v: unknown): string =>
        Array.isArray(v) ? v.map(String).join(",") : String(v);
      const foundKeys = new Set(
        records.map((r) =>
          keyFor(
            Array.isArray(pk)
              ? pk.map((col: string) => (r as any)._readAttribute(col))
              : (r as any)._readAttribute(pk),
          ),
        ),
      );
      const notFoundIds = filteredIds.filter((id) => !foundKeys.has(keyFor(id)));
      raiseNotFoundAll(
        Klass.name,
        pk,
        {
          ids: filteredIds,
          wantArray: true,
          tuples: Array.isArray(pk) ? (filteredIds as unknown[][]) : null,
        },
        records.length,
        filteredIds.length,
        "",
        notFoundIds,
      );
    }

    // Rails' `ids_writer` ends in `replace(records)` (collection_association.rb:83).
    // Mirror that direct call, then run the persisted-owner half `replace`
    // defers (the awaitable `writer` does the same two steps).
    const plan = this.replace(records);
    if (plan) await this.persistReplacePlan(plan);
  }

  override reset(): void {
    super.reset();
    this.target = [];
    this._associationIds = null;
    // Drop the trails-specific named-scope memo (see `_namedScopeRelations`) so
    // the next `things.someScope()` rebuilds against the reset collection. (This
    // sits alongside Rails' `reset`, which clears @target/@association_ids; the
    // named-scope cache itself has no Rails counterpart.)
    this._namedScopeRelations = undefined;
  }

  /**
   * Find records within the association. If inverse_of is set and the
   * collection is loaded, scans the in-memory target. Otherwise
   * delegates to the association scope.
   */
  async find(...args: unknown[]): Promise<Base | Base[] | null> {
    const ids = (args as any[]).flat().filter((id) => id != null);

    if (this.reflection.options.inverseOf && this.isLoaded()) {
      if (ids.length === 0) {
        throw new Error(`Couldn't find ${this.klass.name} without an ID`);
      }
      return this.findByScan(ids);
    }

    const rel = this.scope();
    if (rel && typeof rel.find === "function") {
      return await rel.find(...ids);
    }
    return null;
  }

  build(attributes?: Record<string, unknown>): Base {
    const record = this.buildRecord(attributes);
    if (record) {
      this.setOwnerAttributes(record);
      this.addToTarget(record, { replace: true });
    }
    return record!;
  }

  /**
   * Add records to this association. Flattens arguments and inserts
   * each record, persisting if the owner is persisted.
   *
   * Yields the added records, or `undefined` when a failed `insert_record`
   * made `concat_records` raise `ActiveRecord::Rollback` inside the
   * persisted-owner transaction (collection_association.rb:127-135) — the
   * nil that makes `CollectionProxy#<<` falsy.
   */
  async concat(...records: Base[]): Promise<Base[] | undefined> {
    const flattened = records.flat();
    if (this.owner.isNewRecord()) {
      await this.loadTarget();
      return this.concatRecords(flattened);
    }
    return this.transaction(() => this.concatRecords(flattened));
  }

  /**
   * Run `block` in the reflection klass's transaction.
   *
   * Mirrors: ActiveRecord::Associations::CollectionAssociation#transaction —
   * overridden by `ThroughAssociation#transaction` (the through model's), which
   * `HasManyThroughAssociation` picks up.
   * @internal
   */
  protected transaction<R>(block: () => Promise<R>): Promise<R | undefined> {
    // Rails: reflection.klass.transaction(&block) — uses the reflection's klass, not assoc.klass
    const klass = (this.reflection as any).klass ?? this.klass;
    if (klass && typeof klass.transaction === "function") {
      return klass.transaction(block);
    }
    return block();
  }

  /**
   * Diff hooks Rails leaves to the concrete subclass: `HasManyAssociation`
   * supplies `a - b` / `a & b`, `HasManyThroughAssociation` the multiset
   * variants. Declared here (rather than implemented, as Rails' base has no
   * definition at all) only so the shared `replace` machinery can call them.
   * @internal
   */
  protected difference(_a: Base[], _b: Base[]): Base[] {
    throw new Error("difference is implemented by CollectionAssociation subclasses");
  }

  /** @internal */
  protected intersection(_a: Base[], _b: Base[]): Base[] {
    throw new Error("intersection is implemented by CollectionAssociation subclasses");
  }

  /** @internal */
  async insertRecord(record: Base, validate = true, raise = false): Promise<boolean> {
    this.setOwnerAttributes(record);
    if (raise && typeof (record as any).saveBang === "function") {
      await (record as any).saveBang({ validate });
      return true;
    }
    return !!(await (record as any).save?.({ validate }));
  }

  /**
   * Mirrors Rails' `CollectionAssociation#concat_records`
   * (collection_association.rb): add each record to the target, inserting it
   * when the owner is persisted. Returns `records` so subclasses (HMT) can
   * post-process the appended set.
   *
   * The per-record loop, `result &&= insert_record(...)` accumulation, and
   * `raise Rollback unless result` live in the shared `concatRecordsLoop` so the
   * runtime `CollectionProxy#push` path and this OO parity surface can't drift.
   *
   * @internal
   */
  protected async concatRecords(records: Base[], shouldRaise = false): Promise<Base[]> {
    await concatRecordsLoop(records, async (record, resultStillTrue) => {
      (this as any).raiseOnTypeMismatchBang(record);
      // Mirror Rails' `add_to_target(record) { insert_record }`
      // (collection_association.rb:440-446): the insert runs *inside* the
      // funnel — after before_add + set_inverse_instance, before the target
      // mutation and after_add — rather than after the whole add. A
      // before_add abort (`added == null`) skips the yield, so `inserted`
      // stays true and the fold leaves `result` unchanged.
      let inserted = true;
      await this.addToTarget(record, {}, async () => {
        // `resultStillTrue === false` → a prior record failed, so Rails'
        // `result &&= insert_record` short-circuits the save.
        if (this.owner.isNewRecord() || !resultStillTrue) return;
        inserted = await this.insertRecord(record, true, shouldRaise);
      });
      return inserted;
    });
    return records;
  }

  /**
   * Build any in-memory join rows for `records` on a new (unsaved) owner.
   * No-op for non-through collections; HMT overrides it to pre-build the
   * through-rows (mirrors the `build_through_record` loop reached via
   * `concat_records` on a new owner).
   * @internal
   */
  protected buildThroughRecordsInMemory(_records: Base[]): void {}

  /**
   * Removes all records from the association. Honors the :dependent
   * option. If :dependent is :destroy, uses :delete_all strategy instead.
   */
  async deleteAll(dependent?: string): Promise<void> {
    if (
      dependent &&
      dependent !== "nullify" &&
      dependent !== "deleteAll" &&
      dependent !== "delete"
    ) {
      throw new Error("Valid values are 'nullify', 'delete', or 'deleteAll'");
    }

    const normalized = dependent === "delete" ? "deleteAll" : dependent;
    const optionDep = this.options.dependent;
    const effectiveDependent =
      normalized ?? (optionDep === "destroy" || optionDep === "delete" ? "deleteAll" : optionDep);

    await this.deleteOrNullifyAllRecords(effectiveDependent);

    this.reset();
    this.loadedBang();
  }

  /**
   * Mirrors Rails' `delete_or_nullify_all_records(method)`: the single
   * dispatch point that `delete_all` routes through, so subclasses
   * (`HasManyThroughAssociation`) can override the bulk strategy in one
   * place. The base CollectionAssociation chooses delete vs. nullify by
   * `method`, mirroring Rails' `delete_count`: only an explicit `"deleteAll"`
   * deletes the rows; every other method (including the `nil`/`undefined`
   * default from `delete_all` with no `:dependent`) nullifies the FK.
   */
  protected async deleteOrNullifyAllRecords(method?: string): Promise<void> {
    if (method === "deleteAll") {
      await this.deleteAllRecords();
    } else {
      await this.nullifyAllRecords();
    }
  }

  /**
   * Destroy all records from this association, calling destroy callbacks.
   *
   * Mirrors Rails' `CollectionAssociation#destroy_all`: routes the loaded
   * target through `destroy` (→ `remove_records`) so `before_remove` /
   * `after_remove` fire — not a direct `record.destroy` loop, which would
   * bypass the collection callbacks on `owner.destroy` (`dependent: :destroy`).
   */
  async destroyAll(): Promise<void> {
    const records = await this.loadTarget();
    await this.destroy(...records);
    this.reset();
    this.loadedBang();
  }

  /**
   * Remove specific records from the association using the :dependent
   * strategy. Calls before_remove/after_remove callbacks.
   */
  async delete(...records: Array<Base | number | string | bigint>): Promise<Base[] | undefined> {
    // Pass the raw splat (do NOT pre-flatten) so deleteOrDestroy's
    // `records.empty?` check sees the un-flattened arg list, matching Rails:
    // `delete()` → [] → nil, but `delete([])` → [[]] (size 1) → [] → [].
    return this.deleteOrDestroy(records, this.reflection.options.dependent);
  }

  /**
   * Destroy specific records, ignoring the :dependent option.
   * Calls before_remove/after_remove + before_destroy/after_destroy callbacks.
   */
  async destroy(...records: Array<Base | number | string | bigint>): Promise<Base[] | undefined> {
    // Raw splat, as in `delete` above — the empty check is pre-flatten.
    return this.deleteOrDestroy(records, "destroy");
  }

  get size(): number {
    if (!this.findTargetNeeded() || this.isLoaded()) {
      return this.target.length;
    }
    if (this._associationIds) {
      return this._associationIds.length;
    }
    return this.target.length;
  }

  isEmpty(): boolean {
    if (this.isLoaded() || this._associationIds) {
      return this.size === 0;
    }
    return this.target.length === 0;
  }

  async isEmptyAsync(): Promise<boolean> {
    if (this.isLoaded() || this._associationIds) {
      return this.size === 0;
    }
    if (this.target.length > 0) return false;
    const rel = this.scope();
    if (rel && typeof rel.exists === "function") {
      return !(await rel.exists());
    }
    return true;
  }

  /**
   * Replace this collection with other_array. Performs a diff and
   * delete/add only records that have changed.
   *
   * In-memory only. For a *new* owner that is the whole of Rails' behaviour
   * (`replace_records` without a save — the FK isn't known yet), so the
   * owner's first `save()` autosaves the target and nothing else is needed.
   * For a *persisted* owner Rails additionally runs the diffed deletes +
   * inserts in a transaction; that DB work cannot happen here (this is
   * synchronous, and reached from the property setter), so it is returned as a
   * plan for the awaitable {@link writer} to execute via
   * {@link persistReplacePlan}. Returns `null` when there is nothing to
   * persist.
   */
  replace(otherArray: Base[]): ReplacePlan | null {
    // The writer path (`firm.clients = [...]`, `firm.client_ids = [...]`, mass
    // assignment) mutates `target` directly rather than going through
    // `setTarget`, so it needs the in-flight guard applied here too —
    // otherwise the ordinary user-facing assignment stays silently clobberable
    // while only the raw `association(name).setTarget(...)` call is protected.
    this.raiseIfLoadInFlight();
    for (const val of otherArray) (this as any).raiseOnTypeMismatchBang(val);
    const wasLoaded = this.isLoaded();
    const originalTarget = [...this.target];
    if (this.owner.isNewRecord()) {
      // Rails routes a new-owner replace through replace_records → concat →
      // concat_records (collection_association.rb): delete(difference(target,
      // new_target)) then concat(difference(new_target, target)). The concat
      // runs the build path — for HMT it constructs through-rows in memory that
      // the owner's save autosaves alongside it. Mirror that here rather than
      // setting _target directly, which would skip the through-row build.
      //
      // delete(difference(...)) → delete_or_destroy → remove_records: fire
      // before_remove (an abort halts removal), prune the target and clear the
      // inverse, then after_remove. delete_records (the DB delete) is skipped —
      // a new owner has no persisted join rows yet, so existing_records is
      // empty (the owner's save is what creates them).
      const toRemove = this.difference(this.target, otherArray);
      let removable = true;
      for (const r of toRemove) {
        if (!callback(this, "beforeRemove", r)) {
          removable = false;
          break;
        }
      }
      if (removable) {
        for (const r of toRemove) {
          const idx = this.target.indexOf(r);
          if (idx !== -1) this.target.splice(idx, 1);
          this.removeInverseInstance(r);
        }
        for (const r of toRemove) callback(this, "afterRemove", r);
      }
      // concat(difference(new_target, target)): add_to_target per record.
      // `added` is that difference — Rails' concat_records returns the full
      // input array (before_add aborts affect @target membership but not the
      // returned set), and HMT#concat_records builds a through-row for each, so
      // we build for the whole difference rather than filtering on addToTarget.
      const added = this.difference(otherArray, this.target);
      for (const r of added) this.addToTarget(r);
      this.loadedBang();
      this.buildThroughRecordsInMemory(added);
    } else {
      // Persisted owner: Rails calls replace_common_records_in_memory before
      // diffing (collection_association.rb). For a new owner Rails skips it —
      // replace_records leaves common records in place untouched — so it lives
      // here, not above the branch.
      replaceCommonRecordsInMemory(this, otherArray, originalTarget);
      if (!wasLoaded || !arraysEqual(otherArray, originalTarget)) {
        for (const r of this.difference(originalTarget, otherArray)) {
          const idx = this.target.indexOf(r);
          if (idx !== -1) this.target.splice(idx, 1);
        }
        for (const r of this.difference(otherArray, this.target)) {
          this.setOwnerAttributes(r);
          this.addToTarget(r);
        }
        this.loadedBang();
        return { newTarget: [...otherArray], originalTarget, wasLoaded };
      }
    }
    return null;
  }

  /**
   * Run the persisted-owner half of {@link replace}: the diffed deletes +
   * inserts, in a transaction (Rails' `replace_records`,
   * collection_association.rb:242). Awaited inline by {@link writer} — the
   * in-memory `replace` above has already mutated `target`, so this restores
   * the captured baseline for the duration of the diff.
   */
  protected async persistReplacePlan(pending: ReplacePlan): Promise<void> {
    if (this.owner.isNewRecord()) return;
    // If the association wasn't loaded at assignment time, fetch the persisted
    // baseline directly rather than via findTarget, to avoid the loadedBang short-circuit
    // and without mutating this.target (mirrors Rails' load_target in replace).
    if (!pending.wasLoaded) {
      // Query the DB directly via scope() to get the persisted baseline.
      // findTarget() hits the association-instance cache (which may
      // already reflect the in-memory replace) and returns the wrong diff.
      const rel = this.scope() as { toArray?: () => Promise<Base[]> } | null | undefined;
      const dbRecords = rel?.toArray ? await rel.toArray() : [];
      pending.originalTarget = [...dbRecords];
    }
    const currentTarget = this.target;
    await this.transaction(async () => {
      // replaceRecords diffs against assoc.target; restore originalTarget so
      // it sees the real DB state rather than the already-updated in-memory target
      this.target = [...pending.originalTarget];
      try {
        await replaceRecords(this, pending.newTarget, pending.originalTarget);
      } finally {
        this.target = currentTarget;
      }
    });
  }

  /**
   * Check if a record is in the collection. For new records, checks
   * the in-memory target. For persisted records, uses scope if not loaded.
   */
  async isInclude(record: Base): Promise<boolean> {
    if (record.isNewRecord() || this.isLoaded()) {
      return isIncludeInMemory(this, record);
    }
    const rel = this.scope();
    if (rel && typeof rel.exists === "function") {
      const pk = this.primaryKeyValue(record);
      return await rel.exists(pk);
    }
    return isIncludeInMemory(this, record);
  }

  /**
   * Load target from database and merge with in-memory records.
   */
  override async loadTarget(): Promise<Base[]> {
    if (this.findTargetNeeded()) {
      const cached = this.doFindTarget();
      if (cached !== undefined && Array.isArray(cached)) {
        this.target = this.mergeTargetLists(cached, this.target);
      } else {
        const found = await this.findTarget();
        if (found !== undefined && found !== null && Array.isArray(found)) {
          // Rails applies set_strict_loading per record in find_target's DB
          // execute block — only freshly loaded records, never cached ones.
          for (const record of found) this.setStrictLoading(record);
          this.target = this.mergeTargetLists(found, this.target);
        }
      }
    }

    this.loadedBang();
    return this.target;
  }

  /**
   * Add a record to the in-memory target array, firing callbacks and setting
   * inverse associations. Mirrors Rails' single `add_to_target(record, &block)`
   * (collection_association.rb:281-283): when a `save` callback is supplied it
   * runs at Rails' `yield(record)` point — after `set_inverse_instance`, before
   * the target mutation and after_add — and the method returns a promise.
   * `concatRecords` passes the per-record insert as `save` so it runs inside the
   * add funnel; the target push happens regardless of the save result (Rails
   * relies on the surrounding `raise Rollback` to undo a failed insert), keeping
   * the OO path's membership behavior unchanged. Sync callers (build/replace,
   * no `save`) get the synchronous return.
   */
  addToTarget(record: Base, options?: { skipCallbacks?: boolean; replace?: boolean }): Base | null;
  addToTarget(
    record: Base,
    options: { skipCallbacks?: boolean; replace?: boolean },
    save: () => Promise<void>,
  ): Promise<Base | null>;
  addToTarget(
    record: Base,
    options: { skipCallbacks?: boolean; replace?: boolean } = {},
    save?: () => Promise<void>,
  ): Base | null | Promise<Base | null> {
    const { skipCallbacks = false, replace = false } = options;
    // Rails: `replace: replace || association_scope.distinct_value`
    // (collection_association.rb:283) — a `distinct` association scope dedups
    // in place on append rather than appending the same record twice.
    const shouldReplace = replace || this.associationScopeDistinctValue();
    if (save) return replaceOnTargetAsync(this, record, skipCallbacks, shouldReplace, save);
    return replaceOnTarget(this, record, skipCallbacks, shouldReplace);
  }

  /**
   * `association_scope.distinct_value`, resolved defensively: the memoized
   * association scope is unavailable for an owner whose target class or FK
   * cannot be resolved yet, and Rails' `add_to_target` is not the place that
   * surfaces such a failure.
   * @internal
   */
  private associationScopeDistinctValue(): boolean {
    try {
      return !!(this.associationScope() as { distinctValue?: boolean } | undefined)?.distinctValue;
    } catch {
      return false;
    }
  }

  /**
   * Returns the scope (Relation) for this association, applying
   * none! if the scope is null (owner is new and has no FK).
   */
  override scope(): any {
    const s = super.scope();
    if (this.isNullScope() && s && typeof s.none === "function") {
      return s.none();
    }
    return s;
  }

  /**
   * Whether the target can be fetched for a new-record owner. A has_many :through
   * routes through a belongs_to (`ThroughAssociation#foreign_key_present?`,
   * through_association.rb:90); a vanilla has_many requires the owner's
   * `active_record_primary_key` to be present (`ForeignAssociation#foreign_key_present?`,
   * foreign_association.rb:5). Mirrors the same dispatch in
   * `CollectionProxy#_foreignKeyPresent` so the two never disagree.
   */
  protected override foreignKeyPresent(): boolean {
    if (this.reflection.options.through) {
      return throughForeignKeyPresent({
        owner: this.owner,
        reflection: this.reflection as unknown as AssociationReflection,
      });
    }
    // Resolve the *rich* reflection (the registered Reflection instance) the
    // same way `Association#scope` does. `this.reflection` is the lightweight
    // AssociationDefinition, which has no `activeRecordPrimaryKey` getter — so
    // `foreignKeyPresentFor` would fall back to `"id"` and report a custom-PK
    // owner's FK absent, wrongly nullifying the scope for a new-record owner
    // whose custom PK is present (e.g. `Subscriber#subscriptions`).
    const ctor = this.owner.constructor as typeof Base & {
      _reflectOnAssociation?: (n: string) => unknown;
    };
    const reflection = (ctor._reflectOnAssociation?.(this.reflection.name) ??
      this.reflection) as unknown as AssociationReflection;
    return foreignKeyPresentFor(reflection, this.owner);
  }

  /**
   * Returns true if the scope should be null — owner is a new
   * record and has no foreign key present.
   */
  isNullScope(): boolean {
    return this.owner.isNewRecord() && !this.foreignKeyPresent();
  }

  /**
   * Returns true if find should search the loaded target rather than
   * going to the database. Mirrors
   * ActiveRecord::Associations::CollectionAssociation#find_from_target?
   * (collection_association.rb:308): loaded, owner strict-loading-all,
   * reflection strict-loading, owner new record, or any target record
   * new/changed.
   *
   * The final clause is Rails' `record.changed?`, NOT `has_changes_to_save?` —
   * different mutation sources (`mutations_from_user` vs
   * `mutations_from_database`), even though both currently resolve to
   * `_dirty.changed` here.
   *
   * `loaded` falls back to this association's own `isLoaded()` and is only
   * passed explicitly by `CollectionProxy#isFindFromTarget`, which borrows this body
   * (Rails' proxy delegates to `@association.find_from_target?`) but tracks
   * loadedness in its own `_targetLoaded`. Rails' method takes no argument.
   */
  isFindFromTarget(loaded?: boolean): boolean {
    return (
      (loaded ?? this.isLoaded()) ||
      (this.owner.isStrictLoading() && this.owner.isStrictLoadingAll()) ||
      !!this.reflection.options.strictLoading ||
      this.owner.isNewRecord() ||
      this.target.some((r) => r.isNewRecord() || r.changed)
    );
  }

  override isCollection(): boolean {
    return true;
  }

  /**
   * Mirrors Rails' `CollectionAssociation#target=` (collection_association.rb
   * :285-296): the inverse-wiring chain `set_inverse_instance` → `inversed_from`
   * → `self.target =`. Under `has_many_inversing`, a single inverse record folds
   * into the collection via `replace_on_target(record, true, replace: true,
   * inversing: true)`; without the flag it falls back to the plain holder write
   * (`super`). A `nil` cannot be removed from the inverse (Rails no-ops too).
   *
   * The trails analog of `replace_on_target`'s `@target` write is the
   * `CollectionProxy` — the canonical has_many store surfaced via
   * `Base#_associationCache` — reached through `_wireInverseTarget`, so a
   * belongs_to build under `has_many_inversing` lands in the parent's collection
   * where readers (`size()`/`load()`) see it.
   */
  override inversedFrom(record: Base | null): void {
    if (!(this.klass as typeof Base | undefined)?.hasManyInversing) {
      super.inversedFrom(record);
      return;
    }
    if (record === null) return;
    const proxy = associationProxy(this.owner, this.reflection.name) as unknown as {
      _wireInverseTarget: (r: Base) => void;
    };
    proxy._wireInverseTarget(record);
  }

  override get reader(): Base[] {
    this.ensureKlassExists();
    return this.target;
  }

  async asyncReader(): Promise<Base[]> {
    this.ensureKlassExists();

    if (this.isStaleTarget()) {
      await this.reload();
    }

    return this.target;
  }

  private ensureKlassExists(): void {
    try {
      void this.klass;
    } catch (error) {
      throw new Error(`Association ${this.reflection.name}: target class does not exist`, {
        cause: error,
      });
    }
  }

  // --- Protected helpers ---

  protected setOwnerAttributes(record: Base): void {
    if (this.reflection.options.through) return;

    const ctor = this.owner.constructor as any;
    const fks = this.foreignKeyColumns();
    // Rails zips `Array(reflection.join_primary_key)` (the child FK columns)
    // against `Array(reflection.join_foreign_key)` — for a has_many the latter
    // is `active_record_primary_key`, NOT the owner's bare `primary_key`. A
    // composite FK derived from the owner's `query_constraints` (Sharded::BlogPost
    // `[blog_id, id]`) only pairs correctly through that resolver; falling back
    // to `ctor.primaryKey` collapses both FK columns onto `id`.
    const richPk = (
      ctor._reflectOnAssociation?.(this.reflection.name) as
        | { activeRecordPrimaryKey?: string | string[] }
        | undefined
    )?.activeRecordPrimaryKey;
    const configuredPk = this.reflection.options.primaryKey ?? richPk ?? ctor.primaryKey ?? "id";
    const pks = Array.isArray(configuredPk) ? configuredPk : [configuredPk];

    for (let i = 0; i < fks.length; i++) {
      const pkCol = pks[i] ?? pks[0];
      const pkValue =
        typeof (this.owner as any)._readAttribute === "function"
          ? (this.owner as any)._readAttribute(pkCol)
          : (this.owner as any)[pkCol];

      if (typeof (record as any)._writeAttribute === "function") {
        (record as any)._writeAttribute(fks[i], pkValue);
      } else {
        (record as any)[fks[i]] = pkValue;
      }
    }

    if (this.reflection.options.as) {
      const typeCol = this.polymorphicTypeColumn()!;
      // Rails writes `owner.class.base_class.name` (polymorphic_name) for the
      // `as:` type column, so STI subclasses store their base class name.
      const typeName = polymorphicName(ctor as typeof Base);
      if (typeof (record as any)._writeAttribute === "function") {
        (record as any)._writeAttribute(typeCol, typeName);
      } else {
        (record as any)[typeCol] = typeName;
      }
    }
  }

  // --- Private helpers ---

  private foreignKeyColumns(): string[] {
    return ownerForeignKeyColumns(
      this.owner.constructor as typeof Base,
      this.reflection.name,
      this.reflection.options as Parameters<typeof ownerForeignKeyColumns>[2],
    );
  }

  private foreignKeyColumn(): string {
    return this.foreignKeyColumns()[0];
  }

  /**
   * Resolve the polymorphic `as:` type column, honoring a custom
   * `foreignType` option (e.g. `imageable_class` instead of the default
   * `imageable_type`). Mirrors Rails `reflection.type`. Returns null for
   * non-polymorphic associations.
   */
  private polymorphicTypeColumn(): string | null {
    const opts = this.reflection.options as { as?: string; foreignType?: string };
    if (!opts.as) return null;
    return opts.foreignType ?? `${underscore(opts.as)}_type`;
  }

  protected async deleteOrDestroy(
    records: Array<Base | number | string | bigint>,
    method?: string,
  ): Promise<Base[] | undefined> {
    // Rails delete_or_destroy opens with `return if records.empty?`
    // (collection_association.rb:385) BEFORE the flatten on the next line, so
    // the check is against the raw splat: `delete()` → [] → nil, but an
    // explicit `delete([])` → [[]] (size 1) skips the return, flattens to [],
    // runs remove_records, and returns [] — NOT nil. `[]` is truthy in JS, so
    // returning nil here would let a caller's `if (assoc.delete(...))` misread
    // a no-arg removal as success; an empty-array arg keeps the [] contract.
    if (records.length === 0) return undefined;
    // Rails `delete`/`destroy` coerce ids via `find` only when a TOP-LEVEL splat
    // arg is an Integer/String (`records.any? { … } … find(records)`,
    // collection_association.rb:186-197) — BEFORE the flatten. An id nested in an
    // array (`delete([id])` → `[[id]]`) is therefore NOT coerced; it survives to
    // `raise_on_type_mismatch!` after `records.flatten` and raises. So run the
    // id-check on the raw splat, then flatten, then type-check the flattened
    // values — the order the non-through proxy path already follows.
    const coerced = await this.coerceToRecords(records);
    const resolved = (coerced as unknown[]).flat(Infinity) as Base[];
    for (const record of resolved) (this as any).raiseOnTypeMismatchBang(record);
    const existingRecords = resolved.filter((r) => !r.isNewRecord());
    // A `before_remove` abort halts removal (removeRecords returns false); like
    // Rails, leave the target untouched and report no removed records.
    let removed = false;
    if (existingRecords.length === 0) {
      removed = await this.removeRecords(existingRecords, resolved, method ?? "");
    } else {
      await this.transaction(async () => {
        removed = await this.removeRecords(existingRecords, resolved, method ?? "");
      });
    }
    // Rails remove_records aborts via `catch(:abort) { ... } || return` → nil
    // (collection_association.rb:399-402), so a halted before_remove returns nil.
    return removed ? resolved : undefined;
  }

  /**
   * Mirrors Rails' `delete_or_destroy` id-coercion: resolve Integer/String
   * keys to records *within the association* (Rails' scoped `find`, never
   * `klass.find`). Through associations resolve against the join-aware loaded
   * target — trails' through `scope()`-based `find` can't query across the
   * join (see HMT `idsReader`).
   * @internal
   */
  private async coerceToRecords(records: Array<Base | number | string | bigint>): Promise<Base[]> {
    const isId = (r: Base | number | string | bigint): r is number | string | bigint =>
      typeof r === "number" || typeof r === "string" || typeof r === "bigint";
    if (!records.some(isId)) return records as Base[];
    const ids = records.map((r) => (isId(r) ? r : this.primaryKeyValue(r)));
    if (this.reflection.options.through) {
      const target = await this.loadTarget();
      return ids.map((id) => {
        const found = target.find((r) => String(this.primaryKeyValue(r)) === String(id));
        if (!found) throw new Error(`Couldn't find ${this.klass.name} with ID ${String(id)}`);
        return found;
      });
    }
    const found = await this.find(...ids);
    return Array.isArray(found) ? found : found ? [found] : [];
  }

  /**
   * Mirrors: ActiveRecord::Associations::CollectionAssociation#remove_records —
   * before/after-remove callbacks, `deleteRecords`, in-memory target prune.
   * @internal
   */
  protected async removeRecords(
    existingRecords: Base[],
    records: Base[],
    method: string,
  ): Promise<boolean> {
    // Rails remove_records: catch(:abort) { each before_remove } || return —
    // an aborted before_remove halts removal (target untouched); returns false.
    for (const record of records) {
      if (!callback(this, "beforeRemove", record)) {
        this._lastRemoveAborted = true;
        return false;
      }
    }
    this._lastRemoveAborted = false;
    if (existingRecords.length > 0) {
      await this.deleteRecords(existingRecords, method);
    }
    for (const record of records) {
      const idx = this.target.indexOf(record);
      if (idx !== -1) this.target.splice(idx, 1);
      // A `dependent: :destroy` record is frozen once destroyed, so clearing its
      // inverse foreign key would raise FrozenError. Rails leaves the destroyed
      // record's attributes untouched here (remove_records only prunes @target),
      // so skip inverse removal for already-destroyed records.
      if (typeof (record as any).isDestroyed === "function" && (record as any).isDestroyed())
        continue;
      this.removeInverseInstance(record);
    }
    this._associationIds = null;
    for (const record of records) callback(this, "afterRemove", record);
    return true;
  }

  /**
   * Abstract in the base; subclasses override per strategy. Mirrors Rails'
   * `CollectionAssociation#delete_records` (raises NotImplementedError).
   * @internal
   */
  protected async deleteRecords(_records: Base[], _method: string): Promise<number> {
    throw new Error(`deleteRecords must be implemented by ${this.constructor.name}`);
  }

  /**
   * Returns the FK/type-column → null map for `dependent: :nullify` bulk
   * updates. Subclasses (HasManyAssociation) override this to honor the
   * rich AssociationReflection's foreignKey/foreignType.
   *
   * @internal
   */
  protected computeNullifiedOwnerAttributes(): Record<string, null> {
    const nullAttrs: Record<string, null> = {};
    for (const fk of this.foreignKeyColumns()) {
      nullAttrs[fk] = null;
    }
    const typeCol = this.polymorphicTypeColumn();
    if (typeCol) {
      nullAttrs[typeCol] = null;
    }
    return nullAttrs;
  }

  protected async nullifyAllRecords(): Promise<void> {
    const nullAttrs = this.computeNullifiedOwnerAttributes();

    // Prefer scope-based bulk update (hits DB even if target isn't loaded)
    const rel = this.scope();
    if (rel && typeof rel.updateAll === "function") {
      await rel.updateAll(nullAttrs);
      return;
    }

    // Fallback: load and update individually
    await this.loadTarget();
    for (const record of this.target) {
      for (const [attr, val] of Object.entries(nullAttrs)) {
        if (typeof (record as any)._writeAttribute === "function") {
          (record as any)._writeAttribute(attr, val);
        } else {
          (record as any)[attr] = val;
        }
      }
      if (typeof (record as any).save === "function") {
        await (record as any).save();
      }
    }
  }

  /**
   * Stable identity for a record using the target model's configured PK.
   * Returns the record object itself for new records with null PK
   * (reference identity), or a JSON-serialized PK for persisted records.
   */
  private recordIdentity(record: Base): string | Base {
    const pk = (this.klass as any).primaryKey ?? "id";
    const keys = Array.isArray(pk) ? pk : [pk];
    const values = keys.map((key: string) =>
      typeof (record as any)._readAttribute === "function"
        ? (record as any)._readAttribute(key)
        : (record as any)[key],
    );
    if (values.some((v) => v == null)) return record;
    // BigInt PKs (int8 default under PG bigserial) can't go through
    // JSON.stringify ("Do not know how to serialize a BigInt"); fold to their
    // decimal string. Both merged lists read PKs from the same source, so the
    // identity key stays deterministic.
    const ids = values.map((v) => (typeof v === "bigint" ? v.toString() : v));
    return JSON.stringify(ids.length === 1 ? ids[0] : ids);
  }

  protected primaryKeyValue(record: Base): unknown {
    const pk = (this.klass as any).primaryKey ?? "id";
    if (Array.isArray(pk)) {
      return pk.map((key: string) =>
        typeof (record as any)._readAttribute === "function"
          ? (record as any)._readAttribute(key)
          : (record as any)[key],
      );
    }
    return typeof (record as any)._readAttribute === "function"
      ? (record as any)._readAttribute(pk)
      : (record as any)[pk];
  }

  private async deleteAllRecords(): Promise<void> {
    const rel = this.scope();
    if (rel && typeof rel.deleteAll === "function") {
      await rel.deleteAll();
    }
  }

  /**
   * The collection form of `_setTargetFromLoader`, mirroring Rails'
   * `load_target`: `@target = merge_target_lists(find_target, target);
   * loaded!`. Overwriting instead would discard in-memory builds.
   * @internal
   */
  _mergeLoaderResults(rows: Base[]): void {
    this.target = this.mergeTargetLists(rows, this.target);
    this.loadedBang();
  }

  /**
   * Merge persisted records from DB with in-memory target records.
   * Preserves order of persisted, deduplicates, and keeps
   * attribute changes from in-memory versions.
   */
  private mergeTargetLists(persisted: Base[], memory: Base[]): Base[] {
    if (memory.length === 0) return persisted;

    const newRecords: Base[] = [];
    const memoryByIdentity = new Map<string | Base, Base>();
    for (const record of memory) {
      const identity = this.recordIdentity(record);
      if (typeof identity !== "string") {
        newRecords.push(record);
      } else {
        memoryByIdentity.set(identity, record);
      }
    }

    const merged = persisted.map((record) => {
      const identity = this.recordIdentity(record);
      if (typeof identity !== "string") return record;
      const memRecord = memoryByIdentity.get(identity);
      if (memRecord) {
        memoryByIdentity.delete(identity);
        return memRecord;
      }
      return record;
    });

    merged.push(...newRecords);
    return merged;
  }

  private findByScan(ids: unknown[]): Base | Base[] {
    // Fold each key through `normalizeAssociationKey` before stringifying: an
    // in-memory target PK is a BigInt (int8 default under PG bigserial) while a
    // `find(id)` argument is a number, and a raw `JSON.stringify` of a BigInt
    // throws outright ("Do not know how to serialize a BigInt"). Normalizing
    // both sides folds `1n` and `1` to the same key so the scan matches the way
    // Ruby's width-agnostic `Integer ==` does. `normalize` runs over both the
    // incoming `ids` and each target's `primaryKeyValue(r)`, which returns an
    // *array* for a composite-PK klass (see `primaryKeyValue`) — hence the
    // per-element map, so a composite key holding a BigInt doesn't re-introduce
    // the `JSON.stringify` throw on the target side.
    const normalize = (v: unknown) =>
      JSON.stringify(
        Array.isArray(v) ? v.map(normalizeAssociationKey) : normalizeAssociationKey(v),
      );
    const normalizedIds = ids.map(normalize);

    if (ids.length === 1) {
      const found = this.target.find(
        (r) => normalize(this.primaryKeyValue(r)) === normalizedIds[0],
      );
      if (!found) {
        throw new Error(`Couldn't find ${this.klass.name} with ID ${normalizedIds[0]}`);
      }
      return found;
    }

    const idSet = new Set(normalizedIds);
    const found = this.target.filter((r) => idSet.has(normalize(this.primaryKeyValue(r))));
    if (found.length !== ids.length) {
      const foundSet = new Set(found.map((r) => normalize(this.primaryKeyValue(r))));
      const missing = ids.filter((id) => !foundSet.has(normalize(id)));
      throw new Error(
        `Couldn't find all ${this.klass.name} with IDs (${missing.map(normalize).join(", ")})`,
      );
    }
    return found;
  }
}

/**
 * Shared per-record concat loop mirroring Rails'
 * `CollectionAssociation#concat_records` accumulation
 * (collection_association.rb:438-454): for each record run `addRecord`, fold its
 * boolean into `result &&= ...`, and `raise ActiveRecord::Rollback unless result`
 * so a record whose `save` merely returns false (a validation/callback abort that
 * doesn't raise) still rolls back the records already inserted in this batch.
 *
 * Rails' `result &&= insert_record(...)` short-circuits: once `result` is false,
 * `insert_record` is no longer evaluated for the remaining records, even though
 * `add_to_target` still runs for each (the record is still type-checked and added
 * to the in-memory target — `replace_on_target` ignores the block's return
 * value). `addRecord` receives `resultStillTrue` so callers reproduce that: do the
 * per-record target/callback work unconditionally, but only attempt the insert
 * while the accumulated result is still true. It returns whether this record's
 * insert succeeded — a record only added in memory (new-record owner, a
 * `before_add` abort, or the post-failure short-circuit) returns true so the fold
 * leaves `result` unchanged. The surrounding transaction wrap lives at each call
 * site (`CollectionAssociation#concat` / `CollectionProxy#push`) since a
 * new-record owner skips it.
 *
 * Single implementation shared by the runtime `CollectionProxy#push` path and the
 * `CollectionAssociation#concat`/`concatRecords` parity surface so the two can't
 * drift.
 *
 * @internal
 */
export async function concatRecordsLoop(
  records: Base[],
  addRecord: (record: Base, resultStillTrue: boolean) => Promise<boolean>,
): Promise<void> {
  let result = true;
  for (const record of records) {
    // `add_to_target` always runs (so the record is type-checked and buffered),
    // but the insert inside `addRecord` is gated on the current `result` to match
    // Ruby's `result &&= insert_record(...)` short-circuit.
    const inserted = await addRecord(record, result);
    result = result && inserted;
  }
  if (!result) throw new Rollback();
}

/**
 * Reach the protected `difference`/`intersection` overrides from the
 * module-level replace helpers.
 * @internal
 */
function diffHooks(assoc: CollectionAssociation): {
  difference(a: Base[], b: Base[]): Base[];
  intersection(a: Base[], b: Base[]): Base[];
} {
  return assoc as unknown as {
    difference(a: Base[], b: Base[]): Base[];
    intersection(a: Base[], b: Base[]): Base[];
  };
}

/** @internal */
export function includesRecord(records: Base[], record: Base): boolean {
  return records.some((r) => (r as unknown as { isEqual(o: unknown): boolean }).isEqual(record));
}

/** @internal */
async function replaceRecords(
  assoc: CollectionAssociation,
  newTarget: Base[],
  originalTarget: Base[],
): Promise<Base[]> {
  // Rails: delete(difference(target, new_target)); concat(difference(new_target, target))
  const diff = diffHooks(assoc);
  const toDelete = diff.difference(assoc.target, newTarget);
  if (toDelete.length > 0) await assoc.delete(...toDelete);
  const toAdd = diff.difference(newTarget, assoc.target);
  if (toAdd.length > 0) {
    try {
      await assoc.concat(...toAdd);
    } catch (e) {
      // Only translate validation/rollback failures; re-throw adapter/query errors as-is
      if (e instanceof Rollback) {
        (assoc as any).target = originalTarget;
        throw new RecordNotSaved(
          `Failed to replace ${assoc.reflection.name} because one or more records could not be saved.`,
          assoc.owner,
        );
      }
      throw e;
    }
  }
  return assoc.target;
}

/** @internal */
function replaceCommonRecordsInMemory(
  assoc: CollectionAssociation,
  newTarget: Base[],
  originalTarget: Base[],
): void {
  const common = diffHooks(assoc).intersection(newTarget, originalTarget);
  for (const record of common) {
    replaceOnTarget(assoc, record, true, true);
  }
}

/**
 * Rails `replace_on_target`'s pre-`yield` half: the index lookup, `before_add`
 * abort check, `set_inverse_instance`, and `@association_ids` reset. Returns the
 * replace index (`-1` when appending) or `null` when `before_add` aborted the
 * add (Rails' `catch(:abort) { ... } || return`). Shared by the sync
 * `replaceOnTarget` and the async `replaceOnTargetAsync` so both stay in parity.
 * @internal
 */
function beginReplaceOnTarget(
  assoc: CollectionAssociation,
  record: Base,
  skipCallbacks: boolean,
  replace: boolean,
): number | null {
  // Rails: `index = @target.index(record) if replace && (!record.new_record? ||
  // @replaced_or_added_targets.include?(record))` (collection_association.rb:478).
  const index =
    replace && (!record.isNewRecord() || assoc._replacedOrAddedTargets.has(record))
      ? indexInTarget(assoc, record)
      : -1;
  if (!skipCallbacks && !callback(assoc, "beforeAdd", record)) return null;
  assoc.setInverseInstance(record);
  (assoc as any)._associationIds = null;
  return index;
}

/**
 * Rails `replace_on_target`'s post-`yield` half: the target mutation and
 * `after_add` callback.
 * @internal
 */
function finishReplaceOnTarget(
  assoc: CollectionAssociation,
  record: Base,
  skipCallbacks: boolean,
  index: number,
): Base {
  const target = assoc.target;
  // Rails re-runs `@target.index(record)` after the `yield` — the block (a
  // save) can have added the record to `@replaced_or_added_targets` in between.
  let at = index;
  if (at === -1 && assoc._replacedOrAddedTargets.has(record)) at = indexInTarget(assoc, record);
  if (at !== -1 || record.isNewRecord()) assoc._replacedOrAddedTargets.add(record);
  if (at !== -1) {
    target[at] = record;
  } else {
    target.push(record);
  }
  if (!skipCallbacks) callback(assoc, "afterAdd", record);
  return record;
}

/**
 * Ruby's `@target.index(record)` inside `replace_on_target`: `Core#==`, not JS
 * reference identity, so a re-fetched persisted record dedups against the one
 * already buffered.
 * @internal
 */
function indexInTarget(assoc: CollectionAssociation, record: Base): number {
  return assoc.target.findIndex((r) => r === record || r.isEqual(record));
}

/** @internal */
function replaceOnTarget(
  assoc: CollectionAssociation,
  record: Base,
  skipCallbacks: boolean,
  replace: boolean,
): Base | null {
  const index = beginReplaceOnTarget(assoc, record, skipCallbacks, replace);
  if (index === null) return null;
  return finishReplaceOnTarget(assoc, record, skipCallbacks, index);
}

/**
 * Async twin of `replaceOnTarget`: runs `save` at Rails' `yield(record)` point
 * — after `set_inverse_instance`, before the target mutation and after_add.
 * Kept as a separate async function so the sync `replaceOnTarget` callers
 * (build/replace paths) stay synchronous.
 * @internal
 */
async function replaceOnTargetAsync(
  assoc: CollectionAssociation,
  record: Base,
  skipCallbacks: boolean,
  replace: boolean,
  save?: () => Promise<void>,
): Promise<Base | null> {
  const index = beginReplaceOnTarget(assoc, record, skipCallbacks, replace);
  if (index === null) return null;
  if (save) await save();
  return finishReplaceOnTarget(assoc, record, skipCallbacks, index);
}

/**
 * The owner + reflection pair {@link callback} needs. Both the
 * `CollectionAssociation` and the `CollectionProxy` (which holds the same two
 * pieces under different field names) satisfy it.
 * @internal
 */
export interface CallbackHost {
  owner: Base;
  reflection: { name: string; options: object };
}

/**
 * Unified association-callback dispatch. Mirrors Rails'
 * `CollectionAssociation#callback` (collection_association.rb:492), whose
 * lookup half is `callbacks_for` (:498): looks up the registered callbacks for
 * `kind` (`beforeAdd`/`afterAdd`/`beforeRemove`/`afterRemove`) and invokes
 * each. Returns `false` if any callback aborts (Rails `throw :abort`,
 * modelled here as a callback returning `false`), so callers can halt the
 * add/remove like Rails' `catch(:abort) ... || return`.
 *
 * Arity note: like Rails, the stored procs take `(method, owner, record)` and
 * this dispatcher passes `kind` through as `method`. The symbol and proc arms
 * ignore it, but the object arm needs it — Rails' `callback.send(method, owner,
 * record)` (builder/collection_association.rb:51) dispatches the callback kind
 * as a method ON the callback object, so binding it at registration time would
 * silently drop object callbacks.
 *
 * `callback` is private in Rails, hence `@internal`.
 * @internal
 */
export function callback(assoc: CallbackHost, kind: string, record: Base): boolean {
  // Rails wraps only `before_add`/`before_remove` in `catch(:abort)`
  // (collection_association.rb:400-402, 462-464); after callbacks run outside
  // the catch (:408, :485), so a `throw :abort` from after_add/after_remove
  // propagates rather than being silently swallowed.
  const catchAbort = kind.startsWith("before");
  for (const cb of callbacksFor(assoc, kind)) {
    if (typeof cb !== "function") continue;
    // A before callback halts the add/remove ONLY by throwing the abort sentinel
    // (faithful `throw :abort`); a `false` return no longer halts (Rails 5+).
    if (catchAbort) {
      try {
        (cb as any)(kind, assoc.owner, record);
      } catch (e) {
        if (!isAbortSignal(e)) throw e;
        return false;
      }
    } else {
      // after callbacks run outside the catch; their return value is ignored.
      (cb as any)(kind, assoc.owner, record);
    }
  }
  return true;
}

/** @internal */
function callbacksFor(assoc: CallbackHost, callbackName: string): unknown[] {
  // The builder stores normalized callbacks both as the
  // `<kind>For<Name>` class attribute (Rails parity) and on the reflection
  // options; either is the same array. Prefer the class attribute, matching
  // Rails' `owner.class.send("#{callback_name}_for_#{reflection.name}")`.
  const fullName = `${callbackName}For${assoc.reflection.name.charAt(0).toUpperCase()}${assoc.reflection.name.slice(1)}`;
  const owner = assoc.owner.constructor as any;
  const stored = owner[fullName];
  if (typeof stored === "function") return stored();
  if (Array.isArray(stored)) return stored;
  const fromOptions = (assoc.reflection.options as Record<string, unknown>)[callbackName];
  return Array.isArray(fromOptions) ? fromOptions : fromOptions != null ? [fromOptions] : [];
}

/** @internal */
function isIncludeInMemory(assoc: CollectionAssociation, record: Base): boolean {
  // For through reflections, also check through the source chain.
  const refl = assoc.reflection as any;
  if (refl.isThroughReflection?.()) {
    const throughName = refl.options?.through;
    if (throughName) {
      const throughAssoc = (assoc.owner as any).association?.(throughName);
      const sourceRefl = refl.sourceReflection?.();
      if (throughAssoc && sourceRefl) {
        const sourceName = sourceRefl.name;
        const reader = throughAssoc.target as Base[];
        if (Array.isArray(reader)) {
          const found = reader.some((source: any) => {
            const targetRefl = source[sourceName];
            if (Array.isArray(targetRefl)) return targetRefl.includes(record);
            return targetRefl === record;
          });
          if (found) return true;
        }
      }
    }
  }
  return assoc.target.includes(record);
}

function arraysEqual(a: Base[], b: Base[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((r, i) => r === b[i]);
}

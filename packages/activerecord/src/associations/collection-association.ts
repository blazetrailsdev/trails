import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import {
  underscore,
  isAbortSignal,
  compactBlank,
  indexBy,
  valuesAt,
} from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/activemodel";
import { Association } from "./association.js";
import type { AssociationProxy } from "./collection-proxy.js";
import { _CollectionProxyCtor } from "./collection-proxy-slot.js";
import { foreignKeyPresentFor, ownerForeignKeyColumns } from "./foreign-association.js";
import type { AssociationReflection } from "../reflection.js";
import { RecordNotFound, RecordNotSaved, Rollback } from "../errors.js";
import { CollectionIdsAssignmentError, CollectionPersistedAssignmentError } from "./errors.js";

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
  /** Mirrors `@proxy` (collection_association.rb:41). */
  protected _proxy?: AssociationProxy;
  protected _associationIds: unknown[] | null = null;
  // Whether the most recent `removeRecords` was halted by a `before_remove`
  // abort. Rails leaves `@target` untouched on abort (remove_records exits
  // before `@target -= records`), and for has_many :through the abort-nil is
  // masked by HMT#remove_records' `delete_through_records` return — so the
  // CollectionProxy through-branch reads this to avoid pruning its loaded
  // target when the removal was actually aborted. Read externally by the proxy.
  _lastRemoveAborted = false;
  /**
   * Mirrors: `CollectionAssociation#callback` / `#callbacks_for`
   * (collection_association.rb:492-505) — instance methods on the association,
   * assigned as `this`-typed functions (CLAUDE.md's spelling for a body that
   * lives at its Rails file position) so every call site is Rails'
   * `callback(:before_add, record)` rather than a free function taking the
   * receiver as its first argument.
   *
   * @internal
   */
  callback = callback;
  /** @internal */
  callbacksFor = callbacksFor;

  // Rails has no `CollectionAssociation#initialize`: `Association#initialize`
  // runs `reset` (association.rb:46), which seeds `@target = []`
  // (collection_association.rb:89). trails' base constructor does not call
  // `reset`, so the collection seat is opened here instead.
  constructor(owner: Base, definition: AssociationDefinition) {
    super(owner, definition);
    this._targetStore = [];
  }

  /**
   * Ruby's `@target` for a collection is always an Array (`reset` seeds it with
   * `[]`, collection_association.rb:89); the override only narrows the
   * singular-shaped base type.
   */
  override get target(): Base[] {
    return this._targetStore as Base[];
  }

  /**
   * Mirrors: ActiveRecord::Associations::CollectionAssociation#target=
   * (`collection_association.rb:284-295`). Without `has_many_inversing` this is
   * the plain holder write (`super`); with it, a single inverse record folds
   * into the collection via `replace_on_target(record, true, replace: true,
   * inversing: true)` and a `nil` is a no-op — it cannot be removed from the
   * inverse.
   */
  override set target(record: Base | Base[] | null) {
    if (!this.reflection.klass?.hasManyInversing) {
      super.target = record;
      return;
    }

    if (record === null) {
    } else if (Array.isArray(record)) {
      super.target = record;
    } else {
      void this.replaceOnTarget(record, true, { replace: true, inversing: true });
    }
  }

  /**
   * Rails' `@replaced_or_added_targets`, the other half of
   * `replace_on_target`'s state.
   * @internal
   */
  _replacedOrAddedTargets = new Set<Base>();

  /**
   * Rails' `@_was_loaded` (collection_association.rb:468-489): `loaded?` as of
   * the `insert_record` yield, so `replace_on_target` can tell an append it
   * still owes from one the save's own callbacks already made by loading the
   * association.
   * @internal
   */
  _wasLoaded: boolean | null = null;

  /**
   * Implements the writer method, e.g. foo.items= for Foo.has_many :items.
   * Replaces the entire collection.
   *
   * Awaitable: mirrors Rails' `CollectionAssociation#writer` → `replace`
   * (collection_association.rb:46-48, :242), which for a *persisted* owner
   * runs the diffed deletes + inserts inline in a transaction. That is DB I/O,
   * so this returns a Promise — the sync property setter cannot await it and
   * uses {@link syncWrite} instead (RFC 0068).
   */
  async writer(records: Base[]): Promise<void> {
    await this.replace(records);
  }

  /**
   * Writer for the JS property setter (`owner.items = [...]`,
   * builder/collection-association.ts `defineWriters`) and mass-assignment,
   * neither of which can `await`.
   *
   * - **Unpersisted owner, no I/O owed:** in-memory `replace`, exactly as Rails
   *   does no I/O for such an owner (the FK isn't known yet); autosave persists
   *   at the owner's first `save()`.
   * - **Persisted owner, or any replace that owes I/O:** THROW. Rails replaces
   *   inline at assignment; JS cannot do synchronous DB I/O from a property
   *   setter, so rather than deferring the writes to the owner's next `save()`
   *   (where a deferred delete can race an interim insert) we throw and name
   *   the awaitable Rails-named replacement (`await owner.items.replace([...])`).
   *
   * A NEW owner can owe I/O too, which is why the second arm is not just the
   * persisted one: Rails loads the target before diffing even for a new owner
   * (`skip_strict_loading { load_target }`, collection_association.rb:244), and
   * that load is a query once the owner's primary key is set (`find_target?`,
   * association.rb:190). Removing an already-persisted record is the other
   * case — Rails deletes it in a transaction (`delete_or_destroy`, :393-397).
   * Both are refused BEFORE `replace` mutates anything, so this path never
   * schedules DB work nobody can await.
   *
   * RFC 0087 §1 listed this for deletion with the property setter it backed.
   * The setter is gone; this survives deliberately, because Rails'
   * `assign_attributes` returns nil and assigns inline
   * (`activemodel/lib/active_model/attribute_assignment.rb:32-35`) — trails
   * matches that, so mass assignment can never await and this is its only
   * route into the collection writer.
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
    if (
      (this.owner as { isPersisted?: () => boolean }).isPersisted?.() ||
      this.findTargetNeeded() ||
      this.difference(this.target, records).some((r) => !r.isNewRecord())
    ) {
      throw new CollectionPersistedAssignmentError(this.reflection.name);
    }
    this.replace(records) as Base[];
  }

  /**
   * The `#{singular}Ids` analogue of {@link syncWrite}, reached from
   * mass assignment (`new Author({ postIds })`, `assignAttributes`) — and,
   * unlike it, a throw on BOTH owner arms.
   *
   * `syncWrite`'s unpersisted arm is faithful because Rails does no I/O for a
   * new-record owner either. `ids_writer` has no such arm: it resolves the ids
   * to records with a query before replacing
   * (collection_association.rb:61-83), so the new-record path is DB I/O too.
   * Awaitable surfaces exist for both arms —
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
   *
   * @missingRailsCall empty? — PERMANENT: Verified per-site (RFC 0106):
   *   `target.empty?` (collection_association.rb:54) — `empty?` on a Ruby Array,
   *   whose faithful JS spelling is `xs.length === 0`. That emits no callee, so
   *   no TS call can ever credit the Ruby one. The gate flags it only because
   *   `empty?` maps onto the unrelated `ActiveRecord::Result.empty`, which takes
   *   arguments since it gained Rails' `async:` kwarg (result.rb:94-100) —
   *   nothing in the TS body was dropped.
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
    return this.reflection.associationPrimaryKey?.() ?? (this.klass as any).primaryKey ?? "id";
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
    const klass = this.klass as any;
    // Rails `ids_writer`: `primary_key = reflection.association_primary_key`.
    // For a through/custom-PK association this is the association's own key
    // (e.g. `Category.primary_key == "name"`), not the target model's `id`, so
    // the lookup + not-found message key must come from the rich reflection.
    const primaryKey = this.associationPrimaryKey();
    const pkType = klass.typeForAttribute(primaryKey);
    ids = compactBlank(ids == null ? [] : Array.isArray(ids) ? ids : [ids]);
    ids = ids.map((id) => pkType.cast(id));

    // Ruby Hash keys compare by value, so Rails can `index_by` a composite
    // tuple and read it straight back with `values_at(*ids)`. A JS object keys
    // an array by its `toString`, and a Map by identity, so both arms index
    // under this explicit string form of the key — that is all `indexKey` is.
    const indexKey = (key: unknown): string =>
      Array.isArray(key) ? key.map(String).join(",") : String(key);
    let indexed: Record<string, Base>;
    if (klass.compositePrimaryKey) {
      // `where(cols, tuples)` is the trails spelling of Rails' array-key
      // `klass.where(primary_key => ids)`, which a JS object literal cannot
      // express (predicate-builder.ts:388).
      const rows: Base[] = await klass.where(primaryKey, ids).toArray();
      indexed = indexBy<Base, string>(rows, (record) =>
        indexKey(
          (primaryKey as string[]).map((primaryKey) => (record as any)._readAttribute(primaryKey)),
        ),
      );
    } else {
      const rows: Base[] = await klass.where({ [primaryKey as string]: ids }).toArray();
      indexed = indexBy<Base, string>(rows, (record) =>
        indexKey((record as any)._readAttribute(primaryKey as string)),
      );
    }
    // Rails: `.values_at(*ids).compact` over the `index_by` result — the keys
    // are the explicit string form above, so the ids are mapped through
    // `indexKey` too.
    const records: Base[] = valuesAt(indexed, ...ids.map(indexKey)).filter(
      (record): record is Base => record != null,
    );

    if (records.length !== ids.length) {
      const foundIds = records.map((record) =>
        Array.isArray(primaryKey)
          ? primaryKey.map((primaryKey) => (record as any)._readAttribute(primaryKey))
          : (record as any)._readAttribute(primaryKey),
      );
      const foundKeys = new Set(foundIds.map(indexKey));
      const notFoundIds = ids.filter((id) => !foundKeys.has(indexKey(id)));
      klass
        .all()
        .raiseRecordNotFoundExceptionBang(ids, records.length, ids.length, primaryKey, notFoundIds);
    } else {
      await this.replace(records);
    }
  }

  override reset(): void {
    super.reset();
    this._targetStore = [];
    // Rails' `Set.new.compare_by_identity`: a JS Set already compares object
    // members by identity.
    this._replacedOrAddedTargets = new Set<Base>();
    this._associationIds = null;
  }

  /**
   * Find records within the association. If inverse_of is set and the
   * collection is loaded, scans the in-memory target. Otherwise
   * delegates to the association scope.
   */
  async find(...args: unknown[]): Promise<Base | Base[] | null> {
    const scope = this.scope();

    if (this.reflection.options.inverseOf && this.isLoaded()) {
      const argsFlatten = (args as any[]).flat(Infinity);
      const model = scope.model;

      if (argsFlatten.length === 0) {
        throw new RecordNotFound(
          `Couldn't find ${model.name} without an ID`,
          model.name,
          String(model.primaryKey),
          args,
        );
      }

      const result = this.findByScan(args);

      const resultSize = Array.isArray(result) ? result.length : result == null ? 0 : 1;
      if (!result || resultSize !== argsFlatten.length) {
        scope.raiseRecordNotFoundExceptionBang(argsFlatten, resultSize, argsFlatten.length);
      }
      return result as Base | Base[];
    }

    if (scope && typeof scope.find === "function") {
      return await scope.find(...args);
    }
    return null;
  }

  build(attributes: Record<string, unknown>[], block?: (record: Base) => void): Base[];
  build(attributes?: Record<string, unknown>, block?: (record: Base) => void): Base;
  build(
    attributes?: Record<string, unknown> | Record<string, unknown>[],
    block?: (record: Base) => void,
  ): Base | Base[] {
    if (Array.isArray(attributes)) {
      return attributes.map((attr) => this.build(attr, block));
    } else {
      return this.addToTarget(this.buildRecord(attributes, block)!, { replace: true })!;
    }
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
  concat(...records: Base[]): Promise<Base[] | undefined> | Base[] | undefined {
    records = records.flat();
    if (this.owner.isNewRecord()) {
      const loaded = this.skipStrictLoading(() => this.loadTarget());
      return isThenable(loaded)
        ? loaded.then(() => this.concatRecords(records))
        : this.concatRecords(records);
    }
    return this.transaction(() => this.concatRecords(records));
  }

  /**
   * Run `block` in the reflection klass's transaction.
   *
   * Mirrors: ActiveRecord::Associations::CollectionAssociation#transaction —
   * overridden by `ThroughAssociation#transaction` (the through model's), which
   * `HasManyThroughAssociation` picks up.
   * @internal
   */
  protected transaction<R>(block: () => Promise<R> | R): Promise<R | undefined> {
    // Rails: reflection.klass.transaction(&block) — uses the reflection's klass, not assoc.klass
    const klass = (this.reflection as any).klass ?? this.klass;
    if (klass && typeof klass.transaction === "function") {
      return klass.transaction(() => Promise.resolve(block()));
    }
    return Promise.resolve(block());
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

  /**
   * Mirrors: ActiveRecord::Associations::CollectionAssociation#insert_record
   * (collection_association.rb:377-383) — `raise` picks `save!`, which raises
   * from inside the save, over `save`, which returns false.
   * @internal
   */
  async insertRecord(
    record: Base,
    validate = true,
    raise = false,
    block?: (record: Base) => void,
  ): Promise<boolean> {
    if (raise) {
      return !!(await (record as any).saveBang({ validate }, block));
    } else {
      return !!(await (record as any).save({ validate }, block));
    }
  }

  /**
   * Mirrors: ActiveRecord::Associations::CollectionAssociation#_create_record
   * (collection_association.rb:354-372).
   *
   * @internal
   */
  protected override async _createRecord(
    attributes?: Record<string, unknown> | Record<string, unknown>[],
    raise = false,
    block?: (record: Base) => void,
  ): Promise<Base | Base[] | null> {
    if (!this.owner.isPersisted()) {
      throw new RecordNotSaved("You cannot call create unless the parent is saved", this.owner);
    }

    if (Array.isArray(attributes)) {
      const records: Base[] = [];
      for (const attr of attributes) {
        records.push((await this._createRecord(attr, raise, block)) as Base);
      }
      return records;
    }

    const record = this.buildRecord(attributes, block);
    if (!record) return null;
    await this.transaction(async () => {
      let result: boolean | undefined = undefined;
      await this.addToTarget(record, {}, async () => {
        result = await this.insertRecord(record, true, raise, () => {
          this._wasLoaded = this.isLoaded();
        });
      });
      if (!result) throw new Rollback();
    });
    return record;
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
  protected concatRecords(records: Base[], raise = false): Promise<Base[]> | Base[] {
    const looped = concatRecordsLoop(records, (record, resultStillTrue) => {
      (this as any).raiseOnTypeMismatchBang(record);
      // Mirror Rails' `add_to_target(record) { insert_record }`
      // (collection_association.rb:440-446): the insert runs *inside* the
      // funnel — after before_add + set_inverse_instance, before the target
      // mutation and after_add — rather than after the whole add. A
      // before_add abort (`added == null`) skips the yield, so `inserted`
      // stays true and the fold leaves `result` unchanged.
      let inserted = true;
      const added = this.addToTarget(record, {}, () => {
        // `resultStillTrue === false` → a prior record failed, so Rails'
        // `result &&= insert_record` short-circuits the save.
        if (this.owner.isNewRecord() || !resultStillTrue) return;
        return this.insertRecord(record, true, raise, () => {
          this._wasLoaded = this.isLoaded();
        }).then((result) => {
          inserted = result;
        });
      });
      return isThenable(added) ? added.then(() => inserted) : inserted;
    });
    return isThenable(looped) ? looped.then(() => records) : records;
  }

  /**
   * Removes all records from the association. Honors the :dependent
   * option. If :dependent is :destroy, uses :delete_all strategy instead.
   */
  async deleteAll(dependent?: string): Promise<number> {
    // Rails' `[:nullify, :delete_all].include?(dependent)`. `:delete_all` is
    // spelled both ways in trails: `"delete_all"` (the literal Symbol name, what
    // the proxy has always accepted from callers) and `"deleteAll"` (the
    // camelCased form the internal `method` dispatch below runs on).
    if (
      dependent &&
      dependent !== "nullify" &&
      dependent !== "delete_all" &&
      dependent !== "deleteAll"
    ) {
      throw new ArgumentError("Valid values are :nullify or :delete_all");
    }

    const optionDep = this.options.dependent;
    dependent =
      dependent === "delete_all"
        ? "deleteAll"
        : dependent
          ? dependent
          : // Rails: `options[:dependent] == :destroy` (collection_association.rb:157).
            optionDep === "destroy" || optionDep === "delete"
            ? "deleteAll"
            : optionDep;

    const count = await this.deleteOrNullifyAllRecords(dependent);

    this.reset();
    this.loadedBang();
    return count;
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
  protected async deleteOrNullifyAllRecords(method?: string): Promise<number> {
    if (method === "deleteAll") {
      return this.deleteAllRecords();
    }
    return this.nullifyAllRecords();
  }

  /**
   * Destroy all records from this association, calling destroy callbacks.
   *
   * Mirrors Rails' `CollectionAssociation#destroy_all`: routes the loaded
   * target through `destroy` (→ `remove_records`) so `before_remove` /
   * `after_remove` fire — not a direct `record.destroy` loop, which would
   * bypass the collection callbacks on `owner.destroy` (`dependent: :destroy`).
   */
  async destroyAll(): Promise<Base[] | undefined> {
    // `destroy(load_target)` — the loaded target goes in as ONE argument, as in
    // Ruby, so the pre-flatten empty check sees a non-empty arg list and an
    // empty collection destroys to `[]` rather than nil.
    const destroyed = await this.destroy(await this.loadTarget());
    this.reset();
    this.loadedBang();
    return destroyed;
  }

  /**
   * Remove specific records from the association using the :dependent
   * strategy. Calls before_remove/after_remove callbacks.
   */
  delete(
    ...records: Array<Base | number | string | bigint>
  ): Promise<Base[] | undefined> | Base[] | undefined {
    // Pass the raw splat (do NOT pre-flatten) so deleteOrDestroy's
    // `records.empty?` check sees the un-flattened arg list, matching Rails:
    // `delete()` → [] → nil, but `delete([])` → [[]] (size 1) → [] → [].
    return this.deleteOrDestroy(records, this.reflection.options.dependent);
  }

  /**
   * Destroy specific records, ignoring the :dependent option.
   * Calls before_remove/after_remove + before_destroy/after_destroy callbacks.
   */
  async destroy(
    ...records: Array<Base | number | string | bigint | Base[]>
  ): Promise<Base[] | undefined> {
    // Raw splat, as in `delete` above — the empty check is pre-flatten. A
    // nested array is flattened by `delete_or_destroy` itself, as in Ruby.
    return this.deleteOrDestroy(records as Array<Base | number | string | bigint>, "destroy");
  }

  /**
   * Returns the size of the collection by executing a SELECT COUNT(*) query if
   * the collection hasn't been loaded, and by counting `target` if it has.
   *
   * Mirrors: ActiveRecord::Associations::CollectionAssociation#size
   * (collection_association.rb:209-222), all five arms in Rails' order. The two
   * in-memory arms stay synchronous — Rails' first two issue no query either —
   * while the grouped arm and the two counted arms return a promise, since a
   * grouped COUNT(*) yields one row per group rather than a scalar and so has to
   * load the target and count it in memory.
   *
   * Rails declares `count_records` only on the descendants
   * (has_many_association.rb:80, has_many_through_association.rb:79) and calls it
   * abstractly from here; every concrete collection association is a
   * `HasManyAssociation`, so it is reached through the subclass rather than
   * through a base declaration Rails does not have.
   *
   * @missingRailsCall empty? — PERMANENT: Verified per-site (RFC 0106):
   *   `target.empty?` / `association_scope.group_values.empty?`
   *   (collection_association.rb:214, :216) are `.length === 0` property reads,
   *   which the gate deliberately does not credit as calls
   *   (JS_ENUMERABLE_ALIASES, RFC 0092).
   */
  size(): Promise<number> | number {
    if (!this.findTargetNeeded() || this.isLoaded()) {
      return this.target.length;
    } else if (this._associationIds) {
      return this._associationIds.length;
    } else if (
      ((this.associationScope() as { groupValues?: unknown[] } | undefined)?.groupValues ?? [])
        .length > 0
    ) {
      return Promise.resolve(this.loadTarget()).then((target) => target.length);
    } else if (
      !(this.associationScope() as { distinctValue?: boolean } | undefined)?.distinctValue &&
      this.target.length > 0
    ) {
      const unsavedRecords = this.target.filter((record) => record.isNewRecord());
      return (this as unknown as { countRecords(): Promise<number> })
        .countRecords()
        .then((count) => unsavedRecords.length + count);
    } else {
      return (this as unknown as { countRecords(): Promise<number> }).countRecords();
    }
  }

  async isEmpty(): Promise<boolean> {
    if (this.isLoaded() || this._associationIds || this.reflection.hasActiveCachedCounter?.()) {
      return (await this.size()) === 0;
    }
    return this.target.length === 0 && !(await this.scope().exists());
  }

  /**
   * Replace this collection with other_array. Performs a diff and
   * delete/add only records that have changed.
   *
   * Mirrors: ActiveRecord::Associations::CollectionAssociation#replace
   * (collection_association.rb:242-256) — the type-mismatch guard, its own
   * `skip_strict_loading { load_target }.dup` baseline, and both owner arms,
   * with `transaction { replace_records(...) }` inline on the persisted one.
   *
   * `Promise<Base[] | undefined> | Base[]` rather than `async`, for the reason
   * {@link concat} (collection_association.rb:120) has the same shape: this is
   * reached from `syncWrite`, whose mass-assignment caller cannot await, and an
   * `async` body would defer even the I/O-free new-owner arm past its caller's
   * next statement. `loadTarget` is the one place Rails' body does I/O, so the
   * rest of it continues off that promise where there is one.
   */
  replace(otherArray: Base[]): Promise<Base[] | undefined> | Base[] {
    this.raiseIfLoadInFlight();
    for (const val of otherArray) (this as any).raiseOnTypeMismatchBang(val);
    const replaceAgainst = (originalTarget: Base[]): Promise<Base[] | undefined> | Base[] => {
      if (this.owner.isNewRecord()) {
        return replaceRecords(this, otherArray, originalTarget);
      } else {
        replaceCommonRecordsInMemory(this, otherArray, originalTarget);
        if (!arraysEqual(otherArray, originalTarget)) {
          return this.transaction(() => replaceRecords(this, otherArray, originalTarget));
        } else {
          return otherArray;
        }
      }
    };
    const loaded = this.skipStrictLoading(() => this.loadTarget());
    return isThenable(loaded)
      ? loaded.then((target) => replaceAgainst([...target]))
      : replaceAgainst([...loaded]);
  }

  /**
   * Mirrors: ActiveRecord::Associations::CollectionAssociation#include?
   * (collection_association.rb:258-270) — a new record is looked for in
   * memory, a loaded collection in its target, and anything else with an
   * `exists?` against the scope.
   */
  async isInclude(record: Base): Promise<boolean> {
    const klass = this.klass;
    if (!(record instanceof klass)) return false;

    if (record.isNewRecord()) {
      return await this.isIncludeInMemory(record);
    } else if (this.isLoaded()) {
      return this.target.includes(record);
    } else {
      // Rails: `klass.primary_key.zip(record.id).to_h` for a composite key —
      // `exists?` needs the column=>value hash, not a bare tuple.
      const recordId = klass.compositePrimaryKey
        ? Object.fromEntries(
            (klass.primaryKey as string[]).map((key, i) => [key, (record.id as unknown[])[i]]),
          )
        : record.id;
      return await this.scope().exists(recordId);
    }
  }

  /**
   * Mirrors: ActiveRecord::Associations::CollectionAssociation#include_in_memory?
   * (collection_association.rb:507-519).
   */
  private async isIncludeInMemory(record: Base): Promise<boolean> {
    const reflection = this.reflection as unknown as {
      isThroughReflection?: () => boolean;
      throughReflection?: { name: string } | null;
      sourceReflection?: { name: string } | null;
    };
    if (reflection.isThroughReflection?.()) {
      const assoc = (
        this.owner as unknown as { association: (n: string) => Association }
      ).association(reflection.throughReflection!.name);
      const sourceName = reflection.sourceReflection!.name;
      const reader = (await assoc.reader) as Base[];
      const targetReflections = await Promise.all(
        reader.map((source) => (source as unknown as Record<string, unknown>)[sourceName]),
      );
      return (
        targetReflections.some((targetReflection) =>
          Array.isArray(targetReflection)
            ? targetReflection.includes(record)
            : targetReflection === record,
        ) || this.target.includes(record)
      );
    }
    return this.target.includes(record);
  }

  /**
   * Load target from database and merge with in-memory records.
   */
  override loadTarget(): Promise<Base[]> | Base[] {
    const loaded = (): Base[] => {
      this.loadedBang();
      return this.target;
    };
    if (this.findTargetNeeded()) {
      return Promise.resolve(this.findTarget()).then((findTarget) => {
        this._targetStore = this.mergeTargetLists(findTarget as Base[], this.target);
        return loaded();
      });
    }

    return loaded();
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
   *
   * Rails passes `replace: replace || association_scope.distinct_value`, so a
   * `distinct` association scope dedups in place on append rather than
   * appending the same record twice. As in Rails the scope build is unguarded:
   * `association_scope` raising here is a real failure, not something
   * `add_to_target` absorbs into a `false`.
   */
  addToTarget(record: Base, options?: { skipCallbacks?: boolean; replace?: boolean }): Base | null;
  addToTarget(
    record: Base,
    options: { skipCallbacks?: boolean; replace?: boolean },
    save: () => Promise<void> | void,
  ): Promise<Base | null> | Base | null;
  addToTarget(
    record: Base,
    options: { skipCallbacks?: boolean; replace?: boolean } = {},
    save?: () => Promise<void> | void,
  ): Base | null | Promise<Base | null> {
    const { skipCallbacks = false, replace = false } = options;
    const distinctValue = !!(this.associationScope() as { distinctValue?: boolean } | undefined)
      ?.distinctValue;
    const shouldReplace = replace || distinctValue;
    if (save) {
      return this.replaceOnTarget(record, skipCallbacks, { replace: shouldReplace }, save);
    }
    return this.replaceOnTarget(record, skipCallbacks, { replace: shouldReplace }) as Base | null;
  }

  /**
   * Returns the scope (Relation) for this association, applying
   * none! if the scope is null (owner is new and has no FK).
   */
  override scope(): any {
    const s = super.scope();
    if (this.isNullScope() && s && typeof s.none === "function") {
      const nulled = s.none();
      // Trails-only seed marker (no Rails counterpart): a relation spawned off
      // this `1=0` scope — or the `CollectionProxy` memoizing it as `@scope` —
      // must be able to rebase onto the live association scope once the owner
      // is saved. Rails needs no marker because `reader` runs
      // `@proxy.reset_scope` on every read (collection_association.rb:42), so a
      // stale scope is never observed there.
      nulled._seededNoneNewOwner = true;
      nulled._seedWherePredicates = [...nulled.whereClause.predicates];
      return nulled;
    }
    return s;
  }

  /**
   * Whether the target can be fetched for a new-record owner: the owner's
   * `active_record_primary_key` must be present
   * (`ForeignAssociation#foreign_key_present?`, foreign_association.rb:5). A
   * has_many :through overrides this with `ThroughAssociation#foreign_key_present?`
   * (through_association.rb:90), which the mixin installs on
   * `HasManyThroughAssociation` itself.
   * `CollectionProxy#null_scope?` (collection_proxy.rb:1150-1152) delegates
   * here through `isNullScope`, so the proxy and the association cannot
   * disagree.
   */
  protected override foreignKeyPresent(): boolean {
    return foreignKeyPresentFor(this.reflection as unknown as AssociationReflection, this.owner);
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
      this.target.some((r) => r.isNewRecord() || r.isChanged)
    );
  }

  override isCollection(): boolean {
    return true;
  }

  /**
   * Mirrors: CollectionAssociation#reader (collection_association.rb:33-42).
   *
   * The reload arm issues the load query, so the body after `ensure_klass_exists!`
   * is a promise — Rails' four lines in Rails' order, awaited by the caller.
   * Rails' return value is `@proxy` itself; trails' CollectionProxy is thenable
   * (it resolves to its records), so awaiting this promise hands back the
   * records the proxy holds rather than the proxy object. Callers that need the
   * proxy object take it from `record.<name>` (the generated accessor), which is
   * the same cached instance this returns. `reset_scope` is likewise called for
   * effect: it returns the raw proxy, not the JS Proxy wrapper callers hold.
   *
   * It is called here, not left to `association()`: that factory resets only on
   * its own cache-hit path (the trails generated accessor's reader, RFC 0022),
   * so without this line a second `reader` would skip Rails' fourth line. The
   * cost is one redundant reset on the read that first builds the proxy;
   * `reset_scope` is idempotent.
   */
  override get reader(): Promise<Base[]> {
    this.ensureKlassExists();

    return (async () => {
      if (this.isStaleTarget()) {
        await this.reload();
      }

      const CollectionProxy = _CollectionProxyCtor as unknown as {
        create(klass: typeof Base, association: CollectionAssociation): AssociationProxy;
      };
      this._proxy ??= CollectionProxy.create(this.klass, this);
      this._proxy.resetScope();
      return this._proxy;
    })();
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

  /**
   * Mirrors `ForeignAssociation#set_owner_attributes` (foreign_association.rb:22),
   * which zips `Array(reflection.join_primary_key)` — the child FK columns —
   * against `Array(reflection.join_foreign_key)`. For a has_many the latter is
   * `active_record_primary_key`, not the owner's bare `primary_key`: a composite
   * FK derived from the owner's `query_constraints` (`Sharded::BlogPost`
   * `[blog_id, id]`) only pairs correctly through that resolver, and
   * `ctor.primaryKey` would collapse both FK columns onto `id`.
   */
  protected setOwnerAttributes(record: Base): void {
    if (this.reflection.options.through) return;

    const ctor = this.owner.constructor as any;
    const fks = this.foreignKeyColumns();
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
      const typeName = (ctor as typeof Base).polymorphicName();
      if (typeof (record as any)._writeAttribute === "function") {
        (record as any)._writeAttribute(typeCol, typeName);
      } else {
        (record as any)[typeCol] = typeName;
      }
    }
  }

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

  protected deleteOrDestroy(
    records: Array<Base | number | string | bigint>,
    method?: string,
  ): Promise<Base[] | undefined> | Base[] | undefined {
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
    const coerced = this.coerceToRecords(records);
    // Rails remove_records aborts via `catch(:abort) { ... } || return` → nil
    // (collection_association.rb:399-402), so a halted before_remove returns nil.
    const remove = (coerced: Base[]): Promise<Base[] | undefined> | Base[] | undefined => {
      const resolved = (coerced as unknown[]).flat(Infinity) as Base[];
      for (const record of resolved) (this as any).raiseOnTypeMismatchBang(record);
      const existingRecords = resolved.filter((r) => !r.isNewRecord());
      // A `before_remove` abort halts removal (removeRecords returns false); like
      // Rails, leave the target untouched and report no removed records.
      if (existingRecords.length === 0) {
        const removed = this.removeRecords(existingRecords, resolved, method ?? "");
        return isThenable(removed)
          ? removed.then((r) => (r ? resolved : undefined))
          : removed
            ? resolved
            : undefined;
      }
      let removed = false;
      return this.transaction(async () => {
        removed = await this.removeRecords(existingRecords, resolved, method ?? "");
      }).then(() => (removed ? resolved : undefined));
    };
    return isThenable(coerced) ? coerced.then(remove) : remove(coerced);
  }

  /**
   * Mirrors Rails' `delete_or_destroy` id-coercion: resolve Integer/String
   * keys to records *within the association* (Rails' scoped `find`, never
   * `klass.find`). Through associations resolve against the join-aware loaded
   * target — trails' through `scope()`-based `find` can't query across the
   * join (see HMT `idsReader`).
   * @internal
   */
  private coerceToRecords(
    records: Array<Base | number | string | bigint>,
  ): Promise<Base[]> | Base[] {
    const isId = (r: Base | number | string | bigint): r is number | string | bigint =>
      typeof r === "number" || typeof r === "string" || typeof r === "bigint";
    if (!records.some(isId)) return records as Base[];
    const ids = records.map((r) => (isId(r) ? r : (r as any).id));
    if (this.reflection.options.through) {
      return Promise.resolve(this.loadTarget()).then((target) =>
        ids.map((id) => {
          const found = target.find((r) => String((r as any).id) === String(id));
          if (!found) throw new Error(`Couldn't find ${this.klass.name} with ID ${String(id)}`);
          return found;
        }),
      );
    }
    return this.find(...ids).then((found) => (Array.isArray(found) ? found : found ? [found] : []));
  }

  /**
   * Mirrors: ActiveRecord::Associations::CollectionAssociation#remove_records —
   * before/after-remove callbacks, `deleteRecords`, in-memory target prune.
   *
   * The prune is Rails' `@target -= records` (collection_association.rb:404):
   * an Array difference by `==` — class + id — not by object identity, so a
   * record the id-coercing `find` in `delete_or_destroy` re-materialized still
   * prunes the instance already sitting in the loaded target.
   * @internal
   */
  protected removeRecords(
    existingRecords: Base[],
    records: Base[],
    method: string,
  ): Promise<boolean> | boolean {
    // Rails remove_records: catch(:abort) { each before_remove } || return
    // (collection_association.rb:399-402) — an aborted before_remove halts
    // removal (target untouched); returns false.
    try {
      for (const record of records) this.callback("beforeRemove", record);
    } catch (e) {
      if (!isAbortSignal(e)) throw e;
      this._lastRemoveAborted = true;
      return false;
    }
    this._lastRemoveAborted = false;
    // Rails' tail after `delete_records` (collection_association.rb:404-409).
    const pruned = (): boolean => {
      this._targetStore = this.target.filter((r) => !includesRecord(records, r));
      for (const record of records) {
        // A `dependent: :destroy` record is frozen once destroyed, so clearing its
        // inverse foreign key would raise FrozenError. Rails leaves the destroyed
        // record's attributes untouched here (remove_records only prunes @target),
        // so skip inverse removal for already-destroyed records.
        if (typeof (record as any).isDestroyed === "function" && (record as any).isDestroyed())
          continue;
        this.removeInverseInstance(record);
      }
      this._associationIds = null;
      for (const record of records) this.callback("afterRemove", record);
      return true;
    };
    // `delete_records` is the only I/O in this body and Rails skips it outright
    // when nothing persisted is being removed, so a new-owner removal runs
    // start to finish inline.
    if (existingRecords.length > 0) {
      const deleted = this.deleteRecords(existingRecords, method);
      if (isThenable(deleted)) return deleted.then(pruned);
    }
    return pruned();
  }

  /**
   * Abstract in the base; subclasses override per strategy. Mirrors Rails'
   * `CollectionAssociation#delete_records` (raises NotImplementedError).
   * @internal
   */
  protected deleteRecords(_records: Base[], _method: string): Promise<number> | number {
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

  protected async nullifyAllRecords(): Promise<number> {
    const nullAttrs = this.computeNullifiedOwnerAttributes();

    const rel = this.scope();
    if (rel && typeof rel.updateAll === "function") {
      return rel.updateAll(nullAttrs);
    }

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
    return this.target.length;
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
    const ids = values.map((v) => (typeof v === "bigint" ? v.toString() : v));
    return JSON.stringify(ids.length === 1 ? ids[0] : ids);
  }

  private async deleteAllRecords(): Promise<number> {
    const rel = this.scope();
    if (rel && typeof rel.deleteAll === "function") {
      return rel.deleteAll();
    }
    return 0;
  }

  /**
   * The collection form of `_setTargetFromLoader`, mirroring Rails'
   * `load_target`: `@target = merge_target_lists(find_target, target);
   * loaded!`. Overwriting instead would discard in-memory builds.
   * @internal
   */
  _mergeLoaderResults(rows: Base[]): void {
    this._targetStore = this.mergeTargetLists(rows, this.target);
    this.loadedBang();
  }

  /**
   * Merge persisted records from DB with in-memory target records:
   *
   *   * The final array must not have duplicates
   *   * The order of the persisted array is to be preserved
   *   * Any changes made to attributes on objects in the memory array are to
   *     be preserved
   *   * Otherwise, attributes should have the value found in the database
   *
   * Mirrors: ActiveRecord::Associations::CollectionAssociation#merge_target_lists
   * (collection_association.rb:335-352).
   * @internal
   */
  mergeTargetLists(persisted: Base[], memory: Base[]): Base[] {
    if (memory.length === 0) return persisted;

    const memoryByIdentity = new Map<string | Base, Base>();
    for (const record of memory) memoryByIdentity.set(this.recordIdentity(record), record);

    const merged = persisted.map((record) => {
      const identity = this.recordIdentity(record);
      const memRecord = memoryByIdentity.get(identity);
      if (memRecord) {
        memoryByIdentity.delete(identity);

        const memAttributeNames = new Set(memRecord.attributeNames());
        const changedAttributeNamesToSave = new Set(memRecord.changedAttributeNamesToSave);
        const attrReadonly = (memRecord.constructor as unknown as { _attrReadonly: string[] })
          ._attrReadonly;
        for (const name of record
          .attributeNames()
          .filter((name) => memAttributeNames.has(name))
          .filter((name) => !changedAttributeNamesToSave.has(name))
          .filter((name) => !attrReadonly.includes(name))) {
          memRecord._writeAttribute(name, record.get(name));
        }

        return memRecord;
      } else {
        return record;
      }
    });

    return [...merged, ...[...memoryByIdentity.values()].filter((record) => !record.isPersisted())];
  }

  private findByScan(args: unknown[]): Base | Array<Base | undefined> | undefined {
    const expectsArray = Array.isArray(args[0]);
    // `String()` is Rails' `to_s` (collection_association.rb:523,527): both
    // sides land in string shape, so `find("1")` matches an Integer PK, and it
    // is width-agnostic over the number/BigInt split an int8 PK gives under PG.
    const ids = [
      ...new Set(
        args
          .flat(Infinity)
          .filter((id) => id != null)
          .map((id) => String(id)),
      ),
    ];

    if (ids.length === 1) {
      const id = ids[0];
      const record = this.target.find((r) => id === String((r as any).id));
      return expectsArray ? [record] : record;
    }

    return this.target.filter((r) => ids.includes(String((r as any).id)));
  }

  /**
   * Mirrors Rails' `CollectionAssociation#replace_on_target(record,
   * skip_callbacks, replace:, inversing: false, &block)`
   * (collection_association.rb:457-489) — one Rails method, one TS method, and
   * the ONLY implementation of it: `CollectionProxy` reaches this one rather
   * than re-spelling the body over its own target array.
   *
   * `block` is Rails' `yield(record)`: `concat_records` passes the per-record
   * insert there. TypeScript cannot `await` inside a method whose other callers
   * (build/replace) must stay synchronous, so the block's promise is threaded
   * through `.then` rather than `await`ed, and the return type widens to
   * `Promise<Base | null>` exactly when a block is supplied. Rails'
   * `ensure @_was_loaded = nil` (:488) therefore runs in a `finally` on that
   * promise for the block arm and in the sync `finally` otherwise.
   *
   * `replace_on_target` is private in Rails, hence `@internal`.
   * @internal
   */
  replaceOnTarget(
    record: Base,
    skipCallbacks: boolean,
    { replace, inversing = false }: { replace: boolean; inversing?: boolean },
    block?: () => Promise<void> | void,
  ): Base | null | Promise<Base | null> {
    // Ruby's `@target.index(record)` uses `Core#==`, not JS reference identity,
    // so a re-fetched persisted record dedups against the one already buffered.
    // `-1` stands in for Ruby's `nil` index throughout.
    const targetIndex = (): number =>
      this.target.findIndex((r) => r === record || r.equals(record));

    let index =
      replace && (!record.isNewRecord() || this._replacedOrAddedTargets.has(record))
        ? targetIndex()
        : -1;

    const afterYield = (): Base => {
      const target = this.target;
      if (index === -1 && this._replacedOrAddedTargets.has(record)) index = targetIndex();
      if (inversing || index !== -1 || record.isNewRecord()) {
        this._replacedOrAddedTargets.add(record);
      }
      if (index !== -1) {
        target[index] = record;
      } else if (this._wasLoaded || !this.isLoaded()) {
        (this as any)._associationIds = null;
        target.push(record);
      }
      if (!skipCallbacks) this.callback("afterAdd", record);
      return record;
    };

    let yielded = false;
    try {
      if (!skipCallbacks) {
        try {
          this.callback("beforeAdd", record);
        } catch (e) {
          if (!isAbortSignal(e)) throw e;
          return null;
        }
      }
      this.setInverseInstance(record);
      this._wasLoaded = true;
      if (block) {
        const yield_ = block();
        if (isThenable(yield_)) {
          yielded = true;
          return yield_.then(afterYield).finally(() => {
            this._wasLoaded = null;
          });
        }
        return afterYield();
      }
      return afterYield();
    } finally {
      // Rails' `ensure @_was_loaded = nil` (collection_association.rb:488).
      if (!yielded) this._wasLoaded = null;
    }
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
export function concatRecordsLoop(
  records: Base[],
  addRecord: (record: Base, resultStillTrue: boolean) => Promise<boolean> | boolean,
): Promise<void> | void {
  let result = true;
  for (let i = 0; i < records.length; i++) {
    // `add_to_target` always runs (so the record is type-checked and buffered),
    // but the insert inside `addRecord` is gated on the current `result` to match
    // Ruby's `result &&= insert_record(...)` short-circuit.
    const inserted = addRecord(records[i], result);
    if (isThenable(inserted)) {
      const rest = records.slice(i + 1);
      return inserted.then(async (first) => {
        result = result && first;
        for (const record of rest) {
          const inserted = await addRecord(record, result);
          result = result && inserted;
        }
        if (!result) throw new Rollback();
      });
    }
    result = result && inserted;
  }
  if (!result) throw new Rollback();
}

/**
 * A value a `Promise<T> | T` body must chain behind rather than use directly —
 * the port's stand-in for Ruby, where every one of these bodies has already
 * finished by the time it returns.
 * @internal
 */
export function isThenable<T>(value: Promise<T> | T): value is Promise<T> {
  return typeof (value as { then?: unknown } | null | undefined)?.then === "function";
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
  return records.some((r) => (r as unknown as { equals(o: unknown): boolean }).equals(record));
}

/**
 * Mirrors: ActiveRecord::Associations::CollectionAssociation#replace_records
 * (collection_association.rb:414-424).
 *
 * `Promise<Base[]> | Base[]` because both arms of `replace` reach it: the
 * persisted one inside the transaction it opens, the new-owner one inline in
 * the `replace` body, where `delete` and `concat` are I/O-free and this runs
 * start to finish without awaiting.
 *
 * Rails' `unless concat(...)` reads the nil `concat_records` answers when a
 * failed `insert_record` raised Rollback inside the transaction (:127-135);
 * ours can also surface that Rollback directly, so both spellings of the same
 * failure restore `original_target` and raise. Anything else re-throws as-is.
 * @internal
 */
function replaceRecords(
  assoc: CollectionAssociation,
  newTarget: Base[],
  originalTarget: Base[],
): Promise<Base[]> | Base[] {
  const diff = diffHooks(assoc);
  const deleted = assoc.delete(...diff.difference(assoc.target, newTarget));
  const restoreAndRaise = (e?: unknown): never => {
    if (e !== undefined && !(e instanceof Rollback)) throw e;
    assoc._writeTargetStore(originalTarget);
    throw new RecordNotSaved(
      `Failed to replace ${assoc.reflection.name} because one or more of the new records ` +
        `could not be saved.`,
      assoc.owner,
    );
  };
  const check = (records: Base[] | undefined): Base[] =>
    records ? assoc.target : restoreAndRaise();
  const concatenate = (): Promise<Base[]> | Base[] => {
    try {
      const concatenated = assoc.concat(...diff.difference(newTarget, assoc.target));
      return isThenable(concatenated)
        ? concatenated.then(check, restoreAndRaise)
        : check(concatenated);
    } catch (e) {
      return restoreAndRaise(e);
    }
  };
  return isThenable(deleted) ? deleted.then(concatenate) : concatenate();
}

/** @internal */
function replaceCommonRecordsInMemory(
  assoc: CollectionAssociation,
  newTarget: Base[],
  originalTarget: Base[],
): void {
  const common = diffHooks(assoc).intersection(newTarget, originalTarget);
  for (const record of common) {
    const skipCallbacks = true;
    assoc.replaceOnTarget(record, skipCallbacks, { replace: true }) as Base | null;
  }
}

/**
 * The receiver {@link callback} and {@link callbacksFor} run against — Rails'
 * own `owner` / `reflection` readers plus the two methods themselves, so each
 * calls the other as Rails does (`callbacks_for(method)`,
 * collection_association.rb:493). Both the `CollectionAssociation` and the
 * `CollectionProxy` (which holds the same two pieces under different field
 * names) satisfy it.
 * @internal
 */
export interface CallbackHost {
  owner: Base;
  reflection: { name: string; options: object };
  /** @internal */
  callback(method: string, record: Base): void;
  /** @internal */
  callbacksFor(callbackName: string): unknown[];
}

/**
 * Unified association-callback dispatch. Mirrors Rails'
 * `CollectionAssociation#callback` (collection_association.rb:492), whose
 * lookup half is `callbacks_for` (:498): looks up the registered callbacks for
 * `method` (`beforeAdd`/`afterAdd`/`beforeRemove`/`afterRemove`) and invokes
 * each — nothing more. Like Rails, the abort is NOT caught here: a `throw
 * :abort` (the sentinel thrown by `throwAbort`) propagates out, and only the
 * two Rails call sites that wrap the before-callbacks in `catch(:abort)`
 * (`remove_records`, collection_association.rb:399-402; `replace_on_target`,
 * :462-465) catch it and take their early return. The after-callback sites
 * (:408, :485) run outside any catch, so an abort from `after_add` /
 * `after_remove` propagates there exactly as it does in Ruby.
 *
 * Arity note: like Rails, the stored procs take `(method, owner, record)` and
 * this dispatcher passes the callback name straight through as `method`. The symbol and proc arms
 * ignore it, but the object arm needs it — Rails' `callback.send(method, owner,
 * record)` (builder/collection_association.rb:51) dispatches the callback kind
 * as a method ON the callback object, so binding it at registration time would
 * silently drop object callbacks.
 *
 * `callback` is private in Rails, hence `@internal`.
 * @internal
 */
export function callback(this: CallbackHost, method: string, record: Base): void {
  for (const cb of this.callbacksFor(method)) {
    if (typeof cb !== "function") continue;
    // A before callback halts the add/remove ONLY by throwing the abort sentinel
    // (faithful `throw :abort`); a `false` return no longer halts (Rails 5+).
    (cb as any)(method, this.owner, record);
  }
}

/**
 * Mirrors: `CollectionAssociation#callbacks_for`
 * (collection_association.rb:498-505), the lookup half of {@link callback}.
 * @internal
 */
export function callbacksFor(this: CallbackHost, callbackName: string): unknown[] {
  // The builder stores normalized callbacks both as the
  // `<kind>For<Name>` class attribute (Rails parity) and on the reflection
  // options; either is the same array. Prefer the class attribute, matching
  // Rails' `owner.class.send("#{callback_name}_for_#{reflection.name}")`.
  const fullName = `${callbackName}For${this.reflection.name.charAt(0).toUpperCase()}${this.reflection.name.slice(1)}`;
  const owner = this.owner.constructor as any;
  const stored = owner[fullName];
  if (typeof stored === "function") return stored();
  if (Array.isArray(stored)) return stored;
  const fromOptions = (this.reflection.options as Record<string, unknown>)[callbackName];
  return Array.isArray(fromOptions) ? fromOptions : fromOptions != null ? [fromOptions] : [];
}

function arraysEqual(a: Base[], b: Base[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((r, i) => r === b[i]);
}

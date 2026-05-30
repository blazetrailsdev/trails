import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import { underscore } from "@blazetrails/activesupport";
import { Association } from "./association.js";
import { foreignKeyPresentFor } from "./foreign-association.js";
import { throughForeignKeyPresent } from "./through-association.js";
import type { AssociationReflection } from "../reflection.js";
import { RecordNotSaved, Rollback } from "../errors.js";

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
  declare target: Base[];
  nestedAttributesTarget: Base[] | null = null;
  protected _associationIds: unknown[] | null = null;
  _pendingReplace: { newTarget: Base[]; originalTarget: Base[]; wasLoaded: boolean } | null = null;

  constructor(owner: Base, definition: AssociationDefinition) {
    super(owner, definition);
    this.target = [];
  }

  /**
   * Implements the writer method, e.g. foo.items= for Foo.has_many :items.
   * Replaces the entire collection.
   */
  writer(records: Base[]): void {
    this.replace(records);
  }

  /**
   * Implements the ids reader, e.g. foo.item_ids.
   * Returns an array of primary key values from the target.
   */
  async idsReader(): Promise<unknown[]> {
    if (this.isLoaded()) {
      return this.target.map((r) => this.primaryKeyValue(r));
    }
    if (this.target.length > 0) {
      await this.loadTarget();
      return this.target.map((r) => this.primaryKeyValue(r));
    }
    if (this._associationIds) return this._associationIds;
    const pk = (this.klass as any).primaryKey ?? "id";
    const rel = this.scope();
    if (rel && typeof rel.pluck === "function") {
      this._associationIds = await rel.pluck(...(Array.isArray(pk) ? pk : [pk]));
      return this._associationIds!;
    }
    return [];
  }

  /**
   * Implements the ids writer, e.g. foo.item_ids=.
   * Loads records by the given IDs and replaces the collection.
   */
  async idsWriter(ids: unknown[]): Promise<void> {
    const Klass = this.klass as any;
    const pk = Klass.primaryKey ?? "id";
    const filteredIds = (Array.isArray(ids) ? ids : [ids]).filter((id) => id != null && id !== "");

    if (filteredIds.length === 0) {
      this.replace([]);
    } else if (Array.isArray(pk)) {
      const found = await Promise.all(
        filteredIds.map(async (id) => {
          const conditions: Record<string, unknown> = {};
          const idParts = Array.isArray(id) ? id : [id];
          pk.forEach((col: string, i: number) => {
            conditions[col] = idParts[i];
          });
          return Klass.findBy(conditions);
        }),
      );
      this.replace(found.filter((r): r is Base => r != null));
    } else if (typeof Klass.where === "function") {
      const records: Base[] = await Klass.where({ [pk]: filteredIds }).toArray();
      this.replace(records);
    }
    await this.persistReplace();
  }

  override reset(): void {
    super.reset();
    this.target = [];
    this._associationIds = null;
    this._pendingReplace = null;
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
   */
  async concat(...records: Base[]): Promise<Base[]> {
    const flattened = records.flat() as Base[];
    if (this.owner.isNewRecord()) {
      await this.loadTarget();
      await this.concatRecords(flattened);
    } else {
      await this.concatRecords(flattened);
    }
    return flattened;
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
   * @internal
   */
  protected async concatRecords(records: Base[], shouldRaise = false): Promise<Base[]> {
    let result = true;
    for (const record of records) {
      (this as any).raiseOnTypeMismatchBang(record);
      const added = this.addToTarget(record);
      if (!added) continue;
      if (!this.owner.isNewRecord()) {
        const saved = await this.insertRecord(record, true, shouldRaise);
        if (!saved) result = false;
      }
    }
    if (!result) throw new Rollback();
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
  async delete(...records: Array<Base | number | string | bigint>): Promise<Base[]> {
    return this.deleteOrDestroy(records.flat(), this.reflection.options.dependent);
  }

  /**
   * Destroy specific records, ignoring the :dependent option.
   * Calls before_remove/after_remove + before_destroy/after_destroy callbacks.
   */
  async destroy(...records: Array<Base | number | string | bigint>): Promise<Base[]> {
    return this.deleteOrDestroy(records.flat(), "destroy");
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
   */
  replace(otherArray: Base[]): void {
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
      const toRemove = (this.target as Base[]).filter((r) => !otherArray.includes(r));
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
      const added: Base[] = [];
      for (const r of otherArray) {
        if (!this.target.includes(r)) {
          this.addToTarget(r);
          added.push(r);
        }
      }
      this.loadedBang();
      this.buildThroughRecordsInMemory(added);
    } else {
      // Persisted owner: Rails calls replace_common_records_in_memory before
      // diffing (collection_association.rb). For a new owner Rails skips it —
      // replace_records leaves common records in place untouched — so it lives
      // here, not above the branch.
      replaceCommonRecordsInMemory(this, otherArray, originalTarget);
      if (!wasLoaded || !arraysEqual(otherArray, originalTarget)) {
        for (const r of originalTarget) {
          if (!otherArray.includes(r)) {
            const idx = this.target.indexOf(r);
            if (idx !== -1) this.target.splice(idx, 1);
          }
        }
        for (const r of otherArray) {
          if (!this.target.includes(r)) {
            this.setOwnerAttributes(r);
            this.addToTarget(r);
          }
        }
        this.loadedBang();
        // Preserve the first originalTarget (what's in the DB) across multiple
        // replace() calls before save(). Only update newTarget so the final flush
        // diffs against the real persisted state, not an intermediate in-memory one.
        if (this._pendingReplace) {
          if (wasLoaded && arraysEqual(otherArray, this._pendingReplace.originalTarget)) {
            this._pendingReplace = null; // reverted to DB state — nothing to flush
          } else {
            this._pendingReplace.newTarget = [...otherArray];
          }
        } else {
          this._pendingReplace = { newTarget: [...otherArray], originalTarget, wasLoaded };
        }
      }
    }
  }

  async persistReplace(): Promise<void> {
    const pending = this._pendingReplace;
    if (!pending || this.owner.isNewRecord()) return;
    // If the association wasn't loaded at assignment time, fetch the persisted
    // baseline directly via doAsyncFindTarget to avoid the loadedBang short-circuit
    // and without mutating this.target (mirrors Rails' load_target in replace).
    if (!pending.wasLoaded) {
      const dbRecords = await this.doAsyncFindTarget();
      pending.originalTarget = Array.isArray(dbRecords) ? [...dbRecords] : [];
    }
    const currentTarget = this.target;
    await transaction(this, async () => {
      // replaceRecords diffs against assoc.target; restore originalTarget so
      // it sees the real DB state rather than the already-updated in-memory target
      this.target = [...pending.originalTarget];
      try {
        await replaceRecords(this, pending.newTarget, pending.originalTarget);
      } finally {
        this.target = currentTarget;
      }
    });
    // Clear only after success — leave intact on error so save() retry can re-attempt
    this._pendingReplace = null;
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
        const found = await this.doAsyncFindTarget();
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
   * Add a record to the in-memory target array, firing callbacks
   * and setting inverse associations.
   */
  addToTarget(
    record: Base,
    options: { skipCallbacks?: boolean; replace?: boolean } = {},
  ): Base | null {
    const { skipCallbacks = false, replace: shouldReplace = false } = options;
    return replaceOnTarget(this, record, skipCallbacks, shouldReplace);
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
    const reflection = this.reflection as unknown as AssociationReflection;
    if (this.reflection.options.through) {
      return throughForeignKeyPresent({ owner: this.owner, reflection });
    }
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
   * going to the database. True when loaded, strict loading, new record,
   * or any target record is new/changed.
   */
  isFindFromTarget(): boolean {
    return (
      this.isLoaded() ||
      (this.owner as any)._strictLoading ||
      this.owner.isNewRecord() ||
      this.target.some(
        (r) =>
          r.isNewRecord() ||
          (typeof (r as any).hasChangesToSave === "function" && (r as any).hasChangesToSave()),
      )
    );
  }

  override isCollection(): boolean {
    return true;
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
    const configuredPk = this.reflection.options.primaryKey ?? ctor.primaryKey ?? "id";
    const pks = Array.isArray(configuredPk) ? configuredPk : [configuredPk];
    const fks = this.foreignKeyColumns();

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
      const typeCol = `${underscore(this.reflection.options.as)}_type`;
      if (typeof (record as any)._writeAttribute === "function") {
        (record as any)._writeAttribute(typeCol, ctor.name);
      } else {
        (record as any)[typeCol] = ctor.name;
      }
    }
  }

  // --- Private helpers ---

  private foreignKeyColumns(): string[] {
    const fk = this.reflection.options.foreignKey;
    if (typeof fk === "string") return [fk];
    if (Array.isArray(fk)) return fk;
    const ctor = this.owner.constructor as any;
    if (this.reflection.options.as) {
      return [`${underscore(this.reflection.options.as)}_id`];
    }
    // Derive composite FKs for CPK owners (mirrors loadHasMany)
    const pk = this.reflection.options.primaryKey ?? ctor.primaryKey ?? "id";
    if (Array.isArray(pk)) {
      return pk.map((col: string) => `${underscore(ctor.name)}_${col}`);
    }
    return [`${underscore(ctor.name)}_id`];
  }

  private foreignKeyColumn(): string {
    return this.foreignKeyColumns()[0];
  }

  protected async deleteOrDestroy(
    records: Array<Base | number | string | bigint>,
    method?: string,
  ): Promise<Base[]> {
    // Rails delete_or_destroy: coerce id args to records, then type-check.
    const resolved = await this.coerceToRecords(records.flat());
    if (resolved.length === 0) return resolved;
    for (const record of resolved) (this as any).raiseOnTypeMismatchBang(record);
    const existingRecords = resolved.filter((r) => !r.isNewRecord());
    // A `before_remove` abort halts removal (removeRecords returns false); like
    // Rails, leave the target untouched and report no removed records.
    let removed = false;
    if (existingRecords.length === 0) {
      removed = await this.removeRecords(existingRecords, resolved, method ?? "");
    } else {
      await transaction(this, async () => {
        removed = await this.removeRecords(existingRecords, resolved, method ?? "");
      });
    }
    return removed ? resolved : [];
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
      if (!callback(this, "beforeRemove", record)) return false;
    }
    if (existingRecords.length > 0) {
      await this.deleteRecords(existingRecords, method);
    }
    for (const record of records) {
      const idx = (this.target as Base[]).indexOf(record);
      if (idx !== -1) (this.target as Base[]).splice(idx, 1);
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
    if (this.reflection.options.as) {
      nullAttrs[`${underscore(this.reflection.options.as)}_type`] = null;
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
    return JSON.stringify(values.length === 1 ? values[0] : values);
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
    const normalize = (v: unknown) => JSON.stringify(v);
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

/** @internal */
function transaction(assoc: CollectionAssociation, block: () => Promise<void>): Promise<void> {
  // Rails: reflection.klass.transaction(&block) — uses the reflection's klass, not assoc.klass
  const klass = (assoc.reflection as any).klass ?? assoc.klass;
  if (klass && typeof (klass as any).transaction === "function") {
    return (klass as any).transaction(block);
  }
  return block();
}

/** @internal */
async function replaceRecords(
  assoc: CollectionAssociation,
  newTarget: Base[],
  originalTarget: Base[],
): Promise<Base[]> {
  // Rails: delete(difference(target, new_target)); concat(difference(new_target, target))
  const toDelete = (assoc.target as Base[]).filter((r) => !newTarget.includes(r));
  if (toDelete.length > 0) await assoc.delete(...toDelete);
  const toAdd = newTarget.filter((r) => !(assoc.target as Base[]).includes(r));
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
  return assoc.target as Base[];
}

/** @internal */
function replaceCommonRecordsInMemory(
  assoc: CollectionAssociation,
  newTarget: Base[],
  originalTarget: Base[],
): void {
  const common = newTarget.filter((r) => originalTarget.includes(r));
  for (const record of common) {
    replaceOnTarget(assoc, record, true, true);
  }
}

/** @internal */
function replaceOnTarget(
  assoc: CollectionAssociation,
  record: Base,
  skipCallbacks: boolean,
  replace: boolean,
): Base | null {
  const replaced = assoc as any;
  let index = -1;
  if (replace) {
    index = (assoc.target as Base[]).indexOf(record);
  }

  // Rails: catch(:abort) { callback(:before_add, record) } || return unless skip_callbacks
  if (!skipCallbacks && !callback(assoc, "beforeAdd", record)) return null;

  assoc.setInverseInstance(record);
  replaced._associationIds = null;

  const target = assoc.target as Base[];
  if (index !== -1) {
    target[index] = record;
  } else {
    target.push(record);
  }

  if (!skipCallbacks) callback(assoc, "afterAdd", record);

  return record;
}

/**
 * Unified association-callback dispatch. Mirrors Rails'
 * `CollectionAssociation#callback`: looks up the registered callbacks for
 * `kind` (`beforeAdd`/`afterAdd`/`beforeRemove`/`afterRemove`) and invokes
 * each. Returns `false` if any callback aborts (Rails `throw :abort`,
 * modelled here as a callback returning `false`), so callers can halt the
 * add/remove like Rails' `catch(:abort) ... || return`.
 *
 * Arity note: Rails procs take `(method, owner, record)` and `callback`
 * passes the kind through (so the symbol case can `callback.send(method, ...)`).
 * Here the builder binds the method/symbol at registration time, so the
 * stored procs take `(owner, record)` — the same 2-arg shape consumed by
 * `fireAssocCallbacks` on the CollectionProxy add/remove paths, which read
 * the identical callback array. Keeping the 2-arg convention lets both
 * dispatch sites share one proc array; passing `kind` here would break the
 * proxy's `cb(owner, record)` call site.
 * @internal
 */
function callback(assoc: CollectionAssociation, kind: string, record: Base): boolean {
  for (const cb of callbacksFor(assoc, kind)) {
    if (typeof cb === "function" && (cb as any)(assoc.owner, record) === false) return false;
  }
  return true;
}

/** @internal */
function callbacksFor(assoc: CollectionAssociation, callbackName: string): unknown[] {
  // The builder stores normalized callbacks both as the
  // `<kind>For<Name>` class attribute (Rails parity) and on the reflection
  // options; either is the same array. Prefer the class attribute, matching
  // Rails' `owner.class.send("#{callback_name}_for_#{reflection.name}")`.
  const fullName = `${callbackName}For${assoc.reflection.name.charAt(0).toUpperCase()}${assoc.reflection.name.slice(1)}`;
  const owner = assoc.owner.constructor as any;
  const stored = owner[fullName];
  if (typeof stored === "function") return stored();
  if (Array.isArray(stored)) return stored;
  const fromOptions = (assoc.reflection.options as any)[callbackName];
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
  return (assoc.target as Base[]).includes(record);
}

function arraysEqual(a: Base[], b: Base[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((r, i) => r === b[i]);
}

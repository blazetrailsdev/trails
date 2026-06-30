import type { Base } from "./base.js";
import {
  modelRegistry,
  _cacheSingularTarget,
  association as collectionProxyFor,
} from "./associations.js";
import { ActiveRecordError, UnknownAttributeError, RecordNotFound } from "./errors.js";
import { singularize, camelize, underscore } from "@blazetrails/activesupport";
import { Table, UpdateManager } from "@blazetrails/arel";
import {
  isMarkedForDestruction,
  markForDestruction,
  defineAutosaveValidationCallbacks,
} from "./autosave-association.js";
import { BooleanType } from "@blazetrails/activemodel";

/**
 * Raised when more nested-attribute records are provided than the
 * association's `limit` option allows.
 *
 * Mirrors: ActiveRecord::NestedAttributes::TooManyRecords
 */
export class TooManyRecords extends ActiveRecordError {
  constructor(message?: string) {
    super(message);
    this.name = "TooManyRecords";
  }
}

/**
 * Returns whether the record is marked for destruction in the context of
 * nested attributes. Mirrors Rails' NestedAttributes instance method `_destroy`,
 * which delegates to `marked_for_destruction?`.
 *
 * Mirrors: ActiveRecord::NestedAttributes#_destroy
 */
export function _destroy(this: Base): boolean {
  return isMarkedForDestruction(this);
}

interface NestedAttributeOptions {
  allowDestroy?: boolean;
  rejectIf?: (attrs: Record<string, unknown>) => boolean;
  // A string limit names a method/attribute on the owner (Rails `limit: :symbol`).
  limit?: number | string | ((...args: unknown[]) => number);
  updateOnly?: boolean;
}

interface NestedAttributeConfig {
  associationName: string;
  options: NestedAttributeOptions;
}

/**
 * Rails: `class_attribute :nested_attributes_options, default: {}` — the
 * per-model map of `associationName => options` populated by
 * `accepts_nested_attributes_for`. Trails records the same data in the
 * dynamically-assigned `_nestedAttributeConfigs` array; expose the Rails-shaped
 * hash reader (the `=`/`?` forms map to the same accessor).
 *
 * Mirrors: ActiveRecord::NestedAttributes#nested_attributes_options
 */
export function nestedAttributesOptions(
  this: typeof Base,
): Readonly<Record<string, NestedAttributeOptions>> {
  const configs: NestedAttributeConfig[] = (this as any)._nestedAttributeConfigs ?? [];
  const out: Record<string, NestedAttributeOptions> = {};
  for (const c of configs) out[c.associationName] = c.options;
  return out;
}

/**
 * Configure nested attributes for an association.
 *
 * Mirrors: ActiveRecord::Base.accepts_nested_attributes_for
 *
 * Usage:
 *   acceptsNestedAttributesFor(Post, 'comments', { allowDestroy: true })
 *
 * Then when saving:
 *   post.assignAttributes({ commentsAttributes: [{ body: 'hi' }, { id: 1, _destroy: true }] })
 *   await post.save()
 */
export function acceptsNestedAttributesFor(
  modelClass: typeof Base,
  associationName: string,
  options: NestedAttributeOptions = {},
): void {
  // Validate that the association exists
  const associations: any[] = (modelClass as any)._associations ?? [];
  const assocExists = associations.find((a: any) => a.name === associationName);
  if (!assocExists) {
    throw new Error(`No association found for name '${associationName}'. Has it been defined yet?`);
  }

  // Rails sets `reflection.autosave = true` for every nested-attributes
  // association (nested_attributes.rb:359), so the parent's save cascades into
  // the in-memory target. trails checks `options.autosave` dynamically at save
  // time, so flipping the flag on the association definition is sufficient — and
  // is what makes the synchronous in-memory target population in
  // `assignNestedAttributesForCollectionAssociation` reachable for plain
  // `acceptsNestedAttributesFor(Model, "assoc")` callers, not only those who
  // also pass `{ autosave: true }` to `hasMany`.
  assocExists.options = { ...assocExists.options, autosave: true };

  // Rails accepts_nested_attributes_for calls `define_autosave_validation_callbacks`
  // after flipping autosave (nested_attributes.rb:368-370). The association's
  // own declaration registered the autosave *save* callbacks, but its validation
  // callback is gated on `reflection.validate?` — false at declaration time for a
  // plain belongs_to/has_one (autosave not yet set). Re-running it here wires the
  // nested-record validator so a singular nested association is validated.
  const reflection = (modelClass as any)._reflectOnAssociation?.(associationName);
  if (reflection) {
    // Rails `reflection.autosave = true` — flip it on the rich reflection too
    // (not just the `_associations` entry the save path reads) so
    // `reflection.validate?` sees it and the validation callback is wired.
    reflection.autosave = true;
    defineAutosaveValidationCallbacks(modelClass, reflection);
  }

  // Rails does NOT reject polymorphic belongs_to at declaration time — the
  // check is deferred to build time (the writer raises when it tries to build
  // a new record and finds no `build_#{association_name}` method). See
  // assign_nested_attributes_for_one_to_one_association in Rails'
  // nested_attributes.rb. We mirror that in
  // assignNestedAttributesForOneToOneAssociation.

  // Store config on the class
  if (!Object.prototype.hasOwnProperty.call(modelClass, "_nestedAttributeConfigs")) {
    (modelClass as any)._nestedAttributeConfigs = [];
  }
  // Upsert: replace existing entry for this association (mirrors Rails'
  // nested_attributes_options[name] = options hash-assignment).
  const configs: NestedAttributeConfig[] = (modelClass as any)._nestedAttributeConfigs;
  const existingIdx = configs.findIndex((c) => c.associationName === associationName);
  const entry: NestedAttributeConfig = { associationName, options };
  if (existingIdx >= 0) {
    configs[existingIdx] = entry;
  } else {
    configs.push(entry);
  }

  const type =
    assocExists.type === "hasMany" || assocExists.type === "hasAndBelongsToMany"
      ? "collection"
      : "one_to_one";
  generateAssociationWriter(modelClass, associationName, type);

  // Wrap save to flush pending nested attributes after the parent is persisted
  const originalSave = modelClass.prototype.save;
  if (!(modelClass as any)._nestedSaveWrapped) {
    (modelClass as any)._nestedSaveWrapped = true;

    modelClass.prototype.save = async function (this: Base): Promise<boolean> {
      const result = await originalSave.call(this);
      if (!result) return false;

      await processNestedAttributes(this);
      return true;
    };
  }
}

/**
 * Assign nested attributes for an association.
 *
 * Mirrors: ActiveRecord::Base#assign_nested_attributes_for
 */
export function assignNestedAttributes(
  record: Base,
  associationName: string,
  attributesArray: Record<string, unknown>[] | Record<string, Record<string, unknown>>,
): void {
  // Validate input type
  if (typeof attributesArray !== "object" || attributesArray === null) {
    throw new Error("Hash or Array expected for nested attributes, got: " + typeof attributesArray);
  }

  // Normalize hash-keyed format to array
  let attrs: Record<string, unknown>[];
  if (Array.isArray(attributesArray)) {
    attrs = attributesArray;
  } else {
    // Rails takes `attributes_collection.values` in insertion order — no
    // sort (nested_attributes.rb:499-506).
    attrs = Object.values(attributesArray);
  }

  // Rails raises TooManyRecords synchronously from
  // `assign_nested_attribute_for_collection_association` when `limit:`
  // is exceeded — mirror that here so callers see the misconfiguration
  // at assign time, not at save time.
  const ctor = record.constructor as typeof Base;
  const configs: NestedAttributeConfig[] = (ctor as any)._nestedAttributeConfigs ?? [];
  const config = configs.find((c) => c.associationName === associationName);
  const resolvedLimit = resolveNestedLimit(config?.options.limit, record);
  if (resolvedLimit !== undefined && attrs.length > resolvedLimit) {
    throw new TooManyRecords(
      `Maximum ${resolvedLimit} records are allowed. ` + `Got ${attrs.length} records instead.`,
    );
  }

  // Store on instance for later processing
  if (!(record as any)._pendingNestedAttributes) {
    (record as any)._pendingNestedAttributes = new Map();
  }
  (record as any)._pendingNestedAttributes.set(associationName, attrs);
}

/**
 * Process all pending nested attributes after save.
 */
async function processNestedAttributes(record: Base): Promise<void> {
  const pending: Map<string, Record<string, unknown>[]> | undefined = (record as any)
    ._pendingNestedAttributes;
  if (!pending) return;

  const ctor = record.constructor as typeof Base;
  const configs: NestedAttributeConfig[] = (ctor as any)._nestedAttributeConfigs ?? [];

  for (const [assocName, attrsList] of pending) {
    const config = configs.find((c) => c.associationName === assocName);
    if (!config) continue;

    const associations: any[] = (ctor as any)._associations ?? [];
    const assocDef = associations.find((a: any) => a.name === assocName);
    if (!assocDef) continue;

    // Resolve target model
    const className = collectionAssociationClassName(assocDef, assocName);

    const targetModel = modelRegistry.get(className);
    if (!targetModel) continue;

    await (targetModel as any).ensureSchemaLoaded();

    // belongs_to keeps the FK on the owner, conventionally `${assoc_name}_id`;
    // has_one/has_many keep it on the child, conventionally `${owner}_id`. Rails
    // derives the owner from the association reflection's `active_record` (the
    // class that *declared* the association), not the runtime instance's class,
    // so a subclass instance still resolves to the declaring model's FK — both
    // for a single-column FK and a composite (array) FK from a CPK has_many/
    // has_one. A composite reflection FK maps element-wise onto the declaring
    // model's `activeRecordPrimaryKey`; only when the reflection yields no
    // string/array FK do we fall back to the `${owner}_id` convention.
    const reflection = (ctor as any).reflectOnAssociation?.(assocName);
    const reflectionFk = reflection?.foreignKey;
    const optionFk = assocDef.options.foreignKey;
    // Rails always resolves the FK through `reflection.foreign_key`, so prefer
    // the (already option-aware) reflection FK and fall back to the raw option
    // only when the reflection yields no array. The belongsTo create branch
    // below uses the same precedence.
    const isCollectionLike = assocDef.type !== "belongsTo";
    const compositeFkColumns: string[] | null = isCollectionLike
      ? Array.isArray(reflectionFk)
        ? (reflectionFk as unknown[]).map(String)
        : Array.isArray(optionFk)
          ? (optionFk as unknown[]).map(String)
          : null
      : null;
    const foreignKey =
      (typeof optionFk === "string" ? optionFk : undefined) ??
      (typeof reflectionFk === "string"
        ? reflectionFk
        : assocDef.type === "belongsTo"
          ? `${underscore(assocName)}_id`
          : `${underscore(ctor.name)}_id`);
    const fkColumns = compositeFkColumns ?? [foreignKey];

    // Foreign-key attributes anchoring a built has_many/has_one child back to
    // this owner. A composite FK reads each owner PK column named by the
    // reflection's `activeRecordPrimaryKey`, paired positionally with the FK
    // columns; a single FK uses the scalar owner id. When the composite FK came
    // from an explicit array `foreignKey` option but the reflection is absent,
    // fall back to the owner class's own primary key (Rails' default for
    // `active_record_primary_key`) so the columns never resolve to undefined.
    const childForeignKeyAttributes = (): Record<string, unknown> => {
      if (!compositeFkColumns) return { [foreignKey]: record.id };
      const ownerPk = reflection?.activeRecordPrimaryKey ?? (ctor as any).primaryKey;
      const ownerPkColumns = Array.isArray(ownerPk) ? ownerPk : [ownerPk];
      const out: Record<string, unknown> = {};
      compositeFkColumns.forEach((col, i) => {
        out[col] = (record as any)._readAttribute(ownerPkColumns[i]);
      });
      return out;
    };

    // limit-check already fired in assignNestedAttributes (Rails
    // raises synchronously at assign time).

    const childPk = (targetModel as any).primaryKey || "id";

    // Get known attribute names from the target model
    const knownAttrs = new Set<string>();
    const attrDefs: Map<string, any> | undefined = (targetModel as any)._attributeDefinitions;
    if (attrDefs) {
      for (const name of attrDefs.keys()) {
        knownAttrs.add(name);
      }
    }
    // Also allow the primary key and foreign key. Nested attributes
    // conventionally address the existing record by the literal `id` key (Rails
    // matches `record.id.to_s == attributes["id"].to_s`), which maps to the
    // model's primary key even when it is named something other than `id`.
    knownAttrs.add(childPk);
    for (const col of fkColumns) knownAttrs.add(col);
    knownAttrs.add("id");

    for (const attrs of attrsList) {
      const { _destroy, ...restAttrs } = attrs as any;
      const pkValue = restAttrs[childPk] ?? restAttrs["id"];
      // Remove the PK (and its `id` alias) from child attrs so they aren't set
      // as regular attributes during update.
      const { [childPk]: _pkIgnored, id: _idIgnored, ...childAttrs } = restAttrs;

      // Validate attributes against the target model's known columns
      if (knownAttrs.size > 0) {
        for (const key of Object.keys(childAttrs)) {
          if (!knownAttrs.has(key)) {
            const dummy = new (targetModel as any)();
            throw new UnknownAttributeError(dummy, key);
          }
        }
      }

      // Check _destroy before rejectIf — destroy should work regardless of rejectIf
      if (_destroy && config.options.allowDestroy) {
        // Destroy existing record
        if (pkValue) {
          const existing = await (targetModel as any).find(pkValue);
          await existing.destroy();
        }
        continue;
      }

      // Check rejectIf only for create/update, not destroy
      if (config.options.rejectIf && config.options.rejectIf(attrs)) {
        continue;
      }

      if (pkValue) {
        // Update existing record
        const existing = await (targetModel as any).find(pkValue);
        await existing.update(childAttrs);
      } else if (assocDef.type === "belongsTo") {
        // For belongs_to, create the target and set FK on *this* record. Rails
        // sets the owner's FK columns from `reflection.foreign_key` zipped with
        // `reflection.association_primary_key` (the *target* PK), regardless of
        // single- or composite-key — see BelongsToAssociation#replace_keys /
        // Association#set_owner_attributes. Thread the same here so a belongs_to
        // to a CPK target writes every FK column (not a single coerced
        // `created.id`).
        const created = await (targetModel as any).create(childAttrs);
        // Only thread the FK when the target actually persisted. `create`
        // returns an *unsaved* record on validation failure; Rails' autosave
        // (`save_belongs_to_association`) aborts rather than committing a nil FK
        // onto the owner. `isPersisted()` is also the correct CPK guard — the
        // old `created.id != null` check was always truthy for a composite PK
        // (an array), so an invalid CPK target would have written nils.
        if (created != null && created.isPersisted()) {
          const belongsToFkColumns = Array.isArray(reflectionFk)
            ? (reflectionFk as unknown[]).map(String)
            : Array.isArray(optionFk)
              ? (optionFk as unknown[]).map(String)
              : [foreignKey];
          const assocPk =
            reflection?.associationPrimaryKey ?? (targetModel as any).primaryKey ?? "id";
          const assocPkColumns = Array.isArray(assocPk) ? assocPk : [assocPk];
          const arelTable = (ctor as any).arelTable as Table;
          // Use _writeAttribute + direct persistence to avoid re-triggering
          // nested attributes.
          const sets = belongsToFkColumns.map((col, i) => {
            const value = created._readAttribute(assocPkColumns[i]);
            record._writeAttribute(col, value);
            return [arelTable.get(col), value] as [ReturnType<Table["get"]>, unknown];
          });
          const um = new UpdateManager()
            .table(arelTable)
            .set(sets)
            .where((ctor as any)._buildPkWhereNode(record.id));
          const conn = (ctor as any).connection;
          await conn.executeMutation(conn.toSql(um));

          // The deferred FK write above bypasses the normal belongs_to
          // assignment, so the counter-cache machinery never runs for the
          // newly-anchored owner. Rails routes this through
          // `BelongsToAssociation#replace_keys` + `save_belongs_to_association`,
          // which bumps the target's counter via `update_counters`. Mirror that
          // here: once the owner has gained its FK, increment the target's
          // counter column when the reflection declares `counterCache`.
          await (record.association(assocName) as any).incrementCounters?.();
        }
      } else {
        // For hasMany/hasOne, set FK on the child record.
        // When inverseOf is declared, cache the parent on the new child before
        // saving so presence validators that check the association object pass
        // without a DB round-trip — mirrors Rails' inverse_of auto-population.
        const inverseOf: string | undefined = assocDef.options.inverseOf;
        const fkAttrs = childForeignKeyAttributes();
        if (inverseOf) {
          await (targetModel as any).create({ ...childAttrs, ...fkAttrs }, (child: any) => {
            _cacheSingularTarget(child, inverseOf, record);
          });
        } else {
          await (targetModel as any).create({ ...childAttrs, ...fkAttrs });
        }
      }
    }
  }

  (record as any)._pendingNestedAttributes = null;
}

const UNASSIGNABLE_KEYS = new Set(["id", "_destroy"]);

/** @internal Stateless; one instance shared across all calls. */
const _booleanType = new BooleanType();

/** @internal */
export function hasDestroyFlag(hash: Record<string, unknown>): boolean {
  return _booleanType.cast(hash["_destroy"]) === true;
}

/** @internal */
export function isAllowDestroy(record: Base, associationName: string): boolean {
  const configs: NestedAttributeConfig[] =
    (record.constructor as any)._nestedAttributeConfigs ?? [];
  return configs.find((c) => c.associationName === associationName)?.options.allowDestroy ?? false;
}

/** @internal */
export function isWillBeDestroyed(
  record: Base,
  associationName: string,
  attributes: Record<string, unknown>,
): boolean {
  return isAllowDestroy(record, associationName) && hasDestroyFlag(attributes);
}

/** @internal */
export function callRejectIf(
  record: Base,
  associationName: string,
  attributes: Record<string, unknown>,
): boolean {
  if (isWillBeDestroyed(record, associationName, attributes)) return false;
  const configs: NestedAttributeConfig[] =
    (record.constructor as any)._nestedAttributeConfigs ?? [];
  const rejectIf = configs.find((c) => c.associationName === associationName)?.options.rejectIf;
  return rejectIf ? rejectIf(attributes) : false;
}

/** @internal */
export function isRejectNewRecord(
  record: Base,
  associationName: string,
  attributes: Record<string, unknown>,
): boolean {
  return (
    isWillBeDestroyed(record, associationName, attributes) ||
    callRejectIf(record, associationName, attributes)
  );
}

/** @internal */
export function assignToOrMarkForDestruction(
  childRecord: Base,
  attributes: Record<string, unknown>,
  allowDestroy: boolean,
): void {
  const assignable: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attributes)) {
    if (!UNASSIGNABLE_KEYS.has(k)) assignable[k] = v;
  }
  childRecord.assignAttributes(assignable);
  if (hasDestroyFlag(attributes) && allowDestroy) {
    markForDestruction(childRecord);
  }
}

/** @internal */
export function findRecordById(klass: typeof Base, records: Base[], id: unknown): Base | undefined {
  if (Array.isArray((klass as any).primaryKey)) {
    const needle = (Array.isArray(id) ? id : [id]).map(String);
    return records.find((r) => {
      const rid = Array.isArray(r.id) ? r.id : [r.id];
      return rid.map(String).join(",") === needle.join(",");
    });
  }
  return records.find((r) => String(r.id) === String(id));
}

/** @internal */
export function raiseNestedAttributesRecordNotFoundBang(
  record: Base,
  associationName: string,
  recordId: unknown,
): never {
  const ctor = record.constructor as typeof Base;
  const associations: any[] = (ctor as any)._associations ?? [];
  const assocDef = associations.find((a: any) => a.name === associationName);
  const modelName = assocDef?.options?.className ?? camelize(singularize(associationName));
  throw new RecordNotFound(
    `Couldn't find ${modelName} with ID=${recordId} for ${ctor.name} with ID=${record.id}`,
    modelName,
    "id",
    recordId,
  );
}

/** @internal */
// Resolve a `limit:` option to a number. A string names a method/attribute on
// the owner (Rails `limit: :parrots_limit`); a function is invoked.
function resolveNestedLimit(
  limit: number | string | ((...args: unknown[]) => number) | undefined,
  record: Base,
): number | undefined {
  if (limit === undefined) return undefined;
  if (typeof limit === "function") return limit();
  if (typeof limit === "string") {
    const value = (record as unknown as Record<string, unknown>)[limit];
    return typeof value === "function" ? (value as () => number).call(record) : Number(value);
  }
  return limit;
}

/** @internal */
export function checkRecordLimitBang(
  limit: number | ((...args: unknown[]) => number) | undefined,
  attributesCollection: unknown[],
): void {
  if (limit === undefined) return;
  const resolved = typeof limit === "function" ? limit() : limit;
  if (resolved !== undefined && attributesCollection.length > resolved) {
    throw new TooManyRecords(
      `Maximum ${resolved} records are allowed. Got ${attributesCollection.length} records instead.`,
    );
  }
}

/** @internal */
function generateAssociationWriter(
  modelClass: typeof Base,
  associationName: string,
  type: "collection" | "one_to_one",
): void {
  const attrName = `${associationName}Attributes`;
  // Register so persistence.create/createBang can re-dispatch after construction
  // (the Base constructor routes attrs through writeAttribute, bypassing setters).
  if (!Object.prototype.hasOwnProperty.call(modelClass, "_nestedAttributeSetterKeys")) {
    (modelClass as any)._nestedAttributeSetterKeys = new Set<string>();
  }
  (modelClass as any)._nestedAttributeSetterKeys.add(attrName);
  if (type === "collection") {
    Object.defineProperty(modelClass.prototype, attrName, {
      set(this: Base, value: any) {
        assignNestedAttributesForCollectionAssociation(this, associationName, value);
      },
      configurable: true,
    });
  } else {
    Object.defineProperty(modelClass.prototype, attrName, {
      set(this: Base, value: any) {
        assignNestedAttributesForOneToOneAssociation(this, associationName, value);
      },
      configurable: true,
    });
  }
}

/** @internal */
export function isPolymorphicBelongsTo(record: Base, associationName: string): boolean {
  const associations: any[] = (record.constructor as any)._associations ?? [];
  const assocDef = associations.find((a: any) => a.name === associationName);
  return assocDef?.type === "belongsTo" && Boolean(assocDef?.options?.polymorphic);
}

/**
 * Plain-object copy of `attributes` with the nested-attribute control keys
 * (`id`, `_destroy`) removed — the assignable set passed to a built/updated
 * child. Iterates own enumerable entries so strong-params wrappers
 * (`ProtectedParams`) work transparently.
 * @internal
 */
function assignableNestedAttributes(attributes: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attributes)) {
    if (!UNASSIGNABLE_KEYS.has(k)) out[k] = v;
  }
  return out;
}

/**
 * The slice of the singular (`belongsTo`/`hasOne`) runtime association used by
 * the one-to-one nested-attributes writer. `target` is the in-memory record (or
 * null); `build` / `initializeAttributes` mirror Rails' `build_#{name}` and
 * `Association#initialize_attributes`.
 * @internal
 */
interface OneToOneAssociation {
  target: Base | null;
  build(attrs: Record<string, unknown>): Base | null;
  initializeAttributes(record: Base): void;
}

/** @internal */
function hasNestedId(attributes: Record<string, unknown>): boolean {
  const id = (attributes as any).id;
  return id !== undefined && id !== null && id !== "";
}

/** @internal */
function storePendingNestedAttributes(
  record: Base,
  associationName: string,
  attrs: Record<string, unknown>[],
): void {
  if (!(record as any)._pendingNestedAttributes) {
    (record as any)._pendingNestedAttributes = new Map();
  }
  (record as any)._pendingNestedAttributes.set(associationName, attrs);
}

// Rails reports the offending value's class name (e.g. `got String`); mirror
// that with the JS constructor name rather than the lowercase `typeof`.
function nestedTypeName(value: unknown): string {
  if (value === null) return "NilClass";
  if (value === undefined) return "undefined";
  return (value as { constructor?: { name?: string } }).constructor?.name ?? typeof value;
}

/** @internal */
export function assignNestedAttributesForOneToOneAssociation(
  record: Base,
  associationName: string,
  attributes: Record<string, unknown>,
): void {
  if (typeof attributes !== "object" || attributes === null || Array.isArray(attributes)) {
    throw new Error(
      `Hash expected for \`${associationName}\` attributes, got ${nestedTypeName(attributes)}`,
    );
  }

  const ctor = record.constructor as typeof Base;
  const configs: NestedAttributeConfig[] = (ctor as any)._nestedAttributeConfigs ?? [];
  const options = configs.find((c) => c.associationName === associationName)?.options ?? {};
  const updateOnly = options.updateOnly ?? false;
  const hasId = hasNestedId(attributes);

  // Rails: `existing_record = send(association_name)`. A synchronous writer can
  // only observe an already-built / loaded in-memory target — trails performs
  // no synchronous DB read — so a DB-backed existing record is reached via the
  // async post-save flush (`processNestedAttributes`) instead.
  const assoc = record.association(associationName) as unknown as OneToOneAssociation;
  const existing = assoc.target ?? null;

  // Rails nested_attributes.rb:436 — update (or mark for destruction) the
  // existing record in place when `update_only` is set, or when a matching
  // `id` was supplied and the in-memory target carries that id.
  if (
    (updateOnly || hasId) &&
    existing &&
    (updateOnly || String(existing.id) === String((attributes as any).id))
  ) {
    if (!callRejectIf(record, associationName, attributes)) {
      assignToOrMarkForDestruction(existing, attributes, options.allowDestroy ?? false);
    }
    return;
  }

  // An `id`/`update_only` update whose target is not in memory: defer it to the
  // async post-save flush (trails-specific — Rails loads `existing_record`
  // synchronously here and assigns in place).
  if (hasId || updateOnly) {
    storePendingNestedAttributes(record, associationName, [attributes]);
    return;
  }

  // Rails nested_attributes.rb:443 — build a new record (no matching id).
  if (!isRejectNewRecord(record, associationName, attributes)) {
    const assignable = assignableNestedAttributes(attributes);
    if (existing && existing.isNewRecord()) {
      // Rails reuses an already-built unsaved target (e.g. after `buildShip`)
      // rather than replacing it: assign into it, then re-anchor FK/scope/
      // inverse via `initialize_attributes`.
      existing.assignAttributes(assignable);
      assoc.initializeAttributes(existing);
    } else {
      // Rails defers the polymorphic-target check to build time: a polymorphic
      // belongs_to has no `build_#{association_name}` method, so the writer
      // raises. Immediate in-memory build otherwise (`part.ship.name` is
      // readable right after assignment); autosave persists it on save.
      if (isPolymorphicBelongsTo(record, associationName)) {
        throw new Error(
          `Cannot build association \`${associationName}'. ` +
            `Are you trying to build a polymorphic one-to-one association?`,
        );
      }
      assoc.build(assignable);
    }
  }
}

/** @internal */
export function assignNestedAttributesForCollectionAssociation(
  record: Base,
  associationName: string,
  attributesCollection: Record<string, unknown>[] | Record<string, Record<string, unknown>>,
): void {
  if (typeof attributesCollection !== "object" || attributesCollection === null) {
    throw new Error(
      `Hash or Array expected for \`${associationName}\` attributes, got ${nestedTypeName(attributesCollection)}`,
    );
  }
  const ctor = record.constructor as typeof Base;
  const configs: NestedAttributeConfig[] = (ctor as any)._nestedAttributeConfigs ?? [];
  const config = configs.find((c) => c.associationName === associationName);

  let attrs: Record<string, unknown>[];
  if (Array.isArray(attributesCollection)) {
    attrs = attributesCollection;
  } else {
    const keys = Object.keys(attributesCollection);
    if (keys.includes("id")) {
      attrs = [attributesCollection as unknown as Record<string, unknown>];
    } else {
      // Rails takes `attributes_collection.values` in insertion order — no
      // sort (nested_attributes.rb:499-506). Object.values preserves the same
      // ordering trails can observe.
      attrs = keys.map((k) => (attributesCollection as any)[k]);
    }
  }

  checkRecordLimitBang(resolveNestedLimit(config?.options.limit, record), attrs);

  // Rails `assign_nested_attributes_for_collection_association` marks matching
  // records for destruction *in memory* at assign time, so validations run
  // against the post-destroy graph (e.g. the association-aware length validator
  // excludes records marked for destruction). The actual DELETE still flows
  // through the post-save flush in `processNestedAttributes`, which only runs
  // when `save` succeeds — so an invalidated graph leaves the rows untouched,
  // matching Rails.
  //
  // KNOWN LIMITATION vs Rails (nested_attributes.rb:510-515): Rails computes
  // `existing_records` as `association.loaded? ? target : scope.where(pk => ids)`
  // — i.e. it queries the DB when the association isn't loaded. We only mark
  // already-loaded records (the sync setter can't perform trails' async load).
  // This stays internally consistent: `readAttributeForValidation` also reads
  // only the loaded proxy, so an unloaded collection is neither validated
  // against nor marked here. The DB rows are still correctly destroyed by the
  // post-save flush; only the pre-save size-validation interaction is skipped
  // for the unloaded case (not exercised by any test).
  if (config?.options.allowDestroy) {
    const loaded = loadedCollectionTarget(record, associationName);
    if (loaded.length > 0) {
      const targetModel = resolveCollectionTargetModel(record, associationName);
      if (targetModel) {
        for (const a of attrs) {
          const id = a.id;
          if (id != null && id !== "" && hasDestroyFlag(a)) {
            const existing = findRecordById(targetModel, loaded, id);
            if (existing) markForDestruction(existing);
          }
        }
      }
    }
  }

  // Rails-style immediate in-memory build: new records (no `id`) are built on
  // the association at assign time so the collection is readable right after
  // assignment (`part.trinkets[0].name`); autosave persists them on save.
  //
  // Existing records (with an `id`): when the association is autosave-backed
  // (which all `accepts_nested_attributes_for` collections are in Rails), the
  // in-memory `@target` is populated synchronously — find the record in the
  // loaded target or instantiate a persisted stub by id, add it to the target,
  // and assign the nested attributes in place. Autosave then persists it (and
  // any grandchildren) on save, mirroring Rails'
  // `assign_nested_attributes_for_collection_association`. This also makes the
  // record readable right after assignment and lets a grandchild save reuse the
  // in-memory record without a DB reload.
  //
  // For non-autosave associations there is no autosave cascade to persist the
  // change, so existing records stay in the pending map for the trails-specific
  // post-save flush (`processNestedAttributes`).
  const associations: any[] = (ctor as any)._associations ?? [];
  const assocDef = associations.find((a: any) => a.name === associationName);
  const isAutosave = assocDef?.options?.autosave === true;

  const deferred: Record<string, unknown>[] = [];
  for (const a of attrs) {
    if (!hasNestedId(a)) {
      if (!isRejectNewRecord(record, associationName, a)) {
        collectionProxyFor(record, associationName).build(assignableNestedAttributes(a));
      }
    } else if (isAutosave) {
      populateInMemoryExistingRecord(record, associationName, a);
    } else {
      deferred.push(a);
    }
  }
  if (deferred.length > 0) {
    storePendingNestedAttributes(record, associationName, deferred);
  }
}

/**
 * Populate the in-memory collection target with an existing (id-bearing) nested
 * record so autosave persists it — and any grandchildren — on save without a DB
 * reload. Mirrors the `existing_record` branch of Rails'
 * `assign_nested_attributes_for_collection_association` (nested_attributes.rb:
 * 527-540): locate the record in the target, add it if absent, then
 * `assign_to_or_mark_for_destruction`. Reject-if and allow-destroy semantics
 * match Rails' existing-record path (`call_reject_if`, not `reject_new_record?`).
 *
 * Rails' `existing_records` set is the loaded target when loaded, else a
 * `scope.where(primary_key => attribute_ids)` SELECT (nested_attributes.rb:
 * 510-516); an id found in neither raises `raise_nested_attributes_record_not_found!`
 * (nested_attributes.rb:542). trails honors that exactly when the association is
 * loaded — `existing_records` is the target, so a missing id raises here. When
 * the association is NOT loaded, trails has no synchronous DB read to materialize
 * Rails' `scope.where(...)` SELECT, so it instantiates a persisted stub keyed by
 * the id instead. Two consequences of that sync-writer constraint, both
 * deviations from Rails:
 *   1. A non-existent id is not rejected at assign time (Rails would raise); the
 *      stub's autosave UPDATE simply matches zero rows.
 *   2. The stub carries only the primary key plus the foreign key back to the
 *      owner (so the child's `belongs_to` — and any `touch: true` on it —
 *      resolves the owner like the DB-loaded record would). Other persisted
 *      column values Rails' SELECT would load are absent — fine for the assigned
 *      attributes, but an autosave callback reading some other column sees a
 *      default, not the DB value.
 * @internal
 */
function populateInMemoryExistingRecord(
  record: Base,
  associationName: string,
  attrs: Record<string, unknown>,
): void {
  const ctor = record.constructor as typeof Base;
  const associations: any[] = (ctor as any)._associations ?? [];
  const assocDef = associations.find((a: any) => a.name === associationName);
  const targetModel = resolveCollectionTargetModel(record, associationName);
  if (!targetModel || !assocDef) return;

  // Rails' ordering (nested_attributes.rb:527→543→528): find the record in
  // `existing_records` first — raise RecordNotFound if absent — and only then
  // consult `call_reject_if`. A non-existent id therefore raises even when the
  // attributes would otherwise satisfy `reject_if`.
  const proxy = collectionProxyFor(record, associationName);
  const id = (attrs as any).id;
  let existing = findRecordById(targetModel, proxy.target, id);
  let isNewStub = false;
  if (!existing) {
    if (proxy.loaded) {
      // Loaded association: the target IS Rails' authoritative `existing_records`
      // set, so an id absent from it is a not-found (nested_attributes.rb:542).
      raiseNestedAttributesRecordNotFoundBang(record, associationName, id);
    }
    const pk = (targetModel as any).primaryKey;
    const pkCol = Array.isArray(pk) ? pk[0] : (pk ?? "id");
    // Seed the foreign key (and polymorphic type) back to the owner so the
    // stub's `belongs_to` resolves — mirrors the FK seeding in
    // `CollectionProxy#_buildRaw`. Instantiated as part of the persisted
    // baseline (not assigned), so it is not dirtied and never enters the
    // child's UPDATE; it only lets owner-touch / inverse reads find the owner.
    const row: Record<string, unknown> = { [pkCol]: id, ...stubOwnerForeignKey(record, assocDef) };
    existing = (targetModel as any)._instantiate(row);
    isNewStub = true;
  }

  // Rails adds the record to the target and assigns inside the
  // `unless call_reject_if(...)` block (nested_attributes.rb:528-539), so a
  // rejected existing record never enters `@target`. Defer the stub's
  // `add_to_target` until after the reject check to avoid leaving a partial
  // (PK-only) stub in the in-memory collection.
  if (callRejectIf(record, associationName, attrs)) return;
  if (isNewStub) (proxy as any).addExistingRecord(existing);
  assignToOrMarkForDestruction(existing!, attrs, isAllowDestroy(record, associationName));
}

/**
 * Foreign-key (and polymorphic type) attributes pointing a freshly-instantiated
 * collection stub back at its owner, mirroring the FK seeding in
 * `CollectionProxy#_buildRaw`. Only meaningful for direct (non-through)
 * has_many: a has_many :through / HABTM keeps the FK on the join row, not on the
 * target, so seeding a `${owner}_id` column there would be wrong (and may not
 * exist) — return nothing in that case.
 * @internal
 */
function stubOwnerForeignKey(record: Base, assocDef: any): Record<string, unknown> {
  if (assocDef.options?.through || assocDef.type === "hasAndBelongsToMany") return {};
  const ctor = record.constructor as typeof Base;
  const asName: string | undefined = assocDef.options?.as;
  const foreignKey: string =
    assocDef.options?.foreignKey ??
    (asName ? `${underscore(asName)}_id` : `${underscore(ctor.name)}_id`);
  const parentPk = assocDef.options?.primaryKey ?? (ctor as any).primaryKey;
  const parentPkCol = Array.isArray(parentPk) ? parentPk[0] : parentPk;
  const out: Record<string, unknown> = {
    [foreignKey]: (record as any)._readAttribute(parentPkCol),
  };
  if (asName) out[`${underscore(asName)}_type`] = ctor.name;
  return out;
}

/**
 * The in-memory target of a loaded collection proxy, or `[]` when the
 * association has not been loaded. Mirrors the read path in
 * `readAttributeForValidation` so destruction marking and validation see the
 * same record instances.
 * @internal
 */
function loadedCollectionTarget(record: Base, associationName: string): Base[] {
  const proxy = (record as any)._collectionProxies?.get?.(associationName) as
    | { target?: unknown[] }
    | undefined;
  return Array.isArray(proxy?.target) ? (proxy.target as Base[]) : [];
}

/**
 * Class name backing a collection association: explicit `className` option, else
 * the camelized singular of the association name. Single source of truth for
 * `processNestedAttributes` and `resolveCollectionTargetModel`.
 * @internal
 */
function collectionAssociationClassName(assocDef: any, associationName: string): string {
  return (
    assocDef.options.className ??
    (assocDef.type === "hasMany" || assocDef.type === "hasAndBelongsToMany"
      ? camelize(singularize(associationName))
      : camelize(associationName))
  );
}

/**
 * Resolve the model class backing a collection association via the registry,
 * mirroring the className resolution in `processNestedAttributes`.
 * @internal
 */
function resolveCollectionTargetModel(
  record: Base,
  associationName: string,
): typeof Base | undefined {
  const ctor = record.constructor as typeof Base;
  const associations: any[] = (ctor as any)._associations ?? [];
  const assocDef = associations.find((a: any) => a.name === associationName);
  if (!assocDef) return undefined;
  return modelRegistry.get(collectionAssociationClassName(assocDef, associationName));
}

export const InstanceMethods = {
  _destroy,
  hasDestroyFlag,
  isAllowDestroy,
  isWillBeDestroyed,
  callRejectIf,
  isRejectNewRecord,
  assignToOrMarkForDestruction,
  findRecordById,
  raiseNestedAttributesRecordNotFoundBang,
  checkRecordLimitBang,
  assignNestedAttributesForOneToOneAssociation,
  assignNestedAttributesForCollectionAssociation,
};

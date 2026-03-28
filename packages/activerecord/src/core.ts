/**
 * Core behavior mixed into every ActiveRecord model.
 *
 * Mirrors: ActiveRecord::Core
 */

/**
 * The Core module interface — methods mixed into every AR model.
 *
 * Mirrors: ActiveRecord::Core
 */
export interface Core {
  inspect(): string;
  attributeForInspect(attr: string): string;
  isEqual(other: unknown): boolean;
  isPresent(): boolean;
  isBlank(): boolean;
  isReadonly(): boolean;
  readonlyBang(): this;
  isStrictLoading(): boolean;
  strictLoadingBang(): this;
  isFrozen(): boolean;
  freeze(): this;
}

/**
 * Placeholder used in inspect output when an attribute value is masked
 * (e.g. for filtered attributes).
 *
 * Mirrors: ActiveRecord::Core::InspectionMask
 */
export class InspectionMask {
  private _value: string;

  constructor(value: string = "[FILTERED]") {
    this._value = value;
  }

  toString(): string {
    return this._value;
  }

  inspect(): string {
    return this._value;
  }
}

// ---------------------------------------------------------------------------
// Instance-level behavior
// ---------------------------------------------------------------------------

interface CoreRecord {
  id: unknown;
  _attributes: Iterable<[string, unknown]>;
  _newRecord: boolean;
  readAttribute(name: string): unknown;
  isPersisted(): boolean;
}

/**
 * Return a human-readable string representation of a record.
 *
 * Mirrors: ActiveRecord::Core#inspect
 */
export function inspect(record: CoreRecord): string {
  const ctor = record.constructor as { name: string };
  const attrs = Array.from(record._attributes)
    .map(([k, v]) => {
      if (v === null) return `${k}: nil`;
      if (v instanceof InspectionMask) return `${k}: ${v}`;
      if (typeof v === "string") return `${k}: "${v}"`;
      if (v instanceof Date) return `${k}: "${v.toISOString()}"`;
      return `${k}: ${JSON.stringify(v)}`;
    })
    .join(", ");
  return `#<${ctor.name} ${attrs}>`;
}

/**
 * Format a single attribute value for display in inspect output.
 *
 * Mirrors: ActiveRecord::Core#attribute_for_inspect
 */
export function attributeForInspect(record: CoreRecord, attr: string): string {
  const value = record.readAttribute(attr);
  if (value === null || value === undefined) return "nil";
  if (value instanceof InspectionMask) return value.toString();
  if (typeof value === "string") {
    if (value.length > 50) return `"${value.substring(0, 50)}..."`;
    return `"${value}"`;
  }
  if (value instanceof Date) return `"${value.toISOString()}"`;
  return JSON.stringify(value);
}

/**
 * Compare two records for equality by class and primary key.
 *
 * Mirrors: ActiveRecord::Core#==
 */
export function isEqual(record: CoreRecord, other: unknown): boolean {
  if (other === null || other === undefined) return false;
  if (typeof other !== "object") return false;
  if (!(other instanceof (record.constructor as any))) return false;
  if (record.constructor !== (other as any).constructor) return false;
  const thisId = record.id;
  const otherId = (other as CoreRecord).id;
  return thisId != null && thisId === otherId;
}

/**
 * Check if this record is present (persisted and not destroyed).
 *
 * Mirrors: ActiveRecord::Core#present?
 */
export function isPresent(record: CoreRecord): boolean {
  return record.isPersisted();
}

/**
 * Check if this record is blank (new record or destroyed).
 *
 * Mirrors: ActiveRecord::Core#blank?
 */
export function isBlank(record: CoreRecord): boolean {
  return !isPresent(record);
}

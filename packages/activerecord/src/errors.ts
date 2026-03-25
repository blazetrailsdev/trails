/**
 * ActiveRecord error classes.
 *
 * Mirrors: ActiveRecord::RecordNotFound, ActiveRecord::RecordInvalid, etc.
 */

/**
 * Raised when a record cannot be found by primary key or conditions.
 *
 * Mirrors: ActiveRecord::RecordNotFound
 */
export class RecordNotFound extends Error {
  readonly model: string;
  readonly primaryKey?: string;
  readonly id?: unknown;

  constructor(message: string, model?: string, primaryKey?: string, id?: unknown) {
    super(message);
    this.name = "RecordNotFound";
    this.model = model ?? "Record";
    this.primaryKey = primaryKey;
    this.id = id;
  }
}

/**
 * Raised when a record fails validation and save! or create! is called.
 *
 * Mirrors: ActiveRecord::RecordInvalid
 */
export class RecordInvalid extends Error {
  readonly record: any;

  constructor(record: any) {
    const messages = record.errors?.fullMessages?.join(", ") ?? "Validation failed";
    super(`Validation failed: ${messages}`);
    this.name = "RecordInvalid";
    this.record = record;
  }
}

/**
 * Raised when a record cannot be saved.
 *
 * Mirrors: ActiveRecord::RecordNotSaved
 */
export class RecordNotSaved extends Error {
  readonly record: any;

  constructor(message: string, record?: any) {
    super(message);
    this.name = "RecordNotSaved";
    this.record = record;
  }
}

/**
 * Raised when a record cannot be destroyed.
 *
 * Mirrors: ActiveRecord::RecordNotDestroyed
 */
export class RecordNotDestroyed extends Error {
  readonly record: any;

  constructor(message: string, record?: any) {
    super(message);
    this.name = "RecordNotDestroyed";
    this.record = record;
  }
}

/**
 * Raised when a record is stale (optimistic locking conflict).
 *
 * Mirrors: ActiveRecord::StaleObjectError
 */
export class StaleObjectError extends Error {
  readonly record: any;

  constructor(record: any, attemptedAction: string) {
    const model = record?.constructor?.name ?? "Record";
    super(
      `StaleObjectError: Attempted to ${attemptedAction} a stale ${model}. The record has been modified by another process.`,
    );
    this.name = "StaleObjectError";
    this.record = record;
  }
}

/**
 * Raised when attempting to modify a readonly record.
 *
 * Mirrors: ActiveRecord::ReadOnlyRecord
 */
export class ReadOnlyRecord extends Error {
  readonly record: any;

  constructor(record?: any) {
    const model = record?.constructor?.name ?? "Record";
    super(`${model} is marked as readonly`);
    this.name = "ReadOnlyRecord";
    this.record = record;
  }
}

/**
 * Raised when sole() finds more than one record.
 *
 * Mirrors: ActiveRecord::SoleRecordExceeded
 */
export class SoleRecordExceeded extends Error {
  readonly model: string;

  constructor(model: string) {
    super(`${model} has more than one record`);
    this.name = "SoleRecordExceeded";
    this.model = model;
  }
}

/**
 * Raised when a lazy-loaded association is accessed on a strict_loading record.
 *
 * Mirrors: ActiveRecord::StrictLoadingViolationError
 */
export class StrictLoadingViolationError extends Error {
  readonly record: any;
  readonly association: string;

  constructor(record: any, association: string) {
    const model = record?.constructor?.name ?? "Record";
    super(
      `${model} is marked for strict_loading. The ${association} association cannot be lazily loaded.`,
    );
    this.name = "StrictLoadingViolationError";
    this.record = record;
    this.association = association;
  }
}

/**
 * Raised when a type column value does not correspond to a valid subclass.
 *
 * Mirrors: ActiveRecord::SubclassNotFound
 */
export class SubclassNotFound extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubclassNotFound";
  }
}

/**
 * Mirrors: ActiveRecord::UnknownAttributeError
 */
export class UnknownAttributeError extends Error {
  readonly record: any;
  readonly attribute: string;

  constructor(record: any, attribute: string) {
    const model = record?.constructor?.name ?? "Record";
    super(`unknown attribute '${attribute}' for ${model}.`);
    this.name = "UnknownAttributeError";
    this.record = record;
    this.attribute = attribute;
  }
}

export class NameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NameError";
  }
}

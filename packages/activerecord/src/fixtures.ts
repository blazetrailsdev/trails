/**
 * Fixtures — test data loading infrastructure.
 *
 * Mirrors: ActiveRecord::Fixture and related error classes
 */
import { ActiveRecordError } from "./errors.js";

export class FixtureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FixtureError";
  }
}

// Rails nests FixtureClassNotFound directly under ActiveRecordError
// (not FixtureError), so keep the inheritance edge there — the class
// is still surfaced via FixtureSet.FixtureClassNotFound for callers.
export class FixtureClassNotFound extends ActiveRecordError {
  constructor(className: string) {
    super(`No model class found for fixture: ${className}`);
    this.name = "FixtureClassNotFound";
  }
}

export class FormatError extends FixtureError {
  constructor(message: string) {
    super(message);
    this.name = "FormatError";
  }
}

/**
 * Mirrors: ActiveRecord::Fixture
 *
 * Represents a single fixture row — a named set of column values
 * that will be inserted into a table.
 */
export class Fixture {
  static readonly FixtureError = FixtureError;
  static readonly FixtureClassNotFound = FixtureClassNotFound;
  static readonly FormatError = FormatError;

  readonly name: string;
  readonly modelClass: string | null;
  private _fixture: Record<string, unknown>;

  constructor(name: string, fixture: Record<string, unknown>, modelClass: string | null = null) {
    this.name = name;
    this._fixture = { ...fixture };
    this.modelClass = modelClass;
  }

  get(key: string): unknown {
    return this._fixture[key];
  }

  set(key: string, value: unknown): void {
    this._fixture[key] = value;
  }

  get keys(): string[] {
    return Object.keys(this._fixture);
  }

  get values(): unknown[] {
    return Object.values(this._fixture);
  }

  toRecord(): Record<string, unknown> {
    return { ...this._fixture };
  }

  get id(): unknown {
    return this._fixture.id;
  }
}

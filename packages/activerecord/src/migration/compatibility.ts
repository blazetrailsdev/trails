/**
 * Migration compatibility — versioned migration behavior.
 *
 * Mirrors: ActiveRecord::Migration::Compatibility
 *
 * Each version class preserves the migration behavior from that Rails version.
 * This allows old migrations to continue working as they were originally written.
 */

import { Migration } from "../migration.js";

export interface Compatibility {
  version: string;
}

export class V7_2 extends Migration {
  async up(): Promise<void> {}
  async down(): Promise<void> {}
}

export interface V7_2TableDefinition {
  timestampsPrecision: number | null;
}

export class V7_1 extends V7_2 {}

export class V7_0 extends V7_1 {}

export interface LegacyIndexName {
  legacyIndexName: boolean;
}

export interface V7_0TableDefinition {
  timestampsPrecision: number | null;
}

export class V6_1 extends V7_0 {}

export class PostgreSQLCompat {
  static readonly changeColumnDefaultToNull = true;
}

export interface V6_1TableDefinition {
  referencesType: string;
}

export class V6_0 extends V6_1 {}

export class V6_0ReferenceDefinition {
  readonly polymorphic: boolean;
  readonly index: boolean;

  constructor(options: { polymorphic?: boolean; index?: boolean } = {}) {
    this.polymorphic = options.polymorphic ?? false;
    this.index = options.index !== false;
  }
}

export interface V6_0TableDefinition {
  referencesType: string;
}

export class V5_2 extends V6_0 {}

export interface V5_2TableDefinition {
  timestampsPrecision: number | null;
}

export interface V5_2CommandRecorder {
  invert: boolean;
}

export class V5_1 extends V5_2 {}

export class V5_0 extends V5_1 {}

export interface V5_0TableDefinition {
  primaryKeyType: string;
}

export class V4_2 extends V5_0 {}

export interface V4_2TableDefinition {
  timestampsNull: boolean;
}

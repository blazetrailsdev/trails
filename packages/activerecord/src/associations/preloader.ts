import type { Base } from "../base.js";

/**
 * Callback type for the actual preloading implementation.
 * This allows the Preloader to delegate to Relation's existing
 * _preloadAssociationsForRecords without a circular dependency.
 */
export type PreloadFn = (records: Base[], associations: string[]) => Promise<void>;

/**
 * Implements eager loading of associations. Given a set of records and
 * association names, loads all associated records in as few queries as
 * possible.
 *
 * In Rails, the Preloader orchestrates Branch and Association objects
 * to batch-load associations efficiently. Our implementation delegates
 * to Relation's _preloadAssociationsForRecords for the actual loading,
 * but routes through this class so the code path matches Rails' structure.
 *
 * Mirrors: ActiveRecord::Associations::Preloader
 */
export class Preloader {
  readonly records: Base[];
  readonly associations: string[];
  private _preloadFn: PreloadFn | null;

  constructor(records: Base[], associations: string[], preloadFn?: PreloadFn) {
    this.records = records;
    this.associations = associations;
    this._preloadFn = preloadFn ?? null;
  }

  async call(): Promise<void> {
    if (this.records.length === 0 || this.associations.length === 0) return;

    if (this._preloadFn) {
      await this._preloadFn(this.records, this.associations);
    } else {
      // Fallback: load each association individually per record
      for (const assocName of this.associations) {
        for (const record of this.records) {
          await (record as any)[assocName];
        }
      }
    }
  }
}

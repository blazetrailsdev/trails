import type pg from "pg";
import { Result } from "../../result.js";

/** @noRailsEquivalent PERMANENT */
export class PGResult extends Array<Record<string, unknown>> {
  /** @noRailsEquivalent PERMANENT */
  static get [Symbol.species]() {
    return Array;
  }

  readonly #native: pg.QueryResult;

  /** @noRailsEquivalent PERMANENT */
  constructor(native: pg.QueryResult) {
    super();
    this.#native = native;
    const hashes = new Result(
      (native.fields ?? []).map((f) => f.name),
      (native.rows ?? []) as unknown[][],
    ).toArray();
    for (const hash of hashes) this.push(hash);
  }

  /** @noRailsEquivalent PERMANENT */
  get fields(): string[] {
    return (this.#native.fields ?? []).map((f) => f.name);
  }

  /** @noRailsEquivalent PERMANENT */
  override values(): unknown[][] & ArrayIterator<Record<string, unknown>> {
    return (this.#native.rows ?? []) as unknown[][] & ArrayIterator<Record<string, unknown>>;
  }

  /** @noRailsEquivalent PERMANENT */
  ntuples(): number {
    return (this.#native.rows ?? []).length;
  }

  /** @noRailsEquivalent PERMANENT */
  getvalue(tupNum: number, fieldNum: number): unknown {
    return ((this.#native.rows ?? []) as unknown[][])[tupNum]?.[fieldNum] ?? null;
  }

  /** @noRailsEquivalent PERMANENT */
  ftype(columnNumber: number): number {
    return this.#native.fields[columnNumber].dataTypeID;
  }

  /** @noRailsEquivalent PERMANENT */
  fmod(columnNumber: number): number {
    return this.#native.fields[columnNumber].dataTypeModifier ?? -1;
  }

  /** @noRailsEquivalent PERMANENT */
  cmdTuples(): number {
    return this.#native.rowCount ?? 0;
  }

  /** @noRailsEquivalent PERMANENT */
  clear(): null {
    return null;
  }
}

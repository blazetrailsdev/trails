import type pg from "pg";
import { Result } from "../../result.js";
import type { PGTypeMapByOid } from "./pg-text-decoder.js";

/** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
export class PGResult extends Array<Record<string, unknown>> {
  /** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
  static get [Symbol.species]() {
    return Array;
  }

  readonly #native: pg.QueryResult;

  /** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
  constructor(native: pg.QueryResult) {
    super();
    this.#native = native;
    const hashes = new Result(
      (native.fields ?? []).map((f) => f.name),
      (native.rows ?? []) as unknown[][],
    ).toArray();
    for (const hash of hashes) this.push(hash);
  }

  /** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
  get fields(): string[] {
    return (this.#native.fields ?? []).map((f) => f.name);
  }

  /** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
  override values(): unknown[][] & ArrayIterator<Record<string, unknown>> {
    return (this.#native.rows ?? []) as unknown[][] & ArrayIterator<Record<string, unknown>>;
  }

  /** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
  ntuples(): number {
    return (this.#native.rows ?? []).length;
  }

  /** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
  getvalue(tupNum: number, fieldNum: number): unknown {
    return ((this.#native.rows ?? []) as unknown[][])[tupNum]?.[fieldNum] ?? null;
  }

  /** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
  ftype(columnNumber: number): number {
    return this.#native.fields[columnNumber].dataTypeID;
  }

  /** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
  fmod(columnNumber: number): number {
    return this.#native.fields[columnNumber].dataTypeModifier ?? -1;
  }

  /** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
  cmdTuples(): number {
    return this.#native.rowCount ?? 0;
  }

  /** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
  mapTypesBang(typeMap: PGTypeMapByOid): this {
    const fields = this.#native.fields ?? [];
    fields.forEach((field, i) => {
      const decoder = typeMap.coders.get(field.dataTypeID);
      if (!decoder) return;
      ((this.#native.rows ?? []) as unknown[][]).forEach((row, tupNum) => {
        if (row[i] == null) return;
        row[i] = decoder.decode(row[i] as string);
        this[tupNum][field.name] = row[i];
      });
    });
    return this;
  }

  /** @noRailsEquivalent CONVERGEABLE pg-gem-result-and-array-coders-score-against-the-pg-gem */
  clear(): null {
    return null;
  }
}

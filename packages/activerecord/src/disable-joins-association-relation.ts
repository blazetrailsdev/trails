import { Relation, type LoadedRelation } from "./relation.js";
import { argumentError } from "./relation/query-methods.js";
import { _registerRelationFamily } from "./relation/uncacheable-methods-slot.js";
import {
  disableJoinsAssociationRelationClassFor,
  wrapWithScopeProxy,
} from "./relation/delegation.js";
import { normalizeAssociationKey } from "./associations/key-normalization.js";
import { stripThenable } from "./relation/thenable.js";
import type { Base } from "./base.js";
import type { Nodes } from "@blazetrails/arel";

const TRUSTED_CLONE = Symbol("DisableJoinsAssociationRelation.trustedClone");

interface TrustedClonePayload<T extends Base> {
  [TRUSTED_CLONE]: {
    storedIds: DjarIds;
    storedKeyStrings: string[] | null;
    composite: boolean;
    chainWalker?: () => Promise<{ relation: Relation<T> }>;
  };
}

export type DjarKey = string | string[];
export type DjarIds = unknown[] | unknown[][];

function serializeKey(v: unknown, composite: boolean): unknown {
  if (!composite) return normalizeAssociationKey(v);
  return (
    "\u0000T" +
    JSON.stringify(v, (_k, value) => {
      if (typeof value !== "bigint") return value;
      const normalized = normalizeAssociationKey(value);
      return typeof normalized === "bigint" ? `\u0000B${normalized.toString()}` : normalized;
    })
  );
}

export class DisableJoinsAssociationRelation<T extends Base> extends Relation<T> {
  /** @internal */
  static override _railsClassName = "ActiveRecord::DisableJoinsAssociationRelation";

  readonly key: DjarKey;
  private readonly _storedIds: DjarIds;
  private readonly _storedKeyStrings: string[] | null;
  private readonly _composite: boolean;
  private readonly _chainWalker?: () => Promise<{ relation: Relation<T> }>;
  private _walkPromise?: Promise<{ relation: Relation<T> }>;

  constructor(klass: typeof Base, key: string, ids: unknown[]);
  constructor(klass: typeof Base, key: string[], ids: unknown[][]);
  constructor(
    klass: typeof Base,
    key: DjarKey,
    ids: DjarIds,
    chainWalkerOrTrusted: (() => Promise<{ relation: Relation<T> }>) | TrustedClonePayload<T>,
  );
  constructor(
    klass: typeof Base,
    key: DjarKey,
    ids: DjarIds,
    chainWalkerOrTrusted?: (() => Promise<{ relation: Relation<T> }>) | TrustedClonePayload<T>,
  ) {
    super(klass);
    if (
      chainWalkerOrTrusted &&
      typeof chainWalkerOrTrusted === "object" &&
      TRUSTED_CLONE in chainWalkerOrTrusted
    ) {
      const t = chainWalkerOrTrusted[TRUSTED_CLONE];
      this.key = key;
      this._composite = t.composite;
      this._storedIds = t.storedIds;
      this._storedKeyStrings = t.storedKeyStrings;
      this._chainWalker = t.chainWalker;
      return;
    }
    const chainWalker = chainWalkerOrTrusted;
    if (!Array.isArray(ids)) {
      throw argumentError(
        `DisableJoinsAssociationRelation: ids must be an array (got ${ids === null ? "null" : typeof ids})`,
      );
    }
    let normalizedKey: DjarKey = key;
    let normalizedIds: DjarIds = ids;
    if (Array.isArray(key)) {
      if (key.length === 0) {
        throw argumentError("DisableJoinsAssociationRelation: key must have at least one column");
      }
      if (key.length === 1) {
        normalizedKey = key[0];
        normalizedIds = (ids as unknown[]).map((id, i) => {
          if (!Array.isArray(id)) return id;
          if (id.length !== 1) {
            throw argumentError(
              `DisableJoinsAssociationRelation: single-column ids[${i}] must be a scalar or single-element array (got arity ${id.length})`,
            );
          }
          return id[0];
        });
      }
    }
    if (normalizedKey === "" && !chainWalker) {
      throw argumentError("DisableJoinsAssociationRelation: key must not be empty");
    }
    this.key = normalizedKey;
    this._composite = Array.isArray(normalizedKey);
    if (this._composite) {
      const cols = normalizedKey as string[];
      const arity = cols.length;
      const seen = new Set<string>();
      const out: unknown[][] = [];
      const keyStrings: string[] = [];
      for (let i = 0; i < (normalizedIds as unknown[]).length; i++) {
        const t = (normalizedIds as unknown[])[i];
        if (!Array.isArray(t)) {
          throw argumentError(
            `DisableJoinsAssociationRelation: composite ids[${i}] must be an array (got ${typeof t})`,
          );
        }
        if (t.length !== arity) {
          throw argumentError(
            `DisableJoinsAssociationRelation: composite ids[${i}] arity ${t.length} does not match key [${cols.join(", ")}] (arity ${arity})`,
          );
        }
        const tuple = Array.from(t);
        const k = serializeKey(tuple, true) as string;
        if (!seen.has(k)) {
          seen.add(k);
          out.push(tuple);
          keyStrings.push(k);
        }
      }
      this._storedIds = out;
      this._storedKeyStrings = keyStrings;
    } else {
      const scalarIds = normalizedIds as unknown[];
      for (let i = 0; i < scalarIds.length; i++) {
        if (Array.isArray(scalarIds[i])) {
          throw argumentError(
            `DisableJoinsAssociationRelation: scalar ids[${i}] must not be an array when key is "${String(normalizedKey)}"`,
          );
        }
      }
      this._storedIds = Array.from(new Set(scalarIds));
      this._storedKeyStrings = null;
    }
    this._chainWalker = chainWalker;
  }

  static deferred<T extends Base>(
    klass: typeof Base,
    chainWalker: () => Promise<{ relation: Relation<T> }>,
  ): DisableJoinsAssociationRelation<T> {
    const Ctor = disableJoinsAssociationRelationClassFor(klass);
    return new Ctor(klass, "", [], chainWalker);
  }

  private _composeChainedState(walkerResult: Relation<T>): Relation<T> {
    type ComposeFields = {
      orderValues?: unknown[];
      selectValues?: unknown[];
    };
    const source = walkerResult as unknown as ComposeFields;
    const sourceOrders = [...(source.orderValues ?? [])];
    const sourceSelects = [...(source.selectValues ?? [])];

    const merged = (walkerResult as unknown as { merge: (o: unknown) => Relation<T> }).merge(this);
    const target = merged as unknown as ComposeFields;
    const overlay = this as unknown as ComposeFields & { reorderingValue?: boolean };
    const overlayOrders = overlay.orderValues ?? [];
    const overlaySelects = overlay.selectValues ?? [];
    const isReordering = overlay.reorderingValue ?? false;

    if (isReordering) {
      target.orderValues = [...overlayOrders];
    } else {
      target.orderValues = [...sourceOrders, ...overlayOrders];
    }

    if (sourceSelects && sourceSelects.length > 0) {
      target.selectValues = Array.from(new Set([...sourceSelects, ...overlaySelects]));
    }

    return merged;
  }

  override async ids(): Promise<DjarIds> {
    if (this._chainWalker) {
      const { relation } = await this._walkOnce();
      const merged = this._composeChainedState(relation);
      return (merged as unknown as { ids: () => Promise<DjarIds> }).ids();
    }
    if (this._composite) {
      return (this._storedIds as unknown[][]).map((t) => Array.from(t));
    }
    return (this._storedIds as unknown[]).slice();
  }

  async count(column?: string): Promise<number | Map<unknown, number>> {
    if (this._chainWalker) {
      const { relation } = await this._walkOnce();
      const merged = this._composeChainedState(relation);
      return (
        merged as unknown as {
          count: (col?: string) => Promise<number | Map<unknown, number>>;
        }
      ).count(column);
    }
    const baseCount = (
      Relation.prototype as unknown as {
        count: (this: unknown, col?: string) => Promise<number | Map<unknown, number>>;
      }
    ).count;
    return baseCount.call(this, column);
  }

  override async calculate(
    operation: "count",
    column?: string,
  ): Promise<number | Map<unknown, number>>;
  override async calculate(
    operation: "sum",
    column: string | Nodes.Node | number | null,
  ): Promise<number | bigint | Map<unknown, number | bigint>>;
  override async calculate(
    operation: "average" | "minimum" | "maximum",
    column: string,
  ): Promise<unknown | null | Map<unknown, unknown>>;
  override async calculate(
    operation: string,
    columnName?: string | Nodes.Node | number | null,
  ): Promise<unknown>;
  override async calculate(
    operation: string,
    columnName?: string | Nodes.Node | number | null,
  ): Promise<unknown> {
    if (this._chainWalker && !(this as unknown as { _isNone: boolean })._isNone) {
      const { relation } = await this._walkOnce();
      const merged = this._composeChainedState(relation);
      return merged.calculate(operation, columnName as string);
    }
    return (
      Relation.prototype as unknown as {
        calculate: (
          this: unknown,
          operation: string,
          columnName?: string | Nodes.Node | number | null,
        ) => Promise<unknown>;
      }
    ).calculate.call(this, operation, columnName);
  }

  override async pluck(
    ...columnNames: Array<string | Nodes.Attribute | Nodes.NamedFunction | Nodes.SqlLiteral>
  ): Promise<unknown[]> {
    if (this._chainWalker && !(this as unknown as { _isNone: boolean })._isNone) {
      const { relation } = await this._walkOnce();
      const merged = this._composeChainedState(relation);
      return merged.pluck(...columnNames);
    }
    return (
      Relation.prototype as unknown as {
        pluck: (
          this: unknown,
          ...columnNames: Array<string | Nodes.Attribute | Nodes.NamedFunction | Nodes.SqlLiteral>
        ) => Promise<unknown[]>;
      }
    ).pluck.call(this, ...columnNames);
  }

  private _walkOnce(): Promise<{ relation: Relation<T> }> {
    if (!this._walkPromise) {
      this._walkPromise = this._chainWalker!();
    }
    return this._walkPromise;
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  override clone(): Relation<T> {
    const payload: TrustedClonePayload<T> = {
      [TRUSTED_CLONE]: {
        storedIds: this._storedIds,
        storedKeyStrings: this._storedKeyStrings,
        composite: this._composite,
        chainWalker: this._chainWalker,
      },
    };
    const trusted = payload as unknown as () => Promise<{ relation: Relation<T> }>;
    const Ctor = disableJoinsAssociationRelationClassFor(this.model);
    const rel = (this._composite
      ? new Ctor(this.model, this.key as string[], this._storedIds as unknown[][], trusted)
      : new Ctor(
          this.model,
          this.key as string,
          this._storedIds as unknown[],
          trusted,
        )) as unknown as Relation<T>;
    rel.initializeCopy(this as unknown as Relation<T>);
    return wrapWithScopeProxy(rel);
  }

  protected override async execQueries(): Promise<T[]> {
    if (this._chainWalker) {
      const { relation } = await this._walkOnce();
      const merged = this._composeChainedState(relation);
      if (merged instanceof DisableJoinsAssociationRelation && !merged._chainWalker) {
        const bounds = merged as unknown as {
          limitValue?: number | null;
          offsetValue?: number | null;
        };
        const limitVal = bounds.limitValue ?? null;
        const offsetVal = bounds.offsetValue ?? null;
        if (limitVal !== null || offsetVal !== null) {
          bounds.limitValue = null;
          bounds.offsetValue = null;
          const ordered = await merged;
          const start = offsetVal ?? 0;
          return ordered.slice(start, limitVal == null ? undefined : start + limitVal);
        }
      }
      return merged.toArray();
    }
    return super.execQueries();
  }

  override async load(): Promise<LoadedRelation<this>> {
    await super.load();
    if (this._chainWalker) return stripThenable(this);
    const records = this._records;

    const recordsById = new Map<unknown, T[]>();
    const keyCols = Array.isArray(this.key) ? this.key : [this.key];
    const composite = this._composite;
    for (const record of records) {
      const raw = composite
        ? keyCols.map((c) => record._readAttribute(c))
        : record._readAttribute(keyCols[0]);
      const k = serializeKey(raw, composite);
      const bucket = recordsById.get(k);
      if (bucket) bucket.push(record);
      else recordsById.set(k, [record]);
    }

    const ordered: T[] = [];
    if (composite) {
      for (const k of this._storedKeyStrings!) {
        const bucket = recordsById.get(k);
        if (bucket) ordered.push(...bucket);
      }
    } else {
      for (const id of this._storedIds) {
        const bucket = recordsById.get(normalizeAssociationKey(id));
        if (bucket) ordered.push(...bucket);
      }
    }

    this._records = ordered;
    return stripThenable(this);
  }

  /** @missingRailsCall take — PERMANENT */
  // @ts-expect-error — deliberate Rails-fidelity deviation in loaded-chain mode: returns Array, not Relation
  override limit(value: number | null): Relation<T> | Promise<T[]> {
    if (this._chainWalker) return Relation.prototype.limit.call(this, value) as Relation<T>;
    return (async () => {
      const records = await this.toArray();
      return value === null ? records : records.slice(0, value);
    })();
  }

  override first(): Promise<T | null>;
  override first(n: number): Promise<T[]>;
  /** @missingRailsCall limit — PERMANENT */
  override async first(limit?: number): Promise<T | T[] | null> {
    if (this._chainWalker) {
      const rows = await (
        this as unknown as { findNthWithLimit: (i: number, l: number) => Promise<T[]> }
      ).findNthWithLimit(0, limit ?? 1);
      return limit === undefined ? (rows[0] ?? null) : rows;
    }
    const records = await this.toArray();
    return limit === undefined ? (records[0] ?? null) : records.slice(0, limit);
  }
}

_registerRelationFamily(
  "disableJoinsAssociationRelation",
  DisableJoinsAssociationRelation as unknown as new (...a: never[]) => unknown,
);

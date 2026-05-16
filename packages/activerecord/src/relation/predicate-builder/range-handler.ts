import { Nodes } from "@blazetrails/arel";
import type { Range } from "../../connection-adapters/postgresql/oid/range.js";

/**
 * Handles Range values in where conditions by delegating to
 * `attribute.between`, which encodes Rails' Arel `Predications#between`
 * decision tree (open-ended, ±Infinity, exclude-end).
 *
 * Mirrors: ActiveRecord::PredicateBuilder::RangeHandler — Rails' `call`
 * builds bind attributes for both bounds and hands a `RangeWithBinds` to
 * `attribute.between`; the open-ended / infinity logic lives in Arel.
 *
 * TS deviation: there is no `QueryAttribute`-wrapping bind step here;
 * `_castBound` runs the attribute's type cast on the raw bound (so e.g.
 * an integer column coerces `"1-meowmeow"` → 1). ±Infinity bounds are
 * passed through uncast — mirroring Rails RangeHandler's reliance on
 * `infinity?` recognizing ±Float::INFINITY at the Arel layer.
 */
export class RangeHandler {
  private _castBound?: (attribute: Nodes.Attribute, value: unknown) => unknown;
  private _predicateBuilder: unknown = undefined;

  constructor(castBound?: (attribute: Nodes.Attribute, value: unknown) => unknown) {
    this._castBound = castBound;
  }

  call(attribute: Nodes.Attribute, value: Range): Nodes.Node {
    const [beginVal, endVal] = this._castBounds(attribute, value);
    return attribute.between({ begin: beginVal, end: endVal, excludeEnd: value.excludeEnd });
  }

  callNegated(attribute: Nodes.Attribute, value: Range): Nodes.Node {
    const [beginVal, endVal] = this._castBounds(attribute, value);
    // Exclusive ranges negate to `(col < begin OR col >= end)` —
    // `NOT (gteq AND lt)` would lose the explicit ordering that AR
    // callers (and parity tests) match on.
    if (
      value.excludeEnd &&
      beginVal !== null &&
      beginVal !== undefined &&
      beginVal !== -Infinity &&
      beginVal !== Infinity &&
      endVal !== null &&
      endVal !== undefined &&
      endVal !== Infinity &&
      endVal !== -Infinity
    ) {
      return new Nodes.Grouping(new Nodes.Or(attribute.lt(beginVal), attribute.gteq(endVal)));
    }
    // Mirrors Rails WhereClause#invert: call `.invert()` on the Arel node so
    // collapsed predicates (`lteq` → `gt`, `gteq` → `lt`, `In([])` →
    // `NotIn([])`) become canonical, instead of double-wrapping `Not(...)` over
    // a simpler form. For full BETWEEN this still yields `Not(Between(...))`
    // (Node#invert default), matching AR-level `where.not(col: 1..5)` exactly.
    return attribute
      .between({ begin: beginVal, end: endVal, excludeEnd: value.excludeEnd })
      .invert();
  }

  private _castBounds(attribute: Nodes.Attribute, value: Range): [unknown, unknown] {
    // Rails RangeHandler skips no bounds: `build_bind_attribute` wraps even
    // nil / Float::INFINITY. We mirror the intent by passing those through
    // uncast — type.cast on null/undefined / Infinity would be a no-op or
    // worse (numeric types may coerce Infinity into something finite).
    const skipCast = (v: unknown): boolean =>
      v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v));
    const cast = this._castBound
      ? (v: unknown) => this._castBound!(attribute, v)
      : (v: unknown) => v;
    return [
      skipCast(value.begin) ? value.begin : cast(value.begin),
      skipCast(value.end) ? value.end : cast(value.end),
    ];
  }

  private get predicateBuilder(): unknown {
    return this._predicateBuilder;
  }
}

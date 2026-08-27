import type { Attribute } from "./attributes/attribute.js";
import type { buildQuoted } from "./nodes/casted.js";
import type { Equality } from "./nodes/equality.js";
import type { Grouping } from "./nodes/grouping.js";
import type { In } from "./nodes/in.js";
import type { And, Or } from "./nodes/nary.js";
import type { Not } from "./nodes/unary.js";
import type { Table } from "./table.js";
import type { Dot } from "./visitors/dot.js";

/** @internal */
export let _Not: typeof Not | undefined;
/** @internal */
export function _setNot(ctor: typeof Not): void {
  _Not = ctor;
}

/** @internal */
export let _Grouping: typeof Grouping | undefined;
/** @internal */
export function _setGrouping(ctor: typeof Grouping): void {
  _Grouping = ctor;
}

/** @internal */
export let _Or: typeof Or | undefined;
/** @internal */
export function _setOr(ctor: typeof Or): void {
  _Or = ctor;
}

/** @internal */
export let _And: typeof And | undefined;
/** @internal */
export function _setAnd(ctor: typeof And): void {
  _And = ctor;
}

/** @internal */
export let _Equality: typeof Equality | undefined;
/** @internal */
export function _setEquality(ctor: typeof Equality): void {
  _Equality = ctor;
}

/** @internal */
export let _In: typeof In | undefined;
/** @internal */
export function _setIn(ctor: typeof In): void {
  _In = ctor;
}

/** @internal */
export let _buildQuoted: typeof buildQuoted | undefined;
/** @internal */
export function _setBuildQuoted(fn: typeof buildQuoted): void {
  _buildQuoted = fn;
}

/** @internal */
export let _Attribute: typeof Attribute | undefined;
/** @internal */
export function _setAttribute(ctor: typeof Attribute): void {
  _Attribute = ctor;
}

/** @internal */
export let _Dot: typeof Dot | undefined;
/** @internal */
export function _setDot(ctor: typeof Dot): void {
  _Dot = ctor;
}

/** @internal */
export let _Table: typeof Table | undefined;
/** @internal */
export function _setTable(ctor: typeof Table): void {
  _Table = ctor;
}

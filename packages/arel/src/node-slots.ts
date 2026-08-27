// Late-bound node-constructor slots, extracted into a module with ZERO
// imports so it cannot participate in any import cycle.
//
// Ruby resolves `Nodes::Grouping` / `Nodes::Or` / `Nodes::Equality` when the
// method that names them RUNS, and Zeitwerk autoloads the file then
// (node.rb:129-131, binary.rb:25-29, casted.rb:48-52). ESM has no such
// deferral: node.ts is the superclass module every node file imports, so a
// value import back down to `unary.ts` / `nary.ts` / `grouping.ts` /
// `casted.ts` / `equality.ts` / `in.ts` closes a cycle whose participants all
// `extend Node`, and entering the graph at one of them evaluates the subclass
// with `Node` still in TDZ.
//
// Each defining module sets its own slot at the bottom of its body; the
// readers import the binding and use it at call time, exactly where Ruby
// resolves the constant.
//
// The shape itself — and why the alternatives do not work — is written down
// once in CLAUDE.md, "Call-time constant resolution (Ruby autoload → the
// zero-import slot)".
//
// The slots are TYPED against the real classes with `import type`, which the
// compiler erases entirely — no runtime edge, so the zero-import guarantee
// still holds and the slot values need no `any`.
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

/**
 * `Arel::Attributes::Attribute` — the class Rails narrows on with `is_a?` in
 * `FetchAttribute#fetch_attribute` (binary.rb:33-37) and `Nodes.build_quoted`
 * (casted.rb:48-52). A value import of `attributes/attribute.js` from either
 * reader closes a cycle back through every node module the Attribute mixins
 * reach.
 * @internal
 */
export let _Attribute: typeof Attribute | undefined;
/** @internal */
export function _setAttribute(ctor: typeof Attribute): void {
  _Attribute = ctor;
}

/**
 * `Arel::Visitors::Dot` — the constant `TreeManager#to_dot` names when it runs
 * (tree_manager.rb:57-61). A value import of `visitors/dot.js` from
 * `tree-manager.ts` closes a cycle back through `table.js` and
 * `select-manager.js` onto the three `extends TreeManager` modules, so
 * entering the graph at `update-manager.js` evaluates `DeleteManager` with
 * `TreeManager` still in TDZ.
 * @internal
 */
export let _Dot: typeof Dot | undefined;
/** @internal */
export function _setDot(ctor: typeof Dot): void {
  _Dot = ctor;
}

/**
 * `Arel::Table` — the constant `Nodes.build_quoted` names in its pass-through
 * `case` (casted.rb:47-51). A value import of `table.js` from `casted.ts`
 * closes a cycle back through every node module `Table` reaches.
 * @internal
 */
export let _Table: typeof Table | undefined;
/** @internal */
export function _setTable(ctor: typeof Table): void {
  _Table = ctor;
}

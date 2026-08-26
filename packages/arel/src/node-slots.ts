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

/* eslint-disable @typescript-eslint/no-explicit-any */

/** @internal */
export let _Not: (new (expr: any) => any) | undefined;
/** @internal */
export function _setNot(ctor: new (expr: any) => any): void {
  _Not = ctor;
}

/** @internal */
export let _Grouping: (new (expr: any) => any) | undefined;
/** @internal */
export function _setGrouping(ctor: new (expr: any) => any): void {
  _Grouping = ctor;
}

/** @internal */
export let _Or: (new (children: any[]) => any) | undefined;
/** @internal */
export function _setOr(ctor: new (children: any[]) => any): void {
  _Or = ctor;
}

/** @internal */
export let _And: (new (children: any[]) => any) | undefined;
/** @internal */
export function _setAnd(ctor: new (children: any[]) => any): void {
  _And = ctor;
}

/** @internal */
export let _Equality: (new (left: any, right: any) => any) | undefined;
/** @internal */
export function _setEquality(ctor: new (left: any, right: any) => any): void {
  _Equality = ctor;
}

/** @internal */
export let _In: (new (left: any, right: any) => any) | undefined;
/** @internal */
export function _setIn(ctor: new (left: any, right: any) => any): void {
  _In = ctor;
}

/** @internal */
export let _buildQuoted: ((other: any, ctx: any) => any) | undefined;
/** @internal */
export function _setBuildQuoted(fn: (other: any, ctx: any) => any): void {
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
export let _Attribute: (new (relation: any, name: string) => any) | undefined;
/** @internal */
export function _setAttribute(ctor: new (relation: any, name: string) => any): void {
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
export let _Dot: (new () => { accept(node: any, collector: any): any }) | undefined;
/** @internal */
export function _setDot(ctor: new () => { accept(node: any, collector: any): any }): void {
  _Dot = ctor;
}

/**
 * `Arel::Table` — the constant `Nodes.build_quoted` names in its pass-through
 * `case` (casted.rb:47-51). A value import of `table.js` from `casted.ts`
 * closes a cycle back through every node module `Table` reaches.
 * @internal
 */
export let _Table: (new (name: any, ...rest: any[]) => any) | undefined;
/** @internal */
export function _setTable(ctor: new (name: any, ...rest: any[]) => any): void {
  _Table = ctor;
}

import { Nodes } from "@blazetrails/arel";

import type { PredicateBuilder } from "../predicate-builder.js";
import { rbObjAsString as toS, Range } from "@blazetrails/ruby-compat";

export class RangeWithBinds {
  #begin: unknown;
  #end: unknown;
  #excludeEnd: boolean;

  constructor(begin?: unknown, end?: unknown, excludeEnd?: boolean) {
    this.#begin = begin;
    this.#end = end;
    this.#excludeEnd = excludeEnd as boolean;
  }

  get begin(): unknown {
    return this.#begin;
  }

  setBegin(begin: unknown): void {
    this.#begin = begin;
  }

  get end(): unknown {
    return this.#end;
  }

  setEnd(end: unknown): void {
    this.#end = end;
  }

  get excludeEnd(): boolean {
    return this.#excludeEnd;
  }

  setExcludeEnd(excludeEnd: boolean): void {
    this.#excludeEnd = excludeEnd;
  }
}

export class RangeHandler {
  private _predicateBuilder: PredicateBuilder;

  constructor(predicateBuilder: PredicateBuilder) {
    this._predicateBuilder = predicateBuilder;
  }

  call(attribute: Nodes.Attribute, value: Range<unknown>): Nodes.Node {
    const beginBind = this.predicateBuilder.buildBindAttribute(toS(attribute.name), value.begin);
    const endBind = this.predicateBuilder.buildBindAttribute(toS(attribute.name), value.end);
    return attribute.between(new RangeWithBinds(beginBind, endBind, value.excludeEnd));
  }

  private get predicateBuilder(): PredicateBuilder {
    return this._predicateBuilder;
  }
}

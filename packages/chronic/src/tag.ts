import type { Time as RubyTime } from "@blazetrails/date";
import { Hash } from "@blazetrails/ruby-compat";
import { Chronic } from "./namespaces.js";
import type { Token } from "./token.js";

export class Tag<T = unknown> {
  type: T;
  /** @internal */
  options: Record<string, unknown>;
  /** @internal */
  now?: RubyTime;

  constructor(type: T, options: Record<string, unknown> = {}) {
    this.type = type;
    this.options = options;
  }

  set start(time: RubyTime) {
    this.now = time;
  }

  /** @internal */
  protected static scanFor<K extends Tag>(
    token: Token,
    klass: new (type: string, options?: Record<string, unknown>) => K,
    items: RegExp | Hash<RegExp, string> = new Hash(),
    options: Record<string, unknown> = {},
  ): K | null {
    if (items instanceof RegExp) {
      if (items.test(token.word)) return new klass(token.word, options);
    } else if (items instanceof Hash) {
      for (const [item, symbol] of items) {
        if (item.test(token.word)) return new klass(symbol, options);
      }
    }
    return null;
  }
}

Chronic.Tag = Tag;

import { Hash } from "@blazetrails/ruby-compat";
import { Chronic } from "./namespaces.js";
import { Tag } from "./tag.js";
import type { Token } from "./token.js";

export class Pointer extends Tag {
  declare type: string;

  static scan(tokens: Token[], _options: Record<string, unknown>): Token[] {
    for (const token of tokens) {
      let t;
      if ((t = this.scanForAll(token))) token.tag(t);
    }
    return tokens;
  }

  static scanForAll(token: Token): Pointer | null {
    return this.scanFor(
      token,
      this,
      new Hash<RegExp, string>().set(/\bpast\b/, "past").set(/\b(?:future|in)\b/, "future"),
    );
  }

  toString(): string {
    return "pointer-" + String(this.type);
  }
}

Chronic.Pointer = Pointer;

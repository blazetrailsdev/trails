import { Hash } from "@blazetrails/ruby-compat";
import { Chronic } from "./namespaces.js";
import { Tag } from "./tag.js";
import type { Token } from "./token.js";

export class Grabber extends Tag {
  declare type: string;

  static scan(tokens: Token[], _options: Record<string, unknown>): Token[] {
    for (const token of tokens) {
      let t;
      if ((t = this.scanForAll(token))) {
        token.tag(t);
        continue;
      }
    }
    return tokens;
  }

  static scanForAll(token: Token): Grabber | null {
    return this.scanFor(
      token,
      this,
      new Hash<RegExp, string>().set(/last/, "last").set(/this/, "this").set(/next/, "next"),
    );
  }

  toString(): string {
    return "grabber-" + String(this.type);
  }
}

Chronic.Grabber = Grabber;

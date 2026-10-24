import { Hash } from "@blazetrails/ruby-compat";
import { Chronic } from "./namespaces.js";
import { Tag } from "./tag.js";
import type { Token } from "./token.js";

export class TimeZone extends Tag {
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

  static scanForAll(token: Token): TimeZone | null {
    return this.scanFor(
      token,
      this,
      new Hash<RegExp, string>().set(/[PMCE][DS]T|UTC/i, "tz").set(/(tzminus)?\d{2}:?\d{2}/, "tz"),
    );
  }

  toString(): string {
    return "timezone";
  }
}

Chronic.TimeZone = TimeZone;

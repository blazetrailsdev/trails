import { Hash } from "@blazetrails/ruby-compat";
import { Chronic } from "./namespaces.js";
import { Tag } from "./tag.js";
import type { Token } from "./token.js";

export class Sign extends Tag {
  declare type: string;

  static scan(tokens: Token[], _options: Record<string, unknown>): Token[] {
    for (const token of tokens) {
      let t;
      if ((t = this.scanForPlus(token))) {
        token.tag(t);
        continue;
      }
      if ((t = this.scanForMinus(token))) {
        token.tag(t);
        continue;
      }
    }
    return tokens;
  }

  static scanForPlus(token: Token): SignPlus | null {
    return this.scanFor(token, SignPlus, new Hash<RegExp, string>().set(/^\+$/m, "plus"));
  }

  static scanForMinus(token: Token): SignMinus | null {
    return this.scanFor(token, SignMinus, new Hash<RegExp, string>().set(/^-$/m, "minus"));
  }

  toString(): string {
    return "sign";
  }
}

export class SignPlus extends Sign {
  toString(): string {
    return super.toString() + "-plus";
  }
}

export class SignMinus extends Sign {
  toString(): string {
    return super.toString() + "-minus";
  }
}

Chronic.Sign = Sign;
Chronic.SignPlus = SignPlus;
Chronic.SignMinus = SignMinus;

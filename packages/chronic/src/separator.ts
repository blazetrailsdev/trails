import { Hash } from "@blazetrails/ruby-compat";
import { Chronic } from "./namespaces.js";
import { Tag } from "./tag.js";
import type { Token } from "./token.js";

export class Separator extends Tag {
  declare type: string;

  static scan(tokens: Token[], _options: Record<string, unknown>): Token[] {
    for (const token of tokens) {
      let t;
      if ((t = this.scanForCommas(token))) {
        token.tag(t);
        continue;
      }
      if ((t = this.scanForDots(token))) {
        token.tag(t);
        continue;
      }
      if ((t = this.scanForColon(token))) {
        token.tag(t);
        continue;
      }
      if ((t = this.scanForSpace(token))) {
        token.tag(t);
        continue;
      }
      if ((t = this.scanForSlash(token))) {
        token.tag(t);
        continue;
      }
      if ((t = this.scanForDash(token))) {
        token.tag(t);
        continue;
      }
      if ((t = this.scanForQuote(token))) {
        token.tag(t);
        continue;
      }
      if ((t = this.scanForAt(token))) {
        token.tag(t);
        continue;
      }
      if ((t = this.scanForIn(token))) {
        token.tag(t);
        continue;
      }
      if ((t = this.scanForOn(token))) {
        token.tag(t);
        continue;
      }
      if ((t = this.scanForAnd(token))) {
        token.tag(t);
        continue;
      }
      if ((t = this.scanForT(token))) {
        token.tag(t);
        continue;
      }
      if ((t = this.scanForW(token))) {
        token.tag(t);
        continue;
      }
    }
    return tokens;
  }

  static scanForCommas(token: Token): SeparatorComma | null {
    return this.scanFor(token, SeparatorComma, new Hash<RegExp, string>().set(/^,$/m, "comma"));
  }

  static scanForDots(token: Token): SeparatorDot | null {
    return this.scanFor(token, SeparatorDot, new Hash<RegExp, string>().set(/^\.$/m, "dot"));
  }

  static scanForColon(token: Token): SeparatorColon | null {
    return this.scanFor(token, SeparatorColon, new Hash<RegExp, string>().set(/^:$/m, "colon"));
  }

  static scanForSpace(token: Token): SeparatorSpace | null {
    return this.scanFor(token, SeparatorSpace, new Hash<RegExp, string>().set(/^ $/m, "space"));
  }

  static scanForSlash(token: Token): SeparatorSlash | null {
    return this.scanFor(token, SeparatorSlash, new Hash<RegExp, string>().set(/^\/$/m, "slash"));
  }

  static scanForDash(token: Token): SeparatorDash | null {
    return this.scanFor(token, SeparatorDash, new Hash<RegExp, string>().set(/^-$/m, "dash"));
  }

  static scanForQuote(token: Token): SeparatorQuote | null {
    return this.scanFor(
      token,
      SeparatorQuote,
      new Hash<RegExp, string>().set(/^'$/m, "single_quote").set(/^"$/m, "double_quote"),
    );
  }

  static scanForAt(token: Token): SeparatorAt | null {
    return this.scanFor(token, SeparatorAt, new Hash<RegExp, string>().set(/^(at|@)$/m, "at"));
  }

  static scanForIn(token: Token): SeparatorIn | null {
    return this.scanFor(token, SeparatorIn, new Hash<RegExp, string>().set(/^in$/m, "in"));
  }

  static scanForOn(token: Token): SeparatorOn | null {
    return this.scanFor(token, SeparatorOn, new Hash<RegExp, string>().set(/^on$/m, "on"));
  }

  static scanForAnd(token: Token): SeparatorAnd | null {
    return this.scanFor(token, SeparatorAnd, new Hash<RegExp, string>().set(/^and$/m, "and"));
  }

  static scanForT(token: Token): SeparatorT | null {
    return this.scanFor(token, SeparatorT, new Hash<RegExp, string>().set(/^t$/m, "T"));
  }

  static scanForW(token: Token): SeparatorW | null {
    return this.scanFor(token, SeparatorW, new Hash<RegExp, string>().set(/^w$/m, "W"));
  }

  toString(): string {
    return "separator";
  }
}

export class SeparatorComma extends Separator {
  toString(): string {
    return super.toString() + "-comma";
  }
}

export class SeparatorDot extends Separator {
  toString(): string {
    return super.toString() + "-dot";
  }
}

export class SeparatorColon extends Separator {
  toString(): string {
    return super.toString() + "-colon";
  }
}

export class SeparatorSpace extends Separator {
  toString(): string {
    return super.toString() + "-space";
  }
}

export class SeparatorSlash extends Separator {
  toString(): string {
    return super.toString() + "-slash";
  }
}

export class SeparatorDash extends Separator {
  toString(): string {
    return super.toString() + "-dash";
  }
}

export class SeparatorQuote extends Separator {
  toString(): string {
    return super.toString() + "-quote-" + String(this.type);
  }
}

export class SeparatorAt extends Separator {
  toString(): string {
    return super.toString() + "-at";
  }
}

export class SeparatorIn extends Separator {
  toString(): string {
    return super.toString() + "-in";
  }
}

export class SeparatorOn extends Separator {
  toString(): string {
    return super.toString() + "-on";
  }
}

export class SeparatorAnd extends Separator {
  toString(): string {
    return super.toString() + "-and";
  }
}

export class SeparatorT extends Separator {
  toString(): string {
    return super.toString() + "-T";
  }
}

export class SeparatorW extends Separator {
  toString(): string {
    return super.toString() + "-W";
  }
}

Chronic.Separator = Separator;
Chronic.SeparatorComma = SeparatorComma;
Chronic.SeparatorDot = SeparatorDot;
Chronic.SeparatorColon = SeparatorColon;
Chronic.SeparatorSpace = SeparatorSpace;
Chronic.SeparatorSlash = SeparatorSlash;
Chronic.SeparatorDash = SeparatorDash;
Chronic.SeparatorQuote = SeparatorQuote;
Chronic.SeparatorAt = SeparatorAt;
Chronic.SeparatorIn = SeparatorIn;
Chronic.SeparatorOn = SeparatorOn;
Chronic.SeparatorAnd = SeparatorAnd;
Chronic.SeparatorT = SeparatorT;
Chronic.SeparatorW = SeparatorW;

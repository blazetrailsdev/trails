import { classModule, include } from "@blazetrails/ruby-compat";
import { Raabro, type Input, type ModuleMethods, type Tree } from "../raabro.js";

const parsers: Record<string, (i: Input) => Tree> = {
  ta(i) {
    return Raabro.str(null, i, "ta");
  },
  to(i) {
    return Raabro.str(null, i, "to");
  },
  tu(i) {
    return Raabro.str(null, i, "tu");
  },

  toPlus(input) {
    return Raabro.rep(":tos", input, ":to", 1);
  },
  toStar(input) {
    return Raabro.rep(null, input, ":to", 0);
  },
  toQmark(input) {
    return Raabro.rep(null, input, ":to", 0, 1);
  },

  nta(i) {
    return Raabro.str("the-ta", i, "ta");
  },

  cha(i) {
    return Raabro.rex(null, i, /^[a-z]/);
  },
  com(i) {
    return Raabro.str(null, i, ",");
  },

  chas(i) {
    return Raabro.rex(null, i, /[a-z ]+/i);
  },

  lt(i) {
    return Raabro.str(null, i, "<");
  },
  gt(i) {
    return Raabro.str(null, i, ">");
  },

  onex(i) {
    return Raabro.str(":onex", i, "x");
  },
  twox(i) {
    return Raabro.str(":twox", i, "xx");
  },
  deux(i) {
    return Raabro.str(":deux", i, "xx");
  },

  acom(i) {
    return Raabro.rex(null, i, /,?/);
  },
  aval(i) {
    return Raabro.rex(null, i, /[a-z]?/);
  },
  arr(i) {
    return Raabro.eseq(null, i, ":lt", ":aval", ":acom", ":gt");
  },
};
for (const [name, value] of Object.entries(parsers)) {
  Object.defineProperty(Object.prototype, name, { value, writable: true, configurable: true });
}

export const {
  ta,
  to,
  tu,
  toPlus,
  toStar,
  toQmark,
  nta,
  cha,
  com,
  chas,
  lt,
  gt,
  onex,
  twox,
  deux,
  acom,
  aval,
  arr,
} = parsers;

export class Cal {
  static readonly [classModule] = true;

  static toString(): string {
    return "Sample::Cal";
  }

  sp(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /\s+/);
  }

  num(this: ModuleMethods, i: Input): Tree {
    return this.rex(":num", i, /-?[0-9]+/);
  }
  op(this: ModuleMethods, i: Input): Tree {
    return this.rex(":op", i, /[+\-*/]/);
  }
  item(this: ModuleMethods, i: Input): Tree {
    return this.alt(":item", i, ":num", ":op");
  }

  suite(this: ModuleMethods, i: Input): Tree {
    return this.jseq(null, i, ":item", ":sp");
  }

  static {
    include(this, Raabro);
    for (const name of [":sp", ":num", ":op", ":item", ":suite"]) {
      (this as unknown as ModuleMethods).methodAdded(name);
    }
  }
}

export class Arith {
  static readonly [classModule] = true;

  static toString(): string {
    return "Sample::Arith";
  }

  number(this: ModuleMethods, i: Input): Tree {
    return this.rex(":number", i, /-?[0-9]+\s*/);
  }
  plus(this: ModuleMethods, i: Input): Tree {
    return this.rex(":plus", i, /\+\s*/);
  }
  minus(this: ModuleMethods, i: Input): Tree {
    return this.rex(":minus", i, /-\s*/);
  }

  addition(this: ModuleMethods, i: Input): Tree {
    return this.seq(":addition", i, ":number", ":plus", ":opOrNum");
  }
  substraction(this: ModuleMethods, i: Input): Tree {
    return this.seq(":substraction", i, ":number", ":minus", ":opOrNum");
  }

  opOrNum(this: ModuleMethods, i: Input): Tree {
    return this.alt(null, i, ":addition", ":substraction", ":number");
  }

  static {
    include(this, Raabro);
    for (const name of [":number", ":plus", ":minus", ":addition", ":substraction", ":opOrNum"]) {
      (this as unknown as ModuleMethods).methodAdded(name);
    }
  }
}

export const Sample = {
  Cal: Cal as typeof Cal & ModuleMethods & Cal,
  Arith: Arith as typeof Arith & ModuleMethods & Arith,
};

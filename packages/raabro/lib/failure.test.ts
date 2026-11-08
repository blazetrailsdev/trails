import "./test-helpers/spec-helper.js";
import { classModule, include, toI } from "@blazetrails/ruby-compat";
import { Raabro, type Input, type ModuleMethods, type Tree } from "./raabro.js";
import { describe, expect, it } from "vitest";
export class ToPlus {
  static readonly [classModule] = true;

  static toString(): string {
    return "Sample.ToPlus";
  }

  spStar(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /\s*/);
  }
  toSpace(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":to", ":spStar");
  }
  toPlus(this: ModuleMethods, i: Input): Tree {
    return this.rep(":tos", i, ":toSpace", 1);
  }

  rewrite(this: ModuleMethods, t: Tree): unknown {
    return [":ok", t.string()];
  }

  static {
    include(this, Raabro);
    for (const name of [":spStar", ":toSpace", ":toPlus", ":rewrite"]) {
      (this as unknown as ModuleMethods).methodAdded(name);
    }
  }
}

export class Fun {
  static readonly [classModule] = true;

  static toString(): string {
    return "Sample.Fun";
  }

  pa(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /\(\s*/);
  }
  pz(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /\)\s*/);
  }
  com(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /,\s*/);
  }

  num(this: ModuleMethods, i: Input): Tree {
    return this.rex(":num", i, /-?[0-9]+\s*/);
  }

  args(this: ModuleMethods, i: Input): Tree {
    return this.eseq(":arg", i, ":pa", ":exp", ":com", ":pz");
  }
  funame(this: ModuleMethods, i: Input): Tree {
    return this.rex(":funame", i, /[a-z][a-z0-9]*/);
  }
  fun(this: ModuleMethods, i: Input): Tree {
    return this.seq(":fun", i, ":funame", ":args");
  }

  exp(this: ModuleMethods, i: Input): Tree {
    return this.alt(":exp", i, ":fun", ":num");
  }

  rewriteNum(this: ModuleMethods, t: Tree): unknown {
    return toI(t.string());
  }

  rewriteFun(this: ModuleMethods, t: Tree): unknown {
    return [t.children[0].string(), ...t.children[1].oddChildren().map((a) => this.rewrite(a))];
  }

  static {
    include(this, Raabro);
    for (const name of [
      ":pa",
      ":pz",
      ":com",
      ":num",
      ":args",
      ":funame",
      ":fun",
      ":exp",
      ":rewriteNum",
      ":rewriteFun",
    ]) {
      (this as unknown as ModuleMethods).methodAdded(name);
    }
  }
}

const Sample = {
  ToPlus: ToPlus as typeof ToPlus & ModuleMethods & ToPlus,
  Fun: Fun as typeof Fun & ModuleMethods & Fun,
};

describe("Raabro and parse failure", () => {
  describe("when there is a syntax error", () => {
    it("points at the error", () => {
      const t = Sample.Fun.parse("f(a, b");
      expect(t).toEqual(null);

      expect(Sample.Fun.parse("f(a, b", { error: true })).toEqual([
        1,
        4,
        3,
        "parsing failed .../:exp/:fun/:arg",
        "f(a, b\n   ^---",
      ]);
    });
  });

  describe("when not all is consumed", () => {
    it("points at the start of the remaining input", () => {
      const t = Sample.ToPlus.parse("totota");
      expect(t).toEqual(null);

      expect(Sample.ToPlus.parse("totota", { error: true })).toEqual([
        1,
        5,
        4,
        "parsing failed, not all input was consumed",
        "totota\n    ^---",
      ]);
    });

    it("points at the start of the remaining input (multiline)", () => {
      const s = "toto\r\n  ta";

      const t = Sample.ToPlus.parse(s);
      expect(t).toEqual(null);

      expect(Sample.ToPlus.parse(s, { error: true })).toEqual([
        2,
        3,
        8,
        "parsing failed, not all input was consumed",
        "  ta\n  ^---",
      ]);
    });
  });
});

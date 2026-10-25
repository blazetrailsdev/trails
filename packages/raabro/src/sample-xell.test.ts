import "./test-helpers/spec-helper.js";
import { classModule, include, toI } from "@blazetrails/ruby-compat";
import { Raabro, Input, type ModuleMethods, type Tree } from "./raabro.js";
import { describe, expect, it } from "vitest";
export class Xell {
  static readonly [classModule] = true;

  static toString(): string {
    return "Sample.Xell";
  }

  pa(this: ModuleMethods, i: Input): Tree {
    return this.str(null, i, "(");
  }
  pz(this: ModuleMethods, i: Input): Tree {
    return this.str(null, i, ")");
  }
  com(this: ModuleMethods, i: Input): Tree {
    return this.str(null, i, ",");
  }
  num(this: ModuleMethods, i: Input): Tree {
    return this.rex(":num", i, /-?[0-9]+/);
  }
  args(this: ModuleMethods, i: Input): Tree {
    return this.eseq(null, i, ":pa", ":exp", ":com", ":pz");
  }
  funame(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /[A-Z][A-Z0-9]*/);
  }
  fun(this: ModuleMethods, i: Input): Tree {
    return this.seq(":fun", i, ":funame", ":args");
  }
  exp(this: ModuleMethods, i: Input): Tree {
    return this.alt(null, i, ":fun", ":num");
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

const Sample = { Xell: Xell as typeof Xell & ModuleMethods & Xell };

describe("Raabro", () => {
  describe("Sample::Xell", () => {
    describe(".parse", () => {
      it("parses (success)", () => {
        expect(Sample.Xell.parse("MUL(7,-3)")).toEqual(["MUL", 7, -3]);
      });

      it("parses (rewrite: false, success)", () => {
        expect((Sample.Xell.parse("MUL(7,-3)", { rewrite: false }) as Tree).toString())
          .toEqual(`1 nil 0,9
  1 :fun 0,9
    1 nil 0,3 "MUL"
    1 nil 3,6
      1 nil 3,1 "("
      1 nil 4,1
        1 :num 4,1 "7"
      1 nil 5,1 ","
      1 nil 6,2
        1 :num 6,2 "-3"
      1 nil 8,1 ")"`);
      });

      it("parses (miss)", () => {
        expect(Sample.Xell.parse("MUL(7,3) ")).toEqual(null);
        expect(Sample.Xell.parse("MUL(7,3")).toEqual(null);
      });
    });
  });
});

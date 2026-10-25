import "./test-helpers/spec-helper.js";
import { classModule, include, toI } from "@blazetrails/ruby-compat";
import { Raabro, Input, type ModuleMethods, type Tree } from "./raabro.js";
import { describe, expect, it } from "vitest";
export class Xel {
  static readonly [classModule] = true;

  static toString(): string {
    return "Sample.Xel";
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
    return this.eseq(":args", i, ":pa", ":exp", ":com", ":pz");
  }
  funame(this: ModuleMethods, i: Input): Tree {
    return this.rex(":funame", i, /[A-Z][A-Z0-9]*/);
  }
  fun(this: ModuleMethods, i: Input): Tree {
    return this.seq(":fun", i, ":funame", ":args");
  }
  exp(this: ModuleMethods, i: Input): Tree {
    return this.alt(":exp", i, ":fun", ":num");
  }

  rewriteExp(this: ModuleMethods, t: Tree): unknown {
    return this.rewrite(t.children[0]);
  }
  rewriteNum(this: ModuleMethods, t: Tree): unknown {
    return toI(t.string());
  }

  rewriteFun(this: ModuleMethods, t: Tree): unknown {
    return [t.children[0].string(), ...t.children[1].oddChildren().map((c) => this.rewrite(c))];
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
      ":rewriteExp",
      ":rewriteNum",
      ":rewriteFun",
    ]) {
      (this as unknown as ModuleMethods).methodAdded(name);
    }
  }
}

const Sample = { Xel: Xel as typeof Xel & ModuleMethods & Xel };

describe("Raabro", () => {
  describe("Sample::Xel", () => {
    describe(".funame", () => {
      it("hits", () => {
        const i = new Input("NADA");

        const t = Sample.Xel.funame(i);

        expect(t.toA({ leaves: true })).toEqual([":funame", 1, 0, 4, null, ":rex", "NADA"]);
      });
    });

    describe(".fun", () => {
      it("parses a function call", () => {
        const i = new Input("SUM(1,MUL(4,5))", { prune: true });

        const t = Sample.Xel.fun(i);

        expect(t.result).toEqual(1);

        expect(Sample.Xel.rewrite(t)).toEqual(["SUM", 1, ["MUL", 4, 5]]);
      });
    });

    describe(".parse", () => {
      it("parses (success)", () => {
        expect(Sample.Xel.parse("MUL(7,-3)")).toEqual(["MUL", 7, -3]);
      });

      it("parses (rewrite: false, success)", () => {
        expect((Sample.Xel.parse("MUL(7,-3)", { rewrite: false }) as Tree).toString())
          .toEqual(`1 :exp 0,9
  1 :fun 0,9
    1 :funame 0,3 "MUL"
    1 :args 3,6
      1 nil 3,1 "("
      1 :exp 4,1
        1 :num 4,1 "7"
      1 nil 5,1 ","
      1 :exp 6,2
        1 :num 6,2 "-3"
      1 nil 8,1 ")"`);
      });

      it("parses (miss)", () => {
        expect(Sample.Xel.parse("MUL(7,3) ")).toEqual(null);
        expect(Sample.Xel.parse("MUL(7,3")).toEqual(null);
      });

      it("parses (miss with error: true)", () => {
        expect(Sample.Xel.parse("MUL(7,3", { error: true })).toEqual([
          1,
          8,
          7,
          "parsing failed .../:exp/:fun/:args",
          "MUL(7,3\n" + "       ^---",
        ]);
      });
    });
  });
});

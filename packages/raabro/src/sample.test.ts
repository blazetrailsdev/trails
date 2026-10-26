import "./test-helpers/spec-helper.js";
import { classModule, include } from "@blazetrails/ruby-compat";
import { Raabro, type Input, type ModuleMethods, type Tree } from "./raabro.js";
import { describe, expect, it } from "vitest";

export class OwnRewrite {
  static readonly [classModule] = true;

  static toString(): string {
    return "Sample::OwnRewrite";
  }

  hello(this: ModuleMethods, i: Input): Tree {
    return this.str(":hello", i, "hello");
  }

  rewrite(this: ModuleMethods, t: Tree): unknown {
    return [":ok", t.string()];
  }

  static {
    include(this, Raabro);
    for (const name of [":hello", ":rewrite"]) {
      (this as unknown as ModuleMethods).methodAdded(name);
    }
  }
}

const Sample = { OwnRewrite: OwnRewrite as typeof OwnRewrite & ModuleMethods & OwnRewrite };

describe("Raabro", () => {
  describe("Sample::OwnRewrite", () => {
    it("uses its own rewrite", () => {
      expect(Sample.OwnRewrite.parse("hello")).toEqual([":ok", "hello"]);
    });
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { InheritableOptions } from "@blazetrails/activesupport";
import { rbObjMethods } from "@blazetrails/ruby-compat";
import type { HelperMethodsModule } from "../../abstract-controller/helpers.js";
import { Base } from "../base.js";
import { setApplicationHelpers } from "../metal/helpers.js";
import { AbcHelper } from "../../test-helpers/fixtures/helpers/abc-helper.js";
import { GamesHelper } from "../../test-helpers/fixtures/helpers/fun/games-helper.js";
import { PdfHelper } from "../../test-helpers/fixtures/helpers/fun/pdf-helper.js";

let AllHelpersController: typeof Base;

beforeAll(() => {
  setApplicationHelpers(
    ["abc", "fun/games", "fun/pdf"],
    new Map<string, HelperMethodsModule>([
      ["AbcHelper", AbcHelper as unknown as HelperMethodsModule],
      ["Fun::GamesHelper", GamesHelper],
      ["Fun::PdfHelper", PdfHelper],
    ]),
  );
  AllHelpersController = class extends Base {
    static {
      this.helper(":all");
    }
  };
});

afterAll(() => {
  setApplicationHelpers([], new Map());
});

describe("HelperTest", () => {
  class TestController extends Base {
    private _delegateAttr: unknown;

    get delegateAttr(): unknown {
      return this._delegateAttr;
    }

    set delegateAttr(value: unknown) {
      this._delegateAttr = value;
    }
  }

  let controllerClass: typeof TestController;

  beforeEach(() => {
    controllerClass = class extends TestController {};
  });

  function masterHelperMethods(): string[] {
    const methods: string[] = [];
    for (
      let mod: object | null = controllerClass._helpers!;
      mod;
      mod = Object.getPrototypeOf(mod)
    ) {
      for (const [name, entry] of Object.entries(Object.getOwnPropertyDescriptors(mod))) {
        if (entry.get || typeof entry.value === "function") methods.push(name);
        if (entry.set) methods.push(`${name}=`);
      }
    }
    return methods;
  }

  it("helper attr", () => {
    expect(() => controllerClass.helperAttr("delegateAttr")).not.toThrow();
    expect(masterHelperMethods()).toContain("delegateAttr");
    expect(masterHelperMethods()).toContain("delegateAttr=");
  });

  it("helper proxy", () => {
    const methods = rbObjMethods(AllHelpersController.helpers());

    expect(methods).toContain("pluralize");

    expect(methods).toContain("bareA");

    expect(methods).toContain("stratego");

    expect(methods).toContain("foobar");
  });

  it("helper proxy in instance", () => {
    const methods = rbObjMethods(new AllHelpersController().helpers());

    expect(methods).toContain("pluralize");

    expect(methods).toContain("bareA");

    expect(methods).toContain("stratego");

    expect(methods).toContain("foobar");
  });

  it("helper proxy config", () => {
    const config = (
      AllHelpersController as unknown as { config(): InheritableOptions & { myVar: string } }
    ).config();
    config.myVar = "smth";

    expect((AllHelpersController.helpers().config as typeof config).myVar).toBe("smth");
  });
});

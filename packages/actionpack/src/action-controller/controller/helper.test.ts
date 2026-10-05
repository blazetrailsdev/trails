import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  include,
  included,
  isAnonymous,
  NameError,
  type InheritableOptions,
} from "@blazetrails/activesupport";
import {
  excBacktraceLocations,
  File,
  rbModConstSet,
  rbObjMethods,
  registerConstant,
  unregisterConstant,
} from "@blazetrails/ruby-compat";
import type { RackResponse } from "@blazetrails/rack";
import { TemplateError } from "@blazetrails/actionview";
import type { HelperMethodsModule } from "../../abstract-controller/helpers.js";
import { TestRequest } from "../../action-dispatch/testing/test-request.js";
import type { Response } from "../../action-dispatch/http/response.js";
import { Base } from "../base.js";
import { loadApplicationHelperNames, helpersPath, setHelpersPath } from "../metal/helpers.js";
import { TestCase } from "../test-case.js";
import { ActionPackTestSuiteUtils } from "../../test-helpers/abstract-unit.js";
import { FooHelper } from "../../test-helpers/fixtures/alternate-helpers/foo-helper.js";
import { AbcHelper } from "../../test-helpers/fixtures/helpers/abc-helper.js";
import { GamesHelper } from "../../test-helpers/fixtures/helpers/fun/games-helper.js";
import { PdfHelper } from "../../test-helpers/fixtures/helpers/fun/pdf-helper.js";
import { JustMeHelper } from "../../test-helpers/fixtures/helpers/just-me-helper.js";
import { MeTooHelper } from "../../test-helpers/fixtures/helpers/me-too-helper.js";
import { Pack1Helper } from "../../test-helpers/fixtures/helpers1-pack/pack1-helper.js";
import { Pack2Helper } from "../../test-helpers/fixtures/helpers2-pack/pack2-helper.js";
import { UsersHelpeR } from "../../test-helpers/fixtures/helpers-typo/admin/users-helper.js";

const thisFile = new URL(import.meta.url).pathname;
const fixtures = File.expandPath("../../test-helpers/fixtures", File.dirname(thisFile));

const helperConstants: Record<string, object> = {
  FooHelper,
  AbcHelper,
  "Fun::GamesHelper": GamesHelper,
  "Fun::PdfHelper": PdfHelper,
  JustMeHelper,
  MeTooHelper,
  Pack1Helper,
  Pack2Helper,
  "Admin::UsersHelpeR": UsersHelpeR,
};

const Fun = {
  GamesController: class GamesController extends Base {
    async renderHelloWorld() {
      await this.render({ inline: "hello: <%= stratego() %>" });
    }
  },

  PdfController: class PdfController extends Base {
    async test() {
      await this.render({ inline: "test: <%= foobar() %>" });
    }
  },
};
for (const [name, klass] of Object.entries(Fun)) {
  Object.defineProperty(klass, "name", { value: `Fun::${name}` });
}

let AllHelpersController: typeof Base;

class ImpressiveLibrary {
  static [included](base: typeof Base): void {
    base.helperMethod("usefulFunction");
  }

  usefulFunction(): void {}
}

class JustMeController extends Base {
  async lib() {
    await this.render({ inline: "<%= usefulFunction() %>" });
  }
}

Object.defineProperty(JustMeController.prototype, "flash", {
  async value(this: JustMeController) {
    await this.render({ inline: "<h1><%= notice %></h1>" });
  },
  configurable: true,
  writable: true,
});

class MeTooController extends JustMeController {}

let HelpersPathsController: typeof Base;

let HelpersTypoController: typeof Base;

const LocalAbcHelper: HelperMethodsModule = {
  a(): void {},
  b(): void {},
  c(): void {},
};

let helpersPathWas: string[];
let helperMethodsWas: string[];

beforeAll(async () => {
  for (const [name, mod] of Object.entries(helperConstants)) registerConstant(name, mod);

  helpersPathWas = helpersPath();
  setHelpersPath([File.expandPath("helpers", fixtures)]);
  await loadApplicationHelperNames();

  AllHelpersController = class AllHelpersController extends Base {
    static {
      this.helper(":all");
    }
  };

  helperMethodsWas = Base._helperMethods;
  include(Base, ImpressiveLibrary);

  JustMeController.clearHelpers();

  const paths = ["helpers2-pack", "helpers1-pack"].map((path) => File.join(fixtures, path));

  setHelpersPath(paths);
  await loadApplicationHelperNames();
  HelpersPathsController = class HelpersPathsController extends Base {
    static {
      this.helpersPath = paths;
      this.includeAllHelpers = false;
      this.helper(":all");
    }

    async index() {
      await this.render({ inline: "<%= conflictingHelper() %>" });
    }
  };
  await ActionPackTestSuiteUtils.requireHelpers(HelpersPathsController.helpersPath);

  HelpersTypoController = class HelpersTypoController extends Base {
    static {
      this.helpersPath = [File.expandPath("helpers-typo", fixtures)];
    }
  };
  await ActionPackTestSuiteUtils.requireHelpers(HelpersTypoController.helpersPath);

  setHelpersPath([File.expandPath("helpers", fixtures)]);
  await loadApplicationHelperNames();
});

afterAll(async () => {
  delete (Base.prototype as { usefulFunction?: unknown }).usefulFunction;
  Base._helperMethods = helperMethodsWas;
  setHelpersPath(helpersPathWas);
  await loadApplicationHelperNames();
  for (const [name, mod] of Object.entries(helperConstants)) unregisterConstant(name, mod);
});

function body(response: RackResponse): string {
  return (response.at(-1) as unknown as Response).body;
}

describe("HelperPathsTest", () => {
  it("helpers paths priority", async () => {
    const responses = await HelpersPathsController.action("index")(TestRequest.defaultEnv());

    expect(body(responses)).toBe("pack1");
  });
});

describe("HelpersTypoControllerTest", () => {
  // BLOCKED: helper-name-error-has-no-did-you-mean
  it.skip("helper typo error message", () => {
    let e!: NameError & { detailedMessage(): string };
    expect(() => {
      try {
        HelpersTypoController.helper("admin/users");
      } catch (error) {
        e = error as typeof e;
        throw error;
      }
    }).toThrow(NameError);
    expect(e.message).toContain("uninitialized constant Admin::UsersHelper");
    expect(e.detailedMessage()).toContain("Did you mean?  Admin::UsersHelpeR");
  });
});

describe("HelperTest", () => {
  class TestController extends Base {
    declare delegateAttr: unknown;
    delegateMethod(): void {}
    delegateMethodArg(arg: unknown): unknown {
      return arg;
    }
    delegateMethodKwarg({ hi }: { hi: unknown }): unknown {
      return hi;
    }
    methodThatRaises(): never {
      throw new Error("an error occurred");
    }
  }

  const constants: { name: string; TestHelper?: HelperMethodsModule } = { name: "HelperTest" };
  let controllerClass: typeof TestController;

  beforeEach(() => {
    controllerClass = class extends TestController {};

    setTestHelper(LocalAbcHelper);
  });

  it("helper", () => {
    expect(missingMethods()).toEqual(expectedHelperMethods());
    expect(() => controllerClass.helper(constants.TestHelper!)).not.toThrow();
    expect(missingMethods()).toEqual([]);
  });

  it("helper method", () => {
    expect(() => controllerClass.helperMethod("delegateMethod")).not.toThrow();
    expect(masterHelperMethods()).toContain("delegateMethod");
  });

  it("helper method arg", () => {
    expect(() => controllerClass.helperMethod("delegateMethodArg")).not.toThrow();
    expect(helpersOf(new controllerClass()).delegateMethodArg({ hi: ":there" })).toEqual({
      hi: ":there",
    });
  });

  it("helper method arg does not call to hash", () => {
    expect(() => controllerClass.helperMethod("delegateMethodArg")).not.toThrow();

    const myClass = new (class {
      toHash() {
        return { hi: ":there" };
      }
    })();

    expect(helpersOf(new controllerClass()).delegateMethodArg(myClass)).toBe(myClass);
  });

  it("helper method kwarg", () => {
    expect(() => controllerClass.helperMethod("delegateMethodKwarg")).not.toThrow();

    expect(helpersOf(new controllerClass()).delegateMethodKwarg({ hi: ":there" })).toBe(":there");
  });

  // BLOCKED: helper-method-forwarders-carry-no-caller-location
  it.skip("helper method with error has correct backgrace", () => {
    controllerClass.helperMethod("methodThatRaises");
    const expectedBacktracePattern = `${thisFile}:${excBacktraceLocations(new Error())![0].lineno - 1}`;

    let error!: Error;
    expect(() => {
      try {
        helpersOf(new controllerClass()).methodThatRaises();
      } catch (e) {
        error = e as Error;
        throw e;
      }
    }).toThrow(Error);
    expect(
      excBacktraceLocations(error)!.find((line) =>
        `${line.path}:${line.lineno}`.includes(expectedBacktracePattern),
      ),
    ).not.toBeUndefined();
  });

  it("helper attr", () => {
    expect(() => controllerClass.helperAttr("delegateAttr")).not.toThrow();
    expect(masterHelperMethods()).toContain("delegateAttr");
    expect(masterHelperMethods()).toContain("delegateAttr=");
  });

  function callController(klass: typeof Base, action: string): Promise<RackResponse> {
    return klass.action(action)(TestRequest.defaultEnv());
  }

  it("helper for nested controller", async () => {
    expect(body(await callController(Fun.GamesController, "renderHelloWorld"))).toBe(
      "hello: Iz guuut!",
    );
  });

  it("helper for acronym controller", async () => {
    expect(body(await callController(Fun.PdfController, "test"))).toBe("test: baz");
  });

  // BLOCKED: helper-modules-are-modules-not-hashes
  // BLOCKED: abstract-controller-helpers-inherited-runs-default-helper-module
  it.skip("default helpers only", () => {
    expect(ancestors(JustMeController._helpers!)).toEqual(["JustMeHelper"]);
    expect(ancestors(MeTooController._helpers!)).toEqual([
      "MeTooController::HelperMethods",
      "MeTooHelper",
      "JustMeHelper",
    ]);
  });

  it("base helper methods after clear helpers", async () => {
    await expect(callController(JustMeController, "flash")).resolves.not.toThrow();
  });

  it("lib helper methods after clear helpers", async () => {
    await expect(callController(JustMeController, "lib")).resolves.not.toThrow();
  });

  it("all helpers", () => {
    const methods = instanceMethods(AllHelpersController._helpers!);

    expect(methods).toContain("bareA");

    expect(methods).toContain("stratego");

    expect(methods).toContain("foobar");
  });

  // BLOCKED: abstract-controller-helpers-module-and-caching-instance-halves
  it.skip("all helpers with alternate helper dir", async () => {
    controllerClass.helpersPath = [File.expandPath("alternate-helpers", fixtures)];
    await ActionPackTestSuiteUtils.requireHelpers(controllerClass.helpersPath);

    controllerClass._helpers = Object.create(null) as HelperMethodsModule;
    controllerClass.helper(":all");

    expect(masterHelperMethods()).not.toContain("bareA");

    expect(masterHelperMethods()).toContain("baz");
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

  function helpersOf(controller: Base) {
    return controller.helpers() as unknown as Record<string, (...args: unknown[]) => unknown>;
  }

  function instanceMethods(helpers: HelperMethodsModule): string[] {
    const methods: string[] = [];
    for (
      let mod: object | null = helpers;
      mod && mod !== Object.prototype;
      mod = Object.getPrototypeOf(mod)
    ) {
      for (const [name, entry] of Object.entries(Object.getOwnPropertyDescriptors(mod))) {
        if (entry.get || typeof entry.value === "function") methods.push(name);
        if (entry.set) methods.push(`${name}=`);
      }
    }
    return methods;
  }

  function ancestors(helpers: HelperMethodsModule): string[] {
    const names: string[] = [];
    for (let mod: object | null = helpers; mod; mod = Object.getPrototypeOf(mod)) {
      if (!isAnonymous(mod as { name: string })) names.push(String((mod as { name: string }).name));
    }
    return names;
  }

  function expectedHelperMethods(): string[] {
    return instanceMethods(constants.TestHelper!);
  }

  function masterHelperMethods(): string[] {
    return instanceMethods(controllerClass._helpers!);
  }

  function missingMethods(): string[] {
    return expectedHelperMethods().filter((method) => !masterHelperMethods().includes(method));
  }

  function setTestHelper(helperModule: HelperMethodsModule): void {
    rbModConstSet(constants, "TestHelper", helperModule);
  }
});

describe("IsolatedHelpersTest", () => {
  class A extends Base {
    async index() {
      await this.render({ inline: "<%= shout() %>" });
    }
  }

  class B extends A {
    static {
      this.helper((mod: HelperMethodsModule) => {
        mod.shout = () => "B";
      });
    }

    async index() {
      await this.render({ inline: "<%= shout() %>" });
    }
  }

  class C extends A {
    static {
      this.helper((mod: HelperMethodsModule) => {
        mod.shout = () => "C";
      });
    }

    async index() {
      await this.render({ inline: "<%= shout() %>" });
    }
  }

  class IsolatedHelpersTest extends TestCase {
    callController(klass: typeof Base, action: string): Promise<RackResponse> {
      return klass.action(action)(this.request.env);
    }

    override setup(): void {
      super.setup();
      this.request.action = "index";
    }
  }

  let tc: IsolatedHelpersTest;
  const callController = (klass: typeof Base, action: string) => tc.callController(klass, action);

  beforeEach(async ({ task }) => {
    tc = new IsolatedHelpersTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });
  it("helper in a", async () => {
    await expect(callController(A, "index")).rejects.toThrow(TemplateError);
  });

  it("helper in b", async () => {
    expect(body(await callController(B, "index"))).toBe("B");
  });

  it("helper in c", async () => {
    expect(body(await callController(C, "index"))).toBe("C");
  });
});

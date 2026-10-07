import { beforeEach, describe, expect, it } from "vitest";
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
  Module,
  rbModConstSet,
  rbObjMethods,
} from "@blazetrails/ruby-compat";
import type { RackResponse } from "@blazetrails/rack";
import { TemplateError } from "@blazetrails/actionview";
import type { HelperMethodsModule } from "../../abstract-controller/helpers.js";
import { TestRequest } from "../../action-dispatch/testing/test-request.js";
import type { Response } from "../../action-dispatch/http/response.js";
import { Base } from "../base.js";
import { TestCase } from "../test-case.js";
import { ActionPackTestSuiteUtils } from "../../test-helpers/abstract-unit.js";

const thisFile = new URL(import.meta.url).pathname;
const fixtures = File.expandPath("../../test-helpers/fixtures", File.dirname(thisFile));

Base.helpersPath = [File.expandPath("helpers", fixtures)];

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

class AllHelpersController extends Base {
  static {
    this.helper(":all");
  }
}

class ImpressiveLibrary {
  static [included](base: typeof Base): void {
    base.helperMethod("usefulFunction");
  }

  usefulFunction(): void {}
}

include(Base, ImpressiveLibrary);

class JustMeController extends Base {
  static {
    this.clearHelpers();
  }

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

const paths = ["helpers2-pack", "helpers1-pack"].map((path) => File.join(fixtures, path));
await ActionPackTestSuiteUtils.requireHelpers(paths);

class HelpersPathsController extends Base {
  static {
    this.helpersPath = paths;

    this.helper(":all");
  }

  async index() {
    await this.render({ inline: "<%= conflictingHelper() %>" });
  }
}

class HelpersTypoController extends Base {
  static {
    this.helpersPath = [File.expandPath("helpers-typo", fixtures)];
  }
}
await ActionPackTestSuiteUtils.requireHelpers(HelpersTypoController.helpersPath);

const LocalAbcHelper = new Module().include({
  a(): void {},
  b(): void {},
  c(): void {},
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
    controllerClass = (() => class extends TestController {})();

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

  it("helper method with error has correct backgrace", () => {
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
    expect(body(await callController(Fun.GamesController, "render_hello_world"))).toBe(
      "hello: Iz guuut!",
    );
  });

  it("helper for acronym controller", async () => {
    expect(body(await callController(Fun.PdfController, "test"))).toBe("test: baz");
  });

  it("default helpers only", () => {
    expect(
      (JustMeController._helpers.ancestors() as Module[])
        .filter((mod) => !isAnonymous(mod as { name: string }))
        .map((mod) => mod.toS()),
    ).toEqual(["JustMeHelper"]);
    expect(
      (MeTooController._helpers.ancestors() as Module[])
        .filter((mod) => !isAnonymous(mod as { name: string }))
        .map((mod) => mod.toS()),
    ).toEqual(["MeTooController::HelperMethods", "MeTooHelper", "JustMeHelper"]);
  });

  it("base helper methods after clear helpers", async () => {
    await expect(callController(JustMeController, "flash")).resolves.not.toThrow();
  });

  it("lib helper methods after clear helpers", async () => {
    await expect(callController(JustMeController, "lib")).resolves.not.toThrow();
  });

  it("all helpers", () => {
    const methods = AllHelpersController._helpers.instanceMethods();

    expect(methods).toContain("bareA");

    expect(methods).toContain("stratego");

    expect(methods).toContain("foobar");
  });

  it("all helpers with alternate helper dir", async () => {
    controllerClass.helpersPath = [File.expandPath("alternate-helpers", fixtures)];
    await ActionPackTestSuiteUtils.requireHelpers(controllerClass.helpersPath);

    controllerClass._helpers = new Module();
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

  function expectedHelperMethods(): string[] {
    return constants.TestHelper!.instanceMethods();
  }

  function masterHelperMethods(): string[] {
    return controllerClass._helpers.instanceMethods();
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
      this.helper((mod) => {
        mod.shout = () => "B";
      });
    }

    async index() {
      await this.render({ inline: "<%= shout() %>" });
    }
  }

  class C extends A {
    static {
      this.helper((mod) => {
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

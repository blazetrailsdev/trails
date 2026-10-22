import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import "../../test-helpers/abstract-unit.js";
import { File, getPath, rbModConstSet, rbObjIvarSet } from "@blazetrails/ruby-compat";

import { ActionController, ActionDispatch, type RouteSet } from "@blazetrails/actionpack";
import { Base } from "../../base.js";
import { DetailsKey } from "../../lookup-context.js";
import { PathSet } from "../../path-set.js";
import { Template } from "../../template.js";
import { Resolver } from "../../template/resolver.js";

const __dir__ = new URL(".", import.meta.url).pathname;
const FIXTURE_LOAD_PATH = File.expandPath("../../test-helpers/fixtures", __dir__);

let expand: (array: string[]) => string[];

beforeAll(async () => {
  const path = getPath();
  expand = (array) => array.map((x) => path.resolve(x.toString()));
});

class TestController extends ActionController.Base {
  static override controllerPath(): string {
    return "test";
  }

  static {
    this.beforeAction("addViewPath", { only: "helloWorldAtRequestTime" });
  }

  async helloWorld(): Promise<void> {}
  async helloWorldAtRequestTime(): Promise<void> {
    await this.render({ action: "helloWorld" });
  }

  /** @internal */
  private addViewPath(): void {
    this.prependViewPath(`${FIXTURE_LOAD_PATH}/override`);
  }
}
TestController.viewPaths([FIXTURE_LOAD_PATH]);

class ViewLoadPathsTest extends ActionController.TestCase {
  declare paths: PathSet;

  static {
    this.withRoutes(function () {
      this.get("helloWorld", { to: "test#helloWorld" });
      this.get("helloWorldAtRequestTime", { to: "test#helloWorldAtRequestTime" });
    });
  }

  override setup(): void {
    DetailsKey.clear();

    this.controller = new TestController();
    Object.assign(this, {
      request: ActionController.TestRequest.create(this.controller.constructor),
      response: new ActionDispatch.TestResponse(),
    });
    this.paths = TestController.viewPaths();
    super.setup();
  }

  override teardown(): void {
    TestController.viewPaths(this.paths);
  }

  assertPaths(...paths: Array<string | typeof ActionController.Base>): void {
    const viewPaths =
      typeof paths[0] === "function"
        ? (paths.shift() as typeof ActionController.Base).viewPaths()
        : (this.controller as ActionController.Base).viewPaths;
    expect(viewPaths.toAry().map(String)).toEqual(expand(paths as string[]));
  }
}

rbModConstSet(Object, "ViewLoadPathsTest", ViewLoadPathsTest);
const Test = rbModConstSet(ViewLoadPathsTest, "Test", {});

class SubController extends ActionController.Base {
  static {
    rbModConstSet(Test, "SubController", this);
    this.layout("test/sub");
  }

  async helloWorld(): Promise<void> {
    await this.render({ template: "test/hello-world" });
  }
}

describe("ViewLoadPathsTest", () => {
  let tc: ViewLoadPathsTest;
  let controller: TestController;

  beforeEach(async ({ task }) => {
    tc = new ViewLoadPathsTest(task.name);
    await tc.beforeSetup();
    tc.setup();
    controller = tc.controller as TestController;
  });

  afterEach(() => {
    tc.teardown();
  });

  test("template load path was set correctly", () => {
    tc.assertPaths(FIXTURE_LOAD_PATH);
  });

  test("controller appends view path correctly", () => {
    controller.appendViewPath("foo");
    tc.assertPaths(FIXTURE_LOAD_PATH, "foo");

    controller.appendViewPath(["bar", "baz"]);
    tc.assertPaths(FIXTURE_LOAD_PATH, "foo", "bar", "baz");

    controller.appendViewPath(FIXTURE_LOAD_PATH);
    tc.assertPaths(FIXTURE_LOAD_PATH, "foo", "bar", "baz", FIXTURE_LOAD_PATH);
  });

  test("controller prepends view path correctly", () => {
    controller.prependViewPath("baz");
    tc.assertPaths("baz", FIXTURE_LOAD_PATH);

    controller.prependViewPath(["foo", "bar"]);
    tc.assertPaths("foo", "bar", "baz", FIXTURE_LOAD_PATH);

    controller.prependViewPath(FIXTURE_LOAD_PATH);
    tc.assertPaths(FIXTURE_LOAD_PATH, "foo", "bar", "baz", FIXTURE_LOAD_PATH);
  });

  test("template appends view path correctly", () => {
    rbObjIvarSet(
      controller,
      "@template",
      Base.withViewPaths(TestController.viewPaths(), {}, controller),
    );
    const classViewPaths = TestController.viewPaths();

    controller.appendViewPath("foo");
    tc.assertPaths(FIXTURE_LOAD_PATH, "foo");

    controller.appendViewPath(["bar", "baz"]);
    tc.assertPaths(FIXTURE_LOAD_PATH, "foo", "bar", "baz");
    tc.assertPaths(TestController, ...classViewPaths.toAry().map(String));
  });

  test("template prepends view path correctly", () => {
    rbObjIvarSet(
      controller,
      "@template",
      Base.withViewPaths(TestController.viewPaths(), {}, controller),
    );
    const classViewPaths = TestController.viewPaths();

    controller.prependViewPath("baz");
    tc.assertPaths("baz", FIXTURE_LOAD_PATH);

    controller.prependViewPath(["foo", "bar"]);
    tc.assertPaths("foo", "bar", "baz", FIXTURE_LOAD_PATH);
    tc.assertPaths(TestController, ...classViewPaths.toAry().map(String));
  });

  test("append view path does not bust template cache", () => {
    const templateInstances = Array.from({ length: 2 }, () => {
      const controller = new SubController();
      controller.appendViewPath(`${FIXTURE_LOAD_PATH}/override2`);
      return controller.lookupContext.findAll("layouts/test/sub");
    });

    const objectIds = templateInstances.flat();
    expect(new Set(objectIds).size).toBe(1);
  });

  test("prepend view path does not bust template cache", () => {
    const templateInstances = Array.from({ length: 2 }, () => {
      const controller = new TestController();
      controller.prependViewPath(`${FIXTURE_LOAD_PATH}/override`);
      return controller.lookupContext.findAll("hello-world", ["test"]);
    });

    const objectIds = templateInstances.flat();
    expect(new Set(objectIds).size).toBe(1);
  });

  test("view paths", async () => {
    await tc.get("helloWorld");
    tc.assertResponse("success");
    expect(tc.response.body).toBe("Hello world!");
  });

  test("view paths override", async () => {
    TestController.prependViewPath(`${FIXTURE_LOAD_PATH}/override`);
    await tc.get("helloWorld");
    tc.assertResponse("success");
    expect(tc.response.body).toBe("Hello overridden world!");
  });

  test("view paths override for layouts in controllers with a module", async () => {
    tc.controller = new SubController();
    await tc.withRouting(async (routes: RouteSet) => {
      routes.draw(function () {
        this.get("helloWorld", { to: "view_load_paths_test/test/sub#helloWorld" });
      });

      SubController.viewPaths([
        `${FIXTURE_LOAD_PATH}/override`,
        FIXTURE_LOAD_PATH,
        `${FIXTURE_LOAD_PATH}/override2`,
      ]);
      await tc.get("helloWorld");
      tc.assertResponse("success");
      expect(tc.response.body).toBe("layout: Hello overridden world!");
    });
  });

  test("view paths override at request time", async () => {
    await tc.get("helloWorldAtRequestTime");
    tc.assertResponse("success");
    expect(tc.response.body).toBe("Hello overridden world!");
  });

  test("decorate view paths with custom resolver", async () => {
    const decoratorClass = class extends Resolver {
      pathSet: PathSet;

      constructor(pathSet: PathSet) {
        super();
        this.pathSet = pathSet;
      }

      override findAll(...args: Parameters<Resolver["findAll"]>): Template[] {
        return (
          this.pathSet.findAll(...(args as Parameters<PathSet["findAll"]>)) as Template[]
        ).map(
          (template) =>
            new Template("Decorated body", template.identifier, template.handler, {
              virtualPath: template.virtualPath,
              format: template.format,
              locals: template.locals as readonly string[],
            }),
        );
      }
    };

    const decorator = new decoratorClass(TestController.viewPaths());
    TestController.viewPaths(new PathSet([decorator]));

    await tc.get("helloWorld");
    tc.assertResponse("success");
    expect(tc.response.body).toBe("Decorated body");
  });

  test("inheritance", () => {
    const originalLoadPaths = ActionController.Base.viewPaths().toAry().map(String);

    class A extends ActionController.Base {}
    class B extends A {}
    class C extends ActionController.Base {}

    A.viewPaths(["a/path"]);

    tc.assertPaths(A, "a/path");
    tc.assertPaths(A, ...B.viewPaths().toAry().map(String));
    tc.assertPaths(C, ...originalLoadPaths);

    C.viewPaths([]);
    expect(() => C.appendViewPath("c/path")).not.toThrow();
    tc.assertPaths(C, "c/path");
  });

  test("lookup context accessor", () => {
    expect(new TestController().lookupContext.prefixes).toEqual(["test"]);
  });
});

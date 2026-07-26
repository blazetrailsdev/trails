import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { getPathAsync } from "@blazetrails/activesupport";
import { PathRegistry } from "./path-registry.js";
import { PathSet } from "./path-set.js";
import { FileSystemResolver } from "./resolver/file-system-resolver.js";
import {
  ClassMethods,
  appendViewPath,
  lookupContext,
  prependViewPath,
  viewPaths,
  type ViewPaths,
  type ViewPathsClass,
} from "./view-paths.js";

const FIXTURE_LOAD_PATH = "/fixtures";

let expand: (paths: string[]) => string[];

beforeAll(async () => {
  const path = await getPathAsync();
  expand = (paths) => paths.map((p) => path.resolve(p));
});

/**
 * Stands in for `ActionController::Base` — the ViewPaths surface assigned onto
 * a class that supplies `abstract?` and `controller_path`.
 */
class TestController implements ViewPaths {
  declare readonly ["constructor"]: ViewPathsClass;

  static isAbstract(): boolean {
    return false;
  }
  static controllerPath(): string {
    return "test";
  }

  static _viewPaths = ClassMethods._viewPaths;
  static _prefixes = ClassMethods._prefixes;
  static _buildViewPaths = ClassMethods._buildViewPaths;
  static appendViewPath = ClassMethods.appendViewPath;
  static prependViewPath = ClassMethods.prependViewPath;
  static viewPaths = ClassMethods.viewPaths;
  static localPrefixes = ClassMethods.localPrefixes;

  lookupContext = lookupContext;
  viewPaths = viewPaths;
  appendViewPath = appendViewPath;
  prependViewPath = prependViewPath;
}

function assertPaths(actual: PathSet, ...paths: string[]): void {
  expect(actual.toArray().map((r) => (r as unknown as FileSystemResolver).path())).toEqual(
    expand(paths),
  );
}

afterEach(() => {
  PathRegistry.reset();
});

describe("ViewLoadPathsTest", () => {
  test("test_template_load_path_was_set_correctly", () => {
    TestController.viewPaths([FIXTURE_LOAD_PATH]);
    assertPaths(new TestController().viewPaths(), FIXTURE_LOAD_PATH);
  });

  test("test_controller_appends_view_path_correctly", () => {
    TestController.viewPaths([FIXTURE_LOAD_PATH]);
    const controller = new TestController();

    controller.appendViewPath("foo");
    assertPaths(controller.viewPaths(), FIXTURE_LOAD_PATH, "foo");

    controller.appendViewPath(["bar", "baz"]);
    assertPaths(controller.viewPaths(), FIXTURE_LOAD_PATH, "foo", "bar", "baz");

    controller.appendViewPath(FIXTURE_LOAD_PATH);
    assertPaths(controller.viewPaths(), FIXTURE_LOAD_PATH, "foo", "bar", "baz", FIXTURE_LOAD_PATH);
  });

  test("test_controller_prepends_view_path_correctly", () => {
    TestController.viewPaths([FIXTURE_LOAD_PATH]);
    const controller = new TestController();

    controller.prependViewPath("baz");
    assertPaths(controller.viewPaths(), "baz", FIXTURE_LOAD_PATH);

    controller.prependViewPath(["foo", "bar"]);
    assertPaths(controller.viewPaths(), "foo", "bar", "baz", FIXTURE_LOAD_PATH);

    controller.prependViewPath(FIXTURE_LOAD_PATH);
    assertPaths(controller.viewPaths(), FIXTURE_LOAD_PATH, "foo", "bar", "baz", FIXTURE_LOAD_PATH);
  });

  test("test_inheritance", () => {
    const originalLoadPaths = [FIXTURE_LOAD_PATH];
    TestController.viewPaths(originalLoadPaths);

    class A extends TestController {}
    class B extends A {}
    class C extends TestController {}

    A.viewPaths(["a/path"]);

    assertPaths(A.viewPaths(), "a/path");
    assertPaths(B.viewPaths(), "a/path");
    assertPaths(C.viewPaths(), ...originalLoadPaths);

    C.viewPaths([]);
    expect(() => C.appendViewPath("c/path")).not.toThrow();
    assertPaths(C.viewPaths(), "c/path");
  });

  test("test_lookup_context_accessor", () => {
    TestController.viewPaths([FIXTURE_LOAD_PATH]);
    expect(new TestController().lookupContext().prefixes).toEqual(["test"]);
  });
});

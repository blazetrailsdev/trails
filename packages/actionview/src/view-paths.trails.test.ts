import { afterEach, describe, expect, test } from "vitest";
import { PathRegistry } from "./path-registry.js";
import {
  ClassMethods,
  _prefixes,
  detailsForLookup,
  formats,
  isAnyTemplates,
  isTemplateExists,
  locale,
  lookupContext,
  type ViewPaths,
  type ViewPathsClass,
} from "./view-paths.js";

class BaseController implements ViewPaths {
  declare readonly ["constructor"]: ViewPathsClass;

  static abstract = true;
  static isAbstract(): boolean {
    return this.abstract;
  }
  static controllerPath(): string {
    return "base";
  }

  static _prefixes = ClassMethods._prefixes;
  static viewPaths = ClassMethods.viewPaths;

  _prefixes = _prefixes;
  lookupContext = lookupContext;
  detailsForLookup = detailsForLookup;
  formats = formats;
  locale = locale;
  isTemplateExists = isTemplateExists;
  isAnyTemplates = isAnyTemplates;
}

class PostsController extends BaseController {
  static abstract = false;
  static controllerPath(): string {
    return "posts";
  }
}

class DraftsController extends PostsController {
  static controllerPath(): string {
    return "drafts";
  }
}

afterEach(() => {
  PathRegistry.reset();
});

describe("ViewPaths::ClassMethods", () => {
  test("_prefixes stops at the first abstract ancestor", () => {
    expect(DraftsController._prefixes()).toEqual(["drafts", "posts"]);
  });
});

describe("ViewPaths", () => {
  test("lookup_context is built from the class's view paths, details and prefixes", () => {
    PostsController.viewPaths([]);
    const controller = new PostsController();

    expect(controller.lookupContext().prefixes).toEqual(["posts"]);
    expect(controller.detailsForLookup()).toEqual({});
    expect(controller.lookupContext()).toBe(controller.lookupContext());
  });

  test("formats and locale delegate to the lookup context", () => {
    PostsController.viewPaths([]);
    const controller = new PostsController();

    controller.formats(["json"]);
    expect(controller.formats()).toEqual(["json"]);
    expect(controller.lookupContext().formats).toEqual(["json"]);

    controller.locale("de");
    expect(controller.locale()).toBe("de");
    expect(controller.lookupContext().locale).toBe("de");
  });

  test("template_exists? and any_templates? delegate to the lookup context", () => {
    PostsController.viewPaths([]);
    const controller = new PostsController();

    expect(controller.isTemplateExists("index", ["posts"])).toBe(false);
    expect(controller.isAnyTemplates("index", ["posts"])).toBe(false);
  });
});

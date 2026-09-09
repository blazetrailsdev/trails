import { afterEach, describe, expect, test } from "vitest";
import { PathRegistry } from "./path-registry.js";
import { FixtureResolver } from "./testing/resolvers.js";
import { TemplateHandlers } from "./template/handlers.js";
import {
  ClassMethods,
  _prefixes,
  appendViewPath,
  detailsForLookup,
  formats,
  isAnyTemplates,
  locale,
  lookupContext,
  templateExists,
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
  templateExists = templateExists;
  appendViewPath = appendViewPath;
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
  TemplateHandlers.clear();
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

    expect(controller.templateExists("index", ["posts"])).toBe(false);
    expect(controller.isAnyTemplates("index", ["posts"])).toBe(false);
  });

  test("an appended resolver is searched by template_exists?", () => {
    TemplateHandlers.registerTemplateHandler("tse", {
      extensions: ["tse"],
      call: () => '""',
    });
    const resolver = new FixtureResolver({ "posts/index.html.tse": "hello" });
    PostsController.viewPaths([]);
    const controller = new PostsController();

    controller.appendViewPath(resolver);

    expect(controller.templateExists("index", ["posts"])).toBe(true);
    expect(controller.templateExists("missing", ["posts"])).toBe(false);
  });
});

describe("localPrefixes", () => {
  const prefixesFor = (controllerPath: string): string[] =>
    ClassMethods.localPrefixes.call({
      controllerPath: () => controllerPath,
    } as unknown as ViewPathsClass);

  test("looks under the kebab-cased directory first", () => {
    expect(prefixesFor("rfc_pages")[0]).toBe("rfc-pages");
  });

  test("keeps the underscored directory as a fallback", () => {
    expect(prefixesFor("rfc_pages")).toEqual(["rfc-pages", "rfc_pages"]);
  });

  test("returns one prefix when a name has no separator to respell", () => {
    expect(prefixesFor("account")).toEqual(["account"]);
  });

  test("respells every segment of a namespaced controller", () => {
    expect(prefixesFor("admin/rfc_pages")).toEqual(["admin/rfc-pages", "admin/rfc_pages"]);
  });

  test("carries a missing controller path through untouched", () => {
    expect(
      ClassMethods.localPrefixes.call({
        controllerPath: () => undefined as unknown as string,
      } as unknown as ViewPathsClass),
    ).toEqual([undefined]);
  });
});

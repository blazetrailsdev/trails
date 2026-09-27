import { describe, expect, test } from "vitest";
import { underscore } from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { ActionController, Request, Response } from "@blazetrails/actionpack";
import { FixtureResolver } from "../../testing/resolvers.js";
import { MissingTemplate } from "../../template/error.js";
import { TemplateHandlers, type TemplateHandler } from "../../template/handlers.js";
import { DetailsKey } from "../../lookup-context.js";

class LayoutTest extends ActionController.Base {
  static override controllerPath(): string {
    return "views";
  }
  static override _impliedLayoutName = function (this: { name: string }): string {
    return underscore(this.name).replace(/_controller$/, "");
  };

  async hello(): Promise<void> {}
  async goodbye(): Promise<void> {}
}

LayoutTest.viewPaths(
  new FixtureResolver({
    "layouts/item.tse": "item.erb <%= yield %>",
    "layouts/layout_test.tse": "layout_test.erb <%= yield %>",
    "layouts/multiple_extensions.html.tse": "multiple_extensions.html.erb <%= yield %>\n",
    "layouts/controller_name_space/nested.tse": "controller_name_space/nested.erb <%= yield %>",
    "layouts/symlinked/symlinked_layout.tse": "This is my layout\n\n<%= yield %>\n\nEnd.\n",
    "layouts/third_party_template_library.mab": "layouts/third_party_template_library.mab",
    "views/hello.tse": "hello.erb",
    "views/goodbye.tse": "goodbye.erb",
  }),
);

async function withTemplateHandler(
  extension: string,
  handler: TemplateHandler,
  block: () => Promise<void>,
): Promise<void> {
  TemplateHandlers.registerTemplateHandler(extension, handler);
  ActionController.Base.viewPaths().paths.forEach((path) => path.clearCache?.());
  DetailsKey.clear();
  try {
    await block();
  } finally {
    TemplateHandlers.unregisterTemplateHandler(extension);
    ActionController.Base.viewPaths().paths.forEach((path) => path.clearCache?.());
    DetailsKey.clear();
  }
}

const mab: TemplateHandler = { call: (_template, source) => `return ${JSON.stringify(source)};` };

class ProductController extends LayoutTest {}

class ItemController extends LayoutTest {}

class ThirdPartyTemplateLibraryController extends LayoutTest {}

class NestedController extends LayoutTest {}
Object.defineProperty(NestedController, "name", { value: "ControllerNameSpace::NestedController" });

class MultipleExtensions extends LayoutTest {}

async function get(controller: LayoutTest, action: string): Promise<string> {
  const env = { REQUEST_METHOD: "GET", PATH_INFO: "/", HTTP_HOST: "www.nextangle.com" };
  await controller.dispatch(action, new Request(env), new Response());
  return controller.responseBody;
}

describe("LayoutAutoDiscoveryTest", () => {
  test("application layout is default when no controller match", async () => {
    expect(await get(new ProductController(), "hello")).toBe("layout_test.erb hello.erb");
  });

  test("controller name layout name match", async () => {
    expect(await get(new ItemController(), "hello")).toBe("item.erb hello.erb");
  });

  test("third party template library auto discovers layout", async () => {
    await withTemplateHandler("mab", mab, async () => {
      const controller = new ThirdPartyTemplateLibraryController();
      await get(controller, "hello");
      expect(controller.response.status).toBe(200);
      expect(controller.body).toBe("layouts/third_party_template_library.mab");
    });
  });

  test("namespaced controllers auto detect layouts1", async () => {
    expect(await get(new NestedController(), "hello")).toBe(
      "controller_name_space/nested.erb hello.erb",
    );
  });

  test("namespaced controllers auto detect layouts2", async () => {
    expect((await get(new MultipleExtensions(), "hello")).trim()).toBe(
      "multiple_extensions.html.erb hello.erb",
    );
  });
});

class DefaultLayoutController extends LayoutTest {}

class AbsolutePathLayoutController extends LayoutTest {
  static {
    this.layout("/fixtures/actionpack/layout_tests/layouts/layout_test");
  }
}

class HasOwnLayoutController extends LayoutTest {
  static {
    this.layout("item");
  }
}

class HasNilLayoutSymbol extends LayoutTest {
  static {
    this.layout(":nilz");
  }

  nilz(): null {
    return null;
  }
}

class HasNilLayoutProc extends LayoutTest {
  static {
    this.layout(() => null);
  }
}

class PrependsViewPathController extends LayoutTest {
  override async hello(): Promise<void> {
    this.prependViewPath(new FixtureResolver({ "layouts/alt.tse": "alt.erb <%= yield %>" }));
    this.render({ layout: "alt" });
  }
}

class OnlyLayoutController extends LayoutTest {
  static {
    this.layout("item", { only: "hello" });
  }
}

class ExceptLayoutController extends LayoutTest {
  static {
    this.layout("item", { except: "goodbye" });
  }
}

class SetsLayoutInRenderController extends LayoutTest {
  override async hello(): Promise<void> {
    this.render({ layout: "third_party_template_library" });
  }
}

class RendersNoLayoutController extends LayoutTest {
  override async hello(): Promise<void> {
    this.render({ layout: false });
  }
}

describe("LayoutSetInResponseTest", () => {
  test("layout set when using default layout", async () => {
    expect(await get(new DefaultLayoutController(), "hello")).toContain("layout_test.erb");
  });

  test("layout set when set in controller", async () => {
    expect(await get(new HasOwnLayoutController(), "hello")).toContain("item.erb");
  });

  test("layout symbol set in controller returning nil falls back to default", async () => {
    expect(await get(new HasNilLayoutSymbol(), "hello")).toContain("layout_test.erb");
  });

  test("layout proc set in controller returning nil falls back to default", async () => {
    expect(await get(new HasNilLayoutProc(), "hello")).toContain("layout_test.erb");
  });

  test("layout only exception when included", async () => {
    expect(await get(new OnlyLayoutController(), "hello")).toContain("item.erb");
  });

  test("layout only exception when excepted", async () => {
    expect(await get(new OnlyLayoutController(), "goodbye")).not.toContain("item.erb");
  });

  test("layout except exception when included", async () => {
    expect(await get(new ExceptLayoutController(), "hello")).toContain("item.erb");
  });

  test("layout except exception when excepted", async () => {
    expect(await get(new ExceptLayoutController(), "goodbye")).not.toContain("item.erb");
  });

  test("layout set when using render", async () => {
    await withTemplateHandler("mab", mab, async () => {
      expect(await get(new SetsLayoutInRenderController(), "hello")).toContain(
        "layouts/third_party_template_library.mab",
      );
    });
  });

  test("layout is not set when none rendered", async () => {
    expect(await get(new RendersNoLayoutController(), "hello")).toBe("hello.erb");
  });

  test("layout is picked from the controller instances view path", async () => {
    expect(await get(new PrependsViewPathController(), "hello")).toContain("alt.erb");
  });

  test("absolute pathed layout", async () => {
    await expect(get(new AbsolutePathLayoutController(), "hello")).rejects.toThrow(ArgumentError);
  });
});

class SetsNonExistentLayoutFile extends LayoutTest {
  static {
    this.layout("nofile");
  }
}

describe("LayoutExceptionRaisedTest", () => {
  test("exception raised when layout file not found", async () => {
    await expect(get(new SetsNonExistentLayoutFile(), "hello")).rejects.toThrow(MissingTemplate);
  });
});

class LayoutStatusIsRendered extends LayoutTest {
  override async hello(): Promise<void> {
    this.render({ status: 401 });
  }
}

describe("LayoutStatusIsRenderedTest", () => {
  test("layout status is rendered", async () => {
    const controller = new LayoutStatusIsRendered();
    await get(controller, "hello");
    expect(controller.response.status).toBe(401);
  });
});

class LayoutSymlinkedTest extends LayoutTest {
  static {
    this.layout("symlinked/symlinked_layout");
  }
}

describe("LayoutSymlinkedIsRenderedTest", () => {
  test("symlinked layout is rendered", async () => {
    const controller = new LayoutSymlinkedTest();
    await get(controller, "hello");
    expect(controller.response.status).toBe(200);
    expect(controller.body).toContain("This is my layout");
  });
});

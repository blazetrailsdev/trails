import { describe, expect, test } from "vitest";
import { underscore } from "@blazetrails/activesupport";
import { ActionController, Request, Response } from "@blazetrails/actionpack";
import { FixtureResolver } from "../../testing/resolvers.js";
import { MissingTemplate } from "../../template/error.js";

class LayoutTest extends ActionController.Base {
  static override controllerPath(): string {
    return "views";
  }
  static override _impliedLayoutName = function (this: typeof LayoutTest): string {
    return underscore(this.name).replace(/_controller$/, "");
  };

  async hello(): Promise<void> {}
  async goodbye(): Promise<void> {}
}

LayoutTest.viewPaths(
  new FixtureResolver({
    "layouts/item.tse": "item.erb <%= yield %>",
    "layouts/layout_test.tse": "layout_test.erb <%= yield %>",
    "layouts/third_party_template_library.tse": "layouts/third_party_template_library.mab",
    "views/hello.tse": "hello.erb",
    "views/goodbye.tse": "goodbye.erb",
  }),
);

class DefaultLayoutController extends LayoutTest {}

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

async function get(controller: LayoutTest, action: string): Promise<string> {
  const env = { REQUEST_METHOD: "GET", PATH_INFO: "/", HTTP_HOST: "www.nextangle.com" };
  await controller.dispatch(action, new Request(env), new Response());
  return controller.body;
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
    expect(await get(new SetsLayoutInRenderController(), "hello")).toContain(
      "layouts/third_party_template_library.mab",
    );
  });

  test("layout is not set when none rendered", async () => {
    expect(await get(new RendersNoLayoutController(), "hello")).toBe("hello.erb");
  });
});

class SetsNonExistentLayoutFile extends LayoutTest {
  static {
    this.layout("nofile");
  }
}

describe("LayoutExceptionRaisedTest", () => {
  test("exception raised when layout file not found", async () => {
    await expect(get(new SetsNonExistentLayoutFile(), "hello")).rejects.toBeInstanceOf(
      MissingTemplate,
    );
  });
});

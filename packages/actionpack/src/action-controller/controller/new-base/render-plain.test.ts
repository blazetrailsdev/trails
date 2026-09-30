import { describe, it } from "vitest";
import { FixtureResolver } from "@blazetrails/actionview";
import { Base } from "../../base.js";
import { controllerConstants } from "../../../action-dispatch/http/request.js";
import { deprecator } from "../../../action-dispatch/deprecator.js";
import type { RouteSet } from "../../../action-dispatch/routing/route-set.js";
import { ApplicationController, Rack } from "../../../test-helpers/abstract-unit.js";

class SimpleController extends Base {
  static {
    this.viewPaths([new FixtureResolver()]);
  }

  async index(): Promise<void> {
    await this.render({ plain: "hello david" });
  }
}

class WithLayoutController extends ApplicationController {
  static {
    this.viewPaths([
      new FixtureResolver({
        "layouts/application.text.tse": "<%= yield %>, I'm here!",
        "layouts/greetings.text.tse": "<%= yield %>, I wish thee well.",
        "layouts/ivar.text.tse": "<%= yield %>, <%= @ivar %>",
      }),
    ]);
  }

  async index(): Promise<void> {
    await this.render({ plain: "hello david" });
  }

  async custom_code(): Promise<void> {
    await this.render({ plain: "hello world", status: 404 });
  }

  async with_custom_code_as_string(): Promise<void> {
    await this.render({ plain: "hello world", status: "404 Not Found" });
  }

  async with_nil(): Promise<void> {
    await this.render({ plain: null });
  }

  async with_nil_and_status(): Promise<void> {
    await this.render({ plain: null, status: 403 });
  }

  async with_false(): Promise<void> {
    await this.render({ plain: false });
  }

  async with_layout_true(): Promise<void> {
    await this.render({ plain: "hello world", layout: true });
  }

  async with_layout_false(): Promise<void> {
    await this.render({ plain: "hello world", layout: false });
  }

  async with_layout_nil(): Promise<void> {
    await this.render({ plain: "hello world", layout: null });
  }

  async with_custom_layout(): Promise<void> {
    await this.render({ plain: "hello world", layout: "greetings" });
  }

  async with_ivar_in_layout(): Promise<void> {
    (this as unknown as { ivar: string }).ivar = "hello world";
    await this.render({ plain: "hello world", layout: "ivar" });
  }
}

controllerConstants.set("render_plain/simple", SimpleController);
controllerConstants.set("render_plain/with_layout", WithLayoutController);

class RenderPlainTest extends Rack.TestCase {}

describe("RenderPlainTest", () => {
  // BLOCKED: action-controller-rendering-is-not-an-includable-module
  it.skip("rendering text from a minimal controller", () => {});

  it("rendering text from an action with default options renders the text with the layout", async () => {
    const t = new RenderPlainTest();
    await t.withRouting(async (set: RouteSet) => {
      set.draw((r) => {
        deprecator().silence(() => {
          r.get(":controller", { action: "index" });
        });
      });

      await t.get("/render_plain/simple");
      t.assertBody("hello david");
      t.assertStatus(200);
    });
  });

  it("rendering text from an action with default options renders the text without the layout", async () => {
    const t = new RenderPlainTest();
    await t.withRouting(async (set: RouteSet) => {
      set.draw((r) => {
        deprecator().silence(() => {
          r.get(":controller", { action: "index" });
        });
      });

      await t.get("/render_plain/with_layout");

      t.assertBody("hello david");
      t.assertStatus(200);
    });
  });

  it("rendering text, while also providing a custom status code", async () => {
    const t = new RenderPlainTest();
    await t.get("/render_plain/with_layout/custom_code");

    t.assertBody("hello world");
    t.assertStatus(404);
  });

  it("rendering text with nil returns an empty body", async () => {
    const t = new RenderPlainTest();
    await t.get("/render_plain/with_layout/with_nil");

    t.assertBody("");
    t.assertStatus(200);
  });

  it("Rendering text with nil and custom status code returns an empty body and the status", async () => {
    const t = new RenderPlainTest();
    await t.get("/render_plain/with_layout/with_nil_and_status");

    t.assertBody("");
    t.assertStatus(403);
  });

  it("rendering text with false returns the string 'false'", async () => {
    const t = new RenderPlainTest();
    await t.get("/render_plain/with_layout/with_false");

    t.assertBody("false");
    t.assertStatus(200);
  });

  it("rendering text with layout: true", async () => {
    const t = new RenderPlainTest();
    await t.get("/render_plain/with_layout/with_layout_true");

    t.assertBody("hello world, I'm here!");
    t.assertStatus(200);
  });

  it("rendering text with layout: 'greetings'", async () => {
    const t = new RenderPlainTest();
    await t.get("/render_plain/with_layout/with_custom_layout");

    t.assertBody("hello world, I wish thee well.");
    t.assertStatus(200);
  });

  it("rendering text with layout: false", async () => {
    const t = new RenderPlainTest();
    await t.get("/render_plain/with_layout/with_layout_false");

    t.assertBody("hello world");
    t.assertStatus(200);
  });

  it("rendering text with layout: nil", async () => {
    const t = new RenderPlainTest();
    await t.get("/render_plain/with_layout/with_layout_nil");

    t.assertBody("hello world");
    t.assertStatus(200);
  });

  // BLOCKED: action-controller-rendering-is-not-an-includable-module
  it.skip("rendering from minimal controller returns response with text/plain content type", () => {});

  it("rendering from normal controller returns response with text/plain content type", async () => {
    const t = new RenderPlainTest();
    await t.get("/render_plain/simple/index");
    t.assertContentType("text/plain; charset=utf-8");
  });
});

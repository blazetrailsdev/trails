import { beforeEach, describe, it } from "vitest";
import { FixtureResolver } from "@blazetrails/actionview";
import { include } from "@blazetrails/activesupport";
import { Rendering as AbstractControllerRendering } from "../../../abstract-controller/rendering.js";
import { Base } from "../../base.js";
import { Metal } from "../../metal.js";
import { Rendering } from "../../metal/rendering.js";
import { controllerConstants } from "../../../action-dispatch/http/request.js";
import { deprecator } from "../../../action-dispatch/deprecator.js";
import type { RouteSet } from "../../../action-dispatch/routing/route-set.js";
import { ApplicationController, Rack } from "../../../test-helpers/abstract-unit.js";

class MinimalController extends Metal {
  declare render: (options: Record<string, unknown>) => void | Promise<void>;

  static {
    include(this, AbstractControllerRendering);
    include(this, Rendering);
  }

  async index(): Promise<void> {
    await this.render({ plain: "Hello World!" });
  }
}

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

  async customCode(): Promise<void> {
    await this.render({ plain: "hello world", status: 404 });
  }

  async withCustomCodeAsString(): Promise<void> {
    await this.render({ plain: "hello world", status: "404 Not Found" });
  }

  async withNil(): Promise<void> {
    await this.render({ plain: null });
  }

  async withNilAndStatus(): Promise<void> {
    await this.render({ plain: null, status: 403 });
  }

  async withFalse(): Promise<void> {
    await this.render({ plain: false });
  }

  async withLayoutTrue(): Promise<void> {
    await this.render({ plain: "hello world", layout: true });
  }

  async withLayoutFalse(): Promise<void> {
    await this.render({ plain: "hello world", layout: false });
  }

  async withLayoutNil(): Promise<void> {
    await this.render({ plain: "hello world", layout: null });
  }

  async withCustomLayout(): Promise<void> {
    await this.render({ plain: "hello world", layout: "greetings" });
  }

  async withIvarInLayout(): Promise<void> {
    (this as unknown as { ivar: string }).ivar = "hello world";
    await this.render({ plain: "hello world", layout: "ivar" });
  }
}

controllerConstants.set("render_plain/minimal", MinimalController);
controllerConstants.set("render_plain/simple", SimpleController);
controllerConstants.set("render_plain/with_layout", WithLayoutController);

class RenderPlainTest extends Rack.TestCase {}

describe("RenderPlainTest", () => {
  let t: RenderPlainTest;

  const assertBody = (body: string): void => t.assertBody(body);

  const assertStatus = (code: number): void => t.assertStatus(code);

  const assertContentType = (type: string): void => t.assertContentType(type);

  beforeEach(({ task }) => {
    t = new RenderPlainTest(task.name);
  });

  it("rendering text from a minimal controller", async () => {
    await t.get("/render_plain/minimal/index");
    assertBody("Hello World!");
    assertStatus(200);
  });

  it("rendering text from an action with default options renders the text with the layout", async () => {
    await t.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        deprecator().silence(() => {
          this.get("/:controller", { action: "index" });
        });
      });

      await t.get("/render_plain/simple");
      assertBody("hello david");
      assertStatus(200);
    });
  });

  it("rendering text from an action with default options renders the text without the layout", async () => {
    await t.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        deprecator().silence(() => {
          this.get("/:controller", { action: "index" });
        });
      });

      await t.get("/render_plain/with_layout");

      assertBody("hello david");
      assertStatus(200);
    });
  });

  it("rendering text, while also providing a custom status code", async () => {
    await t.get("/render_plain/with_layout/customCode");

    assertBody("hello world");
    assertStatus(404);
  });

  it("rendering text with nil returns an empty body", async () => {
    await t.get("/render_plain/with_layout/withNil");

    assertBody("");
    assertStatus(200);
  });

  it("Rendering text with nil and custom status code returns an empty body and the status", async () => {
    await t.get("/render_plain/with_layout/withNilAndStatus");

    assertBody("");
    assertStatus(403);
  });

  it("rendering text with false returns the string 'false'", async () => {
    await t.get("/render_plain/with_layout/withFalse");

    assertBody("false");
    assertStatus(200);
  });

  it("rendering text with layout: true", async () => {
    await t.get("/render_plain/with_layout/withLayoutTrue");

    assertBody("hello world, I'm here!");
    assertStatus(200);
  });

  it("rendering text with layout: 'greetings'", async () => {
    await t.get("/render_plain/with_layout/withCustomLayout");

    assertBody("hello world, I wish thee well.");
    assertStatus(200);
  });

  it("rendering text with layout: false", async () => {
    await t.get("/render_plain/with_layout/withLayoutFalse");

    assertBody("hello world");
    assertStatus(200);
  });

  it("rendering text with layout: nil", async () => {
    await t.get("/render_plain/with_layout/withLayoutNil");

    assertBody("hello world");
    assertStatus(200);
  });

  it("rendering from minimal controller returns response with text/plain content type", async () => {
    await t.get("/render_plain/minimal/index");
    assertContentType("text/plain; charset=utf-8");
  });

  it("rendering from normal controller returns response with text/plain content type", async () => {
    await t.get("/render_plain/simple/index");
    assertContentType("text/plain; charset=utf-8");
  });
});

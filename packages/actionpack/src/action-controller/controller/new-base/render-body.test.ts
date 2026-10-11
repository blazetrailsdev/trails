import { beforeEach, describe, it } from "vitest";
import { FixtureResolver } from "@blazetrails/actionview";
import { assertEqual, include } from "@blazetrails/activesupport";
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
    await this.render({ body: "Hello World!" });
  }
}

class SimpleController extends Base {
  static {
    this.viewPaths([new FixtureResolver()]);
  }

  async index(): Promise<void> {
    await this.render({ body: "hello david" });
  }
}

class WithLayoutController extends ApplicationController {
  static {
    this.viewPaths([
      new FixtureResolver({
        "layouts/application.tse": "<%= yield %>, I'm here!",
        "layouts/greetings.tse": "<%= yield %>, I wish thee well.",
        "layouts/ivar.tse": "<%= yield %>, <%= @ivar %>",
      }),
    ]);
  }

  async index(): Promise<void> {
    await this.render({ body: "hello david" });
  }

  async customCode(): Promise<void> {
    await this.render({ body: "hello world", status: 404 });
  }

  async withCustomCodeAsString(): Promise<void> {
    await this.render({ body: "hello world", status: "404 Not Found" });
  }

  async withNil(): Promise<void> {
    await this.render({ body: null });
  }

  async withNilAndStatus(): Promise<void> {
    await this.render({ body: null, status: 403 });
  }

  async withFalse(): Promise<void> {
    await this.render({ body: false });
  }

  async withLayoutTrue(): Promise<void> {
    await this.render({ body: "hello world", layout: true });
  }

  async withLayoutFalse(): Promise<void> {
    await this.render({ body: "hello world", layout: false });
  }

  async withLayoutNil(): Promise<void> {
    await this.render({ body: "hello world", layout: null });
  }

  async withCustomLayout(): Promise<void> {
    await this.render({ body: "hello world", layout: "greetings" });
  }

  async withCustomContentType(): Promise<void> {
    this.response.headers.set("Content-Type", "application/json");
    await this.render({ body: '["troll","face"]' });
  }

  async withIvarInLayout(): Promise<void> {
    (this as unknown as { ivar: string }).ivar = "hello world";
    await this.render({ body: "hello world", layout: "ivar" });
  }
}

controllerConstants.set("render_body/minimal", MinimalController);
controllerConstants.set("render_body/simple", SimpleController);
controllerConstants.set("render_body/with_layout", WithLayoutController);

class RenderBodyTest extends Rack.TestCase {}

describe("RenderBodyTest", () => {
  let t: RenderBodyTest;

  const assertBody = (body: string): void => t.assertBody(body);

  const assertStatus = (code: number): void => t.assertStatus(code);

  beforeEach(({ task }) => {
    t = new RenderBodyTest(task.name);
  });

  it("rendering body from a minimal controller", async () => {
    await t.get("/render_body/minimal/index");
    assertBody("Hello World!");
    assertStatus(200);
  });

  it("rendering body from an action with default options renders the body with the layout", async () => {
    await t.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        deprecator().silence(() => {
          this.get(":controller", { action: "index" });
        });
      });

      await t.get("/render_body/simple");
      assertBody("hello david");
      assertStatus(200);
    });
  });

  it("rendering body from an action with default options renders the body without the layout", async () => {
    await t.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        deprecator().silence(() => {
          this.get(":controller", { action: "index" });
        });
      });

      await t.get("/render_body/with_layout");

      assertBody("hello david");
      assertStatus(200);
    });
  });

  it("rendering body, while also providing a custom status code", async () => {
    await t.get("/render_body/with_layout/customCode");

    assertBody("hello world");
    assertStatus(404);
  });

  it("rendering body with nil returns an empty body", async () => {
    await t.get("/render_body/with_layout/withNil");

    assertBody("");
    assertStatus(200);
  });

  it("Rendering body with nil and custom status code returns an empty body and the status", async () => {
    await t.get("/render_body/with_layout/withNilAndStatus");

    assertBody("");
    assertStatus(403);
  });

  it("rendering body with false returns the string 'false'", async () => {
    await t.get("/render_body/with_layout/withFalse");

    assertBody("false");
    assertStatus(200);
  });

  it("rendering body with layout: true", async () => {
    await t.get("/render_body/with_layout/withLayoutTrue");

    assertBody("hello world, I'm here!");
    assertStatus(200);
  });

  it("rendering body with layout: 'greetings'", async () => {
    await t.get("/render_body/with_layout/withCustomLayout");

    assertBody("hello world, I wish thee well.");
    assertStatus(200);
  });

  it("specified content type should not be removed", async () => {
    await t.get("/render_body/with_layout/withCustomContentType");

    assertEqual(["troll", "face"], JSON.parse(t.response.body));
    assertEqual("application/json", t.response.headers.get("Content-Type"));
  });

  it("rendering body with layout: false", async () => {
    await t.get("/render_body/with_layout/withLayoutFalse");

    assertBody("hello world");
    assertStatus(200);
  });

  it("rendering body with layout: nil", async () => {
    await t.get("/render_body/with_layout/withLayoutNil");

    assertBody("hello world");
    assertStatus(200);
  });
});

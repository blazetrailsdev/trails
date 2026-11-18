import { describe, it, expectTypeOf } from "vitest";
import { ActionController } from "@blazetrails/actionpack";

class PostsController extends ActionController.Base {
  show() {
    return this.render({ plain: "hello", status: 200 });
  }

  json() {
    return this.render({ json: { id: 1 }, status: "created" });
  }

  template() {
    return this.render("posts/show", { layout: false });
  }

  string() {
    return this.renderToString({ plain: "hello" });
  }
}

describe("ActionController::Rendering#render", () => {
  const controller = new PostsController();

  it("render answers void or a promise of it", () => {
    expectTypeOf(controller.show()).toEqualTypeOf<void | Promise<void>>();
    expectTypeOf(controller.json()).toEqualTypeOf<void | Promise<void>>();
    expectTypeOf(controller.template()).toEqualTypeOf<void | Promise<void>>();
  });

  it("render_to_string answers a string or a promise of one", () => {
    expectTypeOf(controller.string()).toEqualTypeOf<string | Promise<string>>();
  });

  it("an unknown render option is rejected", () => {
    // @ts-expect-error — `plian` is not a render option
    controller.render({ plian: "hello" });
  });
});

import { describe, it, expectTypeOf } from "vitest";
import { ActionController } from "@blazetrails/actionpack";

class PostsController extends ActionController.Base {
  create() {
    return this.redirectTo("/posts", { status: "see_other", notice: "Created" });
  }

  back() {
    return this.redirectBackOrTo("/posts");
  }
}

describe("ActionController::Redirecting#redirect_to", () => {
  const controller = new PostsController();

  it("redirect_to answers a promise of the status", () => {
    expectTypeOf(controller.create()).toEqualTypeOf<Promise<number>>();
  });

  it("redirect_to accepts a url hash", () => {
    expectTypeOf(controller.redirectTo({ controller: "posts", action: "index" })).toEqualTypeOf<
      Promise<number>
    >();
  });

  it("redirect_back_or_to is not any", () => {
    expectTypeOf(controller.back()).not.toBeAny();
  });

  it("url_for answers a string", () => {
    expectTypeOf(
      controller.urlFor({ controller: "posts", action: "index" }),
    ).toEqualTypeOf<string>();
  });
});

import { describe, it, expectTypeOf } from "vitest";
import { ActionController } from "@blazetrails/actionpack";

class PostsController extends ActionController.Base {
  postParams() {
    return this.params.require("post");
  }
}

describe("ActionController::Parameters", () => {
  const params = new ActionController.Parameters({ post: { title: "Hi" } });

  it("params on a controller is Parameters", () => {
    expectTypeOf(new PostsController().params).toEqualTypeOf<ActionController.Parameters>();
  });

  it("require with one key answers the value, which may be a scalar", () => {
    expectTypeOf(params.require("post")).toBeUnknown();
    expectTypeOf(new PostsController().postParams()).toBeUnknown();
  });

  it("require with an array of keys answers an array", () => {
    expectTypeOf(params.require(["post", "author"])).toEqualTypeOf<unknown[]>();
  });

  it("permit answers Parameters", () => {
    expectTypeOf(params.permit("title", { tags: [] })).toEqualTypeOf<ActionController.Parameters>();
  });

  it("fetch answers the value", () => {
    expectTypeOf(params.fetch("post", null)).toBeUnknown();
  });

  it("permitted? is a boolean", () => {
    expectTypeOf(params.isPermitted()).toEqualTypeOf<boolean>();
  });

  it("toH answers a plain hash", () => {
    expectTypeOf(params.permit("title").toH()).not.toBeAny();
  });
});

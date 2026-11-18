import { describe, it, expectTypeOf } from "vitest";
import { AbstractController, ActionController } from "@blazetrails/actionpack";

class PostsController extends ActionController.Base {
  static {
    this.beforeAction(":_setPost", { only: ["show", "edit"] });
    this.beforeAction((controller) => {
      expectTypeOf(controller).toEqualTypeOf<AbstractController.Base>();
      // @ts-expect-error — red once the block receives PostsController
      expectTypeOf(controller).toEqualTypeOf<PostsController>();
    });
    this.afterAction(":_log", { except: "index" });
    this.aroundAction(":_wrap");
    this.skipBeforeAction(":_setPost", { only: "edit" });
  }

  _setPost(): void {}
}

describe("AbstractController::Callbacks", () => {
  it("before_action answers void", () => {
    expectTypeOf(PostsController.beforeAction(":_setPost")).toEqualTypeOf<void>();
  });

  it("only takes a string or an array of strings", () => {
    // @ts-expect-error — `only` is not a number
    PostsController.beforeAction(":_setPost", { only: 1 });
  });
});

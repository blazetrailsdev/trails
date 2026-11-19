import { describe, it, expectTypeOf } from "vitest";
import { ActionController } from "@blazetrails/actionpack";

class RecordInvalid extends Error {
  readonly record = "post";
}

class PostsController extends ActionController.Base {
  static {
    this.rescueFrom(RecordInvalid, {
      with: function (this: PostsController, error: RecordInvalid) {
        expectTypeOf(error.record).toEqualTypeOf<string>();
      },
    });
    this.rescueFrom(RecordInvalid, function (this: PostsController, error: RecordInvalid) {
      expectTypeOf(this).toEqualTypeOf<PostsController>();
      expectTypeOf(error).toEqualTypeOf<RecordInvalid>();
    });
    this.rescueFrom("RecordInvalid", { with: ":renderInvalid" });
  }
}

describe("ActiveSupport::Rescuable", () => {
  it("rescue_from takes a handler typed for the exception subclass", () => {
    expectTypeOf(PostsController.rescueFrom).toBeFunction();
  });
});

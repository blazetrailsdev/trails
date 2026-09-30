import { describe, it, expect, expectTypeOf } from "vitest";
import type { Base } from "../base.js";
import type { ToModel } from "../../action-dispatch/routing/polymorphic-routes.js";
import { Flash } from "./flash.js";
import { redirectBackOrTo } from "./redirecting.js";

describe("Redirecting#redirect_back_or_to", () => {
  const redirects: string[] = [];
  const host = {
    request: { host: "example.com", referer: "http://evil.test/x" },
    redirectTo: (location: string) => redirects.push(location),
  } as never;

  it("defaults allow_other_host only when the keyword is absent", () => {
    redirectBackOrTo.call(host, "/fallback", { allowOtherHost: null } as never);
    redirectBackOrTo.call(host, "/fallback");
    expect(redirects).toEqual(["/fallback", "http://evil.test/x"]);
  });
});

describe("Redirecting#redirect_to types", () => {
  it("accepts redirecting.rb's option forms and rejects unknown response options", () => {
    const typed = (controller: Base, post: ToModel): void => {
      controller.redirectTo("/posts");
      controller.redirectTo(post, {
        notice: "Post was successfully updated.",
        status: "see_other",
      });
      controller.redirectTo({ action: "index", status: 303 });
      controller.redirectTo(() => "/posts", { alert: "Watch it, mister!", status: ":found" });
      controller.redirectTo("/posts", { status: 301, flash: { updatedPostId: 1 } });
      controller.redirectTo("/posts", { status: "unprocessable_entity" });
      controller.redirectTo("https://rubyonrails.org", { allowOtherHost: true });
      controller.redirectTo<"warning">("/posts", { warning: "Careful" });
      // @ts-expect-error a misspelled response option
      controller.redirectTo("/posts", { statsu: "see_other" });
      // @ts-expect-error not a Rack status symbol
      controller.redirectTo("/posts", { status: "see_another" });
      // @ts-expect-error a flash type the controller did not name
      controller.redirectTo("/posts", { warning: "Careful" });
      expectTypeOf(controller.redirectTo).returns.toEqualTypeOf<number>();
      const flash = controller as unknown as Flash & { flash: never };
      // @ts-expect-error a misspelled response option on Flash#redirect_to itself
      flash.redirectTo("/posts", { statsu: "see_other" });
    };
    expect(typed).toBeTypeOf("function");
  });
});

import { describe, it, expect, expectTypeOf } from "vitest";
import { Base } from "../../../lib/action-controller/base.js";
import type { ToModel } from "../../../lib/action-dispatch/routing/polymorphic-routes.js";
import type { redirectTo as flashRedirectTo } from "../../../lib/action-controller/metal/flash.js";
import type { RedirectingHost } from "../../../lib/action-controller/metal/redirecting.js";

describe("Redirecting#redirect_back_or_to", () => {
  const redirects: string[] = [];
  class RedirectBackController extends Base {
    override async redirectTo(location: string): Promise<number> {
      return redirects.push(location);
    }
  }
  const host = Object.assign(new RedirectBackController(), {
    request: { host: "example.com", referer: "http://evil.test/x" },
  });

  it("defaults allow_other_host only when the keyword is absent", () => {
    host.redirectBackOrTo("/fallback", { allowOtherHost: null } as never);
    host.redirectBackOrTo("/fallback");
    expect(redirects).toEqual(["/fallback", "http://evil.test/x"]);
  });
});

describe("Redirecting#redirect_to types", () => {
  it("accepts redirecting.rb's option forms and rejects unknown response options", () => {
    const typed = async (controller: Base, post: ToModel): Promise<void> => {
      await controller.redirectTo("/posts");
      await controller.redirectTo(post, {
        notice: "Post was successfully updated.",
        status: ":see_other",
      });
      await controller.redirectTo({ action: "index", status: 303 });
      await controller.redirectTo({ action: "show", id: 5, onlyPath: true, anchor: "comments" });
      // @ts-expect-error a url_for option of the wrong type
      await controller.redirectTo({ action: "index", onlyPath: "yes" });
      await controller.redirectTo(() => "/posts", { alert: "Watch it, mister!", status: ":found" });
      await controller.redirectTo("/posts", { status: 301, flash: { updatedPostId: 1 } });
      await controller.redirectTo("/posts", { status: ":unprocessable_entity" });
      await controller.redirectTo("https://rubyonrails.org", { allowOtherHost: true });
      await controller.redirectTo<"warning">("/posts", { warning: "Careful" });
      // @ts-expect-error a misspelled response option
      await controller.redirectTo("/posts", { statsu: "see_other" });
      // @ts-expect-error not a Rack status symbol
      await controller.redirectTo("/posts", { status: "see_another" });
      // @ts-expect-error a flash type the controller did not name
      await controller.redirectTo("/posts", { warning: "Careful" });
      expectTypeOf(controller.redirectTo).returns.toEqualTypeOf<Promise<number>>();
      const flash = controller as unknown as { redirectTo: typeof flashRedirectTo; flash: never };
      // @ts-expect-error a misspelled response option on Flash#redirect_to itself
      flash.redirectTo("/posts", { statsu: "see_other" });
      const host = controller as unknown as RedirectingHost;
      host.redirectTo("/posts", { notice: "Forwarded by redirect_back_or_to", status: 303 });
    };
    expect(typed).toBeTypeOf("function");
  });
});

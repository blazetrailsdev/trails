import { describe, it, expect, afterEach } from "vitest";
import { ActionController, RouteSet, controllerConstants } from "@blazetrails/actionpack";
import { bodyToString } from "@blazetrails/rack";

afterEach(() => {
  controllerConstants.delete("posts");
});

describe("ScaffoldControllerGenerator (dispatch)", () => {
  it("routes GET /posts/new to the emitted new action", async () => {
    class PostsController extends ActionController.Base {
      async new(): Promise<void> {
        await this.render({ plain: "new post" });
      }
    }

    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("posts");
    });
    controllerConstants.set("posts", PostsController as never);

    const [status, , body] = await routes.call({ REQUEST_METHOD: "GET", PATH_INFO: "/posts/new" });

    expect(status).toBe(200);
    expect(await bodyToString(body)).toBe("new post");
  });
});

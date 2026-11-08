import { describe, expect, test } from "vitest";
import { ActionController, Request, Response } from "@blazetrails/actionpack";
import { FixtureResolver } from "../../testing/resolvers.js";

class StoryPagesController extends ActionController.Base {
  static override controllerPath(): string {
    return "admin/story_pages";
  }

  async index(): Promise<void> {}
}

StoryPagesController.viewPaths(
  new FixtureResolver({
    "layouts/admin/story-pages.tse": "story pages layout: <%= yield %>",
    "layouts/admin/story_pages.tse": "underscored layout: <%= yield %>",
    "admin/story-pages/index.tse": "index",
  }),
);

describe("ActionView::Layouts implied layout name", () => {
  test("is the controller path in kebab-case, namespaces kept", () => {
    expect(StoryPagesController._impliedLayoutName()).toBe("admin/story-pages");
    expect(StoryPagesController.controllerPath()).toBe("admin/story_pages");
  });

  test("a multi-word namespaced controller renders inside its kebab-case layout", async () => {
    const controller = new StoryPagesController();
    const env = { REQUEST_METHOD: "GET", PATH_INFO: "/", HTTP_HOST: "www.example.com" };
    await controller.dispatch("index", new Request(env), new Response());
    expect(controller.responseBody).toBe("story pages layout: index");
  });
});

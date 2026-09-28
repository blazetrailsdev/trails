import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { controllerConstants } from "../../http/request.js";
import type { Mapper } from "../../routing/mapper.js";
import { RouteSet } from "../../routing/route-set.js";
import { IntegrationTest } from "../../testing/integration.js";
import { ResourcesController } from "../../../test-helpers/abstract-unit.js";

class ReviewsController extends ResourcesController {}

class Reviewable {
  static call(mapper: Mapper, options: Record<string, unknown> = {}): void {
    mapper.resources("reviews", options);
  }
}

const Routes = new RouteSet();
Routes.draw((app) => {
  app.concern("commentable", null, (mapper, options) => {
    mapper.resources("comments", options);
  });

  app.concern("image_attachable", null, (mapper) => {
    mapper.resources("images", { only: "index" });
  });

  app.concern("reviewable", Reviewable);

  app.resources("posts", { concerns: ["commentable", "image_attachable", "reviewable"] }, (app) => {
    app.resource("video", { concerns: "commentable" }, (app) => {
      app.concerns("reviewable", { as: "video_reviews" });
    });
  });

  app.resource("picture", { concerns: "commentable" }, (app) => {
    app.resources("posts", { concerns: "commentable" });
  });

  app.scope("/videos", (app) => {
    app.concerns("commentable", { except: "destroy" });
  });
});

const urlHelpers = () =>
  Routes.urlHelpers() as unknown as Record<string, (...args: unknown[]) => string>;

describe("RoutingConcernsTest", () => {
  let session: IntegrationTest;

  beforeAll(() => {
    controllerConstants.set("reviews", ReviewsController);
  });

  beforeEach(() => {
    session = new IntegrationTest();
    session.routes = Routes;
    session.app = Routes;
  });

  it("accessing concern from resources", async () => {
    await session.get("/posts/1/comments");
    expect(String(session.response.status)).toBe("200");
    expect(urlHelpers().postCommentsPath({ post_id: 1 })).toBe("/posts/1/comments");
  });

  it("accessing concern from resource", async () => {
    await session.get("/picture/comments");
    expect(String(session.response.status)).toBe("200");
    expect(urlHelpers().pictureCommentsPath()).toBe("/picture/comments");
  });

  it("accessing concern from nested resource", async () => {
    await session.get("/posts/1/video/comments");
    expect(String(session.response.status)).toBe("200");
    expect(urlHelpers().postVideoCommentsPath({ post_id: 1 })).toBe("/posts/1/video/comments");
  });

  it("accessing concern from nested resources", async () => {
    await session.get("/picture/posts/1/comments");
    expect(String(session.response.status)).toBe("200");
    expect(urlHelpers().picturePostCommentsPath({ post_id: 1 })).toBe("/picture/posts/1/comments");
  });

  it("accessing concern from resources with more than one concern", async () => {
    await session.get("/posts/1/images");
    expect(String(session.response.status)).toBe("200");
    expect(urlHelpers().postImagesPath({ post_id: 1 })).toBe("/posts/1/images");
  });

  it("accessing concern from resources using only option", async () => {
    await session.get("/posts/1/image/1");
    expect(String(session.response.status)).toBe("404");
  });

  it("accessing callable concern ", async () => {
    await session.get("/posts/1/reviews/1");
    expect(String(session.response.status)).toBe("200");
    expect(urlHelpers().postReviewPath({ post_id: 1, id: 1 })).toBe("/posts/1/reviews/1");
  });

  it.skip("callable concerns accept options", async () => {
    await session.get("/posts/1/video/reviews/1");
    expect(String(session.response.status)).toBe("200");
    expect(urlHelpers().postVideoVideoReviewPath({ post_id: 1, id: 1 })).toBe(
      "/posts/1/video/reviews/1",
    );
  });

  it("accessing concern from a scope", async () => {
    await session.get("/videos/comments");
    expect(String(session.response.status)).toBe("200");
  });

  it("concerns accept options", async () => {
    await session.delete("/videos/comments/1");
    expect(String(session.response.status)).toBe("404");
  });

  it("with an invalid concern name", () => {
    let e: unknown;
    try {
      new RouteSet().draw((app) => {
        app.resources("posts", { concerns: "foo" });
      });
    } catch (error) {
      e = error;
    }
    expect(e).toBeInstanceOf(ArgumentError);
    expect((e as Error).message).toBe("No concern named foo was found!");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { modelRegistry } from "@blazetrails/activerecord";
import { Application } from "./application.js";
import { Trails } from "./rails.js";

describe("a generated app's models resolve string association targets", () => {
  afterEach(() => {
    Trails.application = null;
    Application.appClass = null;
  });

  it("registers every app/models class so an association names its target by string", async () => {
    await import("./__fixtures__/boot-app/config/application.js");
    const app = Trails.application!;
    app.config.setRoot(new URL("./__fixtures__/boot-app", import.meta.url).pathname);

    await Trails.initialize();

    const Post = modelRegistry.get("Post")!;
    const Comment = modelRegistry.get("Comment")!;
    expect(Post).toBeDefined();
    expect(Comment).toBeDefined();
    expect(Post.reflectOnAssociation("comments")!.klass).toBe(Comment);
    expect(Comment.reflectOnAssociation("post")!.klass).toBe(Post);
  }, 15_000);
});
